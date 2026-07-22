// Shared date formatting for event/bounty stamps. Dates replaced session
// numbers when the global clock was removed (docs/decisions.md, 2026-07-22):
// short, calendar-honest, and quiet — "12 Jul", with the year only once it
// stops being obvious.

export function fmtDay(ms: number): string {
  const d = new Date(ms);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}
