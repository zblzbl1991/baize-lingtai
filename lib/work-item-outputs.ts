import { createReadStream, lstatSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { normalizeToolCalls } from "./normalize";
import { extractTurnWrittenFiles } from "./turn-written-files";
import type { AgentMessage, AssistantMessage, ToolResultMessage } from "./types";
import type { WorkItemOutput, WorkItemOutputsResponse } from "./work-item-output-types";
import { projectIdentityKey } from "./project-identity";
import { getAllowedFileRoots, isFilePathAllowed, isExistingFilePathAllowed } from "./file-access";
import { getGitStatus, getGitFileDiff } from "./git-changes";
import { listWorktrees } from "./worktree";
import { samePath, toNativePath } from "./paths";
import { getRpcSession } from "./rpc-manager";
import { readWorkItems, getWorkItemsStorePath, WorkItemRequestError } from "./work-items";
import { discoverWorkItemSessions } from "./work-item-sessions";

const MAX_BYTES = 16 * 1024 * 1024;
const MAX_LINE = 1024 * 1024;
const MAX_SESSIONS = 100;
const MAX_OUTPUTS = 200;
const SCAN_MS = 3000;
const RESPONSE_MS = 12000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const execFileAsync = promisify(execFile);
class OutputLimitError extends Error {}
async function beforeDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new OutputLimitError()), Math.max(1, deadline - Date.now())); })]); }
  finally { clearTimeout(timer!); }
}
type Entry = { type?: string; timestamp?: string; message?: AgentMessage & { nestedCalls?: { complete?: boolean; calls?: { name?: string; status?: string; arguments?: Record<string, unknown> }[] } } };
function localWrite(name: string) { return name === "write" || name === "edit" || (name === "apply_patch" || name.startsWith("apply_patch_")); }

/** Raw historical evidence only; no branch/context projection and no filename inference. */
export function extractWorkItemSessionOutputs(entries: readonly Entry[], session: { id: string; cwd: string }, deadline = Infinity): WorkItemOutputsResponse {
  const calls = new Map<string, { block: AssistantMessage["content"][number]; at: string | null }>();
  const outputs: WorkItemOutput[] = [];
  const reasons = new Set<string>();
  let responseBytes = 0;
  function record(name: string, input: Record<string, unknown>, result: ToolResultMessage, at: string | null) {
    if (!localWrite(name)) return;
    const block = { type: "toolCall" as const, toolCallId: result.toolCallId, toolName: name, input };
    for (const file of extractTurnWrittenFiles([block], new Map([[result.toolCallId, result]]), session.cwd)) {
      const row: WorkItemOutput = { ...file, sourceSessionId: session.id, sourceCwd: session.cwd, checkoutRoot: null, lastWrittenAt: at, state: "unavailable", diffAvailable: false };
      responseBytes += Buffer.byteLength(JSON.stringify(row));
      if (file.filePath.length > 32768 || responseBytes > MAX_RESPONSE_BYTES || outputs.length >= 2000) { reasons.add("limit"); return; }
      outputs.push(row);
    }
  }
  for (const entry of entries) {
    if (Date.now() >= deadline || responseBytes > MAX_RESPONSE_BYTES || outputs.length >= 2000) { reasons.add("limit"); break; }
    if (entry.type !== "message" || !entry.message) continue;
    const message = entry.message;
    const numericDate = typeof message.timestamp === "number" ? new Date(message.timestamp) : null;
    const rawAt = entry.timestamp ?? (numericDate && Number.isFinite(numericDate.getTime()) ? numericDate.toISOString() : null);
    const at = rawAt && Number.isFinite(Date.parse(rawAt)) ? new Date(rawAt).toISOString() : null;
    if (message.role === "assistant") {
      const normalized = normalizeToolCalls(message) as AssistantMessage;
      for (const block of normalized.content ?? []) if (block.type === "toolCall") calls.set(block.toolCallId, { block, at });
    } else if (message.role === "toolResult") {
      const call = calls.get(message.toolCallId);
      if (call?.block.type === "toolCall") record(call.block.toolName, call.block.input, message, at ?? call.at);
      const nested = message.nestedCalls;
      if (nested?.complete === false) reasons.add("nested");
      for (const child of nested?.calls ?? []) {
        if (child.status === "unfinished" || !child.arguments) { reasons.add("nested"); continue; }
        if (child.status === "ok" && (child.name === "write" || child.name === "edit")) record(child.name, child.arguments, { ...message, isError: false }, at);
      }
    }
  }
  return { outputs: deduplicateOutputs(outputs), incomplete: reasons.size > 0, reasons: [...reasons] };
}

