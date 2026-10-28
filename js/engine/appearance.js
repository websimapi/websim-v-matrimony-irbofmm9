import * as THREE from "three";
import { loadGLB, tex } from "./assets.js";
import { METALS } from "./avatar-spec.js";

// Applies a character-creator spec to a loaded Human:
//  - body/face/eye shaping through bone scales and offsets (Rocketbox bones run along local +X),
//  - a per-character texture painter: skin tone, iris colour, makeup, clothing recolour by body
//    region and tattoos. Regions come from the mesh's own skin weights, so it works on any outfit,
//  - hair, facial hair and accessories fitted to measured head/neck/hand/body frames.
// Reference head frame for authored attachments (see TASKS.md "attachment spec").
export const REF_HEAD = new THREE.Vector3(0.165, 0.245, 0.21);
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, -1), RIGHT = new THREE.Vector3(1, 0, 0);
const AX = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const comps = ["x", "y", "z"];

// ---------- measuring ----------
function boneQuatChar(h, bone) { const q = new THREE.Quaternion(), r = new THREE.Quaternion(); bone.getWorldQuaternion(q); h.model.getWorldQuaternion(r); return q.premultiply(r.invert()); }
// which local axis of `bone` points along character-space direction `dir` (at bind)
function localAxis(h, bone, dir) {
  const q = boneQuatChar(h, bone); let best = 0, bd = -1;
  AX.forEach((a, i) => { const d = Math.abs(a.clone().applyQuaternion(q).dot(dir)); if (d > bd) { bd = d; best = i; } });
  return comps[best];
}
export function measure(h) {
  if (h.frames) return h.frames;
  const o = h.obj; o.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(h.model.matrixWorld).invert();
  const skinned = []; o.traverse((m) => { if (m.isSkinnedMesh) skinned.push(m); });
  const bones = skinned[0]?.skeleton.bones || [];
  const idx = (b) => bones.indexOf(b);
  // vertices dominated by a given bone, in character space (bind pose)
  const vertsOf = (bone, minW = 0.5, skinOnly = false) => {
    const out = [], bi = idx(bone); if (bi < 0) return out;
    for (const m of skinned) {
      if (skinOnly && /opacity/i.test(m.material?.name || "")) continue; // hair/lashes are not the head's shape
      const g = m.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bi && sw.getComponent(i, k) >= minW) { out.push(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv).clone()); break; }
    }
    return out;
  };
  const box = (pts) => new THREE.Box3().setFromPoints(pts);
  const headPts = vertsOf(h.b.head, 0.5, true), hb = box(headPts);
  const charPos = (bone) => bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const spine = vertsOf(h.b.spine, 0.4), sb = box(spine);
  const chestZ = sb.min.z, navelY = charPos(h.b.spine).y + 0.02;
  h.frames = {
    skinned, bones,
    head: { bone: h.b.head, center: hb.getCenter(new THREE.Vector3()), size: hb.getSize(new THREE.Vector3()) },
    neck: { bone: h.b.neck, center: charPos(h.b.neck) },
    lHand: { bone: h.b.lHand, center: h.b.lHand ? charPos(h.b.lHand) : null }, rHand: { bone: h.b.rHand, center: h.b.rHand ? charPos(h.b.rHand) : null },
    navel: { bone: h.b.spine, center: new THREE.Vector3(0, navelY, chestZ + 0.01) },
    chest: { bone: h.b.spine2, center: new THREE.Vector3(0, charPos(h.b.spine2).y + 0.06, box(vertsOf(h.b.spine2, 0.4)).min.z) },
    eyes: [h.b.lEye, h.b.rEye].filter(Boolean).map((b) => ({ bone: b, pos: b.position.clone(), quat: b.quaternion.clone(), scale: b.scale.clone() })),
    vertsOf,
  };
  return h.frames;
}

