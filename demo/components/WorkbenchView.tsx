"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { getRecentProjects } from "@/lib/project-groups";
import type { SessionInfo } from "@/lib/types";
import { WorkItemDetail, type WorkbenchActions } from "./WorkItemDetail";
import { ConfigButton } from "./SettingsUi";
import {
  filterWorkItems,
  groupWorkItemsByProject,
  projectDisplayName,
  type WorkItemDto,
  type WorkbenchFilter,
} from "./workbench-view-helpers";

// The Workbench (工作台): the cross-Project view listing Work Items (工作目标)
// with their status and — from ticket 02 — their associated sessions. CRUD
// errors re-fetch from the server and surface a banner: a failed write never
// renders as a successful edit.

const FILTERS: WorkbenchFilter[] = ["all", "in-progress", "completed"];

const FILTER_LABEL_KEY: Record<WorkbenchFilter, string> = {
  all: "workbench.filter.all",
  "in-progress": "workbench.status.inProgress",
  completed: "workbench.status.completed",
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export default function WorkbenchView(actions: WorkbenchActions) {
  const { t, locale } = useI18n();
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }),
    [locale],
  );
  const [workItems, setWorkItems] = useState<WorkItemDto[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<WorkbenchFilter>("all");
  const [actionError, setActionError] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [projects, setProjects] = useState<{ key: string; root: string }[] | null>(null);
  const [createProjectRoot, setCreateProjectRoot] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJson<{ workItems: WorkItemDto[] }>("/api/work-items");
      setWorkItems(data.workItems);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Observe the existing session catalogue/registry even when all members
    // were idle on entry. A later run or completion must reach this view.
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const openCreate = useCallback(async () => {
    setCreateName(t("workbench.untitled"));
    setCreateProjectRoot(projects?.[0]?.root ?? null);
    setCreateOpen(true);
    if (projects === null) {
      try {
        const data = await fetchJson<{ sessions: SessionInfo[] }>("/api/sessions");
        const recent = getRecentProjects(data.sessions);
        setProjects(recent);
        setCreateProjectRoot(recent[0]?.root ?? null);
      } catch {
        setProjects([]);
      }
    }
  }, [projects, t]);

  const createItem = useCallback(async () => {
    if (!createProjectRoot || !createName.trim() || creating) return;
    setCreating(true);
    setActionError(false);
    try {
      await fetchJson("/api/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectRoot: createProjectRoot, name: createName.trim() }),
      });
      setCreateOpen(false);
      await refresh();
    } catch {
      // The list still shows the server's truth; the banner asks for a retry.
      setActionError(true);
      await refresh();
    } finally {
      setCreating(false);
    }
  }, [createName, createProjectRoot, creating, refresh]);

  const patchItem = useCallback(async (id: string, body: Record<string, unknown>) => {
    setActionError(false);
    try {
      await fetchJson(`/api/work-items/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setActionError(true);
    } finally {
      // Re-sync with the store even after a failure: the UI must show the
      // server's state, not an optimistic edit that did not persist.
      await refresh();
    }
  }, [refresh]);

  const deleteItem = useCallback(async (item: WorkItemDto) => {
    if (!window.confirm(t("workbench.deleteConfirm"))) return;
    setActionError(false);
    try {
      await fetchJson(`/api/work-items/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    } catch {
      setActionError(true);
    } finally {
      await refresh();
    }
  }, [refresh, t]);

  const startRename = useCallback((item: WorkItemDto) => {
    setRenamingId(item.id);
    setRenameValue(item.name);
  }, []);

  const submitRename = useCallback(async () => {
    const id = renamingId;
    if (!id || !renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    setRenamingId(null);
    await patchItem(id, { name: renameValue.trim() });
  }, [patchItem, renameValue, renamingId]);

  const visible = workItems === null ? [] : filterWorkItems(workItems, filter);
  const groups = groupWorkItemsByProject(visible);

  return (
    <div className="workbench-view" style={{ height: "100%", overflowY: "auto", background: "var(--bg)" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", margin: 0, flexShrink: 0 }}>
            {t("workbench.title")}
          </h1>
          <div className="config-scope-switch is-small" role="group" aria-label={t("workbench.title")}>
            {FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
                className="config-scope-switch-option"
              >
                {t(FILTER_LABEL_KEY[value])}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <ConfigButton
            variant="primary"
            onClick={() => { void openCreate(); }}
          >
            {t("workbench.create")}
          </ConfigButton>
        </div>

        {actionError && (
          <div role="alert" style={{ padding: "8px 12px", fontSize: 12, borderRadius: 6, border: "1px solid #dc2626", color: "#dc2626", background: "var(--bg-panel)" }}>
            {t("workbench.error.save")}
          </div>
        )}

        {createOpen && (
          <form
            onSubmit={(event) => { event.preventDefault(); void createItem(); }}
            style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8 }}
          >
            <label className="config-field">
              <span className="config-field-label">{t("workbench.createName")}</span>
              <input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder={t("workbench.createNamePlaceholder")}
                maxLength={200}
                autoFocus
                className="workbench-control"
              />
            </label>
            <label className="config-field">
              <span className="config-field-label">{t("workbench.createProject")}</span>
              {projects === null ? (
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{t("workbench.loading")}</span>
              ) : projects.length === 0 ? (
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{t("workbench.createNoProjects")}</span>
              ) : (
                <select
                  aria-label={t("workbench.createProject")}
                  value={createProjectRoot ?? ""}
                  onChange={(event) => setCreateProjectRoot(event.target.value || null)}
                  className="workbench-control"
                >
                  {projects.map((project) => (
                    <option key={project.key} value={project.root}>{projectDisplayName(project.root)}</option>
                  ))}
                </select>
              )}
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <ConfigButton
                onClick={() => setCreateOpen(false)}
              >
                {t("workbench.cancel")}
              </ConfigButton>
              <ConfigButton
                variant="primary"
                type="submit"
                disabled={!createProjectRoot || !createName.trim() || creating}
              >
                {t("workbench.create")}
              </ConfigButton>
            </div>
          </form>
        )}

        {loadError ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 48, color: "var(--text-muted)", fontSize: 13 }}>
            <div>{t("workbench.error.load")}</div>
            <ConfigButton
              onClick={() => { void refresh(); }}
            >
              {t("workbench.retry")}
            </ConfigButton>
          </div>
        ) : workItems === null ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{t("workbench.loading")}</div>
        ) : visible.length === 0 ? (
          workItems.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 15, color: "var(--text)" }}>{t("workbench.empty")}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", maxWidth: 420 }}>{t("workbench.emptyHint")}</div>
            </div>
          ) : (
            <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>{t("workbench.filterEmpty")}</div>
          )
        ) : (
          groups.map((group) => (
            <section key={group.projectKey} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "4px 2px" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{projectDisplayName(group.projectRoot)}</span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  {t("workbench.itemsCount", { count: group.items.length })}
                </span>
              </div>
              {group.items.map((item) => (
                <article
                  key={item.id}
                  className="workbench-item"
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                    background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                    {renamingId === item.id ? (
                      <form
                        onSubmit={(event) => { event.preventDefault(); void submitRename(); }}
                        style={{ display: "flex", gap: 6 }}
                      >
                        <input
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          maxLength={200}
                          autoFocus
                          onFocus={(event) => event.target.select()}
                          onBlur={() => { void submitRename(); }}
                          aria-label={t("workbench.rename")}
                          className="workbench-control"
                          style={{ flex: 1, minWidth: 0 }}
                        />
                        <ConfigButton type="submit" variant="primary">
                          {t("workbench.save")}
                        </ConfigButton>
                        <ConfigButton
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => setRenamingId(null)}
                        >
                          {t("workbench.cancel")}
                        </ConfigButton>
                      </form>
                    ) : (
                      <button className="workbench-item-title" aria-expanded={expandedId === item.id} onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} style={{ fontSize: 14, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.name}
                      </button>
                    )}
                    <span style={{ fontSize: 11, color: "var(--text-dim)", display: "flex", gap: 8 }}>
                      <span>{dateFormatter.format(new Date(item.updatedAt))}</span>
                      <span>{t("workbench.sessionsCount", { count: item.sessionIds.length })}</span>
                    </span>
                  </div>
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 10, flexShrink: 0,
                    background: item.status === "completed" ? "var(--bg-selected)" : "var(--bg)",
                    border: "1px solid var(--border)",
                    color: item.status === "completed" ? "var(--accent)" : "var(--text-muted)",
                  }}>
                    {t(item.status === "completed" ? "workbench.status.completed" : "workbench.status.inProgress")}
                  </span>
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    {renamingId !== item.id && (
                      <ConfigButton
                        variant="ghost" size="small"
                        title={t("workbench.rename")}
                        aria-label={`${t("workbench.rename")}: ${item.name}`}
                        onClick={() => startRename(item)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </ConfigButton>
                    )}
                    <ConfigButton
                      variant="ghost" size="small"
                      onClick={() => { void patchItem(item.id, { status: item.status === "completed" ? "in-progress" : "completed" }); }}
                    >
                      {t(item.status === "completed" ? "workbench.reopen" : "workbench.complete")}
                    </ConfigButton>
                    <ConfigButton
                      variant="danger" size="small"
                      title={t("workbench.delete")}
                      aria-label={`${t("workbench.delete")}: ${item.name}`}
                      onClick={() => { void deleteItem(item); }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </ConfigButton>
                  </div>
                  {expandedId === item.id && <WorkItemDetail item={item} refresh={refresh} {...actions} />}
                </article>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
