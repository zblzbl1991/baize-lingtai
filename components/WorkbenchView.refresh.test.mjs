import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// Execute the real component with a small hook scheduler; no browser or server
// is needed to exercise visibility, timer cleanup and prop-change effects.
function mount(file, fetch, window = {}) {
  const hooks = [], effects = [], timers = new Map();
  let cursor = 0, timerId = 0;
  const document = { visibilityState: "visible" };
  const t = (key, params) => params?.name ? `${key}: ${params.name}` : key;
  const memoize = (fn, deps) => { const index = cursor++, previous = hooks[index]; if (!previous || deps.some((value, i) => value !== previous.deps[i])) hooks[index] = { deps, value: fn() }; return hooks[index].value; };
  const React = {
    useState(initial) { const index = cursor++; hooks[index] ??= { value: typeof initial === "function" ? initial() : initial }; return [hooks[index].value, (value) => { hooks[index].value = typeof value === "function" ? value(hooks[index].value) : value; }]; },
    useMemo: memoize,
    useCallback(fn, deps) { return memoize(() => fn, deps); },
    useEffect(fn, deps) {
      const index = cursor++, previous = hooks[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        effects.push(() => { previous?.cleanup?.(); hooks[index] = { deps, cleanup: fn() }; });
      }
    },
  };
  const exports = {};
  const context = { exports, fetch, document, AbortController, Intl, window: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, ...window }, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setInterval(fn) { timers.set(++timerId, fn); return timerId; }, clearInterval(id) { timers.delete(id); },
    require(name) {
      if (name === "react") return React;
      if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name.includes("useI18n")) return { useI18n: () => ({ t, locale: "en" }) };
      if (name.includes("workspace-memory")) return { workspaceKeyOf: (session) => session.projectKey ?? session.cwd };
      if (name.includes("project-groups")) return { getRecentProjects: () => [] };
      if (name.includes("workbench-view-helpers")) return { filterWorkItems: (items) => items, groupWorkItemsByProject: () => [] };
      if (name.includes("WorkItemDetail")) return { WorkItemDetail: () => null };
      throw new Error(name);
    },
  };
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, context);
  const Component = exports.default ?? exports.WorkItemDetail ?? exports.SessionWorkItemControls;
  return { document, timers, render(props) { cursor = 0; const tree = Component(props); effects.splice(0).forEach((effect) => effect()); return tree; }, unmount() { hooks.forEach((hook) => hook?.cleanup?.()); } };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
function elements(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((child) => elements(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)];
}
const button = (tree, label) => elements(tree, (element) => element.type === "button" && element.props.children === label)[0];

test("the visible Workbench observes sessions that start after an idle initial snapshot", async () => {
  let reads = 0;
  const view = mount("./WorkbenchView.tsx", async () => { reads++; return { ok: true, json: async () => ({ workItems: [] }) }; });
  view.render({}); await settle();
  assert.equal(reads, 1);
  assert.equal(view.timers.size, 1, "idle lists must still observe the running registry");
  [...view.timers.values()][0](); await settle(); assert.equal(reads, 2);
  view.document.visibilityState = "hidden";
  [...view.timers.values()][0](); await settle(); assert.equal(reads, 2);
  view.unmount(); assert.equal(view.timers.size, 0);
});

test("detail refreshes Outputs after a previously idle member runs and completes", async () => {
  let reads = 0;
  const detail = mount("./WorkItemDetail.tsx", async () => { reads++; return { ok: true, json: async () => ({ outputs: [], incomplete: false, reasons: [] }) }; });
  const item = { id: "goal", sessionIds: ["session"], sessions: [{ id: "session", modified: "2026-01-01", isRunning: false }] };
  const refresh = async () => {};
  detail.render({ item, refresh }); await settle();
  detail.render({ item: { ...item, sessions: [{ ...item.sessions[0], isRunning: true }] }, refresh }); await settle();
  detail.render({ item: { ...item, sessions: [{ ...item.sessions[0], modified: "2026-01-02", isRunning: false }] }, refresh }); await settle();
  assert.equal(reads, 3, "both start and completion invalidate the idle Outputs snapshot");
  detail.unmount();
});

