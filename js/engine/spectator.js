import * as THREE from "three";
import { ALTAR } from "./venue.js";

// Advanced spectator camera: named cinematic shots, an auto-director that cuts
// and eases between them, staff-directed overrides, and free orbit on drag.
const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const SHOTS = {
  wide:   { label: "Wide",    fn: (t) => ({ p: V(Math.sin(t * 0.05) * 6, 6.5, 24 - Math.sin(t * 0.04) * 3), l: V(0, 1.5, -8) }) },
  aisle:  { label: "Aisle",   fn: (t) => ({ p: V(0.15, 1.4, 14 - ((t * 0.6) % 14)), l: V(0, 1.6, -11) }) },
  altar:  { label: "Altar",   fn: (t) => ({ p: V(3.8 + Math.sin(t * 0.1) * 0.6, 1.8, -6.6), l: V(0, 1.6, -10.3) }) },
  crane:  { label: "Crane",   fn: (t) => { const a = t * 0.08; return { p: V(Math.sin(a) * 18, 9 + Math.sin(t * 0.07) * 2, -4 + Math.cos(a) * 18), l: V(0, 0.8, -3) }; } },
  guests: { label: "Guests",  fn: (t) => ({ p: V(Math.sin(t * 0.06) * 2.5, 2.6, -8.5), l: V(0, 1, 4) }) },
  aerial: { label: "Aerial",  fn: (t) => { const a = t * 0.03; return { p: V(Math.sin(a) * 4, 26, 2 + Math.cos(a) * 4), l: V(0, 0, 0) }; } },
  dance:  { label: "Party",   fn: (t) => { const a = t * 0.15; return { p: V(Math.sin(a) * 7, 2.8, 23 + Math.cos(a) * 7), l: V(0, 1, 23) }; } },
};
export const SHOT_ORDER = ["wide", "aisle", "crane", "altar", "guests", "aerial", "dance"];

export class Spectator {
  constructor(camera, dom) {
    this.cam = camera; this.dom = dom;
    this.t = 0; this.shot = "wide"; this.prev = null; this.blend = 1; this.held = 0;
    this.auto = true; this.forced = null; this.shotLen = 10;
    this.orbit = null; this.idle = 0;
    this.onchange = () => {};
    this.cur = { p: V(0, 6, 24), l: V(0, 1.5, -8) };
    this._bind();
  }
  _bind() {
    let drag = null;
    this.dom.addEventListener("pointerdown", (e) => { if (!this.enabled) return; drag = { x: e.clientX, y: e.clientY }; });
    addEventListener("pointerup", () => (drag = null));
    addEventListener("pointermove", (e) => {
      if (!drag || !this.enabled) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY };
      if (!this.orbit) this._startOrbit();
      this.orbit.az -= dx * 0.005; this.orbit.el = Math.max(0.05, Math.min(1.45, this.orbit.el + dy * 0.004));
      this.idle = 0;
    });
    this.dom.addEventListener("wheel", (e) => { if (!this.enabled) return; if (!this.orbit) this._startOrbit(); this.orbit.r = Math.max(4, Math.min(45, this.orbit.r * (1 + e.deltaY * 0.001))); this.idle = 0; }, { passive: true });
  }
  _startOrbit() {
    const l = this.cur.l.clone(), d = this.cur.p.clone().sub(l);
    this.orbit = { l, r: d.length(), az: Math.atan2(d.x, d.z), el: Math.asin(d.y / d.length()) };
  }
  cut(name, instant) {
    if (!SHOTS[name]) return;
    this.orbit = null;
    if (name === this.shot && !instant) return;
    this.prev = { ...this.cur, p: this.cur.p.clone(), l: this.cur.l.clone() };
    this.blend = instant ? 1 : 0; this.shot = name; this.held = 0;
    this.onchange(name);
  }
  next(dir = 1) { const i = SHOT_ORDER.indexOf(this.shot); this.cut(SHOT_ORDER[(i + dir + SHOT_ORDER.length) % SHOT_ORDER.length]); }
  force(name) { this.forced = name; if (name) this.cut(name); }
  update(dt) {
    this.t += dt; this.held += dt; this.idle += dt;
    if (this.orbit) {
      if (this.idle > 12 && this.auto) { this.orbit = null; this.next(); }
      else {
        const o = this.orbit;
        if (this.idle > 2) o.az += dt * 0.03;
        this.cur.p.set(o.l.x + Math.sin(o.az) * Math.cos(o.el) * o.r, o.l.y + Math.sin(o.el) * o.r, o.l.z + Math.cos(o.az) * Math.cos(o.el) * o.r);
        this.cur.l.copy(o.l);
        this._apply(); return;
      }
    }
    if (this.auto && !this.forced && this.held > this.shotLen) this.next();
    const s = SHOTS[this.shot].fn(this.t);
    if (this.blend < 1 && this.prev) {
      this.blend = Math.min(1, this.blend + dt / 2.2);
      const k = this.blend * this.blend * (3 - 2 * this.blend);
      this.cur.p.lerpVectors(this.prev.p, s.p, k); this.cur.l.lerpVectors(this.prev.l, s.l, k);
    } else { this.cur.p.copy(s.p); this.cur.l.copy(s.l); }
    this._apply();
  }
  _apply() { this.cam.position.copy(this.cur.p); this.cam.lookAt(this.cur.l); }
}
