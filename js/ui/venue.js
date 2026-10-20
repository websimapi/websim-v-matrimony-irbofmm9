import { api, esc, fmtWhen, fmtDur } from "../api.js";
import { connectRealm } from "../net/realm.js";
import { hostSandbox, joinSandbox } from "../net/sandbox.js";
import { idbGet, idbSet } from "../net/idb.js";
import { device, isTV, vrSupported } from "../device.js";
import { startHud } from "./hud.js";

const LOOK_KEY = "guest:prefs";
async function prefs(ctx) {
  const p = (await idbGet(LOOK_KEY).catch(() => null)) || {};
  return { name: p.name || ctx.user?.username || "", look: p.look ?? Math.floor(Math.random() * 12) };
}

// Gate: pick a name and Walk / Watch. Resolves { name, look, mode, vr }.
async function gate(ctx, { title, names, sub, canEnter, reason, waitUntil }) {
  const vr = await vrSupported();
  const p = await prefs(ctx);
  return new Promise((resolve) => {
    const render = () => {
      const el = ctx.openSheet(`<div class="gate">
        <div class="muted">${esc(title)}</div>
        <div class="names">${esc(names)}</div>
        <div class="muted">${esc(sub)}</div>
        ${canEnter ? `
          <label class="field" style="text-align:left;margin-top:16px">Your name<input id="g-name" maxlength="24" value="${esc(p.name)}" placeholder="How guests will see you"></label>
          <div class="choices">
            ${isTV ? "" : '<button class="choice" data-m="body"><span class="i">🚶</span><b>Walk in</b><span class="muted">Take a seat, move around</span></button>'}
            <button class="choice" data-m="spectator" ${isTV ? 'style="grid-column:1/-1"' : ""}><span class="i">🎥</span><b>Watch</b><span class="muted">Directed cameras, no controls</span></button>
          </div>
          ${vr ? '<button class="btn primary" data-m="vr" style="margin-top:10px;width:100%">Enter in VR</button>' : ""}` :
          `<p style="margin-top:16px">${esc(reason)}</p>${waitUntil ? '<p class="muted" id="g-cd"></p>' : ""}
           <button class="btn" id="g-home" style="margin-top:8px">Back to the garden</button>`}
      </div>`, { close: () => { if (!done) ctx.home(); } });
      el.querySelectorAll("[data-m]").forEach((b) => (b.onclick = async () => {
        const name = (el.querySelector("#g-name")?.value || "").trim() || "Guest";
        done = true; await idbSet(LOOK_KEY, { name, look: p.look }).catch(() => {});
        ctx.closeSheet();
        resolve({ name, look: p.look, mode: b.dataset.m === "spectator" ? "spectator" : "body", vr: b.dataset.m === "vr" });
      }));
      el.querySelector("#g-home")?.addEventListener("click", () => ctx.closeSheet());
      if (isTV) el.querySelector(".choice")?.focus();
      if (waitUntil) {
        const cd = el.querySelector("#g-cd");
        const t = setInterval(() => { if (!cd.isConnected) return clearInterval(t); const s = (waitUntil - Date.now()) / 1000; cd.textContent = s > 0 ? "Opens in " + fmtDur(s) : "Opening…"; if (s <= 0) { clearInterval(t); location.reload(); } }, 1000);
      }
    };
    let done = false;
    render();
  });
}

function dateLine(b) { return fmtWhen(b.start_utc, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }); }

export async function enterEvent(ctx, id) {
  const r = await api("/api/bookings/" + id);
  if (r.error) { ctx.toast(r.error); return ctx.home(); }
  const b = r.booking, staff = r.role !== "guest";
  ctx.dock.innerHTML = "";
  ctx.world.venue.applyConfig({ ...(b.config || {}), names: b.config?.names || b.couple_names, date: b.start_utc });
  const canEnter = r.venue.open || r.role === "staff";
  const g = await gate(ctx, { title: staff ? (r.role === "host" ? "Your wedding venue" : "Staff entry") : "You're invited to the wedding of",
    names: b.couple_names, sub: dateLine(b), canEnter, reason: r.venue.reason, waitUntil: r.venue.opensAt });
  const join = { type: "join", event: id, name: g.name, look: g.look, mode: g.mode, device };
  let hud;
  const t = await connectRealm(join, {
    message: (m) => { ctx.world.handle(m); hud?.message(m); },
    reconnect: () => hud?.reconnect(),
    close: (why) => { ctx.toast(why || "Disconnected"); hud?.end(); },
  });
  ctx.world.attach(t);
  hud = startHud(ctx, { kind: "realm", booking: b, role: r.role, transport: t, mode: g.mode, vr: g.vr });
}

export async function enterSandboxHost(ctx, id) {
  const r = await api("/api/bookings/" + id);
  if (r.error || (r.role === "guest")) { ctx.toast(r.error || "Only the host can open this sandbox"); return ctx.home(); }
  const b = r.booking;
  ctx.dock.innerHTML = "";
  const tick = await api("/api/sandbox/tick", { booking_id: id });
  const draft = (await idbGet("draft:" + id).catch(() => null)) || b.config || {};
  const cfg = { names: b.couple_names, ...draft, date: b.start_utc };
  ctx.world.venue.applyConfig(cfg);
  const g = await gate(ctx, { title: "Rehearsal sandbox", names: b.couple_names,
    sub: tick.error ? "" : fmtDur(tick.remaining) + " of rehearsal time left · not the live venue",
    canEnter: !tick.error && tick.remaining > 0, reason: tick.error || "All 10 sandbox hours have been used." });
  let hud;
  const join = { type: "join", name: g.name, look: g.look, mode: g.mode, device };
  let t;
  try {
    t = await hostSandbox(id, join, {
      message: (m) => { ctx.world.handle(m); hud?.message(m); },
      peers: (n) => hud?.peers(n),
      error: (e) => ctx.toast("Sandbox: " + (e.message || e.type)),
    });
  } catch (e) { ctx.toast(e.message); return ctx.home(); }
  ctx.world.attach(t);
  t.send({ type: "config", config: cfg }); ctx.world.venue.applyConfig(cfg);
  hud = startHud(ctx, { kind: "sandbox-host", booking: b, role: "host", transport: t, mode: g.mode, vr: g.vr, sandboxLeft: tick.remaining, config: cfg });
}

export async function enterSandboxGuest(ctx, peerId, token) {
  ctx.dock.innerHTML = "";
  const g = await gate(ctx, { title: "You're invited to a rehearsal", names: "Wedding sandbox", sub: "A private practice run hosted by the couple", canEnter: true });
  let hud;
  try {
    const t = await joinSandbox(peerId, token, { type: "join", name: g.name, look: g.look, mode: g.mode, device }, {
      message: (m) => { ctx.world.handle(m); hud?.message(m); },
      close: (why) => { ctx.toast(why); hud?.end(); },
    });
    ctx.world.attach(t);
    hud = startHud(ctx, { kind: "sandbox-guest", booking: null, role: "guest", transport: t, mode: g.mode, vr: g.vr });
  } catch (e) { ctx.toast(e.message || "Could not join"); ctx.home(); }
}
