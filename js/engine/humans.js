import * as THREE from "three";
import { skinnedInstance, tex } from "./assets.js";
import { applyFace } from "./face.js";
import { animateHuman } from "./motion.js";
import { applyAppearance } from "./appearance.js";
import { sanitizeSpec } from "./avatar-spec.js";
import { initFace, express } from "./expressions.js";

// Realistic guests: Microsoft Rocketbox avatars (MIT). Procedural animation
// authored relative to the T-pose in character space (forward -Z, right +X).
export const AVATARS = [
  { id: "Business_Female_01", label: "Charcoal suit", h: 1.66 },
  { id: "Business_Male_01", label: "Black suit", h: 1.8 },
  { id: "Business_Female_02", label: "Burgundy blazer", h: 1.66 },
  { id: "Business_Male_02", label: "Navy suit", h: 1.8 },
  { id: "Female_Party_02", label: "Evening dress", h: 1.66 },
  { id: "Business_Male_03", label: "Charcoal suit", h: 1.8 },
  { id: "Business_Female_03", label: "Tweed skirt suit", h: 1.66 },
  { id: "Business_Male_05", label: "Waistcoat", h: 1.8 },
  { id: "Business_Female_04", label: "Black trouser suit", h: 1.66 },
  { id: "Business_Male_06", label: "Suit, purple tie", h: 1.8 },
];
export const LOOKS = AVATARS.length;
const UP = new THREE.Vector3(0, 1, 0);
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

function nameSprite(text, role) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 96;
  const g = c.getContext("2d"); g.font = "600 42px Inter, system-ui, sans-serif";
  const w = Math.min(500, g.measureText(text).width + 56);
  g.fillStyle = role === "host" ? "rgba(185,138,82,.92)" : role === "staff" ? "rgba(80,100,150,.92)" : "rgba(25,20,16,.55)";
  g.beginPath(); g.roundRect((512 - w) / 2, 14, w, 68, 34); g.fill();
  g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 256, 50, 470);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(0.9, 0.17, 1); s.renderOrder = 10; return s;
}

function materialsFor(id) {
  const base = "assets/avatars/" + id + "/";
  // Rocketbox albedo is authored dark; lift it a little, keep normals subtle and
  // let the sky environment fill the shadow side so nobody turns into a silhouette.
  const skin = (k, r, lift) => {
    const m = new THREE.MeshStandardMaterial({ map: tex(base + k + ".jpg", { flipY: false }), normalMap: tex(base + k + "_n.jpg", { srgb: false, flipY: false }), roughness: r, metalness: 0, envMapIntensity: 1.25 });
    m.normalScale.set(0.6, 0.6); m.color.setScalar(lift);
    // soft wrap lighting: brightens the terminator and back side (cheap SSS look)
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * 0.22;"); };
    m.customProgramCacheKey = () => "human-wrap";
    return m;
  };
  const op = new THREE.MeshStandardMaterial({ map: ["Business_Male_05", "Business_Male_06"].includes(id) ? null : tex(base + "opacity.png", { flipY: false }), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7, envMapIntensity: 1.1 });
  op.name = "opacity"; // hair + lashes: the creator finds (and hides/recolours) them by this name
  return { body: skin("body", 0.72, 1.35), head: skin("head", 0.52, 1.12), opacity: op };
}
const matCache = new Map();