// ---------- shaping ----------
const BASE = new WeakMap();
function baseOf(bone) { if (!BASE.has(bone)) BASE.set(bone, { s: bone.scale.clone(), p: bone.position.clone() }); return BASE.get(bone); }
export function shape(h, spec) {
  const B = h.b, f = measure(h), b = spec.body, fc = spec.face, e = spec.eyes;
  const scale = (bone, x = 1, y = 1, z = 1) => { if (!bone) return; const s = baseOf(bone).s; bone.scale.set(s.x * x, s.y * y, s.z * z); };
  const all = Object.values(B).filter((x) => x?.isBone); all.forEach((bone) => { const o = baseOf(bone); bone.scale.copy(o.s); bone.position.copy(o.p); });
  for (const eye of f.eyes) { eye.bone.position.copy(eye.pos); eye.bone.quaternion.copy(eye.quat); eye.bone.scale.copy(eye.scale); }
  h.model.scale.setScalar(1);
  // feet height at rest (before shaping), so length changes can be put back on the floor
  const footY = () => { h.root.updateMatrixWorld(true); const ft = B.lFoot || B.rFoot; return ft ? ft.getWorldPosition(new THREE.Vector3()).y - h.root.position.y : 0; };
  const f0 = footY();
  // limbs: X runs along the bone, Y/Z are thickness
  const thick = (bone, k) => scale(bone, bone.scale.x / baseOf(bone).s.x, 1 + k, 1 + k);
  const len = (bone, k) => { if (!bone) return; bone.scale.x *= 1 + k; };
  thick(B.spine0, 0.1 * b.weight + 0.12 * b.waist); thick(B.spine, 0.08 * b.weight + 0.06 * b.waist);
  thick(B.spine2, 0.08 * b.weight + 0.08 * b.chest + 0.04 * b.muscle);
  for (const s of ["l", "r"]) {
    thick(B[s + "Up"], 0.12 * b.weight + 0.14 * b.muscle); thick(B[s + "Fore"], 0.08 * b.weight + 0.1 * b.muscle);
    thick(B[s + "Thigh"], 0.14 * b.weight + 0.08 * b.muscle + 0.08 * b.hips); thick(B[s + "Calf"], 0.08 * b.weight + 0.06 * b.muscle);
    len(B[s + "Clav"], 0.16 * b.shoulders + 0.05 * b.muscle);
    len(B[s + "Thigh"], 0.1 * b.legs); len(B[s + "Up"], 0.08 * b.arms);
    // hips: spread the leg roots
    if (B[s + "Thigh"]) { const p = baseOf(B[s + "Thigh"]).p; B[s + "Thigh"].position.copy(p).multiplyScalar(1 + 0.14 * b.hips); }
  }
  len(B.neck, 0.35 * b.neck);
  // keep hands, feet and head their own size: undo the scale they inherit from the limb above
  const undo = (child) => { if (!child) return; child.updateWorldMatrix(true, false); const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); child.parent.matrixWorld.decompose(p, q, s); h.model.getWorldScale(p); const sx = s.x / p.x, sy = s.y / p.y, sz = s.z / p.z; child.scale.set(child.scale.x / sx, child.scale.y / sy, child.scale.z / sz); };
  for (const s of ["l", "r"]) { undo(B[s + "Hand"]); undo(B[s + "Foot"]); }
  undo(B.head);
  // head size and face proportions, in the head bone's own axes
  if (B.head) {
    const hs = 1 + 0.1 * b.headSize, ax = { up: localAxis(h, B.head, UP), fw: localAxis(h, B.head, FWD), rt: localAxis(h, B.head, RIGHT) };
    B.head.scale[ax.rt] *= hs * (1 + 0.08 * fc.width); B.head.scale[ax.up] *= hs * (1 + 0.08 * fc.length); B.head.scale[ax.fw] *= hs * (1 + 0.08 * fc.depth);
  }
  // eyes: size, spacing, height, depth, rotation
  for (const [i, eye] of f.eyes.entries()) {
    const bone = eye.bone, side = i === 0 ? 1 : -1, par = boneQuatChar(h, bone.parent).invert();
    bone.position.copy(eye.pos).add(new THREE.Vector3(side * 0.004 * e.spacing, 0.004 * e.height, -0.003 * e.depth).applyQuaternion(par));
    bone.scale.copy(eye.scale).multiplyScalar(1 + 0.12 * e.size);
    bone.quaternion.copy(eye.quat).premultiply(new THREE.Quaternion().setFromAxisAngle(FWD.clone().applyQuaternion(par), side * 0.2 * e.tilt));
  }
  h.model.scale.setScalar(1 + 0.08 * b.height);
  // keep feet on the floor after length changes (animation adds h.groundFix to the model height)
  h.groundFix = (f0 - footY()) / Math.max(h.root.scale.y, 1e-3);
}

