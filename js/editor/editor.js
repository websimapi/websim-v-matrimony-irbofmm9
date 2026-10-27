import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { CATALOG, CATEGORIES, BY_ID, SWATCHES, FINISHES } from "./catalog.js";
import { esc } from "../api.js";

// Build mode for sandbox rehearsals (Sims-style): pick from the catalog, the item
// follows the cursor snapped to the grid, click to place (Shift keeps placing),
// then select anything to move / rotate / scale it with the gizmo, recolour it,
// tune lights and effects, and set the sky, fog and wind. Every change is saved
// to the venue config, so guests in the rehearsal see edits live and the layout
// carries over to the event day.
const GRIDS = [0.25, 0.5, 1, 0];
const uid = () => Math.random().toString(36).slice(2, 9);
const round = (n) => Math.round(n * 1000) / 1000;
const deg = (r) => Math.round(THREE.MathUtils.radToDeg(r));

export function openEditor(ctx, { config, save, palettes }) {
  const world = ctx.world, venue = world.venue, layer = venue.layout, canvas = world.renderer.domElement, cam = world.camera;
  let items = structuredClone(Array.isArray(config.layout) ? config.layout : []);
  let env = { cover: 0.42, fog: 1, wind: 1, ...(config.env || {}) };
  let selected = null, ghost = null, grid = 0.25, cat = "ceremony", query = "", undo = [], redo = [], saveTimer = 0;

  // ---------- camera + gizmo ----------
  const prevMode = world.mode;
  world.setMode("spectator", false); world.spectator.enabled = false;
  // always open on the same raised overview of the ceremony lawn, like Sims build mode
  const orbit = new OrbitControls(cam, canvas);
  const view = (pos, target) => { cam.position.fromArray(pos); orbit.target.fromArray(target); orbit.update(); };
  view([0, 16, 24], [0, 0, 6]);
  orbit.maxPolarAngle = Math.PI * 0.48; orbit.minDistance = 1.5; orbit.maxDistance = 90; orbit.enableDamping = true;
  orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  const gizmo = new TransformControls(cam, canvas);
  gizmo.setTranslationSnap(grid || null); gizmo.setRotationSnap(THREE.MathUtils.degToRad(15)); gizmo.size = 0.9;
  world.scene.add(gizmo);
  gizmo.addEventListener("dragging-changed", (e) => { orbit.enabled = !e.value; if (!e.value && selected) commitFromObject(selected); });
  const box = new THREE.BoxHelper(undefined, 0xffd27a); box.visible = false; world.scene.add(box);
  const keys = new Set();
  world.editor = { update(dt) {
    // WASD / arrows pan the view like Sims build mode
    const f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize(); const r = new THREE.Vector3(-f.z, 0, f.x);
    const sp = dt * Math.max(4, cam.position.distanceTo(orbit.target) * 0.9), mv = new THREE.Vector3();
    if (keys.has("w") || keys.has("arrowup")) mv.add(f); if (keys.has("s") || keys.has("arrowdown")) mv.sub(f);
    if (keys.has("d") || keys.has("arrowright")) mv.add(r); if (keys.has("a") || keys.has("arrowleft")) mv.sub(r);
    if (mv.lengthSq()) { mv.normalize().multiplyScalar(sp); cam.position.add(mv); orbit.target.add(mv); }
    orbit.update();
    if (selected) { const o = objOf(selected); if (o) { box.setFromObject(o); placeActions(o); } }
  } };

  // ---------- DOM ----------
  const el = document.createElement("div"); el.id = "editor"; el.innerHTML = `
    <div class="ed-top">
      <b class="ed-title">Build mode</b>
      <div class="seg" id="ed-mode"><button data-g="translate" class="on" title="Move (1)">✥ Move</button><button data-g="rotate" title="Rotate (2)">⟳ Rotate</button><button data-g="scale" title="Scale (3)">⤢ Scale</button></div>
      <button class="ed-btn" id="ed-grid" title="Grid snap (G) · hold Alt for free placement">Grid 0.25 m</button>
      <button class="ed-btn" id="ed-undo" title="Undo (Ctrl+Z)">↶</button><button class="ed-btn" id="ed-redo" title="Redo (Ctrl+Y)">↷</button>
      <button class="ed-btn" id="ed-env">🌤 Sky & mood</button><button class="ed-btn" id="ed-help">?</button>
      <span class="grow"></span><span class="ed-count" id="ed-count"></span>
      <button class="ed-btn primary" id="ed-done">Done</button>
    </div>
    <aside class="ed-inspect" id="ed-inspect" hidden></aside>
    <div class="ed-actions" id="ed-actions" hidden><button data-act="left" title="Turn left (,)">↺</button><button data-act="right" title="Turn right (.)">↻</button><button data-act="dup" title="Duplicate (Ctrl+D)">⧉</button><button data-act="color" title="Next colour (R)">🎨</button><button data-act="finish" title="Next finish (T)">◐</button><button data-act="del" title="Delete">🗑</button></div>
    <section class="ed-catalog">
      <div class="ed-tabs" id="ed-tabs"></div>
      <input id="ed-search" type="search" placeholder="Search the catalog…" aria-label="Search the catalog">
      <div class="ed-grid" id="ed-cards"></div>
    </section>
    <div class="ed-hint" id="ed-hint"></div>
    <div class="ed-tooltip" id="ed-tooltip" role="tooltip" hidden></div>`;
  document.body.append(el); document.body.classList.add("editing");
  const $ = (s) => el.querySelector(s);
  const hint = (t) => { $("#ed-hint").textContent = t; $("#ed-hint").hidden = !t; };
  const tooltip = $("#ed-tooltip");
  const hideTooltip = () => { tooltip.hidden = true; };
  function showTooltip(label, x, y) {
    if (!label || ghost || drag || gizmo.dragging) return hideTooltip();
    tooltip.textContent = label; tooltip.hidden = false;
    tooltip.style.left = Math.max(8, Math.min(innerWidth - tooltip.offsetWidth - 8, x + 14)) + "px";
    tooltip.style.top = Math.max(8, Math.min(innerHeight - tooltip.offsetHeight - 8, y + 18)) + "px";
  }
  const itemLabel = (def) => def ? def.label + (def.note ? " · " + def.note : "") : "Venue item";

  function renderTabs() {
    $("#ed-tabs").innerHTML = CATEGORIES.map(([k, l, i]) => `<button data-cat="${k}" class="${cat === k ? "on" : ""}"><span>${i}</span>${l}</button>`).join("") +
      `<button data-cat="placed" class="${cat === "placed" ? "on" : ""}"><span>📋</span>Placed (${items.length})</button>`;
    $("#ed-tabs").querySelectorAll("[data-cat]").forEach((b) => (b.onclick = () => { cat = b.dataset.cat; query = ""; $("#ed-search").value = ""; renderTabs(); renderCards(); }));
  }
  function renderCards() {
    const q = query.trim().toLowerCase();
    hideTooltip();
    if (cat === "placed") {
      const placed = items.filter((it) => !q || itemLabel(BY_ID.get(it.t)).toLowerCase().includes(q));
      $("#ed-cards").innerHTML = placed.map((it) => { const d = BY_ID.get(it.t), label = esc(d?.label || it.t); return `<div class="ed-placed"><button class="ed-card${selected === it.i ? " on" : ""}" data-sel="${it.i}" title="${esc(itemLabel(d))}">${thumb(d)}<span>${label}</span></button><div class="ed-placed-actions"><button class="ed-btn" data-focus="${it.i}" aria-label="Focus ${label}" title="Focus ${label}">⌖ Focus</button><button class="ed-btn danger" data-remove="${it.i}" aria-label="Delete ${label}" title="Delete ${label}">🗑</button></div></div>`; }).join("") || `<p class="muted">${q ? "No placed items match your search." : "Nothing placed yet — pick something from a category."}</p>`;
      $("#ed-cards").querySelectorAll("[data-sel]").forEach((b) => (b.onclick = () => { select(b.dataset.sel); focus(); }));
      $("#ed-cards").querySelectorAll("[data-focus]").forEach((b) => (b.onclick = () => { select(b.dataset.focus); focus(); }));
      $("#ed-cards").querySelectorAll("[data-remove]").forEach((b) => (b.onclick = () => { select(b.dataset.remove); remove(); }));
      return;
    }
    const list = CATALOG.filter((c) => (q ? (c.label + " " + c.cat + " " + (c.note || "")).toLowerCase().includes(q) : c.cat === cat));
    $("#ed-cards").innerHTML = list.map((c) => `<button class="ed-card" data-add="${c.id}" title="${esc(itemLabel(c))}">${thumb(c)}<span>${esc(c.label)}</span></button>`).join("") || '<p class="muted">No matches.</p>';
    $("#ed-cards").querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => startPlacing(b.dataset.add)));
  }
  const thumb = (d) => d?.thumb ? `<img src="${d.thumb}" alt="" loading="lazy">` : `<i>${d?.icon || "◆"}</i>`;
  $("#ed-search").oninput = (e) => { query = e.target.value; renderCards(); };
  const cardTooltip = (e) => {
    const card = e.target.closest?.("[data-add],[data-sel]");
    if (!card) return hideTooltip();
    const def = BY_ID.get(card.dataset.add || itemOf(card.dataset.sel)?.t), rect = card.getBoundingClientRect();
    showTooltip(itemLabel(def), e.clientX ?? rect.left, e.clientY ?? rect.top);
  };
  $("#ed-cards").addEventListener("pointermove", cardTooltip);
  $("#ed-cards").addEventListener("focusin", cardTooltip);
  $("#ed-cards").addEventListener("pointerleave", hideTooltip);
  $("#ed-cards").addEventListener("focusout", hideTooltip);

  // ---------- model ----------
  const objOf = (id) => layer.items.get(id)?.obj;
  const itemOf = (id) => items.find((x) => x.i === id);
  function push() { undo.push(JSON.stringify(items)); if (undo.length > 80) undo.shift(); redo = []; }
  function persist(now) {
    layer.apply(items);
    $("#ed-count").textContent = items.length + " item" + (items.length === 1 ? "" : "s");
    clearTimeout(saveTimer);
    const go = () => save({ layout: items.filter((x) => x.i !== ghost), env });
    now ? go() : (saveTimer = setTimeout(go, 350));
  }
  function commitFromObject(id) {
    const o = objOf(id), it = itemOf(id); if (!o || !it) return;
    push();
    it.p = o.position.toArray().map(round); it.r = [round(o.rotation.x), round(o.rotation.y), round(o.rotation.z)];
    it.s = Math.abs(o.scale.x - o.scale.y) < 1e-3 && Math.abs(o.scale.x - o.scale.z) < 1e-3 ? round(o.scale.x) : o.scale.toArray().map(round);
    persist(); inspect();
  }

  // ---------- picking ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  function pointer(e) { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam); }
  // surface under the cursor: placed items (for stacking), venue floors and tables, else the lawn
  function surfacePoint(exclude) {
    const targets = layer.objects().filter((o) => o !== exclude);
    const hits = ray.intersectObjects([...targets, ...venue.root.children.filter((o) => o !== layer.group && !o.isLight && o.type !== "Points")], true)
      .filter((h) => h.object.visible && !h.object.isPoints && h.face && h.face.normal.y > -0.1 && !isChild(h.object, exclude));
    for (const h of hits) { const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); if (n.y > 0.6) return h.point; }
    const p = new THREE.Vector3(); return ray.ray.intersectPlane(ground, p) ? p : null;
  }
  const isChild = (o, parent) => { for (let x = o; x; x = x.parent) if (x === parent) return true; return false; };
  const snap = (v, free) => (grid && !free ? Math.round(v / grid) * grid : v);
  function pickItem() {
    const hits = ray.intersectObjects(layer.objects(), true).filter((h) => !h.object.isPoints);
    for (const h of hits) for (let x = h.object; x; x = x.parent) if (x.userData.layoutId) return x.userData.layoutId;
    // open structures (arches, canopies) and lights/effects: select by footprint on the ground
    const g = new THREE.Vector3(); if (!ray.ray.intersectPlane(ground, g)) return null;
    let best = null, bd = Infinity;
    for (const [id, rec] of layer.items) {
      if (id === ghost) continue;
      const b = new THREE.Box3().setFromObject(rec.obj, true), c = rec.obj.position;
      const inside = !b.isEmpty() && g.x >= b.min.x - 0.15 && g.x <= b.max.x + 0.15 && g.z >= b.min.z - 0.15 && g.z <= b.max.z + 0.15;
      const d = Math.hypot(g.x - c.x, g.z - c.z);
      if ((inside || d < 0.5) && d < bd) { bd = d; best = id; }
    }
    return best;
  }

  // ---------- placing ----------
  function startPlacing(type, from) {
    hideTooltip();
    cancelGhost(); deselect();
    const def = BY_ID.get(type); if (!def) return;
    const it = { i: uid(), t: type, p: [orbit.target.x, 0, orbit.target.z], r: [0, from?.r?.[1] || 0, 0], s: from?.s ?? 1 };
    if (from?.c) it.c = from.c; if (from?.l != null) it.l = from.l;
    items.push(it); ghost = it.i; layer.apply(items);
    hint(`Placing ${def.label}: click to place · Shift+click places another · , . rotate 45° (Alt 15°) · [ ] size · R colour · Alt = off-grid · Esc cancels`);
  }
  function cancelGhost() { if (!ghost) return; items = items.filter((x) => x.i !== ghost); ghost = null; layer.apply(items); hint(""); }
  function placeGhost(keepGoing) {
    const it = itemOf(ghost); if (!it) return;
    const placed = ghost; ghost = null; hint("");
    undo.push(JSON.stringify(items.filter((x) => x.i !== placed))); redo = [];
    persist(true); renderTabs();
    if (keepGoing) startPlacing(it.t, it); else { select(placed); }
  }

  // ---------- selection + inspector ----------
  function select(id) {
    if (!itemOf(id)) return deselect();
    selected = id; const o = objOf(id); gizmo.attach(o); box.visible = true; box.setFromObject(o); inspect(); if (cat === "placed") renderCards();
  }
  function deselect() { selected = null; gizmo.detach(); box.visible = false; $("#ed-inspect").hidden = true; $("#ed-actions").hidden = true; if (cat === "placed") renderCards(); }
  // Sims-style quick actions floating beside the selected item
  const _p = new THREE.Vector3();
  function placeActions(o) {
    const a = $("#ed-actions"), b = new THREE.Box3().setFromObject(o);
    _p.set((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2).project(cam);
    if (_p.z > 1) { a.hidden = true; return; }
    a.hidden = false; const r = canvas.getBoundingClientRect();
    a.style.left = Math.round((_p.x * 0.5 + 0.5) * r.width + r.left) + "px"; a.style.top = Math.max(70, Math.round((-_p.y * 0.5 + 0.5) * r.height + r.top) - 54) + "px";
  }
  function focus() { const o = objOf(selected); if (!o) return; const d = cam.position.clone().sub(orbit.target); orbit.target.copy(o.position); cam.position.copy(o.position).add(d.setLength(Math.min(d.length(), 9))); }
  function inspect() {
    const it = itemOf(selected), ins = $("#ed-inspect"); if (!it) { ins.hidden = true; return; }
    const d = BY_ID.get(it.t), s = Array.isArray(it.s) ? it.s[0] : it.s ?? 1, light = d.light || d.kind === "light";
    ins.hidden = false;
    ins.innerHTML = `<div class="ed-ins-head">${thumb(d)}<div><b>${esc(d.label)}</b><div class="muted">${esc(CATEGORIES.find((c) => c[0] === d.cat)?.[1] || "")}</div></div></div>
      <label>Position <span class="ed-xyz">${["x", "y", "z"].map((k, i) => `<input type="number" step="0.05" data-pos="${i}" value="${(it.p?.[i] ?? 0).toFixed(2)}" aria-label="${k}">`).join("")}</span></label>
      <label>Turn <input type="range" min="-180" max="180" step="5" id="ed-rot" value="${deg(it.r?.[1] || 0)}"><output>${deg(it.r?.[1] || 0)}°</output></label>
      <label>Size <input type="range" min="0.2" max="4" step="0.05" id="ed-scale" value="${s}"><output>${(+s).toFixed(2)}×</output></label>
      ${d.colorable || d.kind !== "glb" ? `<div class="ed-label">Colour</div><div class="ed-swatches">${SWATCHES.map((c) => `<button style="background:${c}" data-c="${c}" class="${it.c === c ? "on" : ""}" aria-label="${c}"></button>`).join("")}<input type="color" id="ed-color" value="${it.c || d.color || "#ffffff"}" aria-label="Custom colour"><button class="ed-btn small" id="ed-nocolor">Original</button></div>` : ""}
      ${d.colorable || d.kind === "glb" ? `<div class="ed-label">Finish</div><div class="ed-finishes"><button data-f="" class="${!it.f ? "on" : ""}"><i style="background:linear-gradient(135deg,#eee,#bbb)"></i>Original</button>${Object.entries(FINISHES).map(([k, v]) => `<button data-f="${k}" class="${it.f === k ? "on" : ""}"><i style="background:${v.swatch}"></i>${v.label}</button>`).join("")}</div>` : ""}
      ${light ? `<label>Brightness <input type="range" min="0" max="12" step="0.1" id="ed-light" value="${it.l ?? (d.light?.intensity ?? 3)}"><output>${(it.l ?? d.light?.intensity ?? 3).toFixed(1)}</output></label>` : ""}
      ${d.note ? `<p class="muted">${esc(d.note)}</p>` : ""}
      <div class="ed-row"><button class="ed-btn" id="ed-dup">Duplicate</button><button class="ed-btn" id="ed-drop">Drop to floor</button><button class="ed-btn danger" id="ed-del">Delete</button></div>`;
    const live = (fn) => (e) => { fn(e); e.target.nextElementSibling && (e.target.nextElementSibling.textContent = e.target.id === "ed-rot" ? e.target.value + "°" : e.target.id === "ed-scale" ? (+e.target.value).toFixed(2) + "×" : (+e.target.value).toFixed(1)); layer.apply(items); };
    ins.querySelectorAll("[data-pos]").forEach((x) => (x.onchange = () => { push(); it.p = [0, 1, 2].map((i) => round(+ins.querySelector(`[data-pos="${i}"]`).value)); persist(); }));
    const rot = $("#ed-rot"); rot.onpointerdown = push; rot.oninput = live(() => { it.r = [it.r?.[0] || 0, round(THREE.MathUtils.degToRad(+rot.value)), it.r?.[2] || 0]; }); rot.onchange = () => persist();
    const sc = $("#ed-scale"); sc.onpointerdown = push; sc.oninput = live(() => { it.s = round(+sc.value); }); sc.onchange = () => persist();
    ins.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => recolor(b.dataset.c)));
    ins.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => refinish(b.dataset.f || null)));
    $("#ed-color") && ($("#ed-color").onchange = (e) => recolor(e.target.value));
    $("#ed-nocolor") && ($("#ed-nocolor").onclick = () => recolor(null));
    const li = $("#ed-light"); if (li) { li.onpointerdown = push; li.oninput = live(() => { it.l = round(+li.value); }); li.onchange = () => persist(); }
    $("#ed-dup").onclick = duplicate; $("#ed-del").onclick = remove;
    $("#ed-drop").onclick = () => { push(); it.p[1] = 0; persist(); inspect(); };
  }
  function refinish(f) { const it = itemOf(selected); if (!it) return; push(); if (f) it.f = f; else delete it.f; persist(); inspect(); }
  function nextFinish() { const it = itemOf(selected); if (!it) return; const keys = [null, ...Object.keys(FINISHES)]; refinish(keys[(keys.indexOf(it.f ?? null) + 1) % keys.length]); }
  function recolor(c) { const it = itemOf(selected); if (!it) return; push(); if (c) it.c = c; else delete it.c; persist(); inspect(); }
  function duplicate() { const it = itemOf(selected); if (!it) return; push(); const n = { ...structuredClone(it), i: uid() }; n.p = [it.p[0] + (grid || 0.5), it.p[1], it.p[2] + (grid || 0.5)]; items.push(n); persist(); renderTabs(); select(n.i); }
  function remove() { if (!selected) return; push(); items = items.filter((x) => x.i !== selected); deselect(); persist(); renderTabs(); }
  function history(from, to) { if (!from.length) return; cancelGhost(); to.push(JSON.stringify(items)); items = JSON.parse(from.pop()); const keep = selected; deselect(); persist(); renderTabs(); if (itemOf(keep)) select(keep); }

  // ---------- environment ----------
  function openEnv() {
    const ins = $("#ed-inspect"); deselect(); ins.hidden = false;
    const t = config.time || "live";
    ins.innerHTML = `<div class="ed-ins-head"><i>🌤</i><div><b>Sky & mood</b><div class="muted">${esc(venue.sky.state.phase)} · sun ${Math.round(venue.sky.state.sunAlt * 57.3)}°</div></div></div>
      <div class="ed-label">Time of day</div><div class="seg" id="ed-time">${[["live", "Live"], ["ceremony", "Ceremony"], ["golden", "Golden"], ["evening", "Evening"]].map(([k, l]) => `<button data-t="${k}" class="${t === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <label>Clouds <input type="range" min="0" max="1" step="0.02" data-env="cover" value="${env.cover}"><output>${Math.round(env.cover * 100)}%</output></label>
      <label>Fog & mist <input type="range" min="0" max="4" step="0.05" data-env="fog" value="${env.fog}"><output>${(+env.fog).toFixed(2)}×</output></label>
      <label>Breeze <input type="range" min="0" max="3" step="0.05" data-env="wind" value="${env.wind}"><output>${(+env.wind).toFixed(2)}×</output></label>
      <div class="ed-label">Aisle runner</div><div class="seg">${[["petals", "Petal print"], ["satin", "Ivory satin"], ["blush", "Blush"], ["none", "Bare lawn"]].map(([k, l]) => `<button data-sf="runner:${k}" class="${(config.surfaces?.runner || "petals") === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="ed-label">Dance floor</div><div class="seg">${[["parquet", "Parquet"], ["white", "White gloss"], ["black", "Black gloss"]].map(([k, l]) => `<button data-sf="dance:${k}" class="${(config.surfaces?.dance || "parquet") === k ? "on" : ""}">${l}</button>`).join("")}</div>
      ${palettes ? `<div class="ed-label">Flower palette</div><div class="seg">${palettes.map((k) => `<button data-pal="${k}" class="${(config.palette || "blush") === k ? "on" : ""}">${k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div>` : ""}`;
    ins.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => { config.time = b.dataset.t; save({ time: b.dataset.t }); openEnv(); }));
    ins.querySelectorAll("[data-sf]").forEach((b) => (b.onclick = () => { const [k, v] = b.dataset.sf.split(":"); config.surfaces = { ...(config.surfaces || {}), [k]: v }; save({ surfaces: config.surfaces }); openEnv(); }));
    ins.querySelectorAll("[data-pal]").forEach((b) => (b.onclick = () => { config.palette = b.dataset.pal; save({ palette: b.dataset.pal }); openEnv(); }));
    ins.querySelectorAll("[data-env]").forEach((r) => (r.oninput = () => { env[r.dataset.env] = +r.value; r.nextElementSibling.textContent = r.dataset.env === "cover" ? Math.round(r.value * 100) + "%" : (+r.value).toFixed(2) + "×"; persist(); }));
  }
  function help() {
    const ins = $("#ed-inspect"); deselect(); ins.hidden = false;
    ins.innerHTML = `<div class="ed-ins-head"><i>⌨</i><div><b>Shortcuts</b></div></div><dl class="ed-keys">
      <dt>Click a card</dt><dd>pick it up; click the lawn to place</dd><dt>Shift + click</dt><dd>place another of the same</dd>
      <dt>, / .</dt><dd>turn 45° (with Alt: 15°)</dd><dt>[ / ]</dt><dd>smaller / bigger</dd><dt>R / T</dt><dd>next colour / next finish</dd><dt>Drag an item</dt><dd>move it across the floor</dd>
      <dt>Alt (hold)</dt><dd>place off the grid</dd><dt>G</dt><dd>grid 0.25 / 0.5 / 1 m / off</dd><dt>1 2 3</dt><dd>move / rotate / scale gizmo</dd>
      <dt>Ctrl+D</dt><dd>duplicate</dd><dt>Delete</dt><dd>remove</dd><dt>Ctrl+Z / Ctrl+Y</dt><dd>undo / redo</dd>
      <dt>F</dt><dd>focus the selection</dd><dt>WASD, right-drag</dt><dd>pan</dd><dt>Left-drag, wheel</dt><dd>orbit, zoom</dd><dt>Esc</dt><dd>cancel / deselect / leave</dd></dl>`;
  }

  // ---------- input ----------
  let down = null, drag = null, hover = null;
  const hoverBox = new THREE.BoxHelper(undefined, 0xffffff); hoverBox.visible = false; hoverBox.material.transparent = true; hoverBox.material.opacity = 0.55; world.scene.add(hoverBox);
  const follow = (id, e) => { // move an item to the surface under the cursor (snapped)
    pointer(e); const o = objOf(id), it = itemOf(id), p = surfacePoint(o); if (!p || !it) return;
    it.p = [round(snap(p.x, e.altKey)), round(p.y), round(snap(p.z, e.altKey))]; layer.apply(items);
  };
  const onMove = (e) => {
    if (ghost) { hideTooltip(); return follow(ghost, e); }
    if (drag) { if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) { drag.moved = true; push(); orbit.enabled = false; gizmo.detach(); canvas.style.cursor = "grabbing"; } if (drag.moved) follow(drag.id, e); return; }
    if (gizmo.dragging || e.buttons) return;
    pointer(e); const id = pickItem();
    hover = id; canvas.style.cursor = id ? "grab" : "";
    hoverBox.visible = !!id && id !== selected; if (hoverBox.visible) hoverBox.setFromObject(objOf(id));
    id ? showTooltip(itemLabel(BY_ID.get(itemOf(id)?.t)), e.clientX, e.clientY) : hideTooltip();
  };
  const onDown = (e) => {
    hideTooltip();
    down = { x: e.clientX, y: e.clientY, b: e.button };
    // pressing on an item grabs it (drag to move, like Sims); empty lawn orbits the camera
    if (e.button === 0 && !ghost && !gizmo.dragging && !gizmo.axis) { pointer(e); const id = pickItem(); if (id) { drag = { id, x: e.clientX, y: e.clientY, moved: false }; orbit.enabled = false; } }
  };
  const onUp = (e) => {
    if (drag) { const d = drag; drag = null; orbit.enabled = true; canvas.style.cursor = hover ? "grab" : ""; if (d.moved) { persist(); select(d.id); down = null; return; } }
    if (!down || e.button !== 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || gizmo.dragging) { down = null; return; }
    down = null; pointer(e);
    if (ghost) { follow(ghost, e); placeGhost(e.shiftKey); return; }
    const id = pickItem(); id ? select(id) : deselect();
  };
  const onKey = (e) => {
    if (e.target.closest?.("input,textarea,select")) return;
    const k = e.key.toLowerCase(), id = ghost || selected, it = itemOf(id);
    if (e.type === "keyup") { keys.delete(k); return; }
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k) && !e.ctrlKey && !e.metaKey) { keys.add(k); e.preventDefault(); return; }
    const mod = e.ctrlKey || e.metaKey;
    if (k === "escape") { if (ghost) cancelGhost(); else if (selected) deselect(); else close(); }
    else if (mod && k === "z") { e.preventDefault(); e.shiftKey ? history(redo, undo) : history(undo, redo); }
    else if (mod && k === "y") { e.preventDefault(); history(redo, undo); }
    else if (mod && k === "d") { e.preventDefault(); duplicate(); }
    else if ((k === "delete" || k === "backspace") && selected) { e.preventDefault(); remove(); }
    else if ((k === "," || k === ".") && it) { if (!ghost) push(); it.r = [it.r?.[0] || 0, round((it.r?.[1] || 0) + (k === "," ? 1 : -1) * (e.altKey ? Math.PI / 12 : Math.PI / 4)), it.r?.[2] || 0]; ghost ? layer.apply(items) : (persist(), inspect()); }
    else if ((k === "[" || k === "]") && it) { if (!ghost) push(); it.s = round(Math.min(4, Math.max(0.2, (Array.isArray(it.s) ? it.s[0] : it.s ?? 1) * (k === "]" ? 1.1 : 1 / 1.1)))); ghost ? layer.apply(items) : (persist(), inspect()); }
    else if (k === "r" && it && !mod) { const i = SWATCHES.indexOf(it.c); if (!ghost) push(); it.c = SWATCHES[(i + 1) % SWATCHES.length]; ghost ? layer.apply(items) : (persist(), inspect()); }
    else if (k === "t" && selected && !mod) nextFinish();
    else if (k === "g") setGrid(GRIDS[(GRIDS.indexOf(grid) + 1) % GRIDS.length]);
    else if (k === "1" || k === "2" || k === "3") setGizmo(["translate", "rotate", "scale"][+k - 1]);
    else if (k === "f") focus();
  };
  function setGrid(g) { grid = g; gizmo.setTranslationSnap(g || null); $("#ed-grid").textContent = g ? "Grid " + g + " m" : "Grid off"; }
  function setGizmo(m) { gizmo.setMode(m); el.querySelectorAll("[data-g]").forEach((b) => b.classList.toggle("on", b.dataset.g === m)); }
  el.querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => setGizmo(b.dataset.g)));
  $("#ed-grid").onclick = () => setGrid(GRIDS[(GRIDS.indexOf(grid) + 1) % GRIDS.length]);
  $("#ed-undo").onclick = () => history(undo, redo); $("#ed-redo").onclick = () => history(redo, undo);
  el.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => {
    const it = itemOf(selected); if (!it) return;
    const act = b.dataset.act;
    if (act === "left" || act === "right") { push(); it.r = [it.r?.[0] || 0, round((it.r?.[1] || 0) + (act === "left" ? 1 : -1) * Math.PI / 4), it.r?.[2] || 0]; persist(); inspect(); }
    if (act === "dup") duplicate(); if (act === "del") remove(); if (act === "finish") nextFinish();
    if (act === "color") { const i = SWATCHES.indexOf(it.c); recolor(SWATCHES[(i + 1) % SWATCHES.length]); }
  }));
  $("#ed-env").onclick = openEnv; $("#ed-help").onclick = help; $("#ed-done").onclick = () => close();
  canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", hideTooltip);
  addEventListener("keydown", onKey, true); addEventListener("keyup", onKey, true);

  function close() {
    cancelGhost(); deselect(); clearTimeout(saveTimer); save({ layout: items, env });
    canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointerleave", hideTooltip);
    removeEventListener("keydown", onKey, true); removeEventListener("keyup", onKey, true);
    gizmo.detach(); gizmo.removeFromParent(); gizmo.dispose(); orbit.dispose(); box.removeFromParent(); hoverBox.removeFromParent(); canvas.style.cursor = "";
    el.remove(); document.body.classList.remove("editing"); world.editor = null;
    world.setMode(prevMode, false); if (prevMode !== "body") world.spectator.enabled = true;
    api.onclose?.();
  }
  renderTabs(); renderCards(); hint("Pick something from the catalog · click placed items to edit them · ? for shortcuts");
  $("#ed-count").textContent = items.length + " items";
  const api = { close, get items() { return items; }, startPlacing, select, placeGhost, setGrid, env: () => env, view };
  window.__editor = api;
  return api;
}
