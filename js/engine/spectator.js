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
  terrace:{ label: "Terrace", fn: (t) => { const a = t * 0.07; return { p: V(-12 + Math.sin(a) * 7, 2.6, 13 + Math.cos(a) * 7), l: V(-12, 1, 13) }; } },
  tent:   { label: "Reception", fn: (t) => ({ p: V(Math.sin(t * 0.05) * 5, 3.6, 22.5), l: V(0, 1.2, 37) }) },
  dance:  { label: "Dance floor", fn: (t) => { const a = t * 0.15; return { p: V(Math.sin(a) * 5.5, 2.4, 33 + Math.cos(a) * 4.5), l: V(0, 1.1, 33) }; } },
  cake:   { label: "Cake", fn: (t) => ({ p: V(-5.2 + Math.sin(t * 0.1) * 0.5, 1.6, 39.4), l: V(-6.5, 1.15, 41.2) }) },
};
export const SHOT_ORDER = ["wide", "aisle", "crane", "altar", "guests", "aerial", "terrace", "tent", "dance", "cake"];
// which shots belong to which part of the day (auto-director stays in the active zone)
export const ZONE_SHOTS = { ceremony: ["wide", "aisle", "crane", "altar", "guests"], cocktail: ["terrace", "aerial", "wide"], reception: ["tent", "dance", "cake", "aerial"], dance: ["dance", "tent"], cake: ["cake", "tent", "dance"] };

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
  next(dir = 1) { const O = (this.zone && ZONE_SHOTS[this.zone]) || SHOT_ORDER; const i = O.indexOf(this.shot); this.cut(O[(i + dir + O.length) % O.length]); }
  setZone(z) { this.zone = z; if (!this.forced && ZONE_SHOTS[z]) this.cut(ZONE_SHOTS[z][0]); }
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