export class Human {
  constructor({ name = "Guest", look = 0, role = "guest", face = null, clasp = false, spec = null } = {}) {
    this.seed = Math.random(); this.clasp = clasp; this.role = role;
    // a character-creator spec overrides the plain outfit index
    this.spec = spec ? sanitizeSpec(spec, look) : null;
    if (this.spec) look = this.spec.base;
    this.def = AVATARS[Math.abs(look | 0) % LOOKS];
    this.root = new THREE.Group();
    this.model = new THREE.Group(); this.root.add(this.model);
    this.tag = nameSprite(name, role); this.tag.position.y = this.def.h + 0.32; this.root.add(this.tag);
    this.pitch = 0; this.pos = new THREE.Vector3(); this.buf = []; this.walk = 0; this.speed = 0; this.flags = 0; this.t = Math.random() * 10;
    this.head = new THREE.Object3D(); this.hands = [new THREE.Object3D(), new THREE.Object3D()];
    this.ready = this._load(face);
  }
  async _load(face) {
    const o = await skinnedInstance("assets/avatars/" + this.def.id + ".glb");
    if (!o) return;
    if (!matCache.has(this.def.id)) matCache.set(this.def.id, materialsFor(this.def.id));
    const M = matCache.get(this.def.id);
    this.headMat = M.head.clone();
    o.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false;
      const n = (m.material?.name || "").toLowerCase();
      if (/icosphere/i.test(m.name)) { m.visible = false; return; } // stray modelling helper in the source files
      m.userData.part = n.includes("head") ? "head" : n.includes("opacity") ? "opacity" : "body"; // looks.js recolours by part
      m.material = n.includes("head") ? this.headMat : n.includes("opacity") ? M.opacity : M.body;
    });
    const bones = {}; o.traverse((b) => { if (b.isBone || b.type === "Object3D" || b.isObject3D) bones[b.name] = b; });
    const B = (n) => bones["Bip01 " + n] || bones["Bip01_" + n.replace(/ /g, "_")] || null;
    this.b = { pelvis: B("Pelvis"), spine0: B("Spine"), spine: B("Spine1"), spine2: B("Spine2"), neck: B("Neck"), head: B("Head"),
      lClav: B("L Clavicle"), rClav: B("R Clavicle"),
      lUp: B("L UpperArm"), lFore: B("L Forearm"), lHand: B("L Hand"), rUp: B("R UpperArm"), rFore: B("R Forearm"), rHand: B("R Hand"),
      lThigh: B("L Thigh"), lCalf: B("L Calf"), lFoot: B("L Foot"), rThigh: B("R Thigh"), rCalf: B("R Calf"), rFoot: B("R Foot"), lEye: B("LEye"), rEye: B("REye"), jaw: B("MJaw"),
      lToe: B("L Toe0"), rToe: B("R Toe0") };
    // fingers: l0..l4 / r0..r4 with three segments each (0 = thumb)
    for (const side of ["L", "R"]) for (let f = 0; f < 5; f++) for (let j = 0; j < 3; j++) {
      const bone = B(side + " Finger" + f + (j ? String(j) : ""));
      if (bone) this.b[side.toLowerCase() + "f" + f + j] = bone;
    }
    // orient + scale: find facing from the eyes, height from the head bone
    o.updateMatrixWorld(true);
    const le = new THREE.Vector3(), re = new THREE.Vector3(), hp = new THREE.Vector3();
    this.b.lEye?.getWorldPosition(le); this.b.rEye?.getWorldPosition(re); this.b.head?.getWorldPosition(hp);
    const fwd = new THREE.Vector3().subVectors(le, re).cross(UP).normalize();
    const yaw = Math.atan2(fwd.x, fwd.z); // rotate so forward → -Z
    o.rotation.y = Math.PI - yaw;
    const box = new THREE.Box3().setFromObject(o);
    const s = this.def.h / Math.max(0.5, box.max.y - box.min.y);
    o.scale.multiplyScalar(s);
    o.updateMatrixWorld(true);
    const box2 = new THREE.Box3().setFromObject(o); o.position.y -= box2.min.y;
    this.model.add(o); this.obj = o;
    o.updateMatrixWorld(true);
    // bind data: local quats + parent world quats in character space
    const inv = new THREE.Quaternion(); this.model.getWorldQuaternion(inv).invert();
    this.bind = new Map();
    for (const [k, bone] of Object.entries(this.b)) {
      if (!bone) continue;
      const pw = new THREE.Quaternion(); bone.parent.getWorldQuaternion(pw); pw.premultiply(inv);
      this.bind.set(k, { local: bone.quaternion.clone(), pw, pwi: pw.clone().invert(), pos: bone.position.clone() });
    }
    if (this.b.head) { this.b.head.getWorldPosition(hp); this.headY = this.model.worldToLocal(hp.clone()).y; }
    // bind directions (character space) along each arm segment, for the arm solver
    const wp = (bone) => this.model.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
    this.bindDir = {};
    for (const [a, c] of [["lUp", "lFore"], ["lFore", "lHand"], ["rUp", "rFore"], ["rFore", "rHand"], ["lHand", "lf20"], ["rHand", "rf20"]]) {
      if (this.b[a] && this.b[c]) this.bindDir[a] = wp(this.b[c]).sub(wp(this.b[a])).normalize();
    }
    this.side = { l: Math.sign(this.bindDir.lUp?.x || 1), r: Math.sign(this.bindDir.rUp?.x || -1) };
    initFace(this);
    if (face) await this.setFace(face);
    this.loaded = true;
    // characters without a creator look still get their outfit's style as strand hair (no old hair cards anywhere)
    if (this.spec) this.appearanceReady = applyAppearance(this, this.spec).catch((e) => console.warn("appearance", e));
    else this.appearanceReady = new Promise((r) => setTimeout(r, 2500 + Math.random() * 4000)).then(() => this.spec ? null : applyAppearance(this, sanitizeSpec(null, AVATARS.indexOf(this.def)))).catch((e) => console.warn("appearance", e)); // after the page is interactive
  }
  // rotate bone by R (character space, relative to T-pose)
  rot(k, R) {
    const d = this.bind.get(k); if (!d) return;
    _q.copy(d.pwi).multiply(R).multiply(d.pw).multiply(d.local);
    this.b[k].quaternion.copy(_q);
  }
  async setFace(face) {
    if (!this.b?.head) { this.pendingFace = face; return; }
    this.faceMesh?.removeFromParent();
    const r = await applyFace(this, face).catch((e) => console.warn("face", e));
    if (r) this.faceMesh = r;
  }
  // live updates from the character creator (same base outfit; a different base needs a new Human)
  setSpec(spec) { this.spec = sanitizeSpec(spec, this.def ? AVATARS.indexOf(this.def) : 0); return this.loaded ? applyAppearance(this, this.spec) : this.ready.then(() => applyAppearance(this, this.spec)); }
  // play a short body gesture: clap, wave, cheers, tears, heart, ring, talk
  gesture(kind) { this.gestures = (this.gestures || []).filter((g) => g.kind !== kind).concat({ kind, t: 0 }).slice(-3); }
  // facial expression: content, smile, joy, surprise, moved, love, think, sad (see expressions.js)
  express(kind, dur, weight) { express(this, kind, dur, weight); }
  // resting expression underneath everything else (null for a neutral face)
  setMood(kind, weight = 0.7) { if (this.face) { this.face.mood = kind; this.face.moodW = weight; } }
  // turn the head toward a world position (null to look ahead)
  lookAt(v) { this.lookTarget = v; }
  setName(name, role) { this.root.remove(this.tag); this.tag.material.map.dispose(); this.tag = nameSprite(name, role); this.tag.position.y = this.def.h + 0.32; this.root.add(this.tag); }
  push(t, v) { this.buf.push({ t, v }); if (this.buf.length > 4) this.buf.shift(); if (this.buf.length === 1) this.snap(v); }
  snap(v) { this.root.position.set(v[0], v[1], v[2]); this.root.rotation.y = v[3]; }
  update(dt, renderT) {
    const b = this.buf; let v = null;
    if (b.length >= 2) {
      let i = b.length - 2; while (i > 0 && b[i].t > renderT) i--;
      const a = b[i], c = b[i + 1]; const k = Math.max(0, Math.min(1, (renderT - a.t) / Math.max(1, c.t - a.t)));
      v = a.v.map((x, j) => (j === 3 ? lerpAngle(x, c.v[3], k) : j === 5 ? c.v[5] : x + ((c.v[j] ?? x) - x) * k));
    } else if (b.length) v = b[0].v;
    if (v) this.apply(v, dt);
  }
  apply(v, dt = 0.016) {
    const prev = this.root.position.clone();
    this.root.position.set(v[0], v[1], v[2]); this.root.rotation.y = v[3];
    const sp = prev.distanceTo(this.root.position) / Math.max(dt, 1e-3);
    this.speed += (Math.min(sp, 4) - this.speed) * Math.min(1, dt * 8);
    this.pitch = Number.isFinite(v[4]) ? v[4] : 0; this.flags = v[5] | 0;
    this.animate(dt);
  }
  animate(dt) { if (this.loaded) animateHuman(this, dt); }
  dispose() { this.root.removeFromParent(); this.tag.material.map.dispose(); this.headMat?.dispose(); }
}
export function lerpAngle(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

// The couple at the altar (idle until a live session replaces them).
export function makeCouple() {
  const g = new THREE.Group(); g.userData.people = [];
  const add = (look, x, ry) => { const a = new Human({ name: "", look, clasp: true }); a.root.remove(a.tag); a.root.position.set(x, 0.45, -10.2); a.root.rotation.y = ry; g.add(a.root); g.userData.people.push(a); return a; };
  add(4, -0.42, -Math.PI / 2); add(1, 0.42, Math.PI / 2); // 0.84 m apart: close enough to join hands
  // the officiant under the arch, facing the guests, reading from a book (couple.js drives the gestures)
  const o = new Human({ name: "", look: 7 }); o.root.remove(o.tag); o.root.position.set(0, 0.45, -11.35); o.root.rotation.y = Math.PI;
  g.add(o.root); g.userData.officiant = o; o.officiant = true;
  return g;
}
