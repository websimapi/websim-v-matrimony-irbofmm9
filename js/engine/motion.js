import * as THREE from "three";

// Procedural character animation for the Rocketbox rig. Every pose is a set of
// bone rotations relative to the T-pose in character space (forward -Z,
// right +X): +x on a leg/arm swings it forward, +z on the left arm (-z on the
// right) lowers it, -x on a calf bends the knee. Idle, walk/run, sit and five
// dance styles are blended with smoothed weights so changes never pop.
const BONES = ["spine", "spine2", "neck", "head", "lClav", "rClav", "lUp", "rUp", "lFore", "rFore", "lHand", "rHand", "lThigh", "rThigh", "lCalf", "rCalf", "lFoot", "rFoot"];
const E = new THREE.Euler(), Q = new THREE.Quaternion();
const BPM = 118;
const sm = (x) => x * x * (3 - 2 * x);
// cheap smooth noise for idle variety
const nz = (t, s) => Math.sin(t * 0.71 + s * 13) * 0.5 + Math.sin(t * 1.37 + s * 7) * 0.3 + Math.sin(t * 2.9 + s * 3) * 0.2;

function blank() { const p = {}; for (const k of BONES) p[k] = [0, 0, 0]; p.off = [0, 0, 0]; return p; }
function add(acc, k, w, x = 0, y = 0, z = 0) { const a = acc[k]; a[0] += x * w; a[1] += y * w; a[2] += z * w; }
// symmetric arm helper: down = how far lowered from T, fwd = swing forward, bend = elbow
function arms(acc, w, L, R) {
  add(acc, "lUp", w, L.fwd, -(L.twist || 0), L.down); add(acc, "rUp", w, R.fwd, R.twist || 0, -R.down);
  add(acc, "lFore", w, 0, -L.bend, L.lift || 0); add(acc, "rFore", w, 0, R.bend, -(R.lift || 0));
}

function idle(h, acc, w, t) {
  const s = h.seed, shift = nz(t * 0.35, s); // weight shift
  const br = Math.sin(t * 1.5 + s * 9) * 0.02;
  add(acc, "spine", w, -0.02 + br, nz(t * 0.2, s + 2) * 0.05, shift * 0.02);
  add(acc, "spine2", w, br, 0, 0);
  // glance around now and then
  const look = nz(t * 0.25, s + 5);
  add(acc, "neck", w, 0, look * 0.18, 0);
  add(acc, "head", w, nz(t * 0.3, s + 9) * 0.05, look * 0.2, nz(t * 0.21, s + 3) * 0.04);
  if (h.clasp) arms(acc, w, { down: 1.18, fwd: 0.42, bend: 1.05, twist: 0.35 }, { down: 1.18, fwd: 0.42, bend: 1.05, twist: 0.35 });
  else arms(acc, w, { down: 1.3 + br, fwd: 0.06 + shift * 0.03, bend: 0.28 }, { down: 1.3 + br, fwd: 0.06 - shift * 0.03, bend: 0.3 });
  // relaxed knee on the unweighted leg
  const kl = Math.max(0, shift) * 0.14, kr = Math.max(0, -shift) * 0.14;
  add(acc, "lThigh", w, kl * 0.6, 0, -0.03); add(acc, "rThigh", w, kr * 0.6, 0, 0.03);
  add(acc, "lCalf", w, -kl); add(acc, "rCalf", w, -kr);
  add(acc, "lFoot", w, kl * 0.4); add(acc, "rFoot", w, kr * 0.4);
  acc.off[0] += shift * 0.018 * w; acc.off[1] -= (kl + kr) * 0.02 * w;
}

