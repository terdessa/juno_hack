export function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function formatRelative(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 60_000;
  const abs = Math.abs(diff);
  if (abs < 1) return "now";
  if (abs < 60) return diff > 0 ? `in ${Math.round(abs)}m` : `${Math.round(abs)}m ago`;
  const h = abs / 60;
  if (h < 24) return diff > 0 ? `in ${Math.round(h)}h` : `${Math.round(h)}h ago`;
  const d = Math.round(h / 24);
  return diff > 0 ? `in ${d}d` : `${d}d ago`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDuration(sec?: number) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
