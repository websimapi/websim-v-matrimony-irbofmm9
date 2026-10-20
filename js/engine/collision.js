import * as THREE from "three";

// 2D (XZ) collision world: circles + oriented boxes, plus walkable floor
// patches with heights (dais, terrace, marquee deck, dance floor, stage).
// resolve() slides a moving circle out of everything it overlaps.
export class Colliders {
  constructor() { this.shapes = []; this.floors = []; this.cell = 4; this.grid = new Map(); }
  _key(i, j) { return i * 4096 + j; }
  _insert(s) {
    const c = this.cell, r = s.br;
    for (let i = Math.floor((s.x - r) / c); i <= Math.floor((s.x + r) / c); i++)
      for (let j = Math.floor((s.z - r) / c); j <= Math.floor((s.z + r) / c); j++) {
        const k = this._key(i, j); let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(s);
      }
    this.shapes.push(s); return s;
  }
  circle(x, z, r, tag = null) { return this._insert({ t: 0, x, z, r, br: r, tag }); }
  // centre, half width (local x), half depth (local z), yaw
  box(x, z, hw, hd, yaw = 0, tag = null) { return this._insert({ t: 1, x, z, hw, hd, c: Math.cos(yaw), s: Math.sin(yaw), br: Math.hypot(hw, hd), tag }); }
  // a model's local bounding box transformed by an instance matrix (yaw + uniform scale)
  modelBox(box, m, { shrink = 0.85, tag = null, circle = false } = {}) {
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    m.decompose(p, q, sc);
    const e = new THREE.Euler().setFromQuaternion(q, "YXZ"), s = sc.x;
    const cx = (box.min.x + box.max.x) / 2 * s, cz = (box.min.z + box.max.z) / 2 * s;
    const c = Math.cos(e.y), si = Math.sin(e.y);
    const wx = p.x + cx * c + cz * si, wz = p.z - cx * si + cz * c;
    const hw = (box.max.x - box.min.x) / 2 * s * shrink, hd = (box.max.z - box.min.z) / 2 * s * shrink;
    return circle ? this.circle(wx, wz, Math.max(hw, hd), tag) : this.box(wx, wz, hw, hd, e.y, tag);
  }
  floorCircle(x, z, r, h) { this.floors.push({ t: 0, x, z, r, h }); }
  floorBox(x, z, hw, hd, h, yaw = 0) { this.floors.push({ t: 1, x, z, hw, hd, h, c: Math.cos(yaw), s: Math.sin(yaw) }); }
  heightAt(x, z) {
    let h = 0;
    for (const f of this.floors) {
      if (f.t === 0) { if ((x - f.x) ** 2 + (z - f.z) ** 2 < f.r * f.r) h = Math.max(h, f.h); }
      else { const dx = x - f.x, dz = z - f.z, lx = dx * f.c - dz * f.s, lz = dx * f.s + dz * f.c; if (Math.abs(lx) < f.hw && Math.abs(lz) < f.hd) h = Math.max(h, f.h); }
    }
    return h;
  }
  near(x, z) { const c = this.cell; return this.grid.get(this._key(Math.floor(x / c), Math.floor(z / c))) || []; }
  // push a circle at pos (Vector3, uses x/z) out of every shape; ignore(tag) skips shapes
  resolve(pos, r = 0.28, ignore = null, extra = null) {
    let hit = false;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      const list = this.near(pos.x, pos.z);
      for (let i = 0; i < list.length; i++) { const s = list[i]; if (ignore && s.tag && ignore(s.tag)) continue; if (this._push(pos, r, s)) moved = hit = true; }
      if (extra) for (const s of extra) if (this._push(pos, r, s)) moved = hit = true;
      if (!moved) break;
    }
    return hit;
  }
  free(x, z, r = 0.3, ignore = null) {
    for (const s of this.near(x, z)) { if (ignore && s.tag && ignore(s.tag)) continue; if (this._overlap(x, z, r, s)) return false; }
    return true;
  }
  _overlap(x, z, r, s) {
    if (s.t === 0) return (x - s.x) ** 2 + (z - s.z) ** 2 < (r + s.r) ** 2;
    const dx = x - s.x, dz = z - s.z, lx = dx * s.c - dz * s.s, lz = dx * s.s + dz * s.c;
    const qx = Math.max(-s.hw, Math.min(s.hw, lx)), qz = Math.max(-s.hd, Math.min(s.hd, lz));
    return (lx - qx) ** 2 + (lz - qz) ** 2 < r * r;
  }
  _push(pos, r, s) {
    if (s.t === 0) {
      const dx = pos.x - s.x, dz = pos.z - s.z, d2 = dx * dx + dz * dz, R = r + s.r;
      if (d2 >= R * R) return false;
      const d = Math.sqrt(d2) || 1e-4, k = (R - d) / d;
      pos.x += (d2 ? dx : 1e-4) * k; pos.z += dz * k; return true;
    }
    // box: work in local space (lx = dx*c - dz*s, lz = dx*s + dz*c)
    const dx = pos.x - s.x, dz = pos.z - s.z;
    const lx = dx * s.c - dz * s.s, lz = dx * s.s + dz * s.c;
    const qx = Math.max(-s.hw, Math.min(s.hw, lx)), qz = Math.max(-s.hd, Math.min(s.hd, lz));
    let ox = lx - qx, oz = lz - qz; const d2 = ox * ox + oz * oz;
    if (d2 >= r * r) return false;
    let nx, nz, pen;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = ox / d; nz = oz / d; pen = r - d; }
    else { // centre inside the box: exit through the nearest face
      const px = s.hw - Math.abs(lx), pz = s.hd - Math.abs(lz);
      if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; pen = px + r; } else { nx = 0; nz = Math.sign(lz) || 1; pen = pz + r; }
    }
    // back to world: inverse rotation
    const wx = nx * s.c + nz * s.s, wz = -nx * s.s + nz * s.c;
    pos.x += wx * pen; pos.z += wz * pen; return true;
  }
}