// ---------- texture painting ----------
const imgReady = (t) => new Promise((r) => { const i = t.image; if (i && (i.complete || i.width)) return r(i); const k = setInterval(() => { if (t.image && (t.image.complete || t.image.width)) { clearInterval(k); r(t.image); } }, 50); });
const hexRGB = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
// paint triangles of vertices dominated by `pick(boneName)` into a mask (UV space)
function regionMask(mesh, size, pick) {
  const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d");
  const geo = mesh.geometry, uv = geo.attributes.uv, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, ix = geo.index, bones = mesh.skeleton.bones;
  const dom = (i) => { let best = 0, w = -1; for (let k = 0; k < 4; k++) { const ww = sw.getComponent(i, k); if (ww > w) { w = ww; best = si.getComponent(i, k); } } return bones[best]?.name || ""; };
  const tag = new Array(uv.count); for (let i = 0; i < uv.count; i++) tag[i] = pick(dom(i));
  g.fillStyle = "#fff";
  for (let t = 0; t < ix.count; t += 3) {
    const a = ix.getX(t), b = ix.getX(t + 1), d = ix.getX(t + 2);
    if (!(tag[a] || tag[b] || tag[d])) continue;
    g.beginPath(); g.moveTo(uv.getX(a) * size, uv.getY(a) * size); g.lineTo(uv.getX(b) * size, uv.getY(b) * size); g.lineTo(uv.getX(d) * size, uv.getY(d) * size); g.closePath(); g.fill();
  }
  // grow 2px so seams are covered
  g.filter = "blur(1.5px)"; g.drawImage(c, 0, 0); g.filter = "none";
  return g.getImageData(0, 0, size, size).data;
}
// UV rectangle covering the vertices dominated by bones matching `test` (for tattoos)
function regionRect(mesh, test) {
  const geo = mesh.geometry, uv = geo.attributes.uv, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, bones = mesh.skeleton.bones, us = [], vs = [];
  for (let i = 0; i < uv.count; i++) { let best = 0, w = -1; for (let k = 0; k < 4; k++) { const ww = sw.getComponent(i, k); if (ww > w) { w = ww; best = si.getComponent(i, k); } } if (test(bones[best]?.name || "")) { us.push(uv.getX(i)); vs.push(uv.getY(i)); } }
  if (!us.length) return null;
  us.sort((a, b) => a - b); vs.sort((a, b) => a - b);
  const q = (l, p) => l[Math.floor((l.length - 1) * p)];
  return { u0: q(us, 0.12), u1: q(us, 0.88), v0: q(vs, 0.12), v1: q(vs, 0.88) };
}
const REGION_BONES = { lForearm: /L Forearm/, rForearm: /R Forearm/, lUpperArm: /L UpperArm/, rUpperArm: /R UpperArm/, chest: /Spine2/, back: /Spine1?$/, neck: /Neck/, lCalf: /L Calf/, rCalf: /R Calf/, lHand: /L Hand/, rHand: /R Hand/ };
const artCache = new Map();
const loadArt = (src) => { if (!artCache.has(src)) artCache.set(src, new Promise((r) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => r(i); i.onerror = () => r(null); i.src = src; })); return artCache.get(src); };

