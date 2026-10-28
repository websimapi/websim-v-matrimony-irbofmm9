import { api, esc, fmtDur, eventUrl } from "../api.js";
import { SHOTS, SHOT_ORDER } from "../engine/spectator.js";
import { REACTIONS } from "../engine/fx.js";
import { PALETTES, PLACES } from "../engine/venue.js";
import { loadPrefs, savePrefs, openLook } from "./look.js";
import { inviteUrl, rotateSandboxToken } from "../net/sandbox.js";
import { idbGet, idbSet } from "../net/idb.js";
import { isTV, vrSupported } from "../device.js";
import { openEditor } from "../editor/editor.js";
import { openCreator } from "./creator.js";
import { packSpec } from "../engine/avatar-spec.js";

const CUES = [["processional", "🎻", "Processional"], ["rings", "💍", "Ring exchange"], ["kiss", "💋", "The kiss"], ["pronounce", "🕊", "Pronounced"], ["applause", "👏", "Applause"],
  ["petals", "🌸", "Petals"], ["sparklers", "✨", "Sparklers"], ["bouquet", "💐", "Bouquet toss"], ["firstdance", "💃", "First dance"], ["cake", "🍰", "Cake cutting"],
  ["bubbles", "🫧", "Bubble send-off"], ["lanterns", "🏮", "Sky lanterns"]];

