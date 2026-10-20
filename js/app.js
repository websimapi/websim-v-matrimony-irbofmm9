import { World } from "./world.js";
import { SHOTS } from "./engine/spectator.js";
import { api, esc } from "./api.js";
import { openSheet, closeSheet, toast, sheetOpen } from "./ui/sheet.js";
import { device, isTV } from "./device.js";
import { openBooking } from "./ui/booking.js";
import { openAccount } from "./ui/account.js";
import { openAdmin } from "./ui/admin.js";
import { openAbout } from "./ui/about.js";
import { enterEvent, enterSandboxHost, enterSandboxGuest } from "./ui/venue.js";

const world = new World(document.getElementById("world"));
const dock = document.getElementById("dock");
const shotChip = document.getElementById("shot");
if (isTV) document.body.classList.add("tv");

const ctx = { world, cfg: null, user: null, dock, openSheet, closeSheet, toast, home, refresh };
window.__vm = ctx;

// Camera chip: shows the current shot; click/←/→ to cut.
world.spectator.onchange = (n) => (shotChip.textContent = "🎥 " + SHOTS[n].label + (world.spectator.forced ? " · directed" : ""));
world.spectator.onchange(world.spectator.shot);
shotChip.onclick = () => world.spectator.next();
world.on({ mode: (m) => (shotChip.hidden = m === "body") });
addEventListener("keydown", (e) => {
  if (e.target.closest?.("input,textarea,select") || sheetOpen() || world.mode === "body") return;
  if (e.key === "ArrowRight") world.spectator.next(1);
  if (e.key === "ArrowLeft") world.spectator.next(-1);
  if (isTV && (e.key === "ArrowUp" || e.key === "ArrowDown")) dock.querySelector("button")?.focus();
});

// Hide chrome during idle viewing on the landing page
let idleT; const wake = () => { document.body.classList.remove("cinema"); clearTimeout(idleT); idleT = setTimeout(() => !world.session && !sheetOpen() && document.body.classList.add("cinema"), 6000); };
["pointermove", "keydown", "pointerdown"].forEach((k) => addEventListener(k, wake)); wake();

// Ambient audio after first gesture
addEventListener("pointerdown", () => world.fx.startAmbience(), { once: true });
addEventListener("keydown", () => world.fx.startAmbience(), { once: true });

async function refresh() {
  ctx.cfg = await api("/api/config");
  ctx.user = ctx.cfg.me?.userId ? { id: ctx.cfg.me.userId, username: ctx.cfg.me.username } : null;
  ctx.isAdmin = !!ctx.cfg.me?.isAdmin;
  return ctx.cfg;
}

function home() {
  world.detach();
  history.replaceState(null, "", location.pathname);
  dock.innerHTML = "";
  const b = (label, fn, cls = "") => { const x = document.createElement("button"); x.innerHTML = label; x.className = cls; x.onclick = fn; dock.appendChild(x); return x; };
  b("Book a date", () => openBooking(ctx), "primary");
  b("My events", () => openAccount(ctx));
  b("About", () => openAbout(ctx));
  if (ctx.isAdmin) b("Admin", () => openAdmin(ctx));
  if (ctx.user) { const a = b('<img class="av" alt="" src="https://images.websim.com/avatar/' + esc(ctx.user.username) + '">', () => openAccount(ctx)); a.title = "@" + ctx.user.username; a.style.padding = "5px"; }
  document.getElementById("hud").innerHTML = "";
  world.venue.applyConfig({});
}

async function boot() {
  try { await refresh(); } catch (e) { ctx.cfg = { packages: [], taken: [], blocked: [], me: {} }; }
  // Owner visits register the project id so tip comments can be verified server-side.
  try { const p = await window.websim?.getCurrentProject?.(); if (p?.id && ctx.cfg.me?.isOwner) api("/api/me", { project_id: p.id }); } catch (e) {}
  const q = new URLSearchParams(location.search);
  if (q.get("e")) return enterEvent(ctx, q.get("e").toUpperCase());
  if (q.get("sandbox")) return enterSandboxHost(ctx, q.get("sandbox").toUpperCase());
  if (q.get("sb")) return enterSandboxGuest(ctx, q.get("sb"), q.get("t") || "");
  home();
  if (q.get("book") !== null) openBooking(ctx);
}
boot();
