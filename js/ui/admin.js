import { api, esc, fmtCredits, fmtUsd, fmtWhen, fmtDur, eventUrl } from "../api.js";

const TABS = ["Overview", "Bookings", "Payments", "Calendar", "Pricing", "Admins"];
export async function openAdmin(ctx, tab = "Overview") {
  const el = ctx.openSheet('<div id="adm"><p class="muted">Loading…</p></div>', { wide: true });
  const root = el.querySelector("#adm");
  let d = await api("/api/admin/overview");
  if (d.error) { root.innerHTML = "<p>" + esc(d.error) + "</p>"; return; }
  const reload = async (t = tab) => { d = await api("/api/admin/overview"); tab = t; render(); };
  const act = async (path, body, method) => { const r = await api(path, body, method); if (r.error) ctx.toast(r.error); else ctx.toast("Saved"); await reload(); return r; };
  const user = (u) => u ? '<a class="user" target="_blank" href="https://websim.com/@' + esc(u) + '"><img src="https://images.websim.com/avatar/' + esc(u) + '" alt="">@' + esc(u) + "</a>" : "—";
  const statusPill = (b) => b.status === "cancelled" ? '<span class="pill bad">Cancelled</span>' : b.status === "pending" ? '<span class="pill warn">Pending</span>' : b.due_credits ? '<span class="pill">Deposit</span>' : '<span class="pill ok">Paid</span>';

  function render() {
    const up = d.bookings.filter((b) => b.status !== "cancelled" && b.end_utc > Date.now());
    const pend = d.payments.filter((p) => p.verified === 0);
    const revenue = d.payments.filter((p) => p.verified === 1).reduce((s, p) => s + p.credits, 0);
    const liveIds = Object.keys(d.live || {});
    let body = "";
    if (tab === "Overview") {
      const next = up[0];
      body = `<div class="stat">
          <div><b>${up.length}</b><span class="muted">Upcoming events</span></div>
          <div><b>${fmtCredits(revenue)}</b><span class="muted">${fmtUsd(revenue)} collected</span></div>
          <div><b>${pend.length}</b><span class="muted">Payments to verify</span></div>
          <div><b>${liveIds.length}</b><span class="muted">Venues live now</span></div>
        </div>
        ${liveIds.length ? "<h3>Live now</h3>" + liveIds.map((id) => '<div class="row card"><b class="grow">' + id + "</b><span>" + d.live[id].bodies + " walking · " + d.live[id].spectators + ' watching</span><a class="btn small primary" href="?e=' + id + '" style="text-decoration:none">Join as staff</a></div>').join("") : ""}
        <div class="row card"><span class="grow"><b>Admin sandbox</b><div class="muted">Test the venue any time — no booking or date needed.</div></span><button class="btn small primary" id="adm-sb">Open sandbox</button></div>
        <h3>Next up</h3>
        ${next ? bookingCard(next) : '<p class="muted">No upcoming events.</p>'}
        ${d.projectId ? "" : '<p class="muted">Tip verification activates once the owner has opened the page (project id not stored yet).</p>'}`;
    }
    if (tab === "Bookings") {
      body = '<div class="scroll-x"><table class="t"><tr><th>Date</th><th>Couple</th><th>Host</th><th>Pkg</th><th>Paid</th><th>Status</th><th></th></tr>' +
        d.bookings.map((b) => `<tr><td>${fmtWhen(b.start_utc)}</td><td>${esc(b.couple_names)}<div class="muted">${b.id}</div></td><td>${user(b.host)}</td>
          <td>${esc(b.package_id)}${b.extra_hours ? " +" + b.extra_hours + "h" : ""}</td><td>${fmtCredits(b.paid_credits)} / ${fmtCredits(b.total_credits)}</td>
          <td>${statusPill(b)}</td><td><button class="btn small" data-edit="${b.id}">Manage</button></td></tr>`).join("") + "</table></div>" +
        (d.bookings.length ? "" : '<p class="muted">No bookings yet.</p>');
    }
    if (tab === "Payments") {
      body = `<div class="row"><p class="grow">Tip comments that contain a booking code are matched automatically. Unverified claims wait here.</p><button class="btn small" id="sync">Scan tip comments</button></div>
        <div class="scroll-x"><table class="t"><tr><th>When</th><th>Booking</th><th>From</th><th>Credits</th><th>Method</th><th>Status</th><th></th></tr>${d.payments.map((p) => `
        <tr><td>${fmtWhen(p.created_at)}</td><td>${esc(p.booking_id)}</td><td>${user(p.username)}</td><td>${fmtCredits(p.credits)}</td><td>${esc(p.method)}${p.note ? '<div class="muted">' + esc(p.note) + "</div>" : ""}</td>
        <td>${p.verified === 1 ? '<span class="pill ok">Verified</span>' : p.verified === -1 ? '<span class="pill bad">Rejected</span>' : '<span class="pill warn">Review</span>'}</td>
        <td>${p.verified === 0 ? '<button class="btn small" data-ok="' + p.id + '">Approve</button> <button class="btn small danger" data-no="' + p.id + '">Reject</button>' : ""}</td></tr>`).join("")}</table></div>`;
    }
    if (tab === "Calendar") {
      const taken = d.bookings.filter((b) => b.status !== "cancelled");
      body = `<p>Reserved days are locked automatically. Block extra days for staff time off or maintenance.</p>
        <div class="row"><label class="field"><span>Date</span><input type="date" id="bd"></label><label class="field grow"><span>Reason</span><input id="br" placeholder="Staff holiday"></label><button class="btn primary" id="bb" style="margin-top:14px">Block</button></div>
        <h3>Blocked</h3>${d.blocked.map((x) => '<div class="row guest-row"><b>' + x.date + '</b><span class="grow muted">' + esc(x.reason || "") + '</span><button class="btn small" data-unb="' + x.date + '">Unblock</button></div>').join("") || '<p class="muted">None.</p>'}
        <h3>Reserved</h3>${taken.map((b) => '<div class="row guest-row"><b>' + b.date + '</b><span class="grow">' + esc(b.couple_names) + "</span>" + statusPill(b) + "</div>").join("") || '<p class="muted">None.</p>'}`;
    }
    if (tab === "Pricing") {
      const pr = d.pricing;
      body = `<p>Prices in USD; credits are derived at 1,000 credits = $0.50. Changes apply to new bookings.</p>
        ${pr.packages.map((p, i) => `<div class="card" data-pk="${i}"><div class="row">
          <label class="field"><span>Id</span><input data-k="id" value="${esc(p.id)}" style="width:110px"></label>
          <label class="field grow"><span>Name</span><input data-k="name" value="${esc(p.name)}"></label>
          <label class="field"><span>Tier</span><select data-k="tier"><option ${p.tier === "hands-off" ? "selected" : ""}>hands-off</option><option ${p.tier === "hands-on" ? "selected" : ""}>hands-on</option></select></label>
          <label class="field"><span>USD</span><input data-k="usd" type="number" value="${p.usd}" style="width:90px"></label>
          <label class="field"><span>Guests</span><input data-k="capacity" type="number" value="${p.capacity}" style="width:80px"></label></div>
          <label class="field"><span>Description</span><input data-k="blurb" value="${esc(p.blurb)}"></label>
          <button class="btn small danger" data-rm="${i}">Remove</button></div>`).join("")}
        <div class="row"><button class="btn small" id="pk-add">Add package</button><label class="field"><span>Extra hour (USD)</span><input id="xh" type="number" value="${pr.extraHourUsd}" style="width:90px"></label><span class="grow"></span><button class="btn primary" id="pk-save">Save pricing</button></div>`;
    }
    if (tab === "Admins") {
      body = `<p>Admins can see this panel, manage bookings and payments, and join any venue as staff.</p>
        <div class="row guest-row">${user(d.me.username)}<span class="pill">You</span></div>
        ${d.admins.map((a) => '<div class="row guest-row">' + user(a.username) + '<span class="grow muted">added by @' + esc(a.granted_by || "?") + '</span><button class="btn small danger" data-rmadm="' + esc(a.username) + '">Remove</button></div>').join("")}
        <div class="row" style="margin-top:10px"><label class="field grow"><span>Grant admin to</span><input id="na" placeholder="@username"></label><button class="btn primary" id="na-go" style="margin-top:14px">Add admin</button></div>`;
    }
    root.innerHTML = '<h2>Admin</h2><div class="seg" style="margin:8px 0 14px">' + TABS.map((t) => '<button data-tab="' + t + '" class="' + (t === tab ? "on" : "") + '">' + t + (t === "Payments" && pend.length ? " · " + pend.length : "") + "</button>").join("") + "</div>" + body;
    wire();
  }
  function bookingCard(b) {
    return `<div class="card"><div class="row"><span class="ttl grow">${esc(b.couple_names)}</span>${statusPill(b)}</div>
      <div class="muted">${fmtWhen(b.start_utc)} · ${b.id} · ${esc(b.package_id)} · host ${esc(b.host)}</div>
      <div class="muted">${b.venue.open ? "Venue open" : esc(b.venue.reason)}</div>
      <div class="row" style="margin-top:10px"><button class="btn small" data-edit="${b.id}">Manage</button><a class="btn small" href="?e=${b.id}" style="text-decoration:none">Join as staff</a></div></div>`;
  }
  function edit(id) {
    const b = d.bookings.find((x) => x.id === id);
    root.innerHTML = `<button class="btn small" id="back">‹ Back</button>
      <h2 style="margin-top:10px">${esc(b.couple_names)}</h2>
      <p>${fmtWhen(b.start_utc)} → ${fmtWhen(b.end_utc, { hour: "numeric", minute: "2-digit" })} · ${b.id} · ${user(b.host)}</p>
      <div class="stat"><div><b>${fmtCredits(b.paid_credits)}</b><span class="muted">of ${fmtCredits(b.total_credits)}</span></div>
        <div><b>${fmtDur(b.sandbox_total - b.sandbox_used)}</b><span class="muted">sandbox left</span></div>
        <div><b>${b.venue.open ? "Open" : "Closed"}</b><span class="muted">${esc(b.venue.reason || "")}</span></div></div>
      <h3>Record a payment</h3>
      <div class="row"><label class="field"><span>Credits</span><input id="pc" type="number" placeholder="${b.due_credits}"></label><label class="field grow"><span>Note</span><input id="pn" placeholder="Paid via …"></label><button class="btn primary" id="pp" style="margin-top:14px">Record</button></div>
      <h3>Event</h3>
      <div class="row">
        <label class="field"><span>Extra hours</span><select id="xh">${[0, 1, 2, 3, 4, 5, 6].map((h) => "<option" + (h === b.extra_hours ? " selected" : "") + ">" + h + "</option>").join("")}</select></label>
        <label class="field"><span>Start (local)</span><input id="st" type="datetime-local" value="${new Date(b.start_utc - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16)}"></label>
        <label class="row" style="gap:6px;margin-top:14px"><input type="checkbox" id="fo" ${b.force_open ? "checked" : ""}> Force open now</label>
        <label class="row" style="gap:6px;margin-top:14px"><input type="checkbox" id="wb" ${b.waive_balance ? "checked" : ""}> Waive balance</label>
      </div>
      <label class="field"><span>Staff notes (run-of-show, producer, contacts)</span><textarea id="sn" rows="4">${esc(b.staff_notes || "")}</textarea></label>
      <div class="row"><button class="btn primary" id="save">Save</button><a class="btn" href="?e=${b.id}" style="text-decoration:none">Join as staff</a><a class="btn" href="?sandbox=${b.id}" style="text-decoration:none">Open sandbox</a><button class="btn small" id="cp">Copy guest link</button><span class="grow"></span>
        ${b.status !== "cancelled" ? '<button class="btn danger" id="cx">Cancel booking</button>' : '<button class="btn" id="rs">Restore</button>'}</div>`;
    root.querySelector("#back").onclick = () => render();
    root.querySelector("#cp").onclick = async () => { await navigator.clipboard?.writeText(eventUrl(b.id)); ctx.toast("Guest link copied"); };
    root.querySelector("#pp").onclick = async () => { const c = +root.querySelector("#pc").value; if (!c) return ctx.toast("Enter credits"); await act("/api/admin/payment", { booking_id: b.id, credits: c, note: root.querySelector("#pn").value }); edit(id); };
    root.querySelector("#save").onclick = async () => {
      const start = new Date(root.querySelector("#st").value).getTime();
      const dt = new Date(start); const ds = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
      await act("/api/admin/booking/" + b.id, { extra_hours: +root.querySelector("#xh").value, force_open: root.querySelector("#fo").checked ? 1 : 0,
        waive_balance: root.querySelector("#wb").checked ? 1 : 0, staff_notes: root.querySelector("#sn").value, start_utc: start, date: ds });
      edit(id);
    };
    root.querySelector("#cx")?.addEventListener("click", async () => { if (!confirm("Cancel this booking and free the date?")) return; await act("/api/admin/booking/" + b.id, { status: "cancelled" }); tab = "Bookings"; render(); });
    root.querySelector("#rs")?.addEventListener("click", async () => { await act("/api/admin/booking/" + b.id, { status: "pending" }); edit(id); });
  }
  function wire() {
    root.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; render(); }));
    root.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => edit(b.dataset.edit)));
    root.querySelectorAll("[data-ok]").forEach((b) => (b.onclick = () => act("/api/admin/payment", { verify_id: +b.dataset.ok })));
    root.querySelectorAll("[data-no]").forEach((b) => (b.onclick = () => act("/api/admin/payment", { verify_id: +b.dataset.no, reject: true })));
    root.querySelector("#adm-sb")?.addEventListener("click", () => { ctx.closeSheet(); ctx.adminSandbox(); });
    root.querySelector("#sync")?.addEventListener("click", async () => { const r = await api("/api/admin/sync-tips", {}); ctx.toast(r.error || "Matched " + r.matched + " of " + r.scanned + " tips"); reload(); });
    root.querySelector("#bb")?.addEventListener("click", () => act("/api/admin/block", { date: root.querySelector("#bd").value, reason: root.querySelector("#br").value }));
    root.querySelectorAll("[data-unb]").forEach((b) => (b.onclick = () => act("/api/admin/block", { date: b.dataset.unb }, "DELETE")));
    root.querySelector("#na-go")?.addEventListener("click", () => act("/api/admin/admins", { username: root.querySelector("#na").value }));
    root.querySelectorAll("[data-rmadm]").forEach((b) => (b.onclick = () => act("/api/admin/admins", { username: b.dataset.rmadm }, "DELETE")));
    const collect = () => [...root.querySelectorAll("[data-pk]")].map((c) => { const o = {}; c.querySelectorAll("[data-k]").forEach((i) => (o[i.dataset.k] = i.type === "number" ? +i.value : i.value)); return o; });
    root.querySelector("#pk-add")?.addEventListener("click", () => { d.pricing.packages = collect(); d.pricing.packages.push({ id: "new", name: "New package", tier: "hands-off", usd: 0, capacity: 40, blurb: "" }); render(); });
    root.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { d.pricing.packages = collect(); d.pricing.packages.splice(+b.dataset.rm, 1); render(); }));
    root.querySelector("#pk-save")?.addEventListener("click", async () => { await act("/api/admin/pricing", { packages: collect(), extraHourUsd: +root.querySelector("#xh").value }); ctx.refresh(); });
  }
  render();
}
