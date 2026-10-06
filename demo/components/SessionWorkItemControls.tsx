"use client";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { SessionInfo } from "@/lib/types";
import { workspaceKeyOf } from "@/lib/workspace-memory";
import type { WorkItemDto } from "./workbench-view-helpers";

export function SessionWorkItemControls({ session }: { session: SessionInfo }) {
  const { t } = useI18n();
  const [items, setItems] = useState<WorkItemDto[]>([]);
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const owner = items.find((item) => item.sessionIds.includes(session.id));
  const reload = useCallback(async () => {
    const response = await fetch("/api/work-items");
    if (!response.ok) throw new Error(t("workbench.error.load"));
    setItems((await response.json()).workItems);
  }, [t]);
  useEffect(() => { void reload().catch((e) => setError(e.message)); }, [reload]);
  useEffect(() => {
    const listener = () => { void reload().catch((e) => setError(e.message)); };
    window.addEventListener("work-item-associated", listener);
    return () => window.removeEventListener("work-item-associated", listener);
  }, [reload]);
  async function act(url: string, method: string, body?: unknown) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(t(data.code === "association_conflict" ? "workbench.conflict" : "workbench.error.save"));
      window.dispatchEvent(new CustomEvent("work-item-associated", { detail: { sessionId: session.id } }));
    } catch (e) { setError(e instanceof Error ? e.message : t("workbench.error.save")); }
    finally { await reload().catch((e) => setError(e.message)); setBusy(false); }
  }
  return <div className="workbench-session-controls">
    <span>{owner ? `${t("workbench.goal")}: ${owner.name}` : t("workbench.unassociated")}</span>
    {!owner && <button disabled={busy} onClick={() => {
      const name = window.prompt(t("workbench.saveAs"), session.name || session.firstMessage || t("workbench.untitled"));
      if (name?.trim()) void act("/api/work-items", "POST", { projectRoot: session.projectRoot ?? session.cwd, name: name.trim(), sessionIds: [session.id] });
    }}>{t("workbench.saveAs")}</button>}
    <select aria-label={t("workbench.attach")} value={target} onChange={(e) => setTarget(e.target.value)}>
      <option value="">{t("workbench.chooseGoal")}</option>
      {items.filter((item) => item.projectKey === workspaceKeyOf(session)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    <button disabled={busy || !target} onClick={() => {
      if (owner && owner.id !== target && !window.confirm(t("workbench.moveConfirm", { name: owner.name }))) return;
      void act(`/api/work-items/${target}/sessions`, "POST", { sessionId: session.id, expectedWorkItemId: owner?.id ?? null });
    }}>{t("workbench.attach")}</button>
    {owner && <button disabled={busy} onClick={() => { void act(`/api/work-items/${owner.id}/sessions/${session.id}`, "DELETE"); }}>{t("workbench.detach")}</button>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
