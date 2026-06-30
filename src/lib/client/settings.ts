const AUTOSAVE_KEY = "grocerylist-autosave";

export function getAutoSaveEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const val = localStorage.getItem(AUTOSAVE_KEY);
  return val === null ? true : val === "true";
}

export function setAutoSaveEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTOSAVE_KEY, enabled ? "true" : "false");
}