export async function paint(h, spec) {
  const f = measure(h), token = (h.paintToken = (h.paintToken || 0) + 1);
  const needs = spec.skin.tone || spec.eyeColor || spec.outfit.top || spec.outfit.bottom || spec.outfit.shoes || spec.tattoos.length || spec.makeup.lipAmount || spec.makeup.blush || spec.makeup.shadowAmount || spec.makeup.liner || spec.facial.style === "stubble";
  for (const m of f.skinned) {
    const mat = m.material, kind = mat === h.headMat ? "head" : mat.map?.image?.src?.includes("/body") || /body/.test(mat.name) ? "body" : null;
    if (!kind) continue;
    if (!needs) { if (m.userData.baseMap) { mat.map = m.userData.baseMap; mat.needsUpdate = true; } continue; }
    if (kind === "body" && !m.userData.ownMat) { m.material = mat.clone(); m.userData.ownMat = true; }
    const mm = m.material, base = m.userData.baseMap ||= mm.map;
    const img = await imgReady(base); if (h.paintToken !== token) return;
    const S = Math.min(img.width, 1024), c = document.createElement("canvas"); c.width = c.height = S;
    const g = c.getContext("2d", { willReadFrequently: true }); g.save(); g.translate(0, base.flipY ? 0 : 0); g.drawImage(img, 0, 0, S, S); g.restore();
    const data = g.getImageData(0, 0, S, S), px = data.data;
    // reference skin colour: average of hand (body) or cheek (head) texels
    const skinMask = kind === "body" ? regionMask(m, S, (n) => /Hand|Finger/.test(n)) : regionMask(m, S, (n) => /Head/.test(n));
    let sr = 0, sg = 0, sb = 0, sn = 0;
    for (let i = 0; i < px.length; i += 16) if (skinMask[i] > 200) { const r = px[i], gg = px[i + 1], b = px[i + 2]; if (r > gg && gg > b && r - b > 20) { sr += r; sg += gg; sb += b; sn++; } }
    const ref = sn ? [sr / sn, sg / sn, sb / sn] : [200, 150, 120], refL = lum(...ref);
    const isSkin = (r, gg, b) => { const d = Math.hypot((r - ref[0]) / (ref[0] + 1), (gg - ref[1]) / (ref[1] + 1), (b - ref[2]) / (ref[2] + 1)); return d < 0.35 && r >= gg && gg >= b * 0.85; };
    const recolor = (i, col, keep = 0) => { const L = lum(px[i], px[i + 1], px[i + 2]) / 255, k = Math.min(1.6, 0.25 + L * 1.5); px[i] = px[i] * keep + col[0] * k * (1 - keep); px[i + 1] = px[i + 1] * keep + col[1] * k * (1 - keep); px[i + 2] = px[i + 2] * keep + col[2] * k * (1 - keep); };
    // clothing by region (non-skin texels only)
    if (kind === "body") {
      const regions = [["top", /Spine|Clavicle|UpperArm|Forearm|Neck/], ["bottom", /Pelvis|Thigh|Calf/], ["shoes", /Foot|Toe/]];
      for (const [key, re] of regions) {
        const col = spec.outfit[key]; if (!col) continue;
        const mask = regionMask(m, S, (n) => re.test(n)), rgb = hexRGB(col);
        for (let i = 0; i < px.length; i += 4) if (mask[i] > 128 && !isSkin(px[i], px[i + 1], px[i + 2])) recolor(i, rgb, 0.12);
      }
    }
    // skin tone: shift skin texels toward the chosen tone, keeping their shading
    if (spec.skin.tone) {
      const t = hexRGB(spec.skin.tone), a = spec.skin.amount;
      for (let i = 0; i < px.length; i += 4) if (isSkin(px[i], px[i + 1], px[i + 2])) { const k = lum(px[i], px[i + 1], px[i + 2]) / refL; for (let j = 0; j < 3; j++) px[i + j] = px[i + j] * (1 - a) + Math.min(255, t[j] * k) * a; }
    }
    g.putImageData(data, 0, 0);
    if (kind === "head") paintFace(h, m, g, S, spec, f);
    if (kind === "body") for (const t of spec.tattoos) {
      const rect = regionRect(m, (n) => REGION_BONES[t.region]?.test(n)); if (!rect) continue;
      const art = await loadArt(t.art.startsWith("data:") ? t.art : "assets/creator/tattoos/" + t.art + ".png"); if (!art || h.paintToken !== token) continue;
      const cx = (rect.u0 + (rect.u1 - rect.u0) * t.x) * S, cy = (rect.v0 + (rect.v1 - rect.v0) * t.y) * S, w = Math.min(rect.u1 - rect.u0, rect.v1 - rect.v0) * S * t.scale;
      g.save(); g.globalAlpha = t.opacity; g.globalCompositeOperation = "multiply"; g.translate(cx, cy); g.rotate((t.rot * Math.PI) / 180); g.drawImage(art, -w / 2, -w / 2, w, w); g.restore();
    }
    if (h.paintToken !== token) return;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = base.flipY; tex.anisotropy = 8;
    m.userData.painted?.dispose(); m.userData.painted = tex; mm.map = tex; mm.needsUpdate = true;
  }
}
// eyes, makeup and stubble on the head texture, placed from the eyeball positions
function paintFace(h, mesh, g, S, spec, f) {
  const geo = mesh.geometry, uv = geo.attributes.uv, pos = geo.attributes.position, inv = new THREE.Matrix4().copy(h.model.matrixWorld).invert();
  const eyes = f.eyes.map((e) => e.bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv));
  if (eyes.length < 2) return;
  const mid = eyes[0].clone().add(eyes[1]).multiplyScalar(0.5), span = eyes[0].distanceTo(eyes[1]);
  // nearest head-surface vertex (front-most) to a character-space point -> its UV
  const uvAt = (p, r = span * 0.25) => { let best = -1, bd = 1e9; const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 1) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv); const d = v.distanceTo(p); if (d < bd) { bd = d; best = i; } }
    return best >= 0 && bd < r * 4 ? [uv.getX(best) * S, uv.getY(best) * S] : null; };
  const front = (p) => p.clone().add(new THREE.Vector3(0, 0, -span * 0.35));
  const soft = (xy, rx, ry, color, alpha, op = "multiply") => { if (!xy) return; g.save(); g.globalCompositeOperation = op; g.translate(xy[0], xy[1]); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, color); gr.addColorStop(1, "rgba(255,255,255,0)"); g.globalAlpha = alpha; g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, 6.283); g.fill(); g.restore(); };
  const pxSpan = (() => { const a = uvAt(eyes[0]), b = uvAt(eyes[1]); return a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : S * 0.08; })();
  // iris colour: tint the darker, saturated texels around each eyeball's UV centre
  if (spec.eyeColor) {
    const rgb = hexRGB(spec.eyeColor);
    for (const e of eyes) { const c = uvAt(e); if (!c) continue; const R = Math.round(pxSpan * 0.18), d = g.getImageData(c[0] - R, c[1] - R, R * 2, R * 2), p = d.data;
      for (let i = 0; i < p.length; i += 4) { const L = lum(p[i], p[i + 1], p[i + 2]); if (L < 170) { const k = 0.35 + L / 180; p[i] = rgb[0] * k; p[i + 1] = rgb[1] * k; p[i + 2] = rgb[2] * k; } }
      g.putImageData(d, c[0] - R, c[1] - R); }
  }
  const mk = spec.makeup, mc = spec.makeupColors;
  const mouth = uvAt(front(mid.clone().add(new THREE.Vector3(0, -span * 1.25, 0)))), cheekL = uvAt(front(eyes[0].clone().add(new THREE.Vector3(span * 0.15, -span * 0.65, 0)))), cheekR = uvAt(front(eyes[1].clone().add(new THREE.Vector3(-span * 0.15, -span * 0.65, 0))));
  if (mk.lipAmount > 0) soft(mouth, pxSpan * 0.32, pxSpan * 0.13, mc.lips, mk.lipAmount * 0.85);
  if (mk.blush > 0) { soft(cheekL, pxSpan * 0.32, pxSpan * 0.22, mc.blush, mk.blush * 0.45); soft(cheekR, pxSpan * 0.32, pxSpan * 0.22, mc.blush, mk.blush * 0.45); }
  for (const e of eyes) {
    const lid = uvAt(front(e.clone().add(new THREE.Vector3(0, span * 0.12, 0))));
    if (mk.shadowAmount > 0) soft(lid, pxSpan * 0.26, pxSpan * 0.12, mc.shadow, mk.shadowAmount * 0.7);
    if (mk.liner > 0) soft(uvAt(front(e.clone().add(new THREE.Vector3(0, span * 0.06, 0)))), pxSpan * 0.2, pxSpan * 0.035, "#141012", mk.liner * 0.8);
  }
  if (spec.facial.style === "stubble") {
    const chin = uvAt(front(mid.clone().add(new THREE.Vector3(0, -span * 1.7, 0)))), jl = uvAt(front(eyes[0].clone().add(new THREE.Vector3(span * 0.2, -span * 1.3, span * 0.3)))), jr = uvAt(front(eyes[1].clone().add(new THREE.Vector3(-span * 0.2, -span * 1.3, span * 0.3))));
    const col = spec.facial.color || "#2b1a12";
    for (const p of [chin, jl, jr, mouth]) soft(p, pxSpan * 0.55, pxSpan * 0.4, col, 0.32);
  }
}

