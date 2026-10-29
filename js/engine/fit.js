import * as THREE from "three";

// Accessory fitting from landmarks measured on the character's own surface (bind pose, face morphs
// included): earlobes, nostril, nose bridge, temples, skull + hair band, neck ring, chest/belly surface,
// ring finger and wrist. Accessories were authored in the shared frames of TASKS.md "attachment spec";
// each slot maps its authored anchor onto the matching landmark, so items sit on every outfit and follow
// face-shape changes (ear size, face width, nose…).
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// brimmed hats: authored band height (their crown presses the hair down, hair.js)
export const BRIM = { fedora: 0.078, tophat: 0.073, sunhat: 0.012 };

// character-space points of the head and body skin/clothing, with morphs applied
function surface(h, f) {
  h.model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(h.model.matrixWorld).invert();
  const head = [], body = [], eyes = [[], []], byBone = new Map();
  const eyeIx = [h.b.lEye, h.b.rEye].map((b) => f.bones.indexOf(b));
  for (const m of f.skinned) {
    const part = m.userData.part; if ((part !== "head" && part !== "body") || !m.visible) continue;
    const g = m.geometry, P = g.attributes.position.array, si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array;
    const mp = g.morphAttributes.position || [], infl = m.morphTargetInfluences || [], act = [];
    infl.forEach((w, k) => { if (w && mp[k]) act.push([w, mp[k].array]); });
    const M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), v = V();
    for (let i = 0, n = P.length / 3; i < n; i++) {
      v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      for (const [w, d] of act) { v.x += w * d[i * 3]; v.y += w * d[i * 3 + 1]; v.z += w * d[i * 3 + 2]; }
      let bi = si[i * 4], bw = sw[i * 4]; for (let k = 1; k < 4; k++) if (sw[i * 4 + k] > bw) { bw = sw[i * 4 + k]; bi = si[i * 4 + k]; }
      const p = v.clone().applyMatrix4(M), e = eyeIx.indexOf(bi);
      if (e >= 0) { eyes[e].push(p); continue; }
      (part === "head" ? head : body).push(p);
      if (!byBone.has(bi)) byBone.set(bi, []); byBone.get(bi).push(p);
    }
  }
  return { head, body, eyes, byBone };
}

const centroid = (pts) => pts.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / Math.max(1, pts.length));
const best = (pts, ok, score) => { let b = null, s = -Infinity; for (const p of pts) if (ok(p)) { const v = score(p); if (v > s) { s = v; b = p; } } return b; };
const ring = (pts) => { // extents of a horizontal slice
  const bx = new THREE.Box3().setFromPoints(pts); const c = bx.getCenter(V()), s = bx.getSize(V());
  return { c, rx: s.x / 2, rz: s.z / 2, front: bx.min.z };
};

export function landmarks(h, f, bindPos) {
  const S = surface(h, f), L = {};
  const eL = centroid(S.eyes[0]), eR = centroid(S.eyes[1]); // character's left eye is at +X
  const mid = eL.clone().add(eR).multiplyScalar(0.5), u = eL.distanceTo(eR) || 0.064;
  Object.assign(L, { eL, eR, mid, u });
  const H = S.head;
  L.bridge = best(H, (p) => Math.abs(p.x - mid.x) < 0.15 * u && p.y > mid.y - 0.3 * u && p.y < mid.y + 0.15 * u, (p) => -p.z) || mid.clone().add(V(0, 0, -0.5 * u));
  L.tip = best(H, (p) => Math.abs(p.x - mid.x) < 0.25 * u && p.y < mid.y - 0.3 * u && p.y > mid.y - 1.4 * u, (p) => -p.z);
  L.alar = best(H, (p) => p.distanceTo(L.tip) < 0.6 * u && p.y < L.tip.y + 0.15 * u && p.y > L.tip.y - 0.35 * u && p.z < L.tip.z + 0.5 * u, (p) => p.x);
  for (const [k, s] of [["L", 1], ["R", -1]]) {
    const ear = best(H, (p) => p.y > mid.y - 1.2 * u && p.y < mid.y + 0.2 * u && p.z > mid.z + 0.6 * u, (p) => s * p.x);
    L["ear" + k] = ear;
    // the lobe: lowest point of the ear flap (the part that stands out beyond the skull)
    L["lobe" + k] = ear && best(H, (p) => s * p.x > s * ear.x - 0.2 * u && Math.abs(p.z - ear.z) < 0.4 * u && p.y < ear.y + 0.2 * u, (p) => -p.y);
  }
  L.top = best(H, () => true, (p) => p.y);
  L.brow = mid.y + 0.42 * u;
  const band = H.filter((p) => p.y > L.brow + 0.3 * u && p.y < L.brow + 0.9 * u);
  L.skull = band.length ? ring(band) : null;
  L.templeHalf = (() => { const t = H.filter((p) => Math.abs(p.y - mid.y) < 0.25 * u && p.z > mid.z + 0.2 * u && p.z < mid.z + 1.8 * u); return t.length ? Math.max(...t.map((p) => Math.abs(p.x - mid.x))) : 1.25 * u; })();
  // body
  const all = H.concat(S.body);
  const neckY = bindPos(h.b.neck).y - 0.015;
  const nb = bindPos(h.b.neck), slice = all.filter((p) => Math.abs(p.y - neckY) < 0.012 && Math.abs(p.x - nb.x) < 0.075 && Math.abs(p.z - nb.z) < 0.085); // not the shoulders
  L.neck = slice.length ? ring(slice) : null; L.neckY = neckY;
  L.front = (x, y, r = 0.015) => { const q = S.body.filter((p) => Math.abs(p.x - x) < r && Math.abs(p.y - y) < r); return q.length ? Math.min(...q.map((p) => p.z)) : null; };
  L.chestY = bindPos(h.b.spine2).y + 0.06; L.navelY = bindPos(h.b.spine).y + 0.02;
  L.shoulderHalf = (() => { const q = S.body.filter((p) => Math.abs(p.y - L.chestY) < 0.02); return q.length ? Math.max(...q.map((p) => Math.abs(p.x))) : 0.18; })();
  L.byBone = S.byBone;
  return L;
}