export function deduplicateOutputs(outputs: readonly WorkItemOutput[]): WorkItemOutput[] {
  const sorted = [...outputs].sort((a, b) => (b.lastWrittenAt ?? "").localeCompare(a.lastWrittenAt ?? "") || a.sourceSessionId.localeCompare(b.sourceSessionId) || a.filePath.localeCompare(b.filePath));
  const seen = new Set<string>();
  return sorted.filter((row) => { const key = projectIdentityKey(row.filePath); if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => (b.lastWrittenAt ?? "").localeCompare(a.lastWrittenAt ?? "") || a.filePath.localeCompare(b.filePath));
}

const extractionCache = new Map<string, { fingerprint: string; value: WorkItemOutputsResponse; bytes: number }>();
async function scanSession(session: { id: string; path: string; cwd: string }, signal: AbortSignal, byteBudget: number, deadline: number): Promise<WorkItemOutputsResponse & { scannedBytes?: number }> {
  const live = getRpcSession(session.id);
  if (live?.isAlive()) {
    const entries = live.inner.sessionManager.getEntries() as Entry[];
    // Live memory is authoritative, but materialize only a bounded prefix.
    const bounded: Entry[] = []; let bytes = 0; let skipped = false;
    for (const entry of entries) {
      if (Date.now() >= deadline || signal.aborted) break;
      const size = Buffer.byteLength(JSON.stringify(entry));
      bytes += size; if (bytes > Math.min(MAX_BYTES, byteBudget)) break;
      if (size > MAX_LINE) { skipped = true; continue; }
      bounded.push(entry);
    }
    const result = extractWorkItemSessionOutputs(bounded, session, deadline);
    if (skipped || bounded.length !== entries.length) { result.incomplete = true; result.reasons.push("limit"); }
    return { ...result, scannedBytes: bytes };
  }
  const stats = statSync(session.path);
  const fingerprint = `${stats.size}:${stats.mtimeMs}:${session.cwd}`;
  const cached = extractionCache.get(session.id);
  if (cached?.fingerprint === fingerprint) return { ...cached.value, scannedBytes: 0 };
  const entries: Entry[] = [];
  const allowedBytes = Math.min(MAX_BYTES, byteBudget);
  const stream = createReadStream(session.path, { encoding: "utf8", end: allowedBytes - 1, signal });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let incomplete = stats.size > allowedBytes;
  try {
    for await (const line of lines) {
      if (signal.aborted || Date.now() >= deadline) { incomplete = true; break; }
      if (line.length > MAX_LINE) { incomplete = true; continue; }
      try { entries.push(JSON.parse(line)); } catch { incomplete = true; }
    }
  } catch { incomplete = true; }
  finally { lines.close(); stream.destroy(); }
  const result = extractWorkItemSessionOutputs(entries, session, deadline);
  if (incomplete) { result.incomplete = true; result.reasons.push("limit"); }
  if (!incomplete && !signal.aborted && !result.reasons.includes("limit")) {
    extractionCache.set(session.id, { fingerprint, value: result, bytes: Buffer.byteLength(JSON.stringify(result)) });
    while (extractionCache.size > 100 || [...extractionCache.values()].reduce((sum, entry) => sum + entry.bytes, 0) > 4 * 1024 * 1024) extractionCache.delete(extractionCache.keys().next().value!);
  }
  return { ...result, scannedBytes: stream.bytesRead };
}

export async function readWorkItemOutputs(id: string, requestSignal?: AbortSignal): Promise<WorkItemOutputsResponse> {
  const started = Date.now();
  const deadline = started + RESPONSE_MS;
  const item = (await readWorkItems(getWorkItemsStorePath())).find((item) => item.id === id);
  if (!item) throw new WorkItemRequestError("not-found", 404);
  let discovery;
  try { discovery = await beforeDeadline(discoverWorkItemSessions(), deadline); }
  catch { return { outputs: [], incomplete: true, reasons: ["unavailable", "limit"] }; }
  const byId = new Map(discovery.sessions.map((session) => [session.id, session]));
  const reasons = new Set<string>();
  const found: WorkItemOutput[] = [];
  const signal = requestSignal ? AbortSignal.any([requestSignal, AbortSignal.timeout(SCAN_MS)]) : AbortSignal.timeout(SCAN_MS);
  const scanDeadline = Math.min(deadline, Date.now() + SCAN_MS);
  let byteBudget = MAX_TOTAL_BYTES;
  const ids = item.sessionIds.filter((id) => discovery.liveness(id) !== "absent");
  const candidates = ids.map((id) => byId.get(id)).filter((session) => session !== undefined).sort((a, b) => b.modified.localeCompare(a.modified));
  if (candidates.length !== ids.length) reasons.add("unavailable");
  for (const [index, session] of candidates.entries()) {
    if (index >= MAX_SESSIONS || signal.aborted || byteBudget <= 0) { reasons.add("limit"); break; }
    try { const result = await scanSession(session, signal, byteBudget, scanDeadline); byteBudget -= result.scannedBytes ?? 0; found.push(...result.outputs); result.reasons.forEach((reason) => reasons.add(reason)); }
    catch { reasons.add("unavailable"); }
  }
  let allowed: Set<string>; let roots: string[];
  try {
    allowed = await beforeDeadline(getAllowedFileRoots(), deadline);
    roots = (await beforeDeadline(listWorktrees(item.projectRoot).catch(() => []), deadline)).map((tree) => tree.path);
  } catch { return { outputs: [], incomplete: true, reasons: [...reasons, "limit"] }; }
  roots.push(item.projectRoot);
  for (const session of candidates) if (session.projectKey === item.projectKey && session.cwd) roots.push(session.cwd);
  const rows = deduplicateOutputs(found).map((row) => ({ ...row, filePath: toNativePath(row.filePath), checkoutRoot: null as string | null, state: "unavailable" as WorkItemOutput["state"], diffAvailable: false }));
  if (rows.length > MAX_OUTPUTS) reasons.add("limit");
  const outputs: WorkItemOutput[] = [];
  let outputBytes = 0;
  function addOutput(row: WorkItemOutput) {
    const bytes = Buffer.byteLength(JSON.stringify(row));
    if (outputBytes + bytes > MAX_RESPONSE_BYTES - 1024) { reasons.add("limit"); return false; }
    outputs.push(row); outputBytes += bytes; return true;
  }
  const statuses = new Map<string, Awaited<ReturnType<typeof getGitStatus>>>();
  const isMissing = (filePath: string) => {
    try { statSync(filePath); return false; }
    catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT"; }
  };
  for (const row of rows.slice(0, MAX_OUTPUTS)) {
    if (requestSignal?.aborted || Date.now() - started > RESPONSE_MS) { reasons.add("limit"); break; }
    const projectRoots = new Set(roots);
    if (!(isFilePathAllowed(row.filePath, allowed) || isExistingFilePathAllowed(row.filePath, allowed))) { reasons.add("access"); continue; }
    if (!(isFilePathAllowed(row.filePath, projectRoots) || isExistingFilePathAllowed(row.filePath, projectRoots))) {
      // The associated transcript's original cwd survives checkout removal,
      // while Git can no longer establish its former Project identity. Keep
      // only missing paths beneath that missing cwd, with no file/diff access.
      // Existing paths must still satisfy the current Project boundary.
      const originalCheckout = item.sessionCheckoutRoots?.[row.sourceSessionId] ?? row.sourceCwd;
      if (isMissing(originalCheckout) && isMissing(row.sourceCwd) && isMissing(row.filePath) && isFilePathAllowed(row.sourceCwd, new Set([originalCheckout])) && isFilePathAllowed(row.filePath, new Set([originalCheckout]))) {
        if (!addOutput({ ...row, checkoutRoot: originalCheckout, state: "missing" })) break;
      } else reasons.add("access");
      continue;
    }
    let stat;
    try { stat = statSync(row.filePath); }
    catch (error) {
      if (!addOutput({ ...row, state: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unavailable" })) break;
      continue;
    }
    if (!stat.isFile() || !isExistingFilePathAllowed(row.filePath, allowed) || !isExistingFilePathAllowed(row.filePath, projectRoots)) { reasons.add("access"); continue; }
    try {
      // Status from a subdirectory filters out sibling writes: use checkout root.
      let status = statuses.get(row.sourceCwd);
      if (!status) { const initial = await beforeDeadline(getGitStatus(row.sourceCwd), deadline); status = initial.repositoryRoot ? await beforeDeadline(getGitStatus(toNativePath(initial.repositoryRoot)), deadline) : initial; statuses.set(row.sourceCwd, status); }
      row.checkoutRoot = status.repositoryRoot ? toNativePath(status.repositoryRoot) : null;
      if (!status.isGitRepository) {
        // The shared Git helper also returns false when Git lookup fails.
        // A surviving checkout marker distinguishes that from a non-Git cwd.
        const markerRoot = item.sessionCheckoutRoots?.[row.sourceSessionId] ?? item.projectRoot;
        try {
          lstatSync(path.join(markerRoot, ".git"));
          row.state = "unavailable"; reasons.add("unavailable");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          row.state = "non-git";
        }
      }
      else if (status.files.some((file) => samePath(file.filePath, row.filePath))) {
        row.state = "changed";
        row.diffAvailable = (await beforeDeadline(getGitFileDiff(row.checkoutRoot!, row.filePath), deadline)).supported;
      } else {
        try {
          await beforeDeadline(execFileAsync("git", ["-C", row.checkoutRoot!, "-c", "core.fsmonitor=false", "--literal-pathspecs", "ls-files", "--error-unmatch", "--", path.relative(row.checkoutRoot!, row.filePath).split(path.sep).join("/")], { timeout: Math.max(1, deadline - Date.now()), maxBuffer: MAX_LINE }), deadline);
          row.state = "clean";
        } catch (error) { if (error instanceof OutputLimitError) throw error; row.state = "untracked"; }
      }
    } catch (error) { row.state = "unavailable"; reasons.add(error instanceof OutputLimitError ? "limit" : "unavailable"); }
    if (!addOutput(row)) break;
  }
  return { outputs, incomplete: reasons.size > 0, reasons: [...reasons] };
}
