import * as THREE from "three";

// Ambient + cue effects: petal showers, sparkles, floating reactions, sound.
const petalG = new THREE.PlaneGeometry(0.08, 0.06);
const REACT = { heart: "❤️", clap: "👏", tears: "🥹", cheers: "🥂", ring: "💍" };
export const REACTIONS = REACT;

export class FX {
  constructor(scene, camera) {
    this.scene = scene; this.cam = camera;
    const N = 700;
    this.petalMat = new THREE.MeshStandardMaterial({ color: 0xf6c4cc, side: THREE.DoubleSide, roughness: 0.8 });
    this.petals = new THREE.InstancedMesh(petalG, this.petalMat, N);
    this.petals.count = 0; this.petals.frustumCulled = false; scene.add(this.petals);
    this.p = []; this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler();
    this.sparks = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xffe9a8, size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.frustumCulled = false; scene.add(this.sparks); this.s = [];
    this.layer = document.getElementById("reacts");
    this.sounds = {}; this.ctx = null; this.ambient = null;
  }
  petalBurst(center = new THREE.Vector3(0, 6, -9), n = 400, spread = 6) {
    for (let i = 0; i < n && this.p.length < 700; i++)
      this.p.push({ x: center.x + (Math.random() - 0.5) * spread, y: center.y + Math.random() * 3, z: center.z + (Math.random() - 0.5) * spread * 1.6,
        vy: -0.5 - Math.random() * 0.5, ph: Math.random() * 6, r: Math.random() * 6, life: 14 });
  }
  aislePetals() { this.petalBurst(new THREE.Vector3(0, 4.5, 4), 260, 3); }
  sparkle(center = new THREE.Vector3(0, 2, -10), n = 220) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, u = Math.random() * 2 - 1, sp = 1 + Math.random() * 3;
      this.s.push({ x: center.x, y: center.y, z: center.z, vx: Math.cos(a) * Math.sqrt(1 - u * u) * sp, vy: Math.abs(u) * sp + 1, vz: Math.sin(a) * Math.sqrt(1 - u * u) * sp, life: 1.4 + Math.random() });
    }
  }
  react(kind, worldPos) {
    const el = document.createElement("div"); el.className = "react"; el.textContent = REACT[kind] || "❤️";
    let x = innerWidth * (0.2 + Math.random() * 0.6), y = innerHeight * 0.8;
    if (worldPos) { const v = worldPos.clone().project(this.cam); if (v.z < 1 && Math.abs(v.x) < 1.1) { x = (v.x * 0.5 + 0.5) * innerWidth; y = (-v.y * 0.5 + 0.5) * innerHeight; } }
    el.style.left = x + "px"; el.style.top = y + "px"; el.style.setProperty("--dx", (Math.random() * 60 - 30) + "px");
    this.layer.appendChild(el); setTimeout(() => el.remove(), 2600);
  }
  async audio() {
    if (this.ctx) return this.ctx;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const load = async (n) => { try { const b = await (await fetch("assets/sfx/" + n + ".mp3")).arrayBuffer(); this.sounds[n] = await this.ctx.decodeAudioData(b); } catch (e) {} };
    await Promise.all(["bells", "applause", "harp", "sparkle", "ambience"].map(load));
    return this.ctx;
  }
  play(name, vol = 0.8, loop = false) {
    if (!this.ctx || !this.sounds[name]) return null;
    const s = this.ctx.createBufferSource(); s.buffer = this.sounds[name]; s.loop = loop;
    const g = this.ctx.createGain(); g.gain.value = vol; s.connect(g).connect(this.ctx.destination); s.start();
    return { stop: () => { try { s.stop(); } catch (e) {} }, gain: g };
  }
  async startAmbience() { await this.audio(); this.ctx.resume?.(); if (!this.ambient) this.ambient = this.play("ambience", 0.25, true); }
  cue(name) {
    if (name === "processional") { this.play("harp", 0.7); this.aislePetals(); }
    if (name === "kiss") { this.petalBurst(); this.sparkle(); this.play("bells", 0.8); setTimeout(() => this.play("applause", 0.7), 700); }
    if (name === "sparklers") { this.sparkle(new THREE.Vector3(-3, 1.5, 2)); this.sparkle(new THREE.Vector3(3, 1.5, 2)); this.play("sparkle", 0.7); }
    if (name === "applause") this.play("applause", 0.8);
    if (name === "petals") this.petalBurst(new THREE.Vector3(0, 7, 3), 500, 10);
  }
  update(dt, t) {
    const P = this.p;
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i]; q.life -= dt; q.y += q.vy * dt; q.x += Math.sin(t * 1.3 + q.ph) * dt * 0.4; q.z += Math.cos(t + q.ph) * dt * 0.25; q.r += dt * 2;
      if (q.y < 0.02) { q.y = 0.02; q.vy = 0; }
      if (q.life <= 0) P.splice(i, 1);
    }
    this.petals.count = P.length;
    for (let i = 0; i < P.length; i++) {
      const q = P[i]; this.q.setFromEuler(this.e.set(q.r, q.r * 0.7, q.vy ? q.r * 0.3 : 0));
      this.m4.compose(new THREE.Vector3(q.x, q.y, q.z), this.q, ONE); this.petals.setMatrixAt(i, this.m4);
    }
    this.petals.instanceMatrix.needsUpdate = true;
    const S = this.s;
    for (let i = S.length - 1; i >= 0; i--) { const s = S[i]; s.life -= dt; s.vy -= 3 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; if (s.life <= 0) S.splice(i, 1); }
    const arr = new Float32Array(S.length * 3); S.forEach((s, i) => arr.set([s.x, s.y, s.z], i * 3));
    this.sparks.geometry.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  }
}
const ONE = new THREE.Vector3(1, 1, 1);