function walk(h, acc, w, run) {
  const p = h.walk, s = Math.sin(p), c = Math.cos(p);
  const A = 0.42 + run * 0.18;
  const tl = s * A, tr = -s * A;
  // knee flexes in swing (thigh moving forward), small bend at heel strike
  const kl = 0.12 + Math.max(0, c) * (0.7 + run * 0.5), kr = 0.12 + Math.max(0, -c) * (0.7 + run * 0.5);
  add(acc, "lThigh", w, tl, 0, -0.02); add(acc, "rThigh", w, tr, 0, 0.02);
  add(acc, "lCalf", w, -kl); add(acc, "rCalf", w, -kr);
  // keep feet roughly level, toe-off at the end of stance
  add(acc, "lFoot", w, -(tl - kl) * 0.55 + Math.max(0, -s) * Math.max(0, -c) * 0.4);
  add(acc, "rFoot", w, -(tr - kr) * 0.55 + Math.max(0, s) * Math.max(0, c) * 0.4);
  // torso: counter-rotation, slight forward lean, stable head
  add(acc, "spine", w, -0.05 - run * 0.12, -s * 0.1, 0);
  add(acc, "spine2", w, 0, -s * 0.06, 0);
  add(acc, "head", w, 0.04 + run * 0.06, s * 0.12, 0);
  const sw = 0.38 + run * 0.35;
  arms(acc, w, { down: 1.28 - run * 0.1, fwd: -s * sw, bend: 0.3 + Math.max(0, -s) * 0.35 + run * 0.9 },
              { down: 1.28 - run * 0.1, fwd: s * sw, bend: 0.3 + Math.max(0, s) * 0.35 + run * 0.9 });
  acc.off[1] += (Math.cos(p * 2) * 0.022 - 0.012) * (1 + run) * w;
  acc.off[0] += s * 0.012 * w;
}

function sit(h, acc, w, t) {
  const br = Math.sin(t * 1.4 + h.seed * 9) * 0.015;
  add(acc, "lThigh", w, 1.52, 0, -0.07); add(acc, "rThigh", w, 1.52, 0, 0.07);
  add(acc, "lCalf", w, -1.5); add(acc, "rCalf", w, -1.5);
  add(acc, "lFoot", w, 0.05); add(acc, "rFoot", w, 0.05);
  add(acc, "spine", w, 0.04 + br, nz(t * 0.15, h.seed) * 0.04, 0);
  add(acc, "head", w, -0.06, nz(t * 0.2, h.seed + 4) * 0.25, 0);
  // hands resting on the thighs
  arms(acc, w, { down: 1.2, fwd: 0.55, bend: 1.0, twist: 0.25 }, { down: 1.2, fwd: 0.55, bend: 1.0, twist: 0.25 });
  acc.off[1] += -0.44 * h.def.h / 1.7 * w; acc.off[2] += 0.16 * w;
}

