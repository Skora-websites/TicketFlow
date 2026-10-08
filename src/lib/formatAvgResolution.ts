/**
 * Format an average-resolution duration for the dashboard stat cards.
 * Sub-day values read as hours (e.g. "4.2h"); days kick in past 24h ("1.3d").
 */
export function formatAvgResolution(days: number, hours?: number): string {
  const h = hours ?? (days ?? 0) * 24;
  if (h > 0 && h < 1) return "<1h";
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}
