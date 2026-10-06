const PREFIX = "pi-web-work-item-draft:";
const intents = new Map<string, string>();
export function getWorkItemDraftIntent(key: string | null): string | undefined {
  if (!key) return undefined;
  try { return intents.get(key) ?? window.sessionStorage.getItem(PREFIX + key) ?? undefined; } catch { return intents.get(key); }
}
export function setWorkItemDraftIntent(key: string, id?: string) {
  if (id) intents.set(key, id); else intents.delete(key);
  try { if (id) window.sessionStorage.setItem(PREFIX + key, id); else window.sessionStorage.removeItem(PREFIX + key); } catch { /* optional tab storage */ }
}
export function rekeyWorkItemDraftIntent(previous: string, next: string) {
  const id = getWorkItemDraftIntent(previous);
  if (id) setWorkItemDraftIntent(next, id);
  setWorkItemDraftIntent(previous);
}
