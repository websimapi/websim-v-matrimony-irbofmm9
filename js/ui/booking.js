import { api, esc, fmtCredits, fmtUsd } from "../api.js";
import { openPayment } from "./payment.js";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());

export async function openBooking(ctx) {
  const cfg = await ctx.refresh();
  const st = { pkg: cfg.packages[0]?.id, date: null, time: "16:00", extra: 0, names: "", month: new Date() };
  st.month.setDate(1);
  const el = ctx.openSheet('<div id="bk"></div>');
  const root = el.querySelector("#bk");
  const taken = new Set(cfg.taken), blocked = new Set(cfg.blocked);
  const minDay = new Date(Date.now() + 36 * 3600e3); minDay.setHours(0, 0, 0, 0);

  function total() {
    const p = cfg.packages.find((x) => x.id === st.pkg); if (!p) return 0;
    return p.credits + st.extra * cfg.extraHourCredits;
  }
  function render() {
    const m = st.month, y = m.getFullYear(), mo = m.getMonth();
    const first = new Date(y, mo, 1).getDay(), days = new Date(y, mo + 1, 0).getDate();
    let cells = "";
    for (let i = 0; i < first; i++) cells += '<span class="d empty"></span>';
    for (let d = 1; d <= days; d++) {
      const dt = new Date(y, mo, d), k = ymd(dt);
      const off = dt < minDay, isT = taken.has(k), isB = blocked.has(k);
      cells += '<button class="d' + (isT ? " taken" : "") + (st.date === k ? " sel" : "") + '" data-d="' + k + '"' + (off || isT || isB ? " disabled" : "") +
        ' title="' + (isT ? "Reserved" : isB ? "Unavailable" : "") + '">' + d + "</button>";
    }
    const tot = total(), dep = Math.ceil(tot * cfg.depositPct);
    const times = []; for (let h = 9; h <= 21; h++) for (const mm of [0, 30]) times.push(pad(h) + ":" + pad(mm));
    root.innerHTML = `
      <h2>Reserve your venue</h2>
      <p>One couple per day — the whole venue and staff are yours.</p>
      <h3>Package</h3>
      <div class="pkgs">${cfg.packages.map((p) => `
        <button class="pkg ${st.pkg === p.id ? "sel" : ""}" data-p="${esc(p.id)}">
          <span class="tier">${p.tier === "hands-on" ? "Hands-on · staffed" : "Hands-off · DIY"}</span>
          <b>${esc(p.name)}</b>
          <span class="price">${fmtUsd(p.credits, cfg.creditsPerUsd)} <span class="muted">· ${fmtCredits(p.credits)}</span></span>
          <span class="muted">${esc(p.blurb)}</span>
        </button>`).join("")}</div>
      <h3>Date</h3>
      <div class="cal">
        <div class="head"><button class="btn small" data-m="-1">‹</button><b>${m.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</b><button class="btn small" data-m="1">›</button></div>
        <div class="grid">${["S", "M", "T", "W", "T", "F", "S"].map((x) => '<span class="dow">' + x + "</span>").join("")}${cells}</div>
      </div>
      <div class="row" style="margin-top:6px">
        <label class="field grow">Ceremony start (your time)
          <select id="bk-time">${times.map((t) => '<option' + (t === st.time ? " selected" : "") + ">" + t + "</option>").join("")}</select></label>
        <label class="field">Extra hours
          <select id="bk-extra">${[0, 1, 2, 3, 4].map((h) => '<option value="' + h + '"' + (h === st.extra ? " selected" : "") + ">" + (h ? "+" + h + "h" : "None") + "</option>").join("")}</select></label>
      </div>
      <label class="field">Couple's names<input id="bk-names" maxlength="60" placeholder="Alex & Jordan" value="${esc(st.names)}"></label>
      <div class="sum">
        <div class="l"><span>Venue time</span><span>${cfg.baseHours + st.extra} hours${st.date ? " · " + new Date(st.date + "T12:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : ""}</span></div>
        <div class="l"><span>Rehearsal sandbox</span><span>10 hours, any time before</span></div>
        <div class="l t"><span>Total</span><span>${fmtUsd(tot, cfg.creditsPerUsd)} · ${fmtCredits(tot)}</span></div>
        <div class="l muted"><span>Deposit to hold the date (10%)</span><span>${fmtCredits(dep)}</span></div>
      </div>
      <div class="row" style="margin-top:14px">
        <span class="muted grow" id="bk-err">${ctx.user ? "" : "Sign in to websim to book."}</span>
        <button class="btn primary" id="bk-go" ${!ctx.user ? "disabled" : ""}>Reserve date</button>
      </div>`;
    root.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { st.pkg = b.dataset.p; render(); }));
    root.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { st.date = b.dataset.d; render(); }));
    root.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { st.month = new Date(y, mo + +b.dataset.m, 1); render(); }));
    root.querySelector("#bk-time").onchange = (e) => (st.time = e.target.value);
    root.querySelector("#bk-extra").onchange = (e) => { st.extra = +e.target.value; render(); };
    root.querySelector("#bk-names").oninput = (e) => (st.names = e.target.value);
    root.querySelector("#bk-go").onclick = submit;
  }
  async function submit() {
    const err = root.querySelector("#bk-err");
    if (!st.date) return (err.textContent = "Pick a date.");
    if (!st.names.trim()) return (err.textContent = "Add the couple's names.");
    const start = new Date(st.date + "T" + st.time).getTime();
    const btn = root.querySelector("#bk-go"); btn.disabled = true; btn.textContent = "Reserving…";
    const r = await api("/api/bookings", { package_id: st.pkg, date: st.date, start_utc: start, extra_hours: st.extra, couple_names: st.names.trim() });
    if (r.error) { err.textContent = r.error; btn.disabled = false; btn.textContent = "Reserve date"; if (r.error.includes("taken")) { await ctx.refresh(); taken.clear(); ctx.cfg.taken.forEach((d) => taken.add(d)); st.date = null; render(); } return; }
    openPayment(ctx, r.booking, { fresh: true });
  }
  render();
}
