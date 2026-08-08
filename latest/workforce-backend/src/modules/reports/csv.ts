function escapeCsv(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; header: string }[]) {
  const header = columns.map((c) => escapeCsv(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCsv(row[c.key])).join(",")).join("\n");
  return `${header}\n${body}${body ? "\n" : ""}`;
}