// five dance styles, chosen per person and rotated every few bars
function dance(h, acc, w, t) {
  const beat = t * (BPM / 60) * Math.PI * 2; // one cycle per beat
  const bar = Math.floor((t * BPM / 60) / 16 + h.seed * 7);
  const style = (Math.floor(h.seed * 5) + bar) % 5;
  const b = Math.sin(beat), b2 = Math.sin(beat / 2), bb = Math.abs(Math.sin(beat / 2)); // bounce
  const kn = 0.12 + bb * 0.22;
  // base: soft knees on the beat
  add(acc, "lThigh", w, kn * 0.5); add(acc, "rThigh", w, kn * 0.5);
  add(acc, "lCalf", w, -kn); add(acc, "rCalf", w, -kn);
  add(acc, "lFoot", w, kn * 0.45); add(acc, "rFoot", w, kn * 0.45);
  acc.off[1] += (-0.03 - bb * 0.045) * w;
  add(acc, "head", w, b * 0.08, 0, 0);
  if (style === 0) { // side-to-side two-step, arms bent swinging
    acc.off[0] += b2 * 0.09 * w;
    add(acc, "lThigh", w, 0, 0, -Math.max(0, -b2) * 0.18); add(acc, "rThigh", w, 0, 0, Math.max(0, b2) * 0.18);
    add(acc, "spine", w, 0, b2 * 0.12, -b2 * 0.08); add(acc, "spine2", w, 0, b2 * 0.1, 0);
    arms(acc, w, { down: 1.1, fwd: 0.35 + b2 * 0.35, bend: 1.5 }, { down: 1.1, fwd: 0.35 - b2 * 0.35, bend: 1.5 });
  } else if (style === 1) { // groove: shoulder shimmy + alternating pumps
    add(acc, "spine2", w, 0.05, Math.sin(beat * 2) * 0.12, 0); add(acc, "spine", w, -0.08, 0, b2 * 0.06);
    const pl = Math.max(0, b), pr = Math.max(0, -b);
    arms(acc, w, { down: 0.9 - pl * 0.5, fwd: 0.6 + pl * 0.5, bend: 1.7 - pl * 0.5 }, { down: 0.9 - pr * 0.5, fwd: 0.6 + pr * 0.5, bend: 1.7 - pr * 0.5 });
  } else if (style === 2) { // hands in the air, swaying
    add(acc, "spine", w, 0.06, 0, b2 * 0.12); add(acc, "spine2", w, 0, 0, b2 * 0.08);
    add(acc, "head", w, -0.15, 0, -b2 * 0.1);
    arms(acc, w, { down: -1.1 + b2 * 0.25, fwd: 0.25, bend: 0.35 + bb * 0.3, twist: -0.3 }, { down: -1.1 - b2 * 0.25, fwd: 0.25, bend: 0.35 + bb * 0.3, twist: -0.3 });
  } else if (style === 3) { // twist: hips one way, shoulders the other
    add(acc, "spine", w, -0.05, b * 0.3, 0); add(acc, "spine2", w, 0, -b * 0.22, 0);
    add(acc, "lThigh", w, 0.1, b * 0.25, 0); add(acc, "rThigh", w, 0.1, b * 0.25, 0);
    acc.off[1] -= 0.04 * w;
    arms(acc, w, { down: 0.75, fwd: 0.3 - b * 0.3, bend: 1.3 }, { down: 0.75, fwd: 0.3 + b * 0.3, bend: 1.3 });
  } else { // step-touch with a clap on the backbeat
    const side = Math.sin(beat / 2);
    acc.off[0] += side * 0.12 * w;
    add(acc, "lThigh", w, 0, 0, -Math.max(0, -side) * 0.25); add(acc, "rThigh", w, 0, 0, Math.max(0, side) * 0.25);
    add(acc, "spine", w, -0.04, side * 0.1, -side * 0.05);
    const clap = Math.pow(Math.max(0, Math.cos(beat)), 6);
    arms(acc, w, { down: 1.05, fwd: 0.95, bend: 1.2 + clap * 0.25, twist: 0.55 + clap * 0.35 }, { down: 1.05, fwd: 0.95, bend: 1.2 + clap * 0.25, twist: 0.55 + clap * 0.35 });
  }
}

export function animateHuman(h, dt) {
  h.t += dt;
  const sitT = h.flags & 1 ? 1 : 0, danceT = h.flags & 2 && !sitT ? 1 : 0;
  const k = Math.min(1, dt * 5);
  h.wSit = (h.wSit ?? sitT) + (sitT - (h.wSit ?? sitT)) * k;
  h.wDance = (h.wDance ?? danceT) + (danceT - (h.wDance ?? danceT)) * k;
  const moveT = Math.min(1, h.speed / 0.9) * (1 - sitT);
  h.wMove = (h.wMove ?? 0) + (moveT - (h.wMove ?? 0)) * Math.min(1, dt * 7);
  const run = sm(Math.max(0, Math.min(1, (h.speed - 2.4) / 1.4)));
  // stride: phase advances with distance travelled (no foot skating)
  const stride = 1.35 + run * 0.9;
  h.walk += dt * Math.PI * 2 * Math.max(h.speed, 0.4 * h.wMove) / stride;
  const wSit = sm(h.wSit), wDance = sm(h.wDance) * (1 - h.wMove), wWalk = h.wMove * (1 - wSit);
  const wIdle = Math.max(0, 1 - wSit - wDance - wWalk);
  const acc = blank(), t = h.t;
  if (wIdle > 0.001) idle(h, acc, wIdle, t);
  if (wWalk > 0.001) walk(h, acc, wWalk, run);
  if (wSit > 0.001) sit(h, acc, wSit, t);
  if (wDance > 0.001) dance(h, acc, wDance, t);
  // look pitch (networked) goes to neck + head
  add(acc, "neck", 1, h.pitch * 0.3); add(acc, "head", 1, h.pitch * 0.45);
  for (const kk of BONES) { const a = acc[kk]; h.rot(kk, Q.setFromEuler(E.set(a[0], a[1], a[2], "XYZ"))); }
  h.model.position.set(acc.off[0], acc.off[1], acc.off[2]);
}
