// Strand hair simulation, ported from the owner's Hair Salon project (js/hair3d.js, @api/hair-salon):
// Verlet + follow-the-leader inextensibility, helical curl rest shape, collision with a signed distance
// field of the wearer's own head and shoulders. Units are the salon's "head frame" centimetres (y up,
// +z = face side, cranium centre CC with radii CRAD); hair.js maps every character's skull onto it.
// Parameterised by a style (lengths per region, curl, part, flow, volume, frizz, ties) and seeded, so
// every client grows exactly the same hair from the same spec.
export const SEG = 0.9;
export const MAXP = 48;
export const MAXL = (MAXP - 1) * SEG;
export const CC = [0, 9.5, 0.5];
export const CRAD = [8.75, 10.5, 10.75];

const THR = [[-1, -0.75], [-0.5, -0.5], [-0.2, -0.05], [0, 0.12], [0.5, 0.35], [1, 0.55]];
// hairline: minimum height (unit-sphere y) for a root at front/back coordinate c (−1 back … +1 front)
function hairThr(c, line) {
  for (let i = 1; i < THR.length; i++) if (c <= THR[i][0]) { const [c0, t0] = THR[i - 1], [c1, t1] = THR[i]; return t0 + ((c - c0) / (c1 - c0)) * (t1 - t0) + line * Math.max(0, c) * 0.25; }
  return THR[THR.length - 1][1] + line * 0.25;
}
const DT = 1 / 60;
const TW = Math.cos(0.4), TWS = Math.sin(0.4);
const ROOTK = Array.from({ length: 9 }, (_, i) => (i ? 0.7 * Math.exp(-(i - 1) * 0.38) : 0));
const G = 520 * DT * DT;
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Hair {
  constructor(ng, field) {
    this.NG = ng; this.field = field; // field: { sdf(x,y,z), sdfG(X,Y,Z,j) → SG, SG }
    const N = ng * MAXP, F = () => new Float32Array(N), f = () => new Float32Array(ng);
    this.X = F(); this.Y = F(); this.Z = F(); this.PX = F(); this.PY = F(); this.PZ = F();
    this.CURL = F(); this.STIFF = F(); this.HOLD = F(); this.D = F();
    this.len = f(); this.lastRest = f(); this.n = new Int32Array(ng);
    this.rx = f(); this.ry = f(); this.rz = f(); this.nx = f(); this.ny = f(); this.nz = f();
    this.dx = f(); this.dy = f(); this.dz = f(); this.mx = f(); this.my = f(); this.mz = f();
    this.depth = f(); this.side = f(); this.var = f(); this.hug = f(); this.tie = new Int32Array(ng).fill(-1);
    this.hat = null; this.tick = 0;
  }

  // style: { len, front, top, sides, back (cm), curl, part (cm), flow: "down"|"back"|"up"|"fringe", volume, frizz, hairline, tie: null|"pony"|"bun", seed }
  init(st) {
    const R = rng(st.seed || 1), gauss = () => { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const { X, Y, Z, PX, PY, PZ } = this, { sdf, grad } = this.field;
    const tieP = st.tie ? (st.tie === "bun" ? [0, 17.5, -7.5] : [0, 13, -10]) : null;
    this.tieP = tieP; this.fringe = st.flow === "fringe";
    for (let s = 0; s < this.NG; s++) {
      let px, py, pz, n, ux, uy, uz;
      for (let tries = 0; ; tries++) {
        ux = gauss(); uy = gauss(); uz = gauss();
        const l = Math.hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l;
        const c = uz / Math.max(1e-3, Math.hypot(ux, uz));
        if (uy < hairThr(c, st.hairline || 0) && tries < 400) continue;
        const sx = CC[0] + ux * CRAD[0] * 1.6, sy = CC[1] + uy * CRAD[1] * 1.6, sz = CC[2] + uz * CRAD[2] * 1.6;
        let rx = CC[0] - sx, ry = CC[1] - sy, rz = CC[2] - sz; const rl = Math.hypot(rx, ry, rz); rx /= rl; ry /= rl; rz /= rl;
        let t = 0, hit = false;
        for (let k = 0; k < 100 && t < rl; k++) { const d = sdf(sx + rx * t, sy + ry * t, sz + rz * t); if (d < 0.02) { hit = true; break; } t += Math.max(d * 0.9, 0.03); }
        if (!hit && tries < 400) continue;
        px = sx + rx * t; py = sy + ry * t; pz = sz + rz * t; n = grad(px, py, pz).slice(); break;
      }
      px += n[0] * 0.05; py += n[1] * 0.05; pz += n[2] * 0.05;
      // region lengths: blend front / top / sides / back by where the root sits
      const front = Math.max(0, Math.min(1, (pz - 2) / 6)), back = Math.max(0, Math.min(1, (-pz - 1) / 6)), sides = Math.max(0, Math.min(1, (Math.abs(px) - 4) / 4)) * (1 - front);
      const top = Math.max(0, 1 - front - back - sides);
      let L = (st.front * front + st.back * back + st.sides * sides + st.top * top) / Math.max(1e-3, front + back + sides + top);
      L = Math.max(0.3, Math.min(MAXL, L * (0.9 + R() * 0.14)));
      // flow: away from the part, then down and back (salon); other flows bend it back / up / over the face
      // with a part, hair falls away from it; without one it flows continuously over the crown (no seam)
      const side = st.part == null ? Math.max(-1, Math.min(1, px / 5)) : px - st.part >= 0 ? 1 : -1; this.side[s] = side;
      let fx = side * (1 - 0.25 * front), fy = -0.45 + 1.1 * front, fz = -0.55 - 0.45 * front;
      if (st.flow === "back") { fx *= 0.25; fy = -0.2; fz = -1; }
      if (st.flow === "up") { fx *= 0.3; fy = 0.6; fz = -0.6; }
      if (st.flow === "fringe" && front > 0.2) { fx *= 0.35; fy = -0.8; fz = 0.5; }
      const fd = fx * n[0] + fy * n[1] + fz * n[2]; fx -= n[0] * fd; fy -= n[1] * fd; fz -= n[2] * fd;
      const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
      const lift = (L < 10 ? 0.15 : 0.3) + 0.6 * (st.volume || 0); // short hair lies closer to the head
      let dx = n[0] * lift + fx * 0.85 + gauss() * 0.15 * (st.frizz || 0), dy = n[1] * lift + fy * 0.85 + gauss() * 0.15 * (st.frizz || 0), dz = n[2] * lift + fz * 0.85 + gauss() * 0.15 * (st.frizz || 0);
      const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      let ax = gauss(), ay = gauss(), az = gauss();
      let mx = dy * az - dz * ay, my = dz * ax - dx * az, mz = dx * ay - dy * ax; const ml = Math.hypot(mx, my, mz) || 1;
      this.mx[s] = mx / ml; this.my[s] = my / ml; this.mz[s] = mz / ml;
      this.rx[s] = px; this.ry[s] = py; this.rz[s] = pz; this.nx[s] = n[0]; this.ny[s] = n[1]; this.nz[s] = n[2];
      this.dx[s] = dx; this.dy[s] = dy; this.dz[s] = dz;
      this.depth[s] = R(); this.var[s] = 0.86 + R() * 0.26;
      // short hair lies over the head in a thin layer (thicker with volume) instead of sagging or sticking out
      this.hug[s] = Math.max(0, Math.min(1, (16 - L) / 8)) * (1 - 0.6 * (st.volume || 0)); this.vol = st.volume || 0;
      const curl = (st.curl || 0) * (0.8 + R() * 0.4);
      let nSeg = Math.max(1, Math.ceil(L / SEG - 1e-4));
      this.n[s] = nSeg + 1; this.len[s] = L; this.lastRest[s] = L - (nSeg - 1) * SEG;
      // ties: the point at the scalp distance to the tie is held there
      this.tie[s] = -1;
      if (tieP) { // every strand reaches the tie; a bun's tail stays short so it can coil tight
        const dt = Math.hypot(tieP[0] - px, tieP[1] - py, tieP[2] - pz) * 1.15;
        L = Math.min(MAXL, Math.max(L, dt + 4)); if (st.tie === "bun") L = Math.min(L, dt + 11);
        const ns = Math.max(1, Math.ceil(L / SEG - 1e-4)); this.n[s] = ns + 1; this.len[s] = L; this.lastRest[s] = L - (ns - 1) * SEG;
        this.tie[s] = Math.min(ns, Math.round(dt / SEG));
      }
      const b = s * MAXP;
      let qx = px, qy = py, qz = pz, vx = dx, vy = dy, vz = dz;
      for (let i = 0; i < MAXP; i++) {
        const j = b + i;
        if (i > 0) {
          if (i > 2) { vx *= 0.8; vy = vy * 0.8 - 0.2; vz = vz * 0.8 - 0.12; const l = Math.hypot(vx, vy, vz); vx /= l; vy /= l; vz /= l; }
          qx += vx * SEG; qy += vy * SEG; qz += vz * SEG;
          const d = sdf(qx, qy, qz), m = 0.3 + this.depth[s];
          if (d < m) { const gr = grad(qx, qy, qz); qx += gr[0] * (m - d); qy += gr[1] * (m - d); qz += gr[2] * (m - d); }
        }
        X[j] = PX[j] = qx; Y[j] = PY[j] = qy; Z[j] = PZ[j] = qz;
        const afterTie = this.tie[s] >= 0 && i > this.tie[s];
        this.CURL[j] = afterTie && st.tie === "bun" ? 0.95 : curl;
        this.STIFF[j] = afterTie && st.tie === "bun" ? 0.9 : 0; this.HOLD[j] = afterTie && st.tie === "bun" ? 0.75 : 0; // a bun is pinned and sprayed
        this.D[j] = 3;
      }
    }
  }

  step() {
    this.tick++;
    for (let s = 0; s < this.NG; s++) this.stepStrand(s);
  }

  stepStrand(s) {
    const { X, Y, Z, PX, PY, PZ, STIFF, HOLD } = this;
    const n = this.n[s], b = s * MAXP;
    X[b] = PX[b] = this.rx[s]; Y[b] = PY[b] = this.ry[s]; Z[b] = PZ[b] = this.rz[s];
    for (let i = 1; i < n; i++) {
      const j = b + i, h = HOLD[j], damp = 0.982 * (1 - 0.93 * h);
      let vx = (X[j] - PX[j]) * damp, vy = (Y[j] - PY[j]) * damp, vz = (Z[j] - PZ[j]) * damp;
      const v2 = vx * vx + vy * vy + vz * vz; if (v2 > 2.25) { const k = 1.5 / Math.sqrt(v2); vx *= k; vy *= k; vz *= k; }
      PX[j] = X[j]; PY[j] = Y[j]; PZ[j] = Z[j];
      X[j] += vx; Z[j] += vz; Y[j] += vy - G * (1 - h) * (1 - 0.85 * STIFF[j]);
    }
    const lr = this.lastRest[s];
    this.bend(s, n, b, lr);
    const mL = 0.18 + this.depth[s] * 1.1, side = this.side[s], tie = this.tie[s], tp = this.tieP;
    for (let i = 1; i < n; i++) {
      const j = b + i;
      const ex = X[j] - X[j - 1], ey = Y[j] - Y[j - 1], ez = Z[j] - Z[j - 1];
      const L = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1e-6, k = (i - 1 < n - 2 ? SEG : lr) / L;
      const nx = X[j - 1] + ex * k, ny = Y[j - 1] + ey * k, nz = Z[j - 1] + ez * k;
      if (i > 1) { PX[j - 1] += 0.9 * (nx - X[j]); PY[j - 1] += 0.9 * (ny - Y[j]); PZ[j - 1] += 0.9 * (nz - Z[j]); }
      X[j] = nx; Y[j] = ny; Z[j] = nz;
      if (i > 6 && nz > 2 && ny > -7 && ny < 17) { const ax = nx < 0 ? -nx : nx; if (ax < 8.5) X[j] += (ax > 1.5 ? (nx > 0 ? 1 : -1) : side) * 0.12 * (1 - ax / 8.5); } // part around the face
      // the face stays clear: below the brow, in front of the cheeks, hair is moved out to the sides
      // (a fringe style may cover the forehead, down to the brows)
      if (i > 4 && Z[j] > 3.5 && Y[j] < (this.fringe ? 11.5 : 13.5) && Y[j] > -4) { const ax = Math.abs(X[j]), lim = 6.6 + Math.max(0, 9 - Z[j]) * 0.25; if (ax < lim) { const sg = X[j] > 0.3 ? 1 : X[j] < -0.3 ? -1 : side >= 0 ? 1 : -1; X[j] += (sg * lim - X[j]) * 0.35; } }
      if (tie >= 0 && i <= tie && tp) { // gather toward the tie along the scalp, hold at the tie
        const w = i === tie ? 0.6 : 0.05 * (i / tie);
        X[j] += (tp[0] + (this.depth[s] - 0.5) * 1.2 - X[j]) * w; Y[j] += (tp[1] + (this.var[s] - 1) * 4 - Y[j]) * w; Z[j] += (tp[2] - Z[j]) * w;
      }
      const m = 0.1 + i * 0.2; this.collide(j, m < mL ? m : mL);
    }
  }

  bend(s, n, b, lr) {
    const { X, Y, Z, CURL, STIFF, HOLD } = this;
    let ux = this.dx[s], uy = this.dy[s], uz = this.dz[s], mx = this.mx[s], my = this.my[s], mz = this.mz[s];
    for (let i = 1; i < n; i++) {
      const j = b + i;
      if (i >= 2) { ux = X[j - 1] - X[j - 2]; uy = Y[j - 1] - Y[j - 2]; uz = Z[j - 1] - Z[j - 2]; const l = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1; ux /= l; uy /= l; uz /= l; }
      const c = CURL[j] * 0.55;
      let tx = ux, ty = uy, tz = uz;
      if (c > 0.004) {
        const dm = mx * ux + my * uy + mz * uz; mx -= ux * dm; my -= uy * dm; mz -= uz * dm;
        let ml = Math.sqrt(mx * mx + my * my + mz * mz); if (ml < 1e-4) { mx = uy; my = -ux; mz = 0; ml = Math.sqrt(mx * mx + my * my) || 1; }
        mx /= ml; my /= ml; mz /= ml;
        const cx = uy * mz - uz * my, cy = uz * mx - ux * mz, cz = ux * my - uy * mx;
        mx = mx * TW + cx * TWS; my = my * TW + cy * TWS; mz = mz * TW + cz * TWS;
        const c2 = c * c, cc = 1 - c2 * 0.5 + (c2 * c2) / 24, sc = c - (c2 * c) / 6;
        tx = ux * cc + mx * sc; ty = uy * cc + my * sc; tz = uz * cc + mz * sc;
      }
      let k = 0.025 + (i < 9 ? ROOTK[i] : 0) + c * 1.1 + STIFF[j] * 0.7 + HOLD[j] * 0.3; if (k > 0.95) k = 0.95;
      const r = i - 1 < n - 2 ? SEG : lr;
      X[j] += (X[j - 1] + tx * r - X[j]) * k; Y[j] += (Y[j - 1] + ty * r - Y[j]) * k; Z[j] += (Z[j - 1] + tz * r - Z[j]) * k;
    }
  }

  collide(j, m) {
    const X = this.X, Y = this.Y, Z = this.Z, SG = this.field.SG;
    const dj = this.D[j];
    if ((j + this.tick) & 1) { const dx = X[j] - this.PX[j], dy = Y[j] - this.PY[j], dz = Z[j] - this.PZ[j]; const cl = dj - Math.sqrt(dx * dx + dy * dy + dz * dz); if (cl > m + 3 && !this.hat) { this.D[j] = cl; return; } }
    this.field.sdfG(X, Y, Z, j);
    const d = SG[0]; this.D[j] = d;
    if (d < m) {
      const p = (m - d) * 0.6; X[j] += SG[1] * p; Y[j] += SG[2] * p; Z[j] += SG[3] * p;
      const vx = X[j] - this.PX[j], vy = Y[j] - this.PY[j], vz = Z[j] - this.PZ[j], f = vx * vx + vy * vy + vz * vz < 0.01 ? 1 : 0.7;
      this.PX[j] += vx * f; this.PY[j] += vy * f; this.PZ[j] += vz * f;
    }
    // a worn hat: above its band the hair is pressed inside the crown
    const s = (j / MAXP) | 0, hg = this.hug[s];
    if (hg > 0 && d < 6) { const i = j - s * MAXP, target = 0.25 + 0.12 * i * (0.4 + this.vol) + this.depth[s] * 0.6; if (d > target) { const p = (d - target) * 0.25 * hg; X[j] -= SG[1] * p; Y[j] -= SG[2] * p; Z[j] -= SG[3] * p; } }
    const H = this.hat;
    if (H && Y[j] > H.band) {
      const ex = (X[j] - CC[0]) / H.rx, ey = (Y[j] - H.band) / H.ry, ez = (Z[j] - CC[2]) / H.rz, r = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (r > 1) { const k = 1 / r; X[j] = CC[0] + ex * k * H.rx; Y[j] = H.band + ey * k * H.ry; Z[j] = CC[2] + ez * k * H.rz; this.PX[j] = X[j]; this.PY[j] = Y[j]; this.PZ[j] = Z[j]; }
    }
  }
}
