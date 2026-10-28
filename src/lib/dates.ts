/** yyyy-mm-dd for today + offset days (server-side form defaults). */
export function isoDateOffset(days = 0): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

/** Date `days` before now. */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86400000);
}