test("a stale move requires a fresh confirmation naming the refreshed owner", async () => {
  const session = { id: "session", cwd: "/repo", projectKey: "/repo", name: "Existing title" };
  let owner = "A";
  const writes = [], confirmations = [];
  let consent = false;
  const controls = mount("./SessionWorkItemControls.tsx", async (url, init) => {
    if (init?.method === "POST") {
      writes.push(JSON.parse(init.body)); owner = "C";
      return { ok: false, json: async () => ({ code: "association_conflict", currentWorkItemId: "C" }) };
    }
    return { ok: true, json: async () => ({ workItems: ["A", "B", "C"].map((id) => ({ id, projectKey: "/repo", name: id, sessionIds: id === owner ? [session.id] : [] })) }) };
  }, { confirm(message) { confirmations.push(message); return consent; } });
  controls.render({ session }); await settle();
  let tree = controls.render({ session });
  elements(tree, (element) => element.type === "select")[0].props.onChange({ target: { value: "B" } });
  tree = controls.render({ session });
  button(tree, "workbench.attach").props.onClick(); await settle();
  assert.equal(writes.length, 0, "declining the move leaves the store untouched");
  consent = true; button(tree, "workbench.attach").props.onClick(); await settle();
  assert.equal(writes[0].expectedWorkItemId, "A");
  tree = controls.render({ session });
  assert.equal(elements(tree, (element) => element.props?.role === "alert")[0].props.children, "workbench.conflict");
  consent = false; button(tree, "workbench.attach").props.onClick();
  assert.match(confirmations.at(-1), /C/);
  assert.equal(writes.length, 1, "conflict recovery does not automatically retry a move");
  controls.unmount();
});

test("save-as uses the current session title and explicitly associates that session", async () => {
  const session = { id: "session", cwd: "/repo", name: "Existing title" };
  const prompts = [], writes = [];
  const controls = mount("./SessionWorkItemControls.tsx", async (url, init) => {
    if (init?.method === "POST") { writes.push(JSON.parse(init.body)); return { ok: true, json: async () => ({}) }; }
    return { ok: true, json: async () => ({ workItems: [] }) };
  }, { prompt(message, initial) { prompts.push(initial); return initial; } });
  controls.render({ session }); await settle();
  button(controls.render({ session }), "workbench.saveAs").props.onClick(); await settle();
  assert.deepEqual(prompts, [session.name]); assert.equal(writes[0].name, session.name);
  assert.deepEqual(writes[0].sessionIds, [session.id]); controls.unmount();
});

test("detail exposes unavailable members and empty partial Outputs, and disables missing files", async () => {
  let payload = { outputs: [], incomplete: true, reasons: ["unavailable"] };
  const detail = mount("./WorkItemDetail.tsx", async () => ({ ok: true, json: async () => payload }));
  const opened = [];
  const item = { id: "goal", sessionIds: ["absent", "available"], sessions: [{ id: "absent", unavailable: true }, { id: "available", name: "Recent", modified: "2026-01-02", isRunning: false }] };
  const props = { item, refresh: async () => {}, onOpenSession: (id) => opened.push(id) };
  detail.render(props); await settle(); let tree = detail.render(props);
  button(tree, "workbench.resume").props.onClick(); assert.deepEqual(opened, ["available"]);
  assert.equal(elements(tree, (element) => element.props?.role === "status").length, 1);
  payload = { outputs: [{ filePath: "/missing", state: "missing", diffAvailable: false }], incomplete: false, reasons: [] };
  button(tree, "workbench.refresh").props.onClick(); detail.render(props); await settle(); tree = detail.render(props);
  assert.equal(button(tree, "/missing").props.disabled, true);
  assert.equal(button(tree, "workbench.currentDiff"), undefined); detail.unmount();
});
