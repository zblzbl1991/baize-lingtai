// Authoritative store for Work Items (工作目标): one versioned
// `pi-web-work-items.json` in the agent dir, next to pi's own files but never
// read by pi. This is user data, not a rebuildable cache: unlike the session
// index, a store we cannot read or write is a typed error that preserves the
// existing bytes — never an empty overwrite (ADR 0007, spec "Work Item state
// and persistence").
//
// Every mutation rereads the latest disk contents under proper-lockfile's lock
// with in-process serialization (one promise chain per store path), so two
// writers — two routes, or a second pi-web process — cannot lose updates.
// Reads are served from a snapshot cache keyed by store path and refreshed
// whenever the file's (size, mtimeMs) fingerprint changes; reads never write.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import lockfile from "proper-lockfile";
import { writePrivateFileAtomicSync } from "./atomic-file";
import { serializeByKey } from "./key-serializer";
import { projectIdentityKey } from "./project-identity";
import { resolveProject } from "./worktree";

export const WORK_ITEMS_FORMAT_VERSION = 1;
export const WORK_ITEMS_FILE_NAME = "pi-web-work-items.json";

/** How long a user-visible Work Item name may be. */
export const WORK_ITEM_NAME_MAX_LENGTH = 200;

export type WorkItemStatus = "in-progress" | "completed";

export interface WorkItem {
  id: string;
  /** projectIdentityKey() of projectRoot: equality only, never displayed. */
  projectKey: string;
  /** Original filesystem form, for display and filesystem operations. */
  projectRoot: string;
  name: string;
  status: WorkItemStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  sessionIds: string[];
}

/**
 * The store exists but its contents cannot be used. The bytes on disk are the
 * user's; no caller may replace them, so every mutation fails closed.
 */
export class WorkItemsStoreError extends Error {
  /** "read" — malformed JSON, an invalid record, an unknown schema version, or an unreadable file. "write" — a failed write. */
  readonly kind: "read" | "write";

  constructor(kind: "read" | "write", message: string) {
    super(message);
    this.name = "WorkItemsStoreError";
    this.kind = kind;
  }
}

export function getWorkItemsStorePath(agentDir = getAgentDir()): string {
  return join(agentDir, WORK_ITEMS_FILE_NAME);
}

/**
 * Canonical Project identity for a Work Item: the resolved Project root
 * (main checkout, shared by linked worktrees) in its original filesystem
 * form, plus its identity key for equality. A Work Item record never grants
 * file access — cwd validation and file/Git authorization stay the boundary.
 */
export async function resolveWorkItemProject(cwd: string): Promise<{ projectRoot: string; projectKey: string }> {
  const info = await resolveProject(cwd);
  return { projectRoot: info.projectRoot, projectKey: projectIdentityKey(info.projectRoot) };
}

