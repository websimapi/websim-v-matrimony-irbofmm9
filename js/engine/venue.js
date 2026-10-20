import * as THREE from "three";

// Golden Hour Garden - procedurally generated venue (all geometry is code,
// all textures AI-generated in /assets). Budget: < 60k triangles.
const tl = new THREE.TextureLoader();
function tex(url, rep = 1, srgb = true) {
  const t = tl.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const PALETTES = {
  blush: { flower: 0xffd9dc, ribbon: 0xf3b6be, light: 0xffd7a8 },
  ivory: { flower: 0xfff6e8, ribbon: 0xe9dcc4, light: 0xfff0d0 },
  lavender: { flower: 0xe6dbff, ribbon: 0xc6b3f0, light: 0xf2e2ff },
  sage: { flower: 0xe8f3e1, ribbon: 0xb9d1ad, light: 0xfff4d6 },
};

export const ALTAR = new THREE.Vector3(0, 0.45, -10);
export const SPAWN = new THREE.Vector3(0, 0, 17);
export const BOUNDS = 38;

export function buildVenue(scene) {
  const root = new THREE.Group();
  scene.add(root);

  // Sky
  const skyTex = tl.load("assets/sky.jpg");
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0xf3d6c0, 45, 140);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffeedd, 0x6b7f4a, 1.1);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd2a0, 2.4);
  sun.position.set(-22, 18, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.far = 90;
  sun.shadow.bias = -0.0005;
  root.add(sun);

  // Ground
  const grass = new THREE.Mesh(new THREE.CircleGeometry(70, 48), new THREE.MeshStandardMaterial({ map: tex("assets/grass.jpg", 40), roughness: 1 }));
  grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; root.add(grass);

  const stoneMat = new THREE.MeshStandardMaterial({ map: tex("assets/stone.jpg", 3), roughness: 0.8 });
  const woodMat = new THREE.MeshStandardMaterial({ map: tex("assets/wood.jpg", 1), roughness: 0.7 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf7f2ea, roughness: 0.6 });

  // Ceremony dais
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.9, 0.45, 40), stoneMat);
  dais.position.set(0, 0.22, -10.5); dais.receiveShadow = dais.castShadow = true; root.add(dais);
  const step = new THREE.Mesh(new THREE.BoxGeometry(3, 0.22, 1.2), stoneMat);
  step.position.set(0, 0.11, -5.6); step.receiveShadow = true; root.add(step);

  // Aisle runner
  const runnerTex = tex("assets/runner.jpg", 1);
  runnerTex.repeat.set(1, 9);
  const runnerMat = new THREE.MeshStandardMaterial({ map: runnerTex, roughness: 0.9 });
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 22), runnerMat);
  runner.rotation.x = -Math.PI / 2; runner.position.set(0, 0.012, 5); runner.receiveShadow = true; root.add(runner);

  // Floral arch
  const arch = new THREE.Group(); arch.position.set(0, 0.45, -12); root.add(arch);
  const archCurve = new THREE.TorusGeometry(2.4, 0.09, 8, 40, Math.PI);
  const archMesh = new THREE.Mesh(archCurve, whiteMat); archMesh.position.y = 2.6; archMesh.castShadow = true; arch.add(archMesh);
  for (const x of [-2.4, 2.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 10), whiteMat);
    post.position.set(x, 1.3, 0); post.castShadow = true; arch.add(post);
  }
  const flowerTex = tl.load("assets/flowers.png"); flowerTex.colorSpace = THREE.SRGBColorSpace;
  const flowerMat = new THREE.MeshStandardMaterial({ map: flowerTex, emissiveMap: flowerTex, emissive: 0x8a7468, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.8 });
  const flowerGeo = new THREE.PlaneGeometry(1, 1);
  const flowers = [];
  const addFlower = (parent, x, y, z, s, rz = 0) => {
    const f = new THREE.Mesh(flowerGeo, flowerMat);
    f.position.set(x, y, z); f.scale.setScalar(s); f.rotation.z = rz; parent.add(f); flowers.push(f); return f;
  };
  for (let i = 0; i <= 22; i++) {
    const a = (i / 22) * Math.PI;
    if (a > 0.35 && a < 1.4 || a > 2.2) {
      addFlower(arch, Math.cos(a) * 2.4, 2.6 + Math.sin(a) * 2.4, 0.08, 0.9 + Math.random() * 0.4, a - Math.PI / 2);
      addFlower(arch, Math.cos(a) * 2.4, 2.6 + Math.sin(a) * 2.4, -0.08, 0.8, a);
    }
  }
  for (const x of [-2.4, 2.4]) for (let y = 0.4; y < 1.2; y += 0.4) addFlower(arch, x, y, 0.1, 1.0);

  // Chairs: 2 sections x 5 rows x 4 = 40 seats
  const seats = [];
  const chairGeo = [];
  const seatG = new THREE.BoxGeometry(0.46, 0.05, 0.44); seatG.translate(0, 0.46, 0);
  const backG = new THREE.BoxGeometry(0.46, 0.5, 0.04); backG.translate(0, 0.74, 0.21);
  const legs = [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]].map(([x, z]) => { const g = new THREE.CylinderGeometry(0.02, 0.02, 0.46, 5); g.translate(x, 0.23, z); return g; });
  chairGeo.push(seatG, backG, ...legs);
  const chair = mergeGeos(chairGeo);
  const chairs = new THREE.InstancedMesh(chair, whiteMat, 40);
  chairs.castShadow = true;
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (let row = 0; row < 5; row++) for (const side of [-1, 1]) for (let c = 0; c < 4; c++) {
    const x = side * (1.4 + c * 0.75), z = -2.5 + row * 1.6;
    m4.makeTranslation(x, 0, z); chairs.setMatrixAt(n++, m4);
    seats.push({ pos: new THREE.Vector3(x, 0, z), yaw: 0 });
  }
  root.add(chairs);
  // Aisle-end florals
  for (let row = 0; row < 5; row++) for (const side of [-1, 1]) {
    addFlower(root, side * 1.08, 0.7, -2.5 + row * 1.6, 0.6).rotation.y = side * -Math.PI / 2;
  }

  // Lantern posts + string lights
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe3b0 });
  const bulbs = [];
  const posts = [];
  for (let i = 0; i < 6; i++) for (const side of [-1, 1]) posts.push(new THREE.Vector3(side * 5.2, 0, -4 + i * 4.5));
  const postMat = woodMat;
  const bulbGeo = new THREE.SphereGeometry(0.06, 6, 4);
  const bulbPts = [];
  for (const p of posts) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 8), postMat);
    post.position.set(p.x, 2.1, p.z); post.castShadow = true; root.add(post);
  }
  for (let i = 0; i < 6; i++) {
    const a = posts[i * 2], b = posts[i * 2 + 1];
    for (let k = 0; k <= 14; k++) { const t = k / 14; bulbPts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, 4.1 - Math.sin(t * Math.PI) * 0.7, a.z)); }
    if (i < 5) { const c = posts[(i + 1) * 2]; const d = posts[(i + 1) * 2 + 1];
      for (const [s, e] of [[a, c], [b, d]]) for (let k = 1; k < 8; k++) { const t = k / 8; bulbPts.push(new THREE.Vector3(s.x, 4.1 - Math.sin(t * Math.PI) * 0.4, s.z + (e.z - s.z) * t)); } }
  }
  const bulbMesh = new THREE.InstancedMesh(bulbGeo, lightMat, bulbPts.length);
  bulbPts.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); bulbMesh.setMatrixAt(i, m4); });
  root.add(bulbMesh); bulbs.push(bulbMesh);

  // Dance floor (reception)
  const floor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 7), woodMat);
  floor.position.set(0, 0.06, 23); floor.receiveShadow = true; root.add(floor);
  woodMat.map.repeat.set(2, 2);

  // Sign with couple names
  const signCanvas = document.createElement("canvas"); signCanvas.width = 1024; signCanvas.height = 512;
  const signTex = new THREE.CanvasTexture(signCanvas); signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Group(); sign.position.set(3.4, 0, 14); sign.rotation.y = -0.5; root.add(sign);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.9 }));
  board.position.y = 1.5; sign.add(board);
  const easel = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.2, 0.05), woodMat); easel.position.set(0, 1.5, -0.03); sign.add(easel);
  for (const x of [-0.8, 0.8]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.06), woodMat); l.position.set(x, 0.8, -0.1); sign.add(l); }
  addFlower(sign, -0.9, 2.05, 0.03, 0.7); addFlower(sign, 1.0, 1.0, 0.03, 0.5);
  function drawSign(names, date) {
    const g = signCanvas.getContext("2d");
    g.fillStyle = "#fbf6ee"; g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = "#c9a96e"; g.lineWidth = 6; g.strokeRect(28, 28, 968, 456);
    g.fillStyle = "#6b5440"; g.textAlign = "center";
    g.font = "italic 400 44px Georgia, serif"; g.fillText("Welcome to the wedding of", 512, 150);
    g.font = "400 96px 'Cormorant Garamond', Georgia, serif"; g.fillText(names || "Our Couple", 512, 290, 900);
    g.font = "400 38px Georgia, serif"; g.fillText(date || "", 512, 390);
    signTex.needsUpdate = true;
  }
  drawSign();

  // Screen (slideshow / livestream surface)
  const screenCanvas = document.createElement("canvas"); screenCanvas.width = 640; screenCanvas.height = 360;
  const screenTex = new THREE.CanvasTexture(screenCanvas); screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.7), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(-8.5, 3, -7); screen.rotation.y = 0.65; root.add(screen);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(5, 2.9, 0.1), woodMat); frame.position.set(0, 0, -0.07); screen.add(frame);
  for (const x of [-2.2, 2.2]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.4, 0.1), woodMat); l.position.set(x, -0.9, -0.1); screen.add(l); }
  function drawScreen(names) {
    const g = screenCanvas.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 360); gr.addColorStop(0, "#f6e3d6"); gr.addColorStop(1, "#e8c9b6");
    g.fillStyle = gr; g.fillRect(0, 0, 640, 360);
    g.fillStyle = "#6b5440"; g.textAlign = "center"; g.font = "italic 56px Georgia, serif";
    g.fillText(names || "Golden Hour Garden", 320, 195, 600);
    screenTex.needsUpdate = true;
  }
  drawScreen();
  let screenImg = null, screenVideo = null;
  function setScreen(url) {
    if (screenVideo) { screenVideo.pause(); screenVideo = null; }
    screen.material.map = screenTex; screen.material.needsUpdate = true;
    if (!url) return;
    if (/[.](mp4|webm|m3u8)([?]|$)/i.test(url)) {
      const v = document.createElement("video"); v.src = url; v.crossOrigin = "anonymous"; v.loop = true; v.muted = true; v.playsInline = true;
      v.play().catch(() => {}); screenVideo = v;
      const vt = new THREE.VideoTexture(v); vt.colorSpace = THREE.SRGBColorSpace; screen.material.map = vt; screen.material.needsUpdate = true;
    } else {
      tl.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; screen.material.map = t; screen.material.needsUpdate = true; });
    }
  }

  // Trees (procedural, instanced)
  const trunkG = new THREE.CylinderGeometry(0.18, 0.28, 2.6, 6); trunkG.translate(0, 1.3, 0);
  const crownG = new THREE.IcosahedronGeometry(1.7, 1); crownG.translate(0, 3.6, 0);
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x6b4d36, roughness: 1 });
  const crownM = new THREE.MeshStandardMaterial({ color: 0x5d7c3a, roughness: 1, flatShading: true });
  const TREES = 46;
  const trunks = new THREE.InstancedMesh(trunkG, trunkM, TREES), crowns = new THREE.InstancedMesh(crownG, crownM, TREES);
  trunks.castShadow = crowns.castShadow = true;
  const rnd = mulberry(7);
  const col = new THREE.Color();
  for (let i = 0; i < TREES; i++) {
    const a = rnd() * Math.PI * 2, r = 30 + rnd() * 22;
    const s = 0.8 + rnd() * 0.9;
    m4.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m4); crowns.setMatrixAt(i, m4);
    crowns.setColorAt(i, col.setHSL(0.22 + rnd() * 0.08, 0.35 + rnd() * 0.2, 0.3 + rnd() * 0.12));
  }
  root.add(trunks, crowns);

  // Hedges flanking the dais
  const hedgeM = new THREE.MeshStandardMaterial({ color: 0x4f6e33, roughness: 1, flatShading: true });
  for (const side of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 3.5, 3, 8), hedgeM);
    h.rotation.z = Math.PI / 2; h.rotation.y = side * 0.5; h.position.set(side * 6.5, 0.6, -11); h.castShadow = true; root.add(h);
    for (let k = 0; k < 4; k++) addFlower(root, side * (5.4 + k * 0.7), 1.05 + (k % 2) * 0.2, -10.4 - k * 0.35, 0.7).rotation.y = side * -0.5;
  }

  // Config
  function applyConfig(cfg = {}) {
    const pal = PALETTES[cfg.palette] || PALETTES.blush;
    flowerMat.color.setHex(pal.flower).lerp(new THREE.Color(1, 1, 1), 0.35);
    runnerMat.color.setHex(pal.ribbon).lerp(new THREE.Color(1, 1, 1), 0.55);
    lightMat.color.setHex(pal.light);
    const night = cfg.time === "evening";
    hemi.intensity = night ? 0.35 : 1.1;
    sun.intensity = night ? 0.25 : 2.4;
    scene.fog.color.setHex(night ? 0x2a2235 : 0xf3d6c0);
    scene.backgroundIntensity = night ? 0.18 : 1;
    let dateStr = "";
    if (cfg.date) dateStr = new Date(cfg.date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
    drawSign(cfg.names, dateStr);
    drawScreen(cfg.names);
    setScreen(cfg.screen || null);
  }

  return { root, seats, sun, hemi, bulbs: bulbMesh, lightMat, flowers, applyConfig, setScreen, screen };
}

function mergeGeos(geos) {
  // Minimal non-indexed merge (avoids pulling BufferGeometryUtils)
  const pos = [], nor = [];
  for (let g of geos) {
    g = g.index ? g.toNonIndexed() : g;
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
export function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
