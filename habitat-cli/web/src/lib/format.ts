// Small display formatters shared across dashboard cards.

export function formatKg(value: number, digits = 1): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// "IV" from "Idris Vance"; falls back to the first two characters.
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Compact relative age for alert metadata: "just now", "42 min ago", "3 h ago",
// "2 d ago". Falls back to the raw string when the timestamp does not parse.
export function relativeAge(isoTimestamp: string): string {
  const then = Date.parse(isoTimestamp);
  if (!Number.isFinite(then)) return isoTimestamp;
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}