// hair volume at the hat band (outfit hair or an attached style), character space
function hairBand(h, L) {
  const inv = new THREE.Matrix4().copy(h.model.matrixWorld).invert(), pts = [], v = V();
  const take = (m) => { const P = m.geometry.attributes.position; const M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld); for (let i = 0; i < P.count; i += 3) { v.fromBufferAttribute(P, i).applyMatrix4(M); pts.push(v.clone()); } };
  h.obj.traverse((m) => { if (m.isMesh && m.visible && /opacity/i.test(m.material?.name || "")) take(m); });
  for (const o of h.attached || []) o?.traverse((m) => { if ((m.isMesh || m.isLineSegments) && m.userData.hair && m.name !== "hair-hd") take(m); });
  const q = pts.filter((p) => p.y > L.brow + 0.2 * L.u && p.y < L.brow + 1.0 * L.u && p.z > L.mid.z - 0.2 * L.u);
  return { band: q.length > 20 ? ring(q) : null, top: pts.length ? Math.max(...pts.map((p) => p.y)) : -Infinity };
}

// GLB-local → character-space matrix for an accessory in `slot`; returns { bone, M }
export function fitMatrix(h, slot, id, L) {
  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z), Sc = (x, y, z) => new THREE.Matrix4().makeScale(x, y, z);
  const chain = (...ms) => ms.reduce((a, m) => a.multiply(m), new THREE.Matrix4());
  const u = L.u, out = (bone, M) => ({ bone, M });
  if (slot === "earL" || slot === "earR") {
    // authored piercing point (±0.085, −0.010, +0.010) → just in front of / below the measured lobe
    const s = slot === "earL" ? 1 : -1, lobe = L["lobe" + (s > 0 ? "L" : "R")]; if (!lobe) return null;
    return out(h.b.head, chain(T(lobe.x + s * 0.002, lobe.y + 0.004, lobe.z - 0.002), T(-s * 0.085, 0.01, -0.01)));
  }
  if (slot === "nose") {
    if (!L.alar) return null; // authored on the left nostril at (0.018, −0.025, −0.109)
    return out(h.b.head, chain(T(L.alar.x + 0.001, L.alar.y + 0.002, L.alar.z), T(-0.018, 0.025, 0.109)));
  }
  if (slot === "glasses") {
    // authored: lenses ±0.084 wide, centred at y 0.02, front at z −0.113, arms reach z +0.03
    const half = L.templeHalf + 0.006, sx = half / 0.084;
    const front = L.bridge.z - 0.009, earZ = ((L.earL?.z ?? front + 0.11) + (L.earR?.z ?? front + 0.11)) / 2, sz = Math.max(0.6, (earZ - front) / 0.143);
    return out(h.b.head, chain(T(L.mid.x, L.mid.y, front), Sc(sx, sx, sz), T(0, -0.02, 0.113)));
  }
  if (slot === "hat") {
    // authored for the reference head (W 0.165 × D 0.21, origin = head centre, crown at y 0.1225): fit the band
    // to the skull or the hair, whichever is bigger, and sit the crown on top of it
    const hb = hairBand(h, L), sk = L.skull; if (!sk) return null;
    // hats press hair down: allow at most 1.5 cm of hair per side beyond the skull
    const rx = Math.min(Math.max(sk.rx, hb.band?.rx || 0), sk.rx + 0.015) + 0.004, rz = Math.min(Math.max(sk.rz, hb.band?.rz || 0), sk.rz + 0.015) + 0.004;
    const sx = rx / 0.0825, sz = rz / 0.105, sy = (sx + sz) / 2;
    const c = (hb.band && hb.band.rx > sk.rx ? hb.band.c : sk.c);
    // brimmed hats rest on their band just above the brows (authored band height per hat); crowns and
    // the veil sit on top of the head or hair
    const BAND = BRIM;
    if (BAND[id] !== undefined) return out(h.b.head, chain(T(c.x, L.brow + 0.08 * u - BAND[id] * sy, c.z), Sc(sx, sy, sz)));
    const top = Math.max(L.top.y, Math.min(hb.top, L.top.y + 0.03));
    return out(h.b.head, chain(T(c.x, top - 0.1225 * sy + (/tiara|flowercrown|fascinator/.test(id) ? -0.012 : 0), c.z), Sc(sx, sy, sz)));
  }
  if (slot === "necklace") {
    // authored ring radius 0.062–0.067 at y 0 around the neck joint; sits on the collar slice
    const n = L.neck; if (!n) return null;
    const sx = (n.rx + 0.006) / 0.064, sz = (n.rz + 0.006) / 0.064;
    return out(h.b.spine2, chain(T(n.c.x, L.neckY - 0.01, n.c.z), Sc(sx, (sx + sz) / 2, sz)));
  }
  if (slot === "neckwear" || slot === "lapel" || slot === "navel") {
    // authored at the frame origin (bow tie, belly jewel) or with the rose at x +0.09, y +0.05 (lapel)
    const lap = slot === "lapel", x = lap ? Math.min(0.09, L.shoulderHalf * 0.5) : 0;
    const y = slot === "neckwear" ? L.neckY - 0.035 : slot === "navel" ? L.navelY : L.chestY + 0.05;
    const z = L.front(x, y) ?? L.front(x, y, 0.035); if (z == null) return null;
    const bone = slot === "navel" ? h.b.spine : h.b.spine2;
    return out(bone, chain(T(x, y, z - (slot === "navel" ? 0.001 : 0.004)), lap ? T(-0.09, -0.05, 0) : new THREE.Matrix4()));
  }
  if (slot === "ringL" || slot === "ringR") {
    // authored round the ring finger base at (±0.085, 0, −0.012) with the finger along ±X
    const s = slot === "ringL" ? 1 : -1, k = s > 0 ? "l" : "r", b0 = h.b[k + "f30"], b1 = h.b[k + "f31"]; if (!b0 || !b1) return null;
    const p0 = L.bind(b0), p1 = L.bind(b1), c = p0.clone().lerp(p1, 0.4), axis = p1.clone().sub(p0).normalize();
    const vs = L.byBone.get(L.boneIndex(b0)) || [];
    const r = vs.length ? vs.reduce((a, p) => { const d = p.clone().sub(p0); return a + d.sub(axis.clone().multiplyScalar(d.dot(axis))).length(); }, 0) / vs.length : 0.008;
    const q = new THREE.Quaternion().setFromUnitVectors(V(s, 0, 0), axis), k2 = (r + 0.0012) / 0.0095;
    return out(b0, chain(T(c.x, c.y, c.z), new THREE.Matrix4().makeRotationFromQuaternion(q), Sc(k2, k2, k2), T(-s * 0.085, 0, 0.012)));
  }
  if (slot === "braceletL" || slot === "braceletR") {
    // authored at the origin, axis X, radii 0.030 (y) × 0.024 (z)
    const k = slot === "braceletL" ? "l" : "r", hand = h.b[k + "Hand"], fore = h.b[k + "Fore"]; if (!hand || !fore) return null;
    const ph = L.bind(hand), pf = L.bind(fore), axis = ph.clone().sub(pf).normalize(), c = ph.clone().addScaledVector(axis, -0.025);
    const near = [...(L.byBone.get(L.boneIndex(fore)) || []), ...(L.byBone.get(L.boneIndex(hand)) || [])].filter((p) => Math.abs(p.clone().sub(c).dot(axis)) < 0.012);
    let ry = 0.03, rz = 0.024; if (near.length > 6) { ry = Math.max(...near.map((p) => Math.abs(p.y - c.y))); rz = Math.max(...near.map((p) => Math.abs(p.z - c.z))); }
    const q = new THREE.Quaternion().setFromUnitVectors(V(slot === "braceletL" ? 1 : -1, 0, 0), axis);
    return out(fore, chain(T(c.x, c.y, c.z), new THREE.Matrix4().makeRotationFromQuaternion(q), Sc(1, (ry + 0.004) / 0.03, (rz + 0.004) / 0.024)));
  }
  return null;
}

