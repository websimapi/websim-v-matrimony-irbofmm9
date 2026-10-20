import * as THREE from "three";
import { BOUNDS } from "./venue.js";

// First-person body locomotion. Desktop: WASD/arrows + drag (or pointer lock) look.
// Mobile: left virtual stick + drag look. VR: left stick move, right stick snap-turn.
export class BodyControls {
  constructor(rig, camera, dom, device) {
    this.rig = rig; this.cam = camera; this.dom = dom; this.device = device;
    this.yaw = 0; this.pitch = 0; this.keys = {}; this.stick = { x: 0, y: 0 };
    this.enabled = false; this.locked = false; this.snapCool = 0;
    addEventListener("keydown", (e) => { if (e.target.closest?.("input,textarea")) return; this.keys[e.code] = true; });
    addEventListener("keyup", (e) => (this.keys[e.code] = false));
    addEventListener("blur", () => (this.keys = {}));
    let drag = null;
    dom.addEventListener("pointerdown", (e) => {
      if (!this.enabled) return;
      if (e.pointerType === "touch" && e.clientX < innerWidth * 0.4 && e.clientY > innerHeight * 0.45) return; // stick zone
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    addEventListener("pointermove", (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === dom) { this.look(e.movementX, e.movementY, 0.0022); return; }
      if (!drag || drag.id !== e.pointerId) return;
      this.look(e.clientX - drag.x, e.clientY - drag.y, e.pointerType === "touch" ? 0.006 : 0.004);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    addEventListener("pointerup", (e) => { if (drag?.id === e.pointerId) drag = null; });
    dom.addEventListener("dblclick", () => { if (this.enabled && device === "desktop") dom.requestPointerLock?.(); });
    if (device === "mobile") this._stick();
  }
  look(dx, dy, s) { this.yaw -= dx * s; this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - dy * s)); }
  _stick() {
    const base = document.createElement("div"); base.className = "stick"; base.innerHTML = "<i></i>";
    document.body.appendChild(base); this.stickEl = base;
    const knob = base.firstChild; let id = null, cx = 0, cy = 0;
    base.addEventListener("pointerdown", (e) => { id = e.pointerId; const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; base.setPointerCapture(id); move(e); });
    const move = (e) => {
      if (e.pointerId !== id) return;
      let x = e.clientX - cx, y = e.clientY - cy; const l = Math.hypot(x, y), m = 44;
      if (l > m) { x = (x / l) * m; y = (y / l) * m; }
      knob.style.transform = "translate(" + x + "px," + y + "px)"; this.stick.x = x / m; this.stick.y = y / m;
    };
    base.addEventListener("pointermove", move);
    const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ""; this.stick.x = this.stick.y = 0; };
    base.addEventListener("pointerup", end); base.addEventListener("pointercancel", end);
  }
  showStick(v) { if (this.stickEl) this.stickEl.style.display = v ? "" : "none"; }
  update(dt, xr) {
    if (!this.enabled) return;
    let mx = 0, mz = 0;
    const k = this.keys;
    if (k.KeyW || k.ArrowUp) mz -= 1; if (k.KeyS || k.ArrowDown) mz += 1;
    if (k.KeyA || k.ArrowLeft) mx -= 1; if (k.KeyD || k.ArrowRight) mx += 1;
    if (k.KeyQ) this.yaw += dt * 1.8; if (k.KeyE) this.yaw -= dt * 1.8;
    mx += this.stick.x; mz += this.stick.y;
    let yaw = this.yaw;
    if (xr?.isPresenting) {
      for (const src of xr.getSession()?.inputSources || []) {
        const ax = src.gamepad?.axes; if (!ax) continue;
        const sx = ax[2] ?? ax[0], sy = ax[3] ?? ax[1];
        if (src.handedness === "left") { mx += Math.abs(sx) > 0.15 ? sx : 0; mz += Math.abs(sy) > 0.15 ? sy : 0; }
        if (src.handedness === "right") {
          this.snapCool -= dt;
          if (Math.abs(sx) > 0.6 && this.snapCool <= 0) { this.yaw -= Math.sign(sx) * Math.PI / 6; this.snapCool = 0.3; }
        }
      }
      // move relative to head direction
      const d = new THREE.Vector3(); this.cam.getWorldDirection(d); yaw = Math.atan2(-d.x, -d.z);
      this.rig.rotation.y = this.yaw;
    }
    if (this.locked) { mx = 0; mz = 0; }
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      const sp = (k.ShiftLeft || k.ShiftRight ? 4 : 2.1) * dt * Math.min(1, len) / len;
      const s = Math.sin(yaw), c = Math.cos(yaw);
      this.rig.position.x += (mx * c + mz * s) * sp;
      this.rig.position.z += (-mx * s + mz * c) * sp;
      const r = Math.hypot(this.rig.position.x, this.rig.position.z);
      if (r > BOUNDS) this.rig.position.multiplyScalar(BOUNDS / r);
    }
    // stand on the dais
    const dz = this.rig.position.z + 10.5, dx = this.rig.position.x;
    this.rig.position.y = Math.hypot(dx, dz) < 4.6 ? 0.45 : (Math.abs(dx) < 4.5 && this.rig.position.z > 19.5 && this.rig.position.z < 26.5 ? 0.12 : 0);
    if (!xr?.isPresenting) {
      this.cam.position.set(0, 1.62, 0);
      this.cam.rotation.set(this.pitch, 0, 0, "YXZ");
      this.rig.rotation.y = this.yaw;
    }
  }
  // world pose for the network: [x,y,z,yaw,pitch, (vr) head, left, right]
  pose(xr, controllers) {
    const p = this.rig.position;
    const out = [p.x, p.y, p.z, this.rig.rotation.y, this.pitch];
    if (xr?.isPresenting) {
      const h = new THREE.Vector3(); this.cam.getWorldPosition(h);
      const d = new THREE.Vector3(); this.cam.getWorldDirection(d);
      out[3] = Math.atan2(-d.x, -d.z); out[4] = 0;
      out.push(h.x, h.y - 0.1, h.z);
      for (const c of controllers) { const w = new THREE.Vector3(); c.getWorldPosition(w); out.push(w.x, w.y, w.z); }
    }
    return out;
  }
}
