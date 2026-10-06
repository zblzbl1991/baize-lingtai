import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AppShell.tsx", import.meta.url), "utf8");

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

test("the Workbench replaces the chat area in place", () => {
  assert.match(
    source,
    /\{activeView === "workbench" \? \(\s*<WorkbenchView \/>\s*\) : showChat \? \(/,
  );
});
