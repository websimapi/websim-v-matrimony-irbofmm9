import * as THREE from "three";
import { buildVenue, SPAWN } from "./engine/venue.js";
import { Avatar, makeCouple } from "./engine/avatars.js";
import { Spectator, SHOTS } from "./engine/spectator.js";
import { BodyControls } from "./engine/controls.js";
import { FX } from "./engine/fx.js";
import { device } from "./device.js";

export class World {
  constructor(canvas) {
    const low = device === "mobile" || device === "tv";
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: "high-performance" }));
    r.setPixelRatio(Math.min(devicePixelRatio, low ? 1.25 : 1.75));
    r.setSize(innerWidth, innerHeight, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = device !== "mobile"; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.xr.enabled = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 400);
    this.rig = new THREE.Group(); this.scene.add(this.rig);
    this.specCam = this.camera; // same camera; parented to rig only in body mode
    this.venue = buildVenue(this.scene);
    this.couple = makeCouple(); this.scene.add(this.couple);
    this.fx = new FX(this.scene, this.camera);
    this.spectator = new Spectator(this.camera, canvas); this.spectator.enabled = true;
    this.controls = new BodyControls(this.rig, this.camera, canvas, device);
    this.controls.showStick(false);
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
    r.setAnimationLoop(() => this.frame(Math.min(clock.getDelta(), 0.1), clock.elapsedTime));
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
  goSeat(i) {
    const s = this.venue.seats[i]; if (!s) return;
    this.rig.position.set(s.pos.x, 0, s.pos.z - 0.05); this.controls.yaw = 0; this.controls.pitch = -0.05;
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
  attach(transport) { this.session = transport; this.couple.visible = false; }
  detach() {
    this.session?.close(); this.session = null; this.couple.visible = true;
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
      case "denied": this.emit("denied", m); break;
    }
  }
  addAvatar(p) {
    if (p.id === this.me || p.mode !== "body" || this.avatars.has(p.id)) return;
    const a = new Avatar({ name: p.name, look: p.look, role: p.role });
    a.root.visible = false; this.scene.add(a.root); this.avatars.set(p.id, a);
  }
  removeAvatar(id) { this.avatars.get(id)?.dispose(); this.avatars.delete(id); }
  react(r) {
    this.session?.send({ type: "react", r });
    if (!this.session) this.fx.react(r);
  }

  frame(dt, t) {
    const xr = this.renderer.xr;
    if (this.mode === "body") this.controls.update(dt, xr); else this.spectator.update(dt);
    const renderT = Date.now() - (this.clockOffset || 0) - 150;
    for (const a of this.avatars.values()) { a.update(dt, renderT); if (a.buf.length) a.root.visible = true; }
    this.fx.update(dt, t);
    // flower sway
    const fl = this.venue.flowers; for (let i = 0; i < fl.length; i += 3) fl[i].rotation.x = Math.sin(t * 1.2 + i) * 0.04;
    if (this.session && this.mode === "body" && performance.now() - this.lastSent > 100) {
      const v = this.controls.pose(xr, this.controllers);
      const key = v.map((n) => n.toFixed(2)).join(",");
      if (key !== this.lastPose || performance.now() - this.lastSent > 2000) { this.session.send({ type: "p", v }); this.lastPose = key; }
      this.lastSent = performance.now();
    }
    this.renderer.render(this.scene, this.camera);
  }
}
export { SHOTS };
