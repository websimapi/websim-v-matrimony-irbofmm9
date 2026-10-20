import { api, esc, fmtCredits, fmtUsd, eventUrl, fmtWhen } from "../api.js";
import { payWithTip, syncMyPayments } from "../pay.js";

export function openPayment(ctx, b, { fresh } = {}) {
  const cfg = ctx.cfg;
  const dep = b.deposit_credits, due = b.due_credits;
  const firstPay = b.paid_credits < dep;
  const min = firstPay ? dep - b.paid_credits : Math.min(due, 10);
  let amount = firstPay ? min : due;
  const el = ctx.openSheet('<div id="pay"></div>');
  const root = el.querySelector("#pay");
  function render(state = "choose", msg = "") {
    if (state === "done") {
      root.innerHTML = `
        <h2>${b.status === "confirmed" ? "Your date is secured" : "Payment received"}</h2>
        <p>${esc(b.couple_names)} · ${fmtWhen(b.start_utc)}</p>
        <div class="bar"><i style="width:${Math.min(100, (b.paid_credits / b.total_credits) * 100)}%"></i></div>
        <p class="muted">${fmtCredits(b.paid_credits)} of ${fmtCredits(b.total_credits)} paid${b.due_credits ? " · balance due before the event" : " · paid in full"}</p>
        ${msg ? '<p class="muted">' + esc(msg) + "</p>" : ""}
        <div class="row" style="margin-top:14px">
          ${b.status === "confirmed" ? '<a class="btn primary" href="?sandbox=' + b.id + '" style="text-decoration:none">Open rehearsal sandbox</a>' : ""}
          <button class="btn" id="pay-my">My events</button>
        </div>`;
      root.querySelector("#pay-my").onclick = () => import("./account.js").then((m) => m.openAccount(ctx));
      return;
    }
    if (state === "wait") {
      root.innerHTML = `
        <h2>Finish in the tip window</h2>
        <p>Post the prefilled tip comment to pay <b>${fmtCredits(amount)}</b>. It carries your booking code <b>${b.id}</b>.</p>
        <p class="muted">${esc(msg)}</p>
        <div class="row" style="margin-top:14px"><button class="btn primary" id="pay-chk">I've posted it — check</button><button class="btn" id="pay-back">Back</button></div>`;
      root.querySelector("#pay-chk").onclick = check;
      root.querySelector("#pay-back").onclick = () => { payWithTip.cancel?.(); render(); };
      return;
    }
    root.innerHTML = `
      <h2>${fresh ? "Hold your date" : "Make a payment"}</h2>
      <p>${esc(b.couple_names)} · ${fmtWhen(b.start_utc)} · code <b>${b.id}</b></p>
      ${fresh ? '<p class="muted">Pay at least the 10% deposit within 45 minutes to keep the date.</p>' : ""}
      <h3>Amount</h3>
      <div class="seg" id="pay-opts">
        ${firstPay ? '<button data-a="' + min + '">Deposit · ' + fmtCredits(min) + "</button>" : ""}
        <button data-a="${due}">Pay in full · ${fmtCredits(due)}</button>
        <button data-a="custom">Custom</button>
      </div>
      <label class="field" id="pay-cust" hidden>Credits (min ${fmtCredits(min)}, max ${fmtCredits(due)})<input type="number" min="${min}" max="${due}" step="100" value="${amount}"></label>
      <div class="sum">
        <div class="l"><span>Total</span><span>${fmtCredits(b.total_credits)}</span></div>
        <div class="l"><span>Paid</span><span>${fmtCredits(b.paid_credits)}</span></div>
        <div class="l t"><span>Paying now</span><span id="pay-now">${fmtCredits(amount)} · ${fmtUsd(amount, cfg.creditsPerUsd)}</span></div>
      </div>
      <p class="muted" style="margin-top:10px">Payments are made as a websim tip comment (1,000 credits = $0.50).${ctx.cfg.me?.isOwner ? " As the owner you can't tip yourself — record payments in Admin instead." : ""}</p>
      <div class="row" style="margin-top:12px"><span class="muted grow" id="pay-err">${esc(msg)}</span><button class="btn gold" id="pay-go">Pay with tip</button></div>`;
    const opts = root.querySelectorAll("#pay-opts button"), cust = root.querySelector("#pay-cust"), inp = cust.querySelector("input");
    const sel = (a) => { opts.forEach((o) => o.classList.toggle("on", o.dataset.a === String(a) || (a === "custom" && o.dataset.a === "custom"))); };
    sel(amount === due ? due : amount);
    const setAmt = (v) => { amount = Math.max(min, Math.min(due, Math.round(v) || min)); root.querySelector("#pay-now").textContent = fmtCredits(amount) + " · " + fmtUsd(amount, cfg.creditsPerUsd); };
    opts.forEach((o) => (o.onclick = () => { if (o.dataset.a === "custom") { cust.hidden = false; sel("custom"); } else { cust.hidden = true; sel(o.dataset.a); setAmt(+o.dataset.a); } }));
    inp.oninput = () => setAmt(+inp.value);
    root.querySelector("#pay-go").onclick = go;
  }
  async function go() {
    render("wait", "Waiting for your tip comment…");
    const r = await payWithTip(b, amount);
    if (r.cancelled) return;
    if (r.error) return render("choose", r.error);
    if (r.booking) Object.assign(b, r.booking);
    else { const fr = await api("/api/bookings/" + b.id); if (fr.booking) Object.assign(b, fr.booking); }
    render("done", r.verified ? "" : r.message || "");
  }
  async function check() {
    const r = await syncMyPayments(b.id);
    if (r.booking) Object.assign(b, r.booking);
    if (r.matched || (r.booking && r.booking.paid_credits > 0)) return render("done");
    render("wait", r.error ? "Couldn't verify yet (" + r.error + "). Staff will confirm your tip shortly." : "Not seen yet — give it a few seconds and check again.");
  }
  render();
}
