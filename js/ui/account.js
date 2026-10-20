import { api, esc, fmtCredits, fmtWhen, fmtDur, eventUrl } from "../api.js";
import { openPayment } from "./payment.js";

export async function openAccount(ctx) {
  const el = ctx.openSheet('<h2>My events</h2><div id="acc"><p class="muted">Loading…</p></div>');
  const root = el.querySelector("#acc");
  if (!ctx.user) { root.innerHTML = '<p>Sign in to websim to see your reservations.</p>'; return; }
  const r = await api("/api/bookings/mine");
  const list = r.bookings || [];
  root.innerHTML = `
    <div class="row muted" style="margin-bottom:6px"><a class="user" href="https://websim.com/@${esc(ctx.user.username)}" target="_blank"><img src="https://images.websim.com/avatar/${esc(ctx.user.username)}" alt="">@${esc(ctx.user.username)}</a></div>
    ${list.length ? "" : '<p>No reservations yet.</p><button class="btn primary" id="acc-book">Book a date</button>'}
    ${list.map((b) => {
      const pct = Math.min(100, (b.paid_credits / b.total_credits) * 100);
      const sbLeft = b.sandbox_total - b.sandbox_used;
      const status = b.status === "pending" ? '<span class="pill warn">Deposit needed</span>' : b.due_credits ? '<span class="pill">Balance due</span>' : '<span class="pill ok">Paid</span>';
      return `<div class="card" data-id="${b.id}">
        <div class="row"><span class="ttl grow">${esc(b.couple_names)}</span>${status}</div>
        <div class="muted">${fmtWhen(b.start_utc)} – ${fmtWhen(b.end_utc, { hour: "numeric", minute: "2-digit" })} · ${b.id}</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="muted">${fmtCredits(b.paid_credits)} of ${fmtCredits(b.total_credits)}${b.status === "confirmed" ? " · sandbox " + fmtDur(sbLeft) + " left" : ""}</div>
        <div class="row" style="margin-top:12px">
          ${b.due_credits ? '<button class="btn small gold" data-a="pay">' + (b.status === "pending" ? "Pay deposit" : "Pay balance") + "</button>" : ""}
          ${b.status === "confirmed" ? '<a class="btn small" href="?sandbox=' + b.id + '" style="text-decoration:none">Rehearse' + (sbLeft <= 0 ? " (used)" : "") + "</a>" : ""}
          ${b.status === "confirmed" ? '<button class="btn small" data-a="link">Copy guest link</button>' : ""}
          ${b.venue.open ? '<a class="btn small primary" href="?e=' + b.id + '" style="text-decoration:none">Enter venue</a>' : ""}
        </div>
      </div>`; }).join("")}`;
  root.querySelector("#acc-book")?.addEventListener("click", () => import("./booking.js").then((m) => m.openBooking(ctx)));
  root.querySelectorAll(".card").forEach((c) => {
    const b = list.find((x) => x.id === c.dataset.id);
    c.querySelector('[data-a="pay"]')?.addEventListener("click", () => openPayment(ctx, b));
    c.querySelector('[data-a="link"]')?.addEventListener("click", async () => { await navigator.clipboard?.writeText(eventUrl(b.id)); ctx.toast("Guest link copied"); });
  });
}
