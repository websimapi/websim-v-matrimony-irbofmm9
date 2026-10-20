import { api } from "./api.js";

// Mock checkout via websim tip comments. The comment carries the booking code;
// server.js verifies the tip against the public comments API.
let listening = false; const waiters = new Set();
function listen() {
  if (listening) return; listening = true;
  window.websim?.addEventListener?.("comment:created", (d) => { for (const w of [...waiters]) w(d?.comment); });
}
export function payWithTip(booking, credits) {
  listen();
  return new Promise(async (resolve) => {
    const done = (v) => { waiters.delete(onC); resolve(v); };
    const onC = async (c) => {
      if (!c || !String(c.raw_content || "").includes(booking.id)) return;
      done(await api("/api/payments/claim", { booking_id: booking.id, comment_id: c.id, credits }));
    };
    waiters.add(onC);
    const content = "💍 V-Matrimony payment " + booking.id + " - " + booking.couple_names;
    const r = await window.websim.postComment({ content, credits: Math.round(credits) });
    if (r?.error) done({ error: r.error });
    // The composer stays open until the user posts; the caller shows a waiting state.
    payWithTip.cancel = () => done({ cancelled: true });
  });
}
export const syncMyPayments = (id) => api("/api/payments/sync", { booking_id: id });
