/** Human duration from minutes: 45m, 5h 30m, 1d 2h. */
export function formatDurationMinutes(totalMinutes: number): string {
  const total = Math.max(0, Math.round(Math.abs(totalMinutes)));
  if (total === 0) return "0m";
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const minutes = total % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}
