export function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  // Show enough precision that sub-tick energy amounts (draw / 3600) are visible,
  // then trim trailing zeros so common values stay readable (e.g. "6.5", "493.5").
  return Number(value.toFixed(4)).toString();
}

export function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column]?.length ?? 0)),
  );

  const formatRow = (cells: string[]): string =>
    cells
      .map((cell, column) => cell.padEnd(widths[column] ?? 0))
      .join("  ")
      .trimEnd();

  const divider = widths.map((width) => "-".repeat(width)).join("  ");

  return [formatRow(headers), divider, ...rows.map(formatRow)].join("\n");
}