// ---------- hair, facial hair, accessories ----------
// a bone's rest matrix in model space: mesh-local bind (inverse of its inverse-bind matrix)
// carried into model space by the mesh's fixed offset inside the model
let HAIR_META = null;
function bindModel(h, bone) {
  const f = measure(h), mesh = f.skinned[0], i = mesh.skeleton.bones.indexOf(bone);
  h.model.updateMatrixWorld(true);
  const meshToModel = new THREE.Matrix4().copy(h.model.matrixWorld).invert().multiply(mesh.matrixWorld);
  return meshToModel.multiply(mesh.bindMatrix).multiply(new THREE.Matrix4().copy(mesh.skeleton.boneInverses[i]).invert());
}
const HAIR_MAT = new Map();
async function fitted(url, h, frame) {
  const g = await loadGLB(url); if (!g) return null;
  const o = g.scene.clone(true), f = measure(h), fr = f[frame];
  if (!fr?.bone) return null;
  o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.castShadow = true; } });
  // place in character space at the frame, then parent to the bone so it follows the animation
  const holder = new THREE.Group(); holder.add(o);
  if (frame === "head") { const k = f.head.size; o.scale.set(k.x / REF_HEAD.x, k.y / REF_HEAD.y, k.z / REF_HEAD.z); }
  const center = frame === "head" ? f.head.center : fr.center, bone = fr.bone;
  // place relative to the bone's REST pose (skeleton bind matrices), never its animated pose
  const m = bindModel(h, bone).invert().multiply(new THREE.Matrix4().makeTranslation(center.x, center.y, center.z));
  m.decompose(holder.position, holder.quaternion, holder.scale);
  bone.add(holder); return holder;
}
export async function dress(h, spec) {
  const token = (h.dressToken = (h.dressToken || 0) + 1);
  for (const x of h.attached || []) x.removeFromParent();
  h.attached = [];
  // the outfit's own hair (and lashes) live on the "opacity" material
  h.obj.traverse((m) => { if (m.isMesh && /opacity/i.test(m.material?.name || "")) m.visible = spec.hair.style === "original"; });
  const hairCol = spec.hair.color ? new THREE.Color(spec.hair.color) : null;
  if (spec.hair.style === "original") h.obj.traverse((m) => { if (m.isMesh && /opacity/i.test(m.material?.name || "")) {
    if (!m.userData.ownMat) { m.userData.mat0 = m.material; m.material = m.material.clone(); m.userData.ownMat = true; }
    if (hairCol || spec.hair.dye) hairShader(m.material, hairCol, spec.hair.dye ? new THREE.Color(spec.hair.dye) : null, spec.hair.dyeMode, m); else { m.material.dispose(); m.material = m.userData.mat0.clone(); } } });
  const jobs = [];
  // library hairstyles are the outfits' own (professionally made) hair, re-fitted to this head
  // hc-*: original hair-card styles (H8, work/helper/hair-cards.py) keep their own strand atlas
  const cards = spec.hair.style.startsWith("hc-");
  if (spec.hair.style.startsWith("rb-") || cards) {
    HAIR_META ||= await fetch("assets/creator/hair/meta.json").then((r) => r.json()).catch(() => ({}));
    if (cards && !HAIR_META.__cards) { const list = await fetch("assets/creator/hair/cards.json").then((r) => r.json()).catch(() => []); for (const c of list) HAIR_META[c.id] = { eye: c.eye }; HAIR_META.__cards = true; }
    const src = spec.hair.style.slice(3);
    jobs.push(["assets/creator/hair/" + spec.hair.style + ".glb", "head", (o) => {
      if (cards) o.traverse((m) => { if (m.isMesh) { const mat = m.material.clone(); mat.alphaTest = 0.4; mat.transparent = false; mat.side = THREE.DoubleSide; mat.color?.set(0xffffff); m.material = mat; } });
      else { const map = tex("assets/avatars/" + src + "/opacity.png", { flipY: false });
        o.traverse((m) => { if (m.isMesh) { m.material = new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6, color: 0xffffff }); } }); }
      const model = o.children[0]; // o is the bone-space holder; the hairstyle model sits inside it
      model.scale.multiplyScalar(1 + 0.04 * spec.hair.length); // fitted() already scaled it per axis to this head
      tintHair(o, spec);
      // line the style's eye level up with this wearer's eyes (heads differ in brow/skull proportions)
      const ref = HAIR_META?.[spec.hair.style]?.eye, f = measure(h);
      if (ref && f.eyes.length === 2) {
        const eye = f.eyes.map((e) => new THREE.Vector3().setFromMatrixPosition(bindModel(h, e.bone))).reduce((a, b) => a.add(b)).multiplyScalar(0.5);
        const k = f.head.size;
        model.position.set(0, eye.y - f.head.center.y - ref[1] * model.scale.y, eye.z - f.head.center.z - ref[2] * model.scale.z);
      } }]);
  }
  for (const a of spec.acc) {
    const frame = { hat: "head", glasses: "head", earL: "head", earR: "head", nose: "head", necklace: "neck", ringL: "lHand", ringR: "rHand", braceletL: "lHand", braceletR: "rHand", navel: "navel", neckwear: "chest", lapel: "chest" }[a.slot] || "head";
    jobs.push(["assets/creator/acc/" + a.id + ".glb", frame, (o) => o.traverse((m) => { if (!m.isMesh) return; const n = m.material.name || ""; if (/metal/i.test(n)) { m.material.color.set(METALS[a.metal] || METALS.gold); m.material.metalness = 1; m.material.roughness = 0.25; } else if (/gem|accent/i.test(n) && a.color) m.material.color.set(a.color); })]);
  }
  const done = await Promise.all(jobs.map(async ([url, frame, style]) => { const o = await fitted(url, h, frame).catch(() => null); if (o) try { style(o); } catch (e) { console.warn("[creator] styling", url, e); } return o; }));
  if (!["none", "stubble"].includes(spec.facial.style)) done.push(facialHair(h, spec.facial.style, spec.facial.color || spec.hair.color || "#2b1a12"));
  if (h.dressToken !== token) { done.forEach((o) => o?.removeFromParent()); return; }
  h.attached = done.filter(Boolean);
}
// ---------- beards and moustaches grown from the face itself ----------
let STRANDS = null;
function strandTexture() {
  if (STRANDS) return STRANDS;
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  for (let i = 0; i < 2600; i++) { const x = Math.random() * 256, y = Math.random() * 256, l = 6 + Math.random() * 14, a = (Math.random() - 0.5) * 0.5;
    g.strokeStyle = `rgba(255,255,255,${0.55 + Math.random() * 0.45})`; g.lineWidth = 0.7 + Math.random() * 0.9; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * l, y + Math.cos(a) * l); g.stroke(); }
  STRANDS = new THREE.CanvasTexture(c); STRANDS.wrapS = STRANDS.wrapT = THREE.RepeatWrapping; STRANDS.colorSpace = THREE.SRGBColorSpace; return STRANDS;
}
function facialHair(h, style, color) {
  const f = measure(h), head = f.skinned.find((m) => m.material === h.headMat) || f.skinned[0];
  const bones = head.skeleton.bones, hi = bones.indexOf(h.b.head), ni = bones.indexOf(h.b.neck);
  const g = head.geometry, pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, ix = g.index;
  // landmarks in model space from the eye bones' rest positions
  const eyes = f.eyes.map((e) => new THREE.Vector3().setFromMatrixPosition(bindModel(h, e.bone)));
  if (eyes.length < 2) return null;
  const mid = eyes[0].clone().add(eyes[1]).multiplyScalar(0.5), span = eyes[0].distanceTo(eyes[1]);
  const toModel = new THREE.Matrix4().copy(h.model.matrixWorld).invert().multiply(head.matrixWorld).multiply(head.bindMatrix);
  const toBone = new THREE.Matrix4().copy(head.skeleton.boneInverses[hi]); // mesh-local -> head bone
  const P = [], N = [], inside = [];
  const zone = (p) => { // 0..1 membership, soft at the edges (model space: +y up, -z forward)
    const dy = (p.y - mid.y) / span, dx = Math.abs(p.x - mid.x) / span, front = (mid.z - p.z) / span;
    if (front < -1.1) return 0;
    const ramp = (v, a, b, e = 0.18) => Math.max(0, Math.min(1, (v - a) / e, (b - v) / e));
    const mustache = ramp(dy, -1.42, -1.02) * ramp(dx, -9, 0.72) * ramp(front, 0.15, 9);
    const mouth = ramp(dy, -1.55, -1.38, 0.05) * ramp(dx, -9, 0.42, 0.05) * ramp(front, 0.4, 9, 0.05); // keep the lips clear
    if (style === "mustache") return mustache;
    const goatee = ramp(dy, -2.25, -1.4) * ramp(dx, -9, 0.5) * ramp(front, 0.2, 9);
    if (style === "goatee") return Math.max(mustache, goatee) * (1 - mouth);
    const low = style === "full" ? -2.75 : -2.35;
    const jaw = ramp(dy, low, -0.85) * ramp(dx, -9, 1.55) * ramp(front, -1.0, 9) * (dy > -1.0 ? ramp(dx, 1.0, 9) : 1); // sideburns at the top
    return Math.max(mustache, jaw) * (1 - mouth);
  };
  const v = new THREE.Vector3(), n = new THREE.Vector3(), m3 = new THREE.Matrix3().getNormalMatrix(toModel);
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(toModel); P.push(v.clone()); inside.push(zone(v)); }
  const layers = style === "full" ? [0.0025, 0.005, 0.0085, 0.012] : style === "short" ? [0.002, 0.0042, 0.0065] : [0.0018, 0.0038];
  const out = [], uvs = [], col = [], idx = [];
  const tris = [];
  // the face has its own jaw/lip/cheek bones under the head: accept the whole head subtree and the neck
  const faceBones = new Set([ni]); h.b.head.traverse((b) => { const k = bones.indexOf(b); if (k >= 0) faceBones.add(k); });
  for (let t = 0; t < ix.count; t += 3) { const a = ix.getX(t), b = ix.getX(t + 1), c = ix.getX(t + 2);
    const w = (k) => { let tot = 0; for (let j = 0; j < 4; j++) if (faceBones.has(si.getComponent(k, j))) tot += sw.getComponent(k, j); return tot > 0.5; };
    if (Math.max(inside[a], inside[b], inside[c]) > 0.05 && w(a) && w(b) && w(c)) tris.push([a, b, c]); }
  if (!tris.length) return null;
  const inv = new THREE.Matrix4().copy(toModel).invert(), toBoneFromModel = toBone.clone().multiply(inv);
  layers.forEach((off, L) => {
    const map = new Map();
    for (const tri of tris) idx.push(...tri.map((k) => { if (map.has(k)) return map.get(k);
      n.fromBufferAttribute(nor, k).applyMatrix3(m3).normalize();
      const p = P[k].clone().addScaledVector(n, off * (0.55 + 0.45 * inside[k]) * (1 + 0.12 * L)).applyMatrix4(toBoneFromModel);
      out.push(p.x, p.y, p.z); uvs.push(P[k].x * 9 + L * 0.37, P[k].y * 9); col.push(1, 1, 1, inside[k] * (1 - L * 0.14)); map.set(k, out.length / 3 - 1); return out.length / 3 - 1; }));
  });
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(out, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 4)); geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: strandTexture(), color: new THREE.Color(color).multiplyScalar(1.15), vertexColors: true, transparent: true, alphaTest: 0.32, depthWrite: true, side: THREE.DoubleSide, roughness: 0.75 });
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; h.b.head.add(mesh); return mesh;
}
function tintHair(o, spec) {
  const base = spec.hair.color ? new THREE.Color(spec.hair.color) : null, dye = spec.hair.dye ? new THREE.Color(spec.hair.dye) : null, mode = spec.hair.dyeMode;
  o.traverse((m) => {
    if (!m.isMesh) return;
    if (!base && !dye) return; // keep the style's natural colour
    hairShader(m.material, base, dye, mode, o);
  });
}
// hair recolour from the texture's luminance: any target colour (platinum to black) keeps the
// strands' light and shade; dye blends by height (tips/roots) or in streaks
function hairShader(mat, base, dye, mode, root) {
  const box = new THREE.Box3().setFromObject(root), inv = new THREE.Matrix4().copy(root.matrixWorld).invert(); box.applyMatrix4(inv);
  mat.color.set(0xffffff);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.hairCol = { value: (base || new THREE.Color(0x3a2416)).clone() }; sh.uniforms.useBase = { value: base ? 1 : 0 };
    sh.uniforms.dyeCol = { value: (dye || new THREE.Color(0)).clone() }; sh.uniforms.dyeOn = { value: dye ? 1 : 0 };
    sh.uniforms.dyeY = { value: new THREE.Vector2(box.min.y, box.max.y) }; sh.uniforms.dyeMode = { value: { tips: 0, roots: 1, streaks: 2 }[mode] || 0 };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vHairPos;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvHairPos = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vHairPos; uniform vec3 hairCol; uniform vec3 dyeCol; uniform vec2 dyeY; uniform int dyeMode; uniform int useBase; uniform int dyeOn;")
      .replace("#include <map_fragment>", `#include <map_fragment>
  float hl = dot(diffuseColor.rgb, vec3(.299, .587, .114));
  vec3 shade = vec3(.18 + 1.35 * hl);
  if (useBase == 1) diffuseColor.rgb = hairCol * shade;
  if (dyeOn == 1) {
    float hy = clamp((vHairPos.y - dyeY.x) / max(dyeY.y - dyeY.x, 1e-4), 0., 1.);
    float k = dyeMode == 0 ? smoothstep(.55, .05, hy) : dyeMode == 1 ? smoothstep(.6, .95, hy) : step(.55, fract(vHairPos.x * 38. + vHairPos.z * 21.));
    diffuseColor.rgb = mix(diffuseColor.rgb, dyeCol * shade, k * .9);
  }`);
  };
  mat.customProgramCacheKey = () => "hair-recolour";
  mat.needsUpdate = true;
}
function unusedDyeLegacy(o, dye, mode) {
  o.traverse((m) => {
    if (!m.isMesh) return;
    if (!dye) return;
    // dye: blend toward the dye colour by height (tips/roots) or in streaks, in the shader
    const box = new THREE.Box3().setFromBufferAttribute(m.geometry.attributes.position);
    m.material.onBeforeCompile = (sh) => {
      sh.uniforms.dyeCol = { value: dye.clone().multiplyScalar(1.5) }; sh.uniforms.dyeY = { value: new THREE.Vector2(box.min.y, box.max.y) }; sh.uniforms.dyeMode = { value: { tips: 0, roots: 1, streaks: 2 }[mode] };
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vHairPos;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvHairPos = position;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vHairPos; uniform vec3 dyeCol; uniform vec2 dyeY; uniform int dyeMode;")
        .replace("#include <map_fragment>", `#include <map_fragment>
  float hy = clamp((vHairPos.y - dyeY.x) / max(dyeY.y - dyeY.x, 1e-4), 0., 1.);
  float k = dyeMode == 0 ? smoothstep(.55, .05, hy) : dyeMode == 1 ? smoothstep(.6, .95, hy) : step(.55, fract(vHairPos.x * 38. + vHairPos.z * 21.));
  diffuseColor.rgb = mix(diffuseColor.rgb, dyeCol * (diffuseColor.rgb / max(max(diffuseColor.r, diffuseColor.g), max(diffuseColor.b, 1e-3))) * .9 + dyeCol * .1, k * .85);`);
    };
    m.material.customProgramCacheKey = () => "hair-dye-" + mode;
    m.material.needsUpdate = true;
  });
}

export async function applyAppearance(h, spec) {
  if (!h.loaded) await h.ready;
  if (!h.obj) return;
  shape(h, spec);
  await Promise.all([paint(h, spec), dress(h, spec)]);
}
