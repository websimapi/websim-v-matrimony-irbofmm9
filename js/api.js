export async function api(path, body, method) {
  const r = await fetch(path, body !== undefined || method ? { method: method || "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) } : undefined);
  let d; try { d = await r.json(); } catch { d = { error: "Server error (" + r.status + ")" }; }
  if (!r.ok && !d.error) d.error = "Request failed (" + r.status + ")";
  return d;
}
export const fmtCredits = (c) => Math.round(c).toLocaleString() + " cr";
export const fmtUsd = (c, perUsd = 2000) => "$" + (c / perUsd).toFixed(2);
export function fmtWhen(ms, opts) {
  return new Date(ms).toLocaleString(undefined, opts || { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
export function fmtDur(s) { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? h + "h " + m + "m" : m + "m"; }
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function eventUrl(id) { const u = new URL(location.href); u.search = "?e=" + id; u.hash = ""; return u.toString(); }
