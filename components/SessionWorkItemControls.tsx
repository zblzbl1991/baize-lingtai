"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { SessionInfo } from "@/lib/types";
import { workspaceKeyOf } from "@/lib/workspace-memory";
import type { WorkItemDto } from "./workbench-view-helpers";
import { ConfigButton } from "./SettingsUi";

export function SessionWorkItemControls({ session }: { session: SessionInfo }) {
  const { t } = useI18n();
  const [items, setItems] = useState<WorkItemDto[]>([]);
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const saveTrigger = useRef<HTMLButtonElement>(null);
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
  useEffect(() => { setSaveOpen(false); setError(""); setTarget(""); }, [session.id]);
  function closeSave() {
    setSaveOpen(false);
    saveTrigger.current?.focus();
  }
  async function act(url: string, method: string, body?: unknown) {
    if (busy) return false;
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(t(data.code === "association_conflict" ? "workbench.conflict" : "workbench.error.save"));
      window.dispatchEvent(new CustomEvent("work-item-associated", { detail: { sessionId: session.id } }));
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : t("workbench.error.save")); return false; }
    finally { await reload().catch((e) => setError(e.message)); setBusy(false); }
  }
  return <div className="workbench-session-controls">
    <span>{owner ? `${t("workbench.goal")}: ${owner.name}` : t("workbench.unassociated")}</span>
    {!owner && <ConfigButton ref={saveTrigger} disabled={busy} aria-expanded={saveOpen} onClick={() => {
      if (saveOpen) { closeSave(); return; }
      setName((session.name || session.firstMessage || t("workbench.untitled")).slice(0, 200));
      setError(""); setSaveOpen(true);
    }}>{t("workbench.saveAs")}</ConfigButton>}
    <select className="workbench-control" disabled={busy || saveOpen} aria-label={t("workbench.attach")} value={target} onChange={(e) => setTarget(e.target.value)}>
      <option value="">{t("workbench.chooseGoal")}</option>
      {items.filter((item) => item.projectKey === workspaceKeyOf(session)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    <ConfigButton disabled={busy || saveOpen || !target} onClick={() => {
      if (owner && owner.id !== target && !window.confirm(t("workbench.moveConfirm", { name: owner.name }))) return;
      void act(`/api/work-items/${target}/sessions`, "POST", { sessionId: session.id, expectedWorkItemId: owner?.id ?? null });
    }}>{t("workbench.attach")}</ConfigButton>
    {owner && <ConfigButton variant="ghost" disabled={busy} onClick={() => { void act(`/api/work-items/${owner.id}/sessions/${session.id}`, "DELETE"); }}>{t("workbench.detach")}</ConfigButton>}
    {!owner && saveOpen && <form className="workbench-save-form" aria-label={t("workbench.saveAs")} aria-busy={busy}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
        event.preventDefault(); event.stopPropagation();
        if (!busy) closeSave();
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim() || busy) return;
        if (await act("/api/work-items", "POST", { projectRoot: session.projectRoot ?? session.cwd, name: name.trim(), sessionIds: [session.id] })) closeSave();
      }}>
      <label className="config-field">
        <span className="config-field-label">{t("workbench.createName")}</span>
        <input className="workbench-control" value={name} onChange={(event) => setName(event.target.value)}
          placeholder={t("workbench.createNamePlaceholder")} maxLength={200} required autoFocus disabled={busy} />
      </label>
      <div className="workbench-actions">
        <ConfigButton type="submit" variant="primary" disabled={busy || !name.trim()}>{t("workbench.save")}</ConfigButton>
        <ConfigButton disabled={busy} onClick={closeSave}>{t("workbench.cancel")}</ConfigButton>
      </div>
    </form>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