export function isWorkItemsStoreError(error: unknown): error is WorkItemsStoreError {
  return error instanceof WorkItemsStoreError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Work Item ids are UUIDs; a hand-written store with any other id fails closed. */
export function isWorkItemId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Session ids are pi's UUIDs; the liveness seam (ticket 03) filters by them. */
export function isSessionId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function parseWorkItem(value: unknown): WorkItem {
  if (!isRecord(value)) throw new Error("work item is not an object");
  const {
    id, projectKey, projectRoot, name, status,
    createdAt, updatedAt, completedAt, sessionIds,
  } = value;
  if (!isWorkItemId(id)) throw new Error("work item id is not a UUID");
  if (typeof projectKey !== "string" || !projectKey) throw new Error(`work item ${id} projectKey`);
  if (typeof projectRoot !== "string" || !projectRoot) throw new Error(`work item ${id} projectRoot`);
  if (typeof name !== "string") throw new Error(`work item ${id} name`);
  if (status !== "in-progress" && status !== "completed") throw new Error(`work item ${id} status`);
  if (!isIsoTimestamp(createdAt)) throw new Error(`work item ${id} createdAt`);
  if (!isIsoTimestamp(updatedAt)) throw new Error(`work item ${id} updatedAt`);
  if (completedAt !== null && !isIsoTimestamp(completedAt)) throw new Error(`work item ${id} completedAt`);
  if (!Array.isArray(sessionIds) || sessionIds.some((s) => typeof s !== "string" || !s)) {
    throw new Error(`work item ${id} sessionIds`);
  }
  return {
    id,
    projectKey,
    projectRoot,
    name,
    status,
    createdAt,
    updatedAt,
    completedAt,
    sessionIds: [...new Set(sessionIds as string[])],
  };
}

/**
 * A session must belong to at most one Work Item. A hand edit can violate
 * that; the read side resolves it deterministically (lexicographically
 * smallest Work Item id wins) without rewriting the disk, and the next
 * successful mutation normalizes the stored file under the lock.
 */
export function resolveAssociationConflicts(items: WorkItem[]): WorkItem[] {
  const ownerBySession = new Map<string, string>();
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const resolved = new Map<string, WorkItem>();
  for (const item of sorted) {
    resolved.set(item.id, { ...item, sessionIds: [] });
  }
  for (const item of sorted) {
    for (const sessionId of item.sessionIds) {
      if (!ownerBySession.has(sessionId)) {
        ownerBySession.set(sessionId, item.id);
        resolved.get(item.id)!.sessionIds.push(sessionId);
      }
    }
  }
  return items.map((item) => resolved.get(item.id)!);
}

function parseStore(path: string, contents: string): WorkItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    throw new WorkItemsStoreError("read", `Failed to parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isRecord(parsed)) {
    throw new WorkItemsStoreError("read", `Failed to read ${path}: expected a JSON object`);
  }
  if (parsed.version !== WORK_ITEMS_FORMAT_VERSION) {
    throw new WorkItemsStoreError("read", `Failed to read ${path}: unsupported schema version ${JSON.stringify(parsed.version)}`);
  }
  if (!Array.isArray(parsed.workItems)) {
    throw new WorkItemsStoreError("read", `Failed to read ${path}: workItems must be an array`);
  }
  let items: WorkItem[];
  try {
    items = parsed.workItems.map(parseWorkItem);
  } catch (error) {
    throw new WorkItemsStoreError("read", `Failed to read ${path}: invalid work item — ${error instanceof Error ? error.message : String(error)}`);
  }
  return resolveAssociationConflicts(items);
}

interface StoreSnapshot {
  fingerprint: { size: number; mtimeMs: number };
  items: WorkItem[];
}

declare global {
  var __piWebWorkItemsCache: Map<string, StoreSnapshot> | undefined;
}

function snapshotCache(): Map<string, StoreSnapshot> {
  if (!globalThis.__piWebWorkItemsCache) globalThis.__piWebWorkItemsCache = new Map();
  return globalThis.__piWebWorkItemsCache;
}

function fingerprintOf(path: string): { size: number; mtimeMs: number } | null {
  try {
    const stats = statSync(path);
    return { size: stats.size, mtimeMs: stats.mtimeMs };
  } catch {
    return null;
  }
}

export function resetWorkItemsCacheForTests(): void {
  globalThis.__piWebWorkItemsCache = undefined;
}

function serializeMutation<T>(storePath: string, task: () => Promise<T>): Promise<T> {
  return serializeByKey(Symbol.for("pi-web.work-items"), storePath, task);
}

/**
 * How liveness discovery (ticket 03) reports a session: "alive" when found,
 * "absent" only after authoritative discovery of deletion, "unknown" when the
 * catalogue is stale, partial, or unreadable.
 */
export type SessionLiveness = (sessionId: string) => "alive" | "absent" | "unknown";

export interface ReadWorkItemsOptions {
  /**
   * View-level liveness filter: confirmed-absent sessions drop out of the
   * returned Associations, but only in the returned view — unknown and alive
   * sessions are retained, and the cache and the disk bytes are never touched.
   */
  sessionLiveness?: SessionLiveness;
}

/** Read the items, newest activity first. A genuinely absent store reads as empty. */
export async function readWorkItems(
  storePath: string,
  options: ReadWorkItemsOptions = {},
): Promise<WorkItem[]> {
  const items = await readWorkItemsCached(storePath);
  if (!options.sessionLiveness) return items;
  const liveness = options.sessionLiveness;
  return items.map((item) => ({
    ...item,
    sessionIds: item.sessionIds.filter((sessionId) => liveness(sessionId) !== "absent"),
  }));
}

async function readWorkItemsCached(storePath: string): Promise<WorkItem[]> {
  const fingerprint = fingerprintOf(storePath);
  if (!fingerprint) return [];
  const cached = snapshotCache().get(storePath);
  if (
    cached
    && cached.fingerprint.size === fingerprint.size
    && cached.fingerprint.mtimeMs === fingerprint.mtimeMs
  ) {
    return cached.items;
  }
  let items: WorkItem[];
  try {
    items = parseStore(storePath, readFileSync(storePath, "utf8"));
  } catch (error) {
    if (isWorkItemsStoreError(error)) throw error;
    throw new WorkItemsStoreError("read", `Failed to read ${storePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const sorted = sortItems(items);
  snapshotCache().set(storePath, { fingerprint, items: sorted });
  return sorted;
}

function sortItems(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  );
}

function writeStore(
  storePath: string,
  items: WorkItem[],
  write: (path: string, contents: string) => void = writePrivateFileAtomicSync,
): void {
  mkdirSync(dirname(storePath), { recursive: true });
  const contents = `${JSON.stringify({ version: WORK_ITEMS_FORMAT_VERSION, workItems: items }, null, 2)}\n`;
  try {
    write(storePath, contents);
  } catch (error) {
    throw new WorkItemsStoreError("write", `Failed to write ${storePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const fingerprint = fingerprintOf(storePath);
  if (fingerprint) {
    snapshotCache().set(storePath, { fingerprint, items: sortItems(items) });
  } else {
    snapshotCache().delete(storePath);
  }
}

function truncateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length > WORK_ITEM_NAME_MAX_LENGTH) {
    return trimmed.slice(0, WORK_ITEM_NAME_MAX_LENGTH);
  }
  return trimmed;
}

function withLockAndFreshItems<T>(
  storePath: string,
  update: (items: WorkItem[]) => T,
): Promise<T> {
  return serializeMutation(storePath, async () => {
    mkdirSync(dirname(storePath), { recursive: true });
    // proper-lockfile needs a file to lock. The anchor is written only when
    // the store does not exist yet, and it is a valid empty store so a crash
    // before the real write still leaves a readable store. It is internal
    // plumbing, not user data, so it bypasses the injected writer: the
    // injected seam exists to fail the real store write. A store that
    // existed is parsed strictly (an unreadable store fails).
    let createdHere = false;
    try {
      writeFileSync(
        storePath,
        `${JSON.stringify({ version: WORK_ITEMS_FORMAT_VERSION, workItems: [] }, null, 2)}\n`,
        { flag: "wx", mode: 0o600 },
      );
      createdHere = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const release = await lockfile.lock(storePath, { realpath: false, retries: 10 });
    try {
      // Reread under the lock: another process may have written since our
      // last look, and the cache must not shadow a newer file.
      snapshotCache().delete(storePath);
      const items = !createdHere && existsSync(storePath)
        ? parseStore(storePath, readFileSync(storePath, "utf8"))
        : [];
      return update(items);
    } finally {
      await release();
    }
  });
}

export interface CreateWorkItemInput {
  projectKey: string;
  projectRoot: string;
  name: string;
}

export interface WorkItemsMutationOptions {
  now?: Date;
  /** Test seam: replace the private atomic writer to inject write failures. */
  write?: (path: string, contents: string) => void;
}

/** Create an empty, in-progress Work Item. `now` is injectable for tests. */
export async function createWorkItem(
  storePath: string,
  input: CreateWorkItemInput,
  options: WorkItemsMutationOptions = {},
): Promise<WorkItem> {
  const now = options.now ?? new Date();
  const name = truncateName(input.name);
  if (!name) throw new WorkItemsStoreError("write", "Work Item name must not be empty");
  if (typeof input.projectKey !== "string" || !input.projectKey) {
    throw new WorkItemsStoreError("write", "Work Item projectKey must not be empty");
  }
  if (typeof input.projectRoot !== "string" || !input.projectRoot) {
    throw new WorkItemsStoreError("write", "Work Item projectRoot must not be empty");
  }
  const timestamp = now.toISOString();
  const item: WorkItem = {
    id: randomUUID(),
    projectKey: input.projectKey,
    projectRoot: input.projectRoot,
    name,
    status: "in-progress",
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    sessionIds: [],
  };
  return withLockAndFreshItems(storePath, (items) => {
    const next = resolveAssociationConflicts([...items, item]);
    writeStore(storePath, next, options.write);
    return item;
  });
}

/** Rename a Work Item. Renaming to the same name is a no-op that keeps timestamps. */
export async function renameWorkItem(
  storePath: string,
  id: string,
  name: string,
  options: WorkItemsMutationOptions = {},
): Promise<WorkItem | null> {
  const trimmed = truncateName(name);
  if (!trimmed) throw new WorkItemsStoreError("write", "Work Item name must not be empty");
  const now = options.now ?? new Date();
  return withLockAndFreshItems(storePath, (items) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return null;
    if (item.name === trimmed) return item;
    const renamed = { ...item, name: trimmed, updatedAt: now.toISOString() };
    writeStore(storePath, resolveAssociationConflicts(items.map((candidate) => (candidate.id === id ? renamed : candidate))), options.write);
    return renamed;
  });
}

/**
 * Mark a Work Item completed or in progress. Status is organizational only:
 * completing sets `completedAt`, reopening clears it, and a repeated request
 * with the current status is a no-op that preserves every timestamp.
 */
export async function setWorkItemStatus(
  storePath: string,
  id: string,
  status: WorkItemStatus,
  options: WorkItemsMutationOptions = {},
): Promise<WorkItem | null> {
  const now = options.now ?? new Date();
  return withLockAndFreshItems(storePath, (items) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return null;
    if (item.status === status) return item;
    const timestamp = now.toISOString();
    const updated: WorkItem = {
      ...item,
      status,
      completedAt: status === "completed" ? timestamp : null,
      updatedAt: timestamp,
    };
    writeStore(storePath, resolveAssociationConflicts(items.map((candidate) => (candidate.id === id ? updated : candidate))), options.write);
    return updated;
  });
}

/**
 * Apply a PATCH-shaped edit — name, status, or both — as one locked write so
 * a failure between the two fields cannot persist half of the request.
 * Same-value fields are no-ops; repeated status requests preserve timestamps.
 */
export async function updateWorkItem(
  storePath: string,
  id: string,
  edit: { name?: string; status?: WorkItemStatus },
  options: WorkItemsMutationOptions = {},
): Promise<WorkItem | null> {
  const now = options.now ?? new Date();
  const trimmed = edit.name !== undefined ? truncateName(edit.name) : undefined;
  if (edit.name !== undefined && !trimmed) throw new WorkItemsStoreError("write", "Work Item name must not be empty");
  const wantsName = trimmed !== undefined;
  const wantsStatus = edit.status !== undefined;
  if (!wantsName && !wantsStatus) throw new WorkItemsStoreError("write", "Nothing to update");
  return withLockAndFreshItems(storePath, (items) => {
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return null;
    const timestamp = now.toISOString();
    let updated = item;
    if (wantsStatus && item.status !== edit.status) {
      updated = {
        ...updated,
        status: edit.status!,
        completedAt: edit.status === "completed" ? timestamp : null,
        updatedAt: timestamp,
      };
    }
    if (wantsName && updated.name !== trimmed) {
      updated = { ...updated, name: trimmed!, updatedAt: timestamp };
    }
    if (updated === item) return item;
    writeStore(storePath, resolveAssociationConflicts(items.map((candidate) => (candidate.id === id ? updated : candidate))), options.write);
    return updated;
  });
}

/** Delete a Work Item only — native sessions are never touched. */
export async function deleteWorkItem(
  storePath: string,
  id: string,
  options: WorkItemsMutationOptions = {},
): Promise<boolean> {
  return withLockAndFreshItems(storePath, (items) => {
    const remaining = items.filter((candidate) => candidate.id !== id);
    if (remaining.length === items.length) return false;
    writeStore(storePath, resolveAssociationConflicts(remaining), options.write);
    return true;
  });
}
