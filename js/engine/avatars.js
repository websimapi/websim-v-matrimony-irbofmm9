import * as THREE from "three";

// Procedural low-poly guests: 12 looks (skin x outfit x hair). ~600 tris each.
const SKIN = [0xf1c7a5, 0xd9a07a, 0xa86f4c, 0x6e4630];
const OUTFIT = [0x2f3a56, 0x7b2d3b, 0xe8d5c4, 0x3e5a48, 0x8a6aa8, 0x222222];
const HAIR = [0x2b1d14, 0x6b4423, 0xd8b26e, 0x111111];
export const LOOKS = 12;

const bodyG = new THREE.CapsuleGeometry(0.24, 0.62, 4, 10); bodyG.translate(0, 0.72, 0);
const skirtG = new THREE.ConeGeometry(0.38, 0.75, 12, 1, true); skirtG.translate(0, 0.42, 0);
const headG = new THREE.SphereGeometry(0.16, 14, 10); headG.translate(0, 0, 0);
const hairG = new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
const handG = new THREE.SphereGeometry(0.055, 8, 6);
const eyeG = new THREE.SphereGeometry(0.018, 6, 4);
const eyeM = new THREE.MeshBasicMaterial({ color: 0x2a1c14 });
const mats = new Map();
const mat = (c) => { if (!mats.has(c)) mats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 })); return mats.get(c); };

function nameSprite(text, role) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 96;
  const g = c.getContext("2d");
  g.font = "600 44px system-ui, sans-serif";
  const w = Math.min(500, g.measureText(text).width + 56);
  g.fillStyle = role === "host" ? "rgba(201,150,90,.92)" : role === "staff" ? "rgba(90,110,160,.92)" : "rgba(30,24,20,.62)";
  roundRect(g, (512 - w) / 2, 14, w, 68, 34); g.fill();
  g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 256, 50, 470);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(1.1, 0.206, 1); s.renderOrder = 10;
  return s;
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

export class Avatar {
  constructor({ name = "Guest", look = 0, role = "guest" } = {}) {
    look = Math.abs(look | 0) % LOOKS;
    const skin = SKIN[look % 4], outfit = OUTFIT[(look * 5) % 6], hair = HAIR[(look * 7) % 4];
    const dress = look % 3 === 1;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    const torso = new THREE.Mesh(bodyG, mat(outfit)); torso.castShadow = true; this.body.add(torso);
    if (dress) { const sk = new THREE.Mesh(skirtG, mat(outfit)); sk.castShadow = true; this.body.add(sk); }
    this.head = new THREE.Group(); this.head.position.set(0, 1.52, 0); this.root.add(this.head);
    const h = new THREE.Mesh(headG, mat(skin)); h.castShadow = true; this.head.add(h);
    const hr = new THREE.Mesh(hairG, mat(hair)); hr.rotation.x = -0.25; hr.position.y = 0.02; this.head.add(hr);
    for (const x of [-0.055, 0.055]) { const e = new THREE.Mesh(eyeG, eyeM); e.position.set(x, 0.01, -0.148); this.head.add(e); }
    this.hands = [0, 1].map((i) => { const m = new THREE.Mesh(handG, mat(skin)); m.position.set(i ? 0.3 : -0.3, 0.85, 0); this.root.add(m); return m; });
    this.tag = nameSprite(name, role); this.tag.position.y = 1.95; this.root.add(this.tag);
    this.pos = new THREE.Vector3(); this.yaw = 0; this.pitch = 0;
    this.target = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, hands: null, head: null };
    this.buf = []; this.walk = 0; this.vr = false;
  }
  setName(name, role) { this.root.remove(this.tag); this.tag.material.map.dispose(); this.tag = nameSprite(name, role); this.tag.position.y = 1.95; this.root.add(this.tag); }
  // network snapshot: [x,y,z,yaw,pitch, hx,hy,hz, lx,ly,lz, rx,ry,rz]
  push(t, v) { this.buf.push({ t, v }); if (this.buf.length > 4) this.buf.shift(); if (this.buf.length === 1) this.snap(v); }
  snap(v) { this.pos.set(v[0], v[1], v[2]); this.yaw = v[3]; this.root.position.copy(this.pos); }
  update(dt, renderT) {
    // interpolate ~120ms in the past between bracketing snapshots
    const b = this.buf;
    let v = null;
    if (b.length >= 2) {
      let i = b.length - 2;
      while (i > 0 && b[i].t > renderT) i--;
      const a = b[i], c = b[i + 1];
      const k = Math.max(0, Math.min(1, (renderT - a.t) / Math.max(1, c.t - a.t)));
      v = a.v.map((x, j) => (j === 3 ? lerpAngle(x, c.v[3], k) : x + ((c.v[j] ?? x) - x) * k));
    } else if (b.length) v = b[0].v;
    if (v) this.apply(v, dt);
  }
  apply(v, dt = 0.016) {
    const prev = this.root.position.clone();
    this.root.position.set(v[0], v[1], v[2]);
    const speed = prev.distanceTo(this.root.position) / Math.max(dt, 1e-3);
    this.walk += dt * Math.min(speed, 4) * 3;
    this.root.rotation.y = v[3];
    this.vr = v.length >= 14;
    if (this.vr) {
      // head height & hands from VR pose (world-space offsets relative to root)
      this.head.position.set(v[5] - v[0], v[6] - v[1], v[7] - v[2]).applyAxisAngle(UP, -v[3]);
      this.hands[0].position.set(v[8] - v[0], v[9] - v[1], v[10] - v[2]).applyAxisAngle(UP, -v[3]);
      this.hands[1].position.set(v[11] - v[0], v[12] - v[1], v[13] - v[2]).applyAxisAngle(UP, -v[3]);
      this.body.position.y = Math.min(0, this.head.position.y - 1.52);
    } else {
      this.head.position.set(0, 1.52, 0);
      this.head.rotation.x = -(v[4] || 0) * 0.6;
      const sw = Math.sin(this.walk) * Math.min(speed, 2) * 0.06;
      this.hands[0].position.set(-0.3, 0.85, sw); this.hands[1].position.set(0.3, 0.85, -sw);
      this.body.position.y = Math.abs(Math.sin(this.walk)) * Math.min(speed, 2) * 0.02;
    }
  }
  dispose() { this.root.removeFromParent(); this.tag.material.map.dispose(); }
}
const UP = new THREE.Vector3(0, 1, 0);
export function lerpAngle(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

// The couple (scene props standing at the altar in showcase mode)
export function makeCouple() {
  const g = new THREE.Group();
  const a = new Avatar({ name: "", look: 2 }); a.root.remove(a.tag); a.root.position.set(-0.6, 0.45, -10.2); a.root.rotation.y = Math.PI - 0.0;
  const b = new Avatar({ name: "", look: 0 }); b.root.remove(b.tag); b.root.position.set(0.6, 0.45, -10.2); b.root.rotation.y = Math.PI;
  // veil-like white dress for a
  a.body.children.forEach((m) => (m.material = mat(0xfbf7f0)));
  if (a.body.children.length < 2) { const sk = new THREE.Mesh(skirtG, mat(0xfbf7f0)); sk.scale.set(1.3, 1, 1.3); a.body.add(sk); }
  b.body.children.forEach((m) => (m.material = mat(0x22252e)));
  // rotation: face each other slightly
  a.root.rotation.y = Math.PI * 0.5 + 0.0 + Math.PI; b.root.rotation.y = -Math.PI * 0.5 + Math.PI;
  a.root.rotation.y = -Math.PI / 2; b.root.rotation.y = Math.PI / 2;
  g.add(a.root, b.root);
  return g;
}
