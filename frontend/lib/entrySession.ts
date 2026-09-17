/** Session-scoped flag: entry preloader runs once per browser tab session. */
export const ENTRY_SESSION_KEY = 'floatchat-entry-complete';

export function hasCompletedEntrySession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(ENTRY_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function markEntrySessionComplete(): void {
  try {
    sessionStorage.setItem(ENTRY_SESSION_KEY, '1');
  } catch {
    /* private mode / blocked storage */
  }
}
