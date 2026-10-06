"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import type { WorkItemDto } from "./workbench-view-helpers";
import type { WorkItemOutputsResponse, WorkItemOutput } from "@/lib/work-item-output-types";

export interface WorkbenchActions {
  onOpenSession?: (id: string) => void;
  onNewSession?: (item: WorkItemDto) => void;
  onOpenOutput?: (file: WorkItemOutput, diff: boolean) => void;
}
export function WorkItemDetail({ item, onOpenSession, onNewSession, onOpenOutput, refresh }: WorkbenchActions & { item: WorkItemDto; refresh: () => Promise<void> }) {
  const { t } = useI18n();
  const [outputs, setOutputs] = useState<WorkItemOutputsResponse | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const membership = item.sessionIds.join(",");
  const sessionRevision = item.sessions?.map((session) => "unavailable" in session
    ? `${session.id}:unavailable` : `${session.id}:${session.modified}:${session.isRunning}`).join(",") ?? "";
  useEffect(() => {
    const controller = new AbortController();
    setOutputs(null); setError(false);
    void fetch(`/api/work-items/${item.id}/outputs`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      setOutputs(await response.json());
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [item.id, membership, sessionRevision, revision]);
  const available = item.sessions?.filter((session) => !("unavailable" in session)) ?? [];
  return <div className="workbench-detail">
    <div className="workbench-actions">
      {available[0] && <button onClick={() => onOpenSession?.(available[0].id)}>{t("workbench.resume")}</button>}
      <button onClick={() => onNewSession?.(item)}>{t("workbench.newSession")}</button>
      <button onClick={() => { void refresh(); setRevision((n) => n + 1); }}>{t("workbench.refresh")}</button>
    </div>
    <h3>{t("workbench.sessions")}</h3>
    {!item.sessions?.length && <p>{t("workbench.noSessions")}</p>}
    {item.sessions?.map((session) => <div key={session.id} className="workbench-session-row">
      {"unavailable" in session ? <span>{session.id} · {t("workbench.unavailable")}</span> : <button onClick={() => onOpenSession?.(session.id)}>
        {session.isRunning && <span aria-label={t("workbench.running")}>● </span>}{session.name || session.firstMessage || session.id}
      </button>}
      <button aria-label={t("workbench.detach")} onClick={async () => {
        const response = await fetch(`/api/work-items/${item.id}/sessions/${session.id}`, { method: "DELETE" });
        if (response.ok) await refresh(); else setError(true);
      }}>{t("workbench.detach")}</button>
    </div>)}
    <h3>{t("workbench.outputs")}</h3>
    <p className="workbench-note">{t("workbench.outputCoverage")}</p>
    {error && <p role="alert">{t("workbench.error.load")}</p>}
    {!outputs && !error && <p>{t("workbench.loading")}</p>}
    {outputs?.incomplete && <p role="status">{t("workbench.partialOutputs")} {outputs.reasons.map((reason) => t(`workbench.reason.${reason}`)).join(" · ")}</p>}
    {outputs && !outputs.outputs.length && <p>{t("workbench.noOutputs")}</p>}
    {outputs?.outputs.map((file) => <div key={file.filePath} className="workbench-output-row">
      <button disabled={file.state === "missing" || file.state === "unavailable"} onClick={() => onOpenOutput?.(file, false)}>{file.filePath}</button>
      <span>{t(`workbench.fileState.${file.state}`)}</span>
      {file.diffAvailable && <button onClick={() => onOpenOutput?.(file, true)}>{t("workbench.currentDiff")}</button>}
      {file.state === "changed" && !file.diffAvailable && <span>{t("workbench.diffUnavailable")}</span>}
    </div>)}
  </div>;
}
