import * as THREE from "three";
import { buildVenue, SPAWN, PLACES } from "./engine/venue.js";
import { Human, makeCouple } from "./engine/humans.js";
import { NPCs } from "./engine/npcs.js";
import { Spectator, SHOTS } from "./engine/spectator.js";
import { BodyControls } from "./engine/controls.js";
import { FX } from "./engine/fx.js";
import { device } from "./device.js";

export class World {
  constructor(canvas) {
    let low = device === "mobile" || device === "tv";
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: "high-performance" }));
    // software GPUs (headless / old machines) get the light tier
    const gl = r.getContext(), dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "";
    this.soft = /swiftshader|llvmpipe|software/i.test(gpu);
    if (this.soft) low = true;
    r.setPixelRatio(this.soft ? 0.4 : Math.min(devicePixelRatio, low ? 1.25 : 1.75));
    r.setSize(innerWidth, innerHeight, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = device !== "mobile" && !this.soft; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.xr.enabled = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 400);
    this.rig = new THREE.Group(); this.scene.add(this.rig);
    this.specCam = this.camera; // same camera; parented to rig only in body mode
    this.low = low || device === "vr";
    this.venue = buildVenue(this.scene, { low: this.low, soft: this.soft });
    this.couple = makeCouple(); this.scene.add(this.couple);
    this.npcs = new NPCs(this.scene, this.venue, this.soft ? 6 : low ? 10 : 14);
    this._ft = 0; this._fn = 0;
    this.fx = new FX(this.scene, this.camera);
    this.spectator = new Spectator(this.camera, canvas); this.spectator.enabled = true;
    this.controls = new BodyControls(this.rig, this.camera, canvas, device);
    this.controls.showStick(false);
    this.venue.setRenderer(r);
    this.controls.colliders = this.venue.colliders;
    this.controls.ignore = (tag) => tag === this._ignTag;
    this.npcs.colliders = this.venue.colliders;
    this._people = [];
    this.avatars = new Map();
    this.mode = "spectator"; this.session = null; this.me = null; this.role = "guest";
    this.handlers = {}; this.lastSent = 0; this.lastPose = null; this.clockOffset = 0;
    this.controllers = [0, 1].map((i) => {
      const c = r.xr.getController(i);
      c.add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf1c7a5 })));
      this.rig.add(c); return c;
    });
    addEventListener("resize", () => this.resize());
    const clock = new THREE.Clock();
    const start = () => r.setAnimationLoop(() => this.frame(Math.min(clock.getDelta(), 0.1), clock.elapsedTime));
    if (this.soft) setTimeout(start, 4000); else start();
  }
  on(h) {
    for (const [k, f] of Object.entries(h)) (this.handlers[k] ||= new Set()).add(f);
    return () => { for (const [k, f] of Object.entries(h)) this.handlers[k]?.delete(f); };
  }
  emit(k, ...a) { this.handlers[k]?.forEach((f) => f(...a)); }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight, false); }

  setMode(mode, tell = true) {
    this.mode = mode;
    const body = mode === "body";
    this.spectator.enabled = !body; this.controls.enabled = body; this.controls.showStick(body);
    if (body) {
      this.rig.add(this.camera);
      if (this.mySeat != null && this.mySeat >= 0) this.goSeat(this.mySeat);
      else if (this.rig.position.lengthSq() === 0) { this.rig.position.copy(SPAWN).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, Math.random() * 2)); this.controls.yaw = 0; }
      this.controls.yaw = this.controls.yaw || 0;
    } else {
      this.scene.add(this.camera); this.camera.rotation.set(0, 0, 0);
      if (this.renderer.xr.isPresenting) this.renderer.xr.getSession()?.end();
    }
    if (tell) this.session?.send({ type: "mode", mode });
    this.emit("mode", mode);
  }
  // teleport to a named part of the venue (ceremony, cocktail, reception, dance, cake)
  goPlace(name) {
    const P = PLACES[name]; if (!P) return;
    this.zone = name; this.spectator.setZone(name);
    if (this.mode === "body" && !this.controls.locked) {
      const j = () => (Math.random() - 0.5) * 2.2;
      this.rig.position.set(P.pos.x + j(), P.pos.y, P.pos.z + j()); this.controls.yaw = P.yaw; this.controls.pitch = 0;
    }
    if (this.npcs.visible) this.npcs.gather(name);
    this.emit("place", name);
  }
  goSeat(i) {
    const s = this.venue.seats[i]; if (!s) return;
    this.rig.position.set(s.pos.x, 0, s.pos.z); this.controls.yaw = 0; this.controls.pitch = -0.05;
    this.sitting = this.venue.sitSpots[i]; this._ignTag = "c" + i; this.controls.vel.set(0, 0, 0);
  }
  async enterVR() {
    const s = await navigator.xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor"] });
    this.renderer.xr.setReferenceSpaceType("local-floor");
    await this.renderer.xr.setSession(s);
    this.setMode("body");
    s.addEventListener("end", () => { this.camera.position.set(0, 1.62, 0); this.emit("vr", false); });
    this.emit("vr", true);
  }

  // ---------- sessions ----------
  attach(transport) { this.session = transport; this.couple.visible = false; this.npcs.visible = false; }
  detach() {
    this.session?.close(); this.session = null; this.couple.visible = true; this.npcs.visible = true;
    for (const a of this.avatars.values()) a.dispose(); this.avatars.clear();
    this.setMode("spectator", false); this.spectator.force(null);
  }
  handle(m) {
    switch (m.type) {
      case "welcome":
        this.me = m.id; this.role = m.role;
        for (const a of this.avatars.values()) a.dispose(); this.avatars.clear();
        this.roster = new Map(m.players.map((p) => [p.id, p]));
        for (const p of m.players) this.addAvatar(p);
        for (const v of m.poses || []) this.avatars.get(v[0])?.snap(v.slice(1));
        if (m.config) this.venue.applyConfig(m.config);
        if (m.state?.screen) this.venue.setScreen(m.state.screen);
        if (m.state?.shot) this.spectator.force(m.state.shot);
        this.emit("welcome", m); this.emit("roster", this.roster); break;
      case "join": this.roster.set(m.player.id, m.player); this.addAvatar(m.player); this.emit("roster", this.roster); break;
      case "ident": this.roster.set(m.player.id, m.player); this.removeAvatar(m.player.id); this.addAvatar(m.player); this.emit("roster", this.roster); break;
      case "left": this.roster.delete(m.id); this.removeAvatar(m.id); this.emit("roster", this.roster); break;
      case "s": {
        this.clockOffset = this.clockOffset ? this.clockOffset * 0.9 + (Date.now() - m.t) * 0.1 : Date.now() - m.t;
        for (const v of m.p) this.avatars.get(v[0])?.push(m.t, v.slice(1));
        break;
      }
      case "cue": this.fx.cue(m.cue.name); this.emit("cue", m); break;
      case "shot": this.spectator.force(m.shot); this.emit("shot", m.shot); break;
      case "screen": this.venue.setScreen(m.url); break;
      case "config": this.venue.applyConfig(m.config); this.emit("config", m.config); break;
      case "seats": {
        const mine = m.seats.find((s) => s[0] === this.me);
        this.mySeat = mine ? mine[1] : -1; this.controls.locked = m.locked && this.mySeat >= 0;
        if (this.mode === "body" && this.mySeat >= 0) this.goSeat(this.mySeat);
        this.emit("seats", m); break;
      }
      case "react": this.fx.react(m.r, this.avatars.get(m.id)?.root.position.clone().add(new THREE.Vector3(0, 2.1, 0))); break;
      case "chat": this.emit("chat", m); break;
      case "gb": this.emit("gb", m.entry); break;
      case "gather": this.goPlace(m.place); this.emit("gather", m); break;
      case "denied": this.emit("denied", m); break;
    }
  }
  addAvatar(p) {
    if (p.id === this.me || p.mode !== "body" || this.avatars.has(p.id)) return;
    const a = new Human({ name: p.name, look: p.look, role: p.role, face: p.face });
    a.root.visible = false; this.scene.add(a.root); this.avatars.set(p.id, a);
  }
  removeAvatar(id) { this.avatars.get(id)?.dispose(); this.avatars.delete(id); }
  // adaptive quality: if frames stay slow, drop resolution then shadows
  adapt(dt) {
    this._ft += dt; this._fn++;
    if (this._ft < 3) return;
    const avg = this._ft / this._fn; this._ft = 0; this._fn = 0;
    if (this.soft || avg < 1 / 35 || this.renderer.xr.isPresenting) return;
    const r = this.renderer, pr = r.getPixelRatio();
    if (pr > 0.75) { r.setPixelRatio(Math.max(0.75, pr * 0.8)); this.resize(); }
    else if (r.shadowMap.enabled) { r.shadowMap.enabled = false; this.scene.traverse((m) => m.material && (m.material.needsUpdate = true)); }
  }
  // auto pose: sit when resting at a chair, dance when lingering on the dance floor
  // stop next to a chair to sit in it (move to stand up); stop on the dance floor to dance
  myFlags(dt) {
    const p = this.rig.position, c = this.controls;
    if (this.sitting) {
      if (c.moving && !c.locked) this.sitting = null; else return 1;
    }
    if (this._ignTag) { const s = this.venue.sitSpots.find((x) => x.tag === this._ignTag); if (!s || Math.hypot(s.pos.x - p.x, s.pos.z - p.z) > 0.8) this._ignTag = null; }
    this._still = c.moving ? 0 : (this._still || 0) + dt;
    if (this._still < 0.6) return 0;
    const f = this.venue.danceFloor;
    if (Math.abs(p.x - f.x) < f.w / 2 && Math.abs(p.z - f.z) < f.d / 2) return 2;
    if (this._still < 0.9) return 0;
    let best = null, bd = 0.62;
    for (const s of this.venue.sitSpots) { const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z); if (d < bd && s.tag !== this._ignTag) { bd = d; best = s; } }
    if (best && !this._taken(best)) {
      this.sitting = best; this._ignTag = best.tag; c.vel.set(0, 0, 0);
      p.set(best.pos.x, best.pos.y, best.pos.z); c.yaw = best.yaw; c.pitch = -0.05;
      return 1;
    }
    return 0;
  }
  // a chair is taken if someone else is sitting in it
  _taken(s) {
    for (const q of this._people) if (q.sit && Math.hypot(q.x - s.pos.x, q.z - s.pos.z) < 0.3) return true;
    return false;
  }
  // circles for every visible person (used for the walker's collisions)
  gatherPeople() {
    const L = this._people; L.length = 0;
    const push = (pos, sit) => L.push({ t: 0, x: pos.x, z: pos.z, r: 0.24, sit });
    for (const a of this.avatars.values()) if (a.root.visible) push(a.root.position, a.flags & 1);
    if (this.npcs.visible) for (const n of this.npcs.list) push(n.pos, n.flags === 1);
    if (this.couple.visible) for (const a of this.couple.userData.people) push(a.root.position, false);
    return L;
  }
  react(r) {
    this.session?.send({ type: "react", r });
    if (!this.session) this.fx.react(r);
  }

  frame(dt, t) {
    const xr = this.renderer.xr;
    if (this.mode === "body") { this.controls.people = this.sitting ? null : this.gatherPeople(); this.controls.update(dt, xr); } else this.spectator.update(dt);
    const renderT = Date.now() - (this.clockOffset || 0) - 150;
    for (const a of this.avatars.values()) { a.update(dt, renderT); if (a.buf.length) a.root.visible = true; }
    this.fx.update(dt, t);
    this.camera.getWorldPosition(this._cp ||= new THREE.Vector3());
    this.venue.update(dt, t, this._cp);
    if (this.couple.visible) for (const a of this.couple.userData.people) a.animate(dt);
    this.npcs.update(dt, this.mode === "body" ? this.rig.position : null);
    this.adapt(dt);
    if (this.mode === "body") this.controls.flags = this.myFlags(dt);
    if (this.session && this.mode === "body" && performance.now() - this.lastSent > 100) {
      const v = this.controls.pose(xr, this.controllers);
      const key = v.map((n) => n.toFixed(2)).join(",");
      if (key !== this.lastPose || performance.now() - this.lastSent > 2000) { this.session.send({ type: "p", v }); this.lastPose = key; }
      this.lastSent = performance.now();
    }
    // software GPU: keep the page responsive by rendering sparsely
    if (this.soft && !xr.isPresenting) { const now = performance.now(); if (now - (this._lr || 0) < (this._cost || 0) * 3 + 200) return; const t0 = now; this.renderer.render(this.scene, this.camera); this._lr = performance.now(); this._cost = this._lr - t0; if ((this._dbg = (this._dbg || 0) + 1) % 3 === 1) console.log('[perf]', Math.round(this._cost), 'ms', this.renderer.info.render.triangles, 'tris', this.renderer.info.render.calls, 'calls', this.renderer.info.programs?.length, 'progs'); return; }
    this.renderer.render(this.scene, this.camera);
  }
}
export { SHOTS };