export function startHud(ctx, o) {
  const { world, dock } = ctx;
  const hudEl = document.getElementById("hud");
  const staff = o.role === "host" || o.role === "staff";
  const sandbox = o.kind !== "realm";
  const bid = o.booking?.id;
  let roster = new Map(), endsAt = o.booking?.end_utc, sbLeft = o.sandboxLeft, ended = false, seated = false, config = o.config || o.booking?.config || {};
  const timers = [];
  hudEl.innerHTML = '<div class="top"><span class="chip" id="h-top"></span></div><div id="chat"><div id="chat-list"></div></div>';
  const top = hudEl.querySelector("#h-top"), chat = hudEl.querySelector("#chat"), list = hudEl.querySelector("#chat-list");
  document.body.classList.remove("cinema");

  function topLine() {
    const n = roster.size, title = o.booking?.couple_names || "Rehearsal";
    let when = "";
    if (o.admin) when = "Admin sandbox · unlimited";
    else if (sandbox && o.kind === "sandbox-host") when = "Sandbox · " + fmtDur(sbLeft) + " left";
    else if (sandbox) when = "Sandbox";
    else if (endsAt) { const s = (endsAt - Date.now()) / 1000; when = s > 86400 ? "Live" : s > 0 ? "Live · " + fmtDur(s) + " left" : "Closing"; }
    const link = world.link, natives = [...roster.values()].filter((p) => p.role === "native").length;
    // guests only hear about desktop attendees; the technical link state is for the host and staff
    const linkText = o.kind !== "realm" || !link ? "" : staff ? (link.mode === "bridged" ? " · 🔗 desktop linked" + (natives ? " (" + natives + ")" : "") : link.mode === "reconnecting" ? " · 🔗 reconnecting" : "") : natives ? " · 🖥 " + natives + " on the desktop app" : "";
    top.innerHTML = "<b>" + esc(title) + "</b><span class='muted'>· " + when + " · 👥 " + n + "<span class='link-chip'>" + esc(linkText) + "</span></span>";
  }
  timers.push(setInterval(() => {
    topLine();
    if (!sandbox && endsAt && Date.now() > endsAt + 60e3 && o.role !== "staff") end("The venue has closed. Thank you for celebrating!");
  }, 15000));

  // Sandbox metering: heartbeat every 60s; stops when hours run out.
  if (o.kind === "sandbox-host" && !o.admin) timers.push(setInterval(async () => {
    const r = await api("/api/sandbox/tick", { booking_id: bid });
    if (r.error) return;
    sbLeft = r.remaining; topLine();
    if (r.remaining <= 0) end("Your 10 sandbox hours are used up.");
    else if (r.remaining < 600) ctx.toast("Less than 10 minutes of sandbox time left");
  }, 60000));

  // ---------- dock ----------
  let vrOk = false;
  vrSupported().then((v) => { vrOk = v; renderDock(); });
  function renderDock() {
    dock.innerHTML = "";
    const b = (label, fn, cls = "", title = "") => { const x = document.createElement("button"); x.innerHTML = label; x.className = cls; x.title = title; x.onclick = fn; dock.appendChild(x); return x; };
    const sep = () => dock.appendChild(Object.assign(document.createElement("span"), { className: "sep" }));
    if (!isTV) {
      b("🎥 Watch", () => setMode("spectator"), world.mode === "spectator" ? "on" : "");
      b("🚶 Walk", () => setMode("body"), world.mode === "body" ? "on" : "");
      if (vrOk) b("VR", () => world.enterVR().catch((e) => ctx.toast(e.message)));
      sep();
    }
    for (const [k, e] of Object.entries(REACTIONS)) b(e, () => world.react(k), "emo", k);
    sep();
    b("📍", openPlaces, "", "Go to…");
    if (!isTV) b("💬", openChat, "", "Chat (Enter)");
    if (!isTV) b("👤", changeLook, "", "Your look");
    b("📖", openGuestbook, "", "Guestbook");
    if (canEdit) b("🛠 Edit venue", editVenue, "", "Build mode (B)");
    if (staff) b("Host", openHost, "primary");
    b("Leave", () => end(), "");
  }
  function setMode(m) { world.setMode(m); renderDock(); }
  const off = world.on({ mode: () => !ended && renderDock(), vr: () => !ended && renderDock() });

  // ---------- places + look ----------
  function openPlaces() {
    const el = ctx.openSheet('<h2>Go to</h2><div class="places">' + Object.entries(PLACES).map(([k, p]) => '<button class="btn' + (world.zone === k ? " primary" : "") + '" data-pl="' + k + '">' + p.label + "</button>").join("") + "</div>");
    el.querySelectorAll("[data-pl]").forEach((x) => (x.onclick = () => { world.goPlace(x.dataset.pl); ctx.closeSheet(); }));
  }
  async function changeLook() {
    let p = await loadPrefs(ctx);
    hudEl.hidden = true; dock.hidden = true;
    openCreator(ctx, { spec: p.spec || { base: p.look }, name: p.name,
      onDone: async ({ spec, name, faceScan }) => {
        hudEl.hidden = false; dock.hidden = false;
        p.spec = spec; p.look = spec.base; if (name) p.name = name; await savePrefs(p);
        if (faceScan) p = await openLook(ctx, p);
        o.transport.send({ type: "look", look: p.look, face: p.face, av: packSpec(p.spec) });
      },
      onCancel: () => { hudEl.hidden = false; dock.hidden = false; } });
  }

  // ---------- chat ----------
  function addMsg(from, text, role) {
    const d = document.createElement("div"); d.className = "msg" + (role === "host" ? " host" : "");
    d.innerHTML = "<b>" + esc(from) + "</b>" + esc(text);
    list.appendChild(d); while (list.children.length > 8) list.firstChild.remove();
    setTimeout(() => (d.style.opacity = 0), 9000);
  }
  function openChat() {
    if (chat.querySelector("form")) return chat.querySelector("input").focus();
    chat.classList.add("open");
    const f = document.createElement("form"); f.innerHTML = '<input maxlength="200" placeholder="Say something nice…" enterkeyhint="send">';
    chat.appendChild(f); const inp = f.firstChild; inp.focus();
    const close = () => { f.remove(); chat.classList.remove("open"); };
    f.onsubmit = (e) => { e.preventDefault(); const t = inp.value.trim(); if (t) o.transport.send({ type: "chat", text: t }); inp.value = ""; close(); };
    inp.onblur = () => setTimeout(close, 150);
    inp.onkeydown = (e) => { if (e.key === "Escape") close(); e.stopPropagation(); };
  }
  const onKey = (e) => {
    if (world.editor || e.target.closest?.("input,textarea")) return;
    if (e.key === "Enter" && !isTV) { e.preventDefault(); openChat(); }
    if ((e.key === "b" || e.key === "B") && canEdit && !ctx.sheetOpen?.()) { e.preventDefault(); editVenue(); }
  };
  // Build mode: sandbox rehearsals (host and admin) can rearrange and decorate the venue
  const canEdit = o.kind === "sandbox-host" && !isTV;
  let editor = null;
  function editVenue() {
    if (editor) return;
    ctx.closeSheet(); hudEl.hidden = true; dock.hidden = true;
    editor = openEditor(ctx, { config, save: setConfig, palettes: Object.keys(PALETTES) });
    editor.onclose = () => { editor = null; hudEl.hidden = false; dock.hidden = false; renderDock(); };
  }
  addEventListener("keydown", onKey);

  // ---------- guestbook ----------
  async function gbEntries() {
    if (!sandbox) return (await api("/api/guestbook/" + bid)).entries || [];
    return (await idbGet("gb:" + (bid || "guest")).catch(() => null)) || [];
  }
  async function openGuestbook() {
    const entries = await gbEntries();
    const el = ctx.openSheet(`<h2>Guestbook</h2><p>Leave a blessing for the couple.</p>
      <form id="gb-f"><label class="field"><textarea id="gb-m" rows="3" maxlength="400" placeholder="Wishing you a lifetime of…"></textarea></label>
      <div class="row"><span class="muted grow" id="gb-e"></span><button class="btn primary">Sign</button></div></form>
      <div id="gb-l">${entries.map(gbRow).join("") || '<p class="muted">Be the first to sign.</p>'}</div>`);
    el.querySelector("#gb-m").onkeydown = (e) => e.stopPropagation();
    el.querySelector("#gb-f").onsubmit = async (e) => {
      e.preventDefault(); const msg = el.querySelector("#gb-m").value.trim(); if (!msg) return;
      if (!sandbox) { const r = await api("/api/guestbook/" + bid, { message: msg }); if (r.error) return (el.querySelector("#gb-e").textContent = r.error); }
      o.transport.send({ type: "gb", message: msg }); el.querySelector("#gb-m").value = ""; ctx.toast("Signed ♥");
    };
  }
  const gbRow = (x) => '<div class="card"><b>' + esc(x.username) + "</b><p style='margin:4px 0 0;color:var(--ink)'>" + esc(x.message) + "</p></div>";

  // ---------- host panel ----------
  function openHost() {
    const guests = [...roster.values()].filter((p) => p.id !== world.me);
    const el = ctx.openSheet(`<h2>Host controls</h2>
      <p>${sandbox ? "Rehearsal — everything here works the same on the day." : "Everything you trigger plays for every guest."}</p>
      <h3>Move everyone to</h3><div class="places">${Object.entries(PLACES).map(([k, p]) => '<button class="btn" data-gather="' + k + '">' + p.label + "</button>").join("")}</div>
      <h3>Moments</h3><div class="cues">${CUES.map(([k, i, l]) => '<button data-cue="' + k + '"><span>' + i + "</span>" + l + "</button>").join("")}</div>
      <h3>Cameras for watchers</h3>
      <div class="seg" id="h-shots"><button data-shot="" class="${world.spectator.forced ? "" : "on"}">Auto</button>${SHOT_ORDER.map((s) => '<button data-shot="' + s + '" class="' + (world.spectator.forced === s ? "on" : "") + '">' + SHOTS[s].label + "</button>").join("")}</div>
      <h3>Seating</h3>
      <div class="row"><button class="btn" id="h-seat">${seated ? "Release seats" : "Seat everyone"}</button><span class="muted">Places walking guests in chairs and holds them there.</span></div>
      <h3>Screen</h3>
      <div class="copy"><input id="h-scr" placeholder="Image or .mp4 URL for the screen" value="${esc(config.screen || "")}"><button class="btn small" id="h-scr-go">Show</button></div>
      <h3>Venue style</h3>
      <div class="row"><div class="seg" id="h-pal">${Object.keys(PALETTES).map((k) => '<button data-pal="' + k + '" class="' + ((config.palette || "blush") === k ? "on" : "") + '">' + k[0].toUpperCase() + k.slice(1) + "</button>").join("")}</div>
        <div class="seg" id="h-time">${[["live", "Live sky"], ["ceremony", "Ceremony time"], ["golden", "Golden hour"], ["evening", "Evening"]].map(([k, l]) => '<button data-time="' + k + '" class="' + ((config.time || "live") === k ? "on" : "") + '">' + l + "</button>").join("")}</div></div>
      <p class="muted" style="margin:6px 0 0">${esc(world.venue.sky.state.phase)} · sun ${Math.round(world.venue.sky.state.sunAlt * 57.3)}° · local sky for your time zone</p>
      <label class="field">Sign<input id="h-names" maxlength="40" value="${esc(config.names || o.booking?.couple_names || "")}"></label>
      ${o.kind === "sandbox-host" && !o.admin ? '<div class="row"><button class="btn primary" id="h-save">Save style for the event day</button></div>' : ""}
      <h3>${sandbox ? "Invite to rehearsal" : "Guest link"}</h3>
      <div class="copy"><input id="h-link" readonly value=""><button class="btn small" id="h-copy">Copy</button>${o.kind === "sandbox-host" ? '<button class="btn small" id="h-rot" title="Old links stop working after you reopen the sandbox">New link</button>' : ""}</div>
      ${o.kind === "realm" ? `<h3>Desktop bridge</h3><div class="row"><span class="muted">${world.link?.mode === "bridged" ? "Linked to " + esc(world.link.domain) : world.link?.mode === "reconnecting" ? "Bridge reconnecting…" : "Standalone: Websim guests only. Start a bridge on a desktop to add native Vircadia guests."}</span><button class="btn small" id="h-bridge">Open bridge</button></div>` : ""}
      <h3>Guests (${guests.length})</h3>
      ${guests.map((p) => '<div class="guest-row"><b class="grow">' + esc(p.name) + ' <span class="dev">' + esc(p.device) + " · " + (p.mode === "body" ? "walking" : "watching") + (p.role !== "guest" ? " · " + p.role : "") + "</span></b>" + (p.role === "guest" ? '<button class="btn small danger" data-kick="' + p.id + '">Remove</button>' : "") + "</div>").join("") || '<p class="muted">No one else yet.</p>'}
      ${o.booking?.staff_notes && o.role === "staff" ? "<h3>Staff notes</h3><p style='white-space:pre-wrap'>" + esc(o.booking.staff_notes) + "</p>" : ""}`);
    const link = el.querySelector("#h-link");
    if (o.kind === "sandbox-host") link.value = inviteUrl(o.transport.session); else link.value = bid ? eventUrl(bid) : location.href;
    el.querySelectorAll("[data-gather]").forEach((b) => (b.onclick = () => { o.transport.send({ type: "gather", place: b.dataset.gather }); if (sandbox) world.goPlace(b.dataset.gather); ctx.closeSheet(); }));
    el.querySelectorAll("[data-cue]").forEach((b) => (b.onclick = () => o.transport.send({ type: "cue", name: b.dataset.cue })));
    el.querySelectorAll("[data-shot]").forEach((b) => (b.onclick = () => { o.transport.send({ type: "shot", shot: b.dataset.shot || null }); el.querySelectorAll("[data-shot]").forEach((x) => x.classList.toggle("on", x === b)); }));
    el.querySelector("#h-seat").onclick = () => { o.transport.send({ type: "seat", locked: !seated }); ctx.closeSheet(); };
    el.querySelector("#h-scr-go").onclick = () => { const u = el.querySelector("#h-scr").value.trim(); setConfig({ screen: u }); o.transport.send({ type: "screen", url: u }); };
    el.querySelectorAll("[data-pal]").forEach((b) => (b.onclick = () => { setConfig({ palette: b.dataset.pal }); el.querySelectorAll("[data-pal]").forEach((x) => x.classList.toggle("on", x === b)); }));
    el.querySelectorAll("[data-time]").forEach((b) => (b.onclick = () => { setConfig({ time: b.dataset.time }); el.querySelectorAll("[data-time]").forEach((x) => x.classList.toggle("on", x === b)); }));
    el.querySelector("#h-names").onchange = (e) => setConfig({ names: e.target.value.trim() });
    el.querySelectorAll("input").forEach((i) => (i.onkeydown = (e) => e.stopPropagation()));
    el.querySelector("#h-copy").onclick = async () => { await navigator.clipboard?.writeText(link.value); ctx.toast("Link copied"); };
    el.querySelector("#h-rot")?.addEventListener("click", async () => { await rotateSandboxToken(bid); ctx.toast("New link ready — reopen the sandbox to apply it"); });
    el.querySelector("#h-save")?.addEventListener("click", async () => { const r = await api("/api/bookings/" + bid + "/config", { config: strip(config) }); ctx.toast(r.error || "Saved — your guests will see this style on the day"); });
    el.querySelector("#h-bridge")?.addEventListener("click", () => { const u = new URL(location.href); u.search = "?bridge=" + bid; window.open(u, "vmatrimony-bridge"); });
    el.querySelectorAll("[data-kick]").forEach((b) => (b.onclick = () => { o.transport.send({ type: "kick", id: b.dataset.kick }); b.closest(".guest-row").remove(); }));
  }
  const strip = (c) => ({ palette: c.palette, time: c.time, names: c.names, screen: c.screen, layout: c.layout, env: c.env, surfaces: c.surfaces });
  function setConfig(patch) {
    config = { ...config, ...patch };
    const full = { ...config, date: o.booking?.start_utc };
    world.venue.applyConfig(full);
    o.transport.send({ type: "config", config: full });
    if (o.kind === "sandbox-host") idbSet("draft:" + bid, strip(config)).catch(() => {});
    else if (o.kind === "realm") api("/api/bookings/" + bid + "/config", { config: strip(config) });
  }

  // ---------- messages ----------
  function message(m) {
    if (m.type === "welcome") {
      roster = new Map(m.players.map((p) => [p.id, p])); if (m.endsAt) endsAt = m.endsAt;
      if (m.config) config = { ...config, ...m.config };
      seated = !!m.state?.locked;
      world.setMode(o.mode, false); renderDock(); topLine();
      if (o.vr) world.enterVR().catch(() => ctx.toast("Tap VR in the dock to enter your headset"));
      if (o.mode === "body" && !isTV) ctx.toast(world.renderer.xr.isPresenting ? "" : matchMedia("(pointer: coarse)").matches ? "Left stick to move · drag to look" : "WASD to move · drag to look · Enter to chat", 4000);
    }
    if (m.type === "join" || m.type === "left" || m.type === "ident") { roster = world.roster; topLine(); }
    if (m.type === "link") { topLine(); addMsg("✦", m.link.mode === "bridged" ? "Desktop guests can now join from Vircadia" : m.link.mode === "reconnecting" ? "Desktop bridge reconnecting" : "Desktop bridge closed — venue continues on Websim"); }
    if (m.type === "join") addMsg("✦", m.player.name + (m.player.role === "native" ? " arrived from the desktop app" : " arrived"));
    if (m.type === "chat") addMsg(m.from, m.text, m.role);
    if (m.type === "cue") addMsg("✦", (CUES.find((c) => c[0] === m.cue.name)?.[2] || m.cue.name) + (m.by ? " · " + m.by : ""));
    if (m.type === "gather") addMsg("✦", (m.by || "Host") + " invites everyone to the " + (PLACES[m.place]?.label || m.place).toLowerCase());
    if (m.type === "seats") { seated = m.locked; if (world.controls.locked) ctx.toast("The host has seated everyone"); }
    if (m.type === "config") config = { ...config, ...m.config };
    if (m.type === "gb") {
      addMsg("📖", m.entry.username + " signed the guestbook");
      if (sandbox) idbGet("gb:" + (bid || "guest")).then((l) => idbSet("gb:" + (bid || "guest"), [m.entry, ...(l || [])].slice(0, 200))).catch(() => {});
    }
    if (m.type === "denied") end(m.reason);
  }
  function end(why) {
    if (ended) return; ended = true;
    timers.forEach(clearInterval); removeEventListener("keydown", onKey); off();
    if (o.kind === "sandbox-host" && !o.admin) api("/api/sandbox/tick", { booking_id: bid, stop: true });
    ctx.closeSheet(); hudEl.innerHTML = "";
    if (why) ctx.toast(why, 4000);
    ctx.home();
  }
  topLine(); renderDock();
  return { message, end, reconnect: () => addMsg("✦", "Reconnected"), peers: () => topLine() };
}
