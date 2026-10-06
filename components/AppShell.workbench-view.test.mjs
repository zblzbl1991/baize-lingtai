import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");

test("resuming the already-selected session clears the Workbench URL without remounting chat", () => {
  const callback = (name, next) => source.slice(source.indexOf(`  const ${name} = useCallback`), source.indexOf(next, source.indexOf(`  const ${name} = useCallback`)));
  const code = callback("returnToChat", "  // Single active panel") + callback("handleSelectSession", "  const handleNewSession");
  const session = { id: "550e8400-e29b-41d4-a716-446655440000", cwd: "/repo" };
  const writes = [];
  let remounts = 0;
  const context = {
    useCallback: (fn) => fn, activeViewRef: { current: "workbench" },
    setActiveViewTracked(view) { context.activeViewRef.current = view; },
    applyViewToLocation(view) { const params = new URLSearchParams(context.window.location.search); if (view === "chat") params.delete("view"); writes.push(`?${params}`); },
    activeNewSessionDraftKeyRef: { current: null }, activeProjectKeyRef: { current: "/repo" },
    newSessionCwd: null, selectedSession: session, activeCwd: "/repo", activeFileTabId: null, isMobile: false,
    invalidateWorkspaceRestore() {}, workspaceKeyOf: (s) => s.cwd, hrefPreservingView: (q) => q,
    router: { replace: (url) => writes.push(url) }, window: { location: { search: `?session=${session.id}&view=workbench` } }, URLSearchParams,
  };
  for (const [, setter] of code.matchAll(/\b(set[A-Z]\w*)(?=\()/g)) if (!context[setter]) context[setter] = () => {};
  context.setSessionKey = () => remounts++;
  vm.createContext(context);
  vm.runInContext(stripTypeScriptTypes(`${code}\nglobalThis.select = handleSelectSession;`), context);
  context.select(session);
  assert.equal(context.activeViewRef.current, "chat");
  assert.deepEqual(writes, [`?session=${session.id}`]);
  assert.equal(remounts, 0);
});

test("the Workbench view restores from ?view=workbench", () => {
  assert.match(
    source,
    /const \[activeView, setActiveView\] = useState<AppView>\(initialNavigation\.view\);/,
  );
});

test("the top bar offers a Workbench toggle with pressed state", () => {
  assert.match(
    source,
    /onClick=\{handleWorkbenchToggle\}[\s\S]*?aria-pressed=\{activeView === "workbench"\}/,
  );
  assert.match(source, /data-workbench-toggle="true"/);
});

test("toggling writes ?view=workbench preserving the other URL parameters", () => {
  const start = source.indexOf("const applyViewToLocation = useCallback");
  const end = source.indexOf("const handleWorkbenchToggle", start);
  const body = source.slice(start, end);
  assert.match(body, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(body, /params\.set\("view", "workbench"\)/);
  assert.match(body, /params\.delete\("view"\)/);
});

test("restore-time URL writes keep the Workbench view", () => {
  // Tab-memory session restore, workspace restore, and the initial cwd
  // validation must not rewrite ?view=workbench away.
  for (const callbackName of ["handleSelectSession", "restoreWorkspaceContext"]) {
    const start = source.indexOf(`const ${callbackName} = useCallback`);
    const slice = source.slice(start, start + 6000);
    assert.match(slice, /hrefPreservingView\(`\?session=/, callbackName);
  }
  const cwdEffect = source.indexOf("void fetch(\"/api/cwd/validate\"");
  assert.match(source.slice(cwdEffect, cwdEffect + 2200), /hrefPreservingView\(`\?cwd=/);
});

test("explicit session, new-session, and project selections return to chat", () => {
  // Restoring a remembered session (isRestore) is not a selection: it must
  // leave the Workbench view alone.
  const select = source.indexOf("const handleSelectSession = useCallback");
  assert.match(source.slice(select, select + 500), /if \(!isRestore\) returnToChat\(\);/);
  const fresh = source.indexOf("const handleNewSession = useCallback");
  assert.match(source.slice(fresh, fresh + 300), /returnToChat\(\);/);
  // The project switch returns to chat only after the initial-restore and
  // identity-hydration guards, so a ?view=workbench URL restore stays put.
  const cwdChange = source.indexOf("const handleCwdChange = useCallback");
  const guardEnd = source.indexOf("// Close any session that belongs to a different project", cwdChange);
  assert.ok(source.slice(cwdChange, guardEnd).indexOf("returnToChat()") === -1, "returnToChat must not run before the restore guards");
  assert.match(source.slice(guardEnd, guardEnd + 300), /returnToChat\(\);/);
});

test("the Workbench keeps the composer mounted while hiding the chat area", () => {
  assert.match(
    source,
    /display: activeView === "workbench" \? "none" : "block"/,
  );
});
