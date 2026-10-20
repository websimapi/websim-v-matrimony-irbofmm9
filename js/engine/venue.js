import * as THREE from "three";
import { instanced, instance, tex, loadGLB } from "./assets.js";
import { Colliders } from "./collision.js";
import { buildSky, SUN_DIR } from "./sky.js";
import { roseClusters, Trees } from "./flora.js";

// Golden Hour Estate: ceremony lawn, cocktail terrace and a reception marquee
// (dining, dance floor, cake, buffet, band stage). Photoscanned CC0 props from
// Poly Haven, procedural 3D roses, photo-impostor trees, AI-generated textures.
const tl = new THREE.TextureLoader();

export const PALETTES = {
  blush: { flower: 0xf6b9c0, ribbon: 0xf3b6be, light: 0xffd7a8 },
  ivory: { flower: 0xfbf3e4, ribbon: 0xe9dcc4, light: 0xfff0d0 },
  lavender: { flower: 0xc9b4f2, ribbon: 0xc6b3f0, light: 0xf2e2ff },
  sage: { flower: 0xf4f1e6, ribbon: 0xb9d1ad, light: 0xfff4d6 },
};
export const ALTAR = new THREE.Vector3(0, 0.45, -10);
export const SPAWN = new THREE.Vector3(0, 0, 17);
export const BOUNDS = 52;
const TENT = new THREE.Vector3(0, 0, 35);
// yaw 0 faces -z (the altar); PI faces +z (the marquee)
export const PLACES = {
  ceremony: { label: "Ceremony", pos: new THREE.Vector3(0, 0, 8), yaw: 0 },
  cocktail: { label: "Cocktails", pos: new THREE.Vector3(-11, 0, 15), yaw: Math.PI * 0.75 },
  reception: { label: "Reception", pos: new THREE.Vector3(0, 0, 25.5), yaw: Math.PI },
  dance: { label: "Dance floor", pos: new THREE.Vector3(0, 0.08, 33), yaw: Math.PI },
  cake: { label: "Cake", pos: new THREE.Vector3(-6.5, 0, 39), yaw: Math.PI * 0.75 },
};

export function buildVenue(scene, { low = false, soft = false } = {}) {
  const root = new THREE.Group(); scene.add(root);
  const roseSpots = [], signRoses = [], tableRoses = [], cakeRoses = [];
  const m4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = (x, y, z) => new THREE.Vector3(x, y, z);
  const at = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(V(x, y, z), Q.clone().setFromAxisAngle(V(0, 1, 0), ry), V(s, s, s));
  const col = new Colliders(), sitSpots = [];
  // opts.col = { shrink, circle, tag(i) } turns every instance into a collider
  const place = (url, mats, opts = {}) => instanced(url, mats, opts).then(async (g) => {
    if (!g) return; root.add(g);
    if (opts.col) {
      const src = await loadGLB(url); const box = new THREE.Box3().setFromObject(src.scene);
      mats.forEach((m, i) => col.modelBox(box, m, { shrink: opts.col.shrink ?? 0.85, circle: opts.col.circle, tag: opts.col.tag ? opts.col.tag(i) : null }));
    }
  });

  // Sky (procedural dome, clouds, hills) + light
  const sky = buildSky(scene, { low });
  scene.background = null; scene.environmentIntensity = 0.75;
  scene.fog = new THREE.Fog(0xe9cdb8, 60, 220);
  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x7d8a5a, 1.1); root.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdcb2, 2.7); sun.castShadow = true;
  sun.target.position.set(0, 0, 14); sun.position.copy(SUN_DIR).multiplyScalar(70).add(sun.target.position);
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  const sc = sun.shadow.camera; sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 150; sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
  root.add(sun, sun.target);
  // cool sky fill from the opposite side so the shadow side of people stays readable
  const fill = new THREE.DirectionalLight(0xc4d4ff, 0.6); fill.position.set(-SUN_DIR.x * 50, 30, -SUN_DIR.z * 50); root.add(fill);

  // Ground
  const grassTex = tex("assets/grass.jpg", { repeat: 70 });
  const grass = new THREE.Mesh(new THREE.CircleGeometry(95, 64), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, color: 0xd8e0c8 }));
  grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; root.add(grass);
  const stoneMat = new THREE.MeshStandardMaterial({ map: tex("assets/stone.jpg", { repeat: 3 }), roughness: 0.75, color: 0xd8cfc2 });
  const woodMat = new THREE.MeshStandardMaterial({ map: tex("assets/wood.jpg"), roughness: 0.65 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf7f2ea, roughness: 0.5 });
  const linenMat = new THREE.MeshStandardMaterial({ map: tex("assets/linen.jpg", { repeat: 3 }), roughness: 0.9, color: 0xfffaf2 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a86a, metalness: 1, roughness: 0.3 });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe3b0 });

  // ---------- CEREMONY LAWN ----------
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.9, 0.45, 64), stoneMat);
  dais.position.set(0, 0.22, -10.5); dais.receiveShadow = dais.castShadow = true; root.add(dais);
  const step = new THREE.Mesh(new THREE.BoxGeometry(3, 0.22, 1.2), stoneMat); step.position.set(0, 0.11, -5.6); step.receiveShadow = true; root.add(step);
  const runnerTex = tex("assets/runner.jpg"); runnerTex.repeat.set(1, 9);
  const runnerMat = new THREE.MeshStandardMaterial({ map: runnerTex, roughness: 0.9 });
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 22), runnerMat);
  runner.rotation.x = -Math.PI / 2; runner.position.set(0, 0.012, 5); runner.receiveShadow = true; root.add(runner);
  // arch: white birch-like frame wrapped in roses
  const arch = new THREE.Group(); arch.position.set(0, 0.45, -12); root.add(arch);
  const archMesh = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.08, 12, 64, Math.PI), whiteMat); archMesh.position.y = 2.6; archMesh.castShadow = true; arch.add(archMesh);
  for (const x of [-2.4, 2.4]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 16), whiteMat); p.position.set(x, 1.3, 0); p.castShadow = true; arch.add(p); col.circle(x, -12, 0.14); }
  col.floorCircle(0, -10.5, 4.6, 0.45); col.floorBox(0, -5.6, 1.5, 0.6, 0.22);
  for (let i = 0; i <= 26; i++) {
    const a = (i / 26) * Math.PI;
    if ((a > 0.25 && a < 1.35) || a > 2.3) roseSpots.push({ p: V(Math.cos(a) * 2.4, 3.05 + Math.sin(a) * 2.4, -12), n: low ? 4 : 7, r: 0.28, s: 1.1, up: 0.1 });
  }
  for (const x of [-2.4, 2.4]) for (let y = 0.6; y < 1.6; y += 0.45) roseSpots.push({ p: V(x, y, -12), n: low ? 3 : 6, r: 0.25, s: 1.1, up: 0.2 });
  // chairs: 2 sections x 5 rows x 4 = 40 seats
  const seats = [], chairM = [];
  for (let row = 0; row < 5; row++) for (const side of [-1, 1]) for (let c = 0; c < 4; c++) {
    const x = side * (1.4 + c * 0.75), z = -2.5 + row * 1.6;
    chairM.push(at(x, 0, z, Math.PI)); seats.push({ pos: V(x, 0, z), yaw: 0 }); sitSpots.push({ pos: V(x, 0, z), yaw: 0, tag: "c" + (seats.length - 1) });
  }
  place("assets/models/gallinera_chair.glb", chairM, { col: { shrink: 0.8, tag: (i) => "c" + i } });
  for (let row = 0; row < 5; row++) for (const side of [-1, 1]) roseSpots.push({ p: V(side * 1.02, 0.75, -2.5 + row * 1.6), n: low ? 4 : 8, r: 0.2, s: 0.9, up: 0.6 });
  // flanking shrubs, potted plants and lanterns along the aisle
  place("assets/models/shrub_03.glb", [at(-6.2, 0, -11, 0.3, 1.6), at(6.2, 0, -11, 2, 1.6), at(-7.6, 0, -9, 1, 1.3), at(7.6, 0, -9, 4, 1.3), at(-5.5, 0, 6.5, 1.5, 1.1), at(5.5, 0, 6.5, 0.7, 1.1)], { col: { shrink: 0.6, circle: true } });
  if (!low) place("assets/models/wooden_lantern_01.glb", [-1, 1].flatMap((s) => [-4, 0, 4].map((z) => at(s * 1.05, 0, z + 0.8, 0, 1))), { col: { shrink: 0.8, circle: true } });
  place("assets/models/potted_plant_02.glb", [at(-3.2, 0.45, -13.4, 0, 1.2), at(3.2, 0.45, -13.4, 1, 1.2)], { col: { shrink: 0.7, circle: true } });

  // string lights over the lawn
  const bulbPts = [], posts = [];
  for (let i = 0; i < 6; i++) for (const side of [-1, 1]) posts.push(V(side * 5.2, 0, -4 + i * 4.5));
  const postG = new THREE.CylinderGeometry(0.07, 0.09, 4.2, 10);
  for (const p of posts) { const post = new THREE.Mesh(postG, woodMat); post.position.set(p.x, 2.1, p.z); post.castShadow = true; root.add(post); col.circle(p.x, p.z, 0.14); }
  for (let i = 0; i < 6; i++) { const a = posts[i * 2], b = posts[i * 2 + 1]; for (let k = 0; k <= 14; k++) { const t = k / 14; bulbPts.push(V(a.x + (b.x - a.x) * t, 4.1 - Math.sin(t * Math.PI) * 0.7, a.z)); } }

    // Sign with couple names
  const signCanvas = document.createElement("canvas"); signCanvas.width = 1024; signCanvas.height = 512;
  const signTex = new THREE.CanvasTexture(signCanvas); signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Group(); sign.position.set(3.4, 0, 13.5); sign.rotation.y = -0.4; root.add(sign);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.9 }));
  board.position.y = 1.5; sign.add(board);
  const easel = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.2, 0.05), woodMat); easel.position.set(0, 1.5, -0.03); sign.add(easel);
  for (const x of [-0.8, 0.8]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.06), woodMat); l.position.set(x, 0.8, -0.1); sign.add(l); }
  col.box(3.4, 13.5, 1.15, 0.2, -0.4);
  signRoses.push({ p: new THREE.Vector3(-0.95, 2.05, 0.06), n: 7, r: 0.16, s: 0.8, up: 0.2 });
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
  for (const x of [-2.2, 2.2]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.4, 0.1), woodMat); l.position.set(x, -0.9, -0.1); screen.add(l);
    const c = Math.cos(0.65), s = Math.sin(0.65); col.circle(-8.5 + x * c - 0.1 * s, -7 - x * s - 0.1 * c, 0.12); }
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


  // ---------- COCKTAIL TERRACE ----------
  const C = V(-12, 0, 13);
  const patio = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.3, 0.1, 64), stoneMat); patio.position.set(C.x, 0.05, C.z); patio.receiveShadow = true; root.add(patio); col.floorCircle(C.x, C.z, 5.2, 0.1);
  const bar = new THREE.Group(); bar.position.set(C.x - 2.6, 0.1, C.z - 2.4); bar.rotation.y = 0.7; root.add(bar);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.05, 0.7), woodMat); counter.position.y = 0.52; counter.castShadow = counter.receiveShadow = true; bar.add(counter);
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.05, 0.85), new THREE.MeshStandardMaterial({ color: 0xece6dc, roughness: 0.15 })); top.position.y = 1.07; bar.add(top);
  bar.updateMatrixWorld(true); col.box(bar.position.x, bar.position.z, 1.92, 0.44, 0.7);
  const bm = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().multiplyMatrices(bar.matrixWorld, at(x, y, z, ry, s));
  place("assets/models/wine_bottles_01.glb", [bm(-1.1, 1.1, 0), bm(1.0, 1.1, 0.05, 2)]);
  place("assets/models/bar_chair_round_01.glb", [-1.2, -0.4, 0.4, 1.2].map((x) => bm(x, 0, 0.85, 0)), { col: { shrink: 0.75, circle: true } });
  place("assets/models/sofa_03.glb", [at(C.x + 2.4, 0.1, C.z - 1.2, -1.9), at(C.x + 1.0, 0.1, C.z + 2.6, -2.9), at(C.x - 1.9, 0.1, C.z + 2.2, 2.6)], { col: { shrink: 0.88 } });
  place("assets/models/round_wooden_table_01.glb", [at(C.x + 0.4, 0.1, C.z + 0.6, 0, 0.7)], { col: { shrink: 0.9, circle: true } });
  if (!low) place("assets/models/potted_plant_01.glb", [at(C.x - 4.5, 0.1, C.z + 1.5, 0), at(C.x + 3.6, 0.1, C.z - 3.6, 2), at(C.x - 0.5, 0.1, C.z - 4.9, 1)], { col: { shrink: 0.7, circle: true } });
  if (!low) place("assets/models/brass_candleholders.glb", [at(C.x + 0.4, 0.1 + 0.52, C.z + 0.6)]);

  // ---------- RECEPTION MARQUEE ----------
  const W = 13, D = 10, eave = 3.4, peak = 6.2;
  const tent = new THREE.Group(); tent.position.copy(TENT); root.add(tent);
  const drape = tex("assets/drape.jpg", { repeat: 4 });
  const canvasMat = new THREE.MeshStandardMaterial({ map: drape, color: 0xfffaf3, roughness: 0.95, side: THREE.DoubleSide, emissive: 0xffe9cf, emissiveIntensity: 0.12 });
  // roof: hipped, with sag between rafters
  const roofG = new THREE.PlaneGeometry(W * 2, D * 2, 48, 36);
  { const p = roofG.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getY(i); const u = Math.abs(x) / W, v = Math.abs(z) / D, m = Math.max(u, v * 0.98);
      const sag = Math.pow(Math.sin(((x + W) / (W * 2)) * Math.PI * 6), 2) * 0.22 * (1 - m);
      p.setXYZ(i, x, eave + (peak - eave) * (1 - m) - sag, z); }
    roofG.computeVertexNormals(); }
  const roof = new THREE.Mesh(roofG, canvasMat); roof.castShadow = true; tent.add(roof);
  // scalloped valance + gathered drapes at poles
  const val = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.5, 4, 1, true, Math.PI / 4), canvasMat); val.scale.set(W * 1.414, 1, D * 1.414); val.position.y = eave - 0.25; tent.add(val);
  const poleG = new THREE.CylinderGeometry(0.09, 0.11, eave, 12), drapeG = new THREE.CylinderGeometry(0.22, 0.45, eave - 0.3, 14, 1, true);
  const polePts = [];
  for (let i = 0; i <= 4; i++) for (const s of [-1, 1]) polePts.push([-W + (i * W) / 2, s * D], [s * W, -D + (i * D) / 2]);
  const seen = new Set();
  for (const [x, z] of polePts) { const k = x + "," + z; if (seen.has(k)) continue; seen.add(k);
    if (z === -D && Math.abs(x) < 1) continue; // keep the entrance clear
    const p = new THREE.Mesh(poleG, whiteMat); p.position.set(x, eave / 2, z); p.castShadow = true; tent.add(p);
    let pr = 0.15;
    if (Math.abs(z) === D && Math.abs(x) < W && x !== 0 || Math.abs(x) === W) { const d = new THREE.Mesh(drapeG, canvasMat); d.position.set(x, (eave - 0.3) / 2, z); tent.add(d); pr = 0.42; }
    col.circle(x + TENT.x, z + TENT.z, pr); }
  // floor: sisal-toned boards + parquet dance floor
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.06, D * 2), new THREE.MeshStandardMaterial({ map: tex("assets/wood.jpg", { repeat: 6 }), roughness: 0.7, color: 0xd9cbb8 }));
  deck.position.y = 0.03; deck.receiveShadow = true; tent.add(deck); col.floorBox(TENT.x, TENT.z, W, D, 0.06);
  const parquet = tex("assets/parquet.jpg", { repeat: 3 });
  const dance = new THREE.Mesh(new THREE.BoxGeometry(7, 0.08, 6), new THREE.MeshStandardMaterial({ map: parquet, roughness: 0.25, metalness: 0.05 }));
  dance.position.set(0, 0.05, -2); dance.receiveShadow = true; tent.add(dance); col.floorBox(TENT.x, TENT.z - 2, 3.5, 3, 0.09);
  // band stage at the back
  const stage = new THREE.Mesh(new THREE.BoxGeometry(6, 0.45, 2.6), woodMat); stage.position.set(0, 0.22, 7.9); stage.castShadow = stage.receiveShadow = true; tent.add(stage); col.floorBox(TENT.x, TENT.z + 7.9, 3, 1.3, 0.45);
  // 8 round tables x 8 chairs around the dance floor
  const T = []; const chairs = [], tableM = [], candleM = [], vaseM = [];
  for (const [x, z] of [[-9, -6], [-9, -1], [-9, 4], [9, -6], [9, -1], [9, 4], [-4.5, 5], [4.5, 5]]) T.push(V(x, 0, z));
  const cloth = new THREE.CylinderGeometry(0.92, 1.0, 0.76, 48, 3, true); cloth.translate(0, 0.38, 0);
  { const p = cloth.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), y = p.getY(i), f = 1 + Math.sin(a * 18) * 0.025 * (1 - y / 0.76); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); } cloth.computeVertexNormals(); }
  const clothTop = new THREE.CircleGeometry(0.92, 48); clothTop.rotateX(-Math.PI / 2); clothTop.translate(0, 0.76, 0);
  const plateG = new THREE.CylinderGeometry(0.14, 0.11, 0.015, 24), glassG = new THREE.LatheGeometry([[0, 0], [0.035, 0], [0.004, 0.01], [0.004, 0.1], [0.03, 0.14], [0.038, 0.21]].map(([x, y]) => new THREE.Vector2(x, y)), 16);
  const plateM = [], glassM = [];
  for (const t of T) {
    const w = new THREE.Vector3().addVectors(TENT, t);
    tableM.push(at(w.x, 0.06, w.z)); vaseM.push(at(w.x, 0.82, w.z, 0, 1.1)); candleM.push(at(w.x + 0.32, 0.82, w.z + 0.1, 1, 0.8));
    tableRoses.push({ p: V(w.x, 1.12, w.z), n: low ? 5 : 11, r: 0.17, s: 0.85, up: 0.5 });
    col.circle(w.x, w.z, 1.0);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2;
      chairs.push(at(w.x + Math.sin(a) * 1.35, 0.06, w.z + Math.cos(a) * 1.35, a + Math.PI));
      sitSpots.push({ pos: V(w.x + Math.sin(a) * 1.35, 0.06, w.z + Math.cos(a) * 1.35), yaw: a, tag: "d" + (chairs.length - 1) });
      plateM.push(at(w.x + Math.sin(a) * 0.68, 0.83, w.z + Math.cos(a) * 0.68));
      glassM.push(at(w.x + Math.sin(a + 0.3) * 0.62, 0.83, w.z + Math.cos(a + 0.3) * 0.62)); }
  }
  const inst = (g, mat, ms, shadow = true) => { const im = new THREE.InstancedMesh(g, mat, ms.length); ms.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); root.add(im); return im; };
  inst(cloth, linenMat, tableM); inst(clothTop, linenMat, tableM, false);
  inst(plateG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }), plateM, false);
  inst(glassG, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: low ? 0 : 0.9, transparent: true, opacity: low ? 0.35 : 1, thickness: 0.01, side: THREE.DoubleSide }), glassM, false);
  place("assets/models/painted_wooden_chair_01.glb", chairs, { col: { shrink: 0.75, tag: (i) => "d" + i } });
  place("assets/models/ceramic_vase_01.glb", vaseM, { shadow: false });
  if (!low) place("assets/models/brass_candleholders.glb", candleM, { shadow: false });
  // chandeliers
  const chand = [V(0, 4.6, -2), V(-8.5, 3.9, -1), V(8.5, 3.9, -1)].map((p) => p.add(TENT));
  place("assets/models/Chandelier_02.glb", chand.map((p) => at(p.x, p.y, p.z, 0, 1.3)), { shadow: false });
  const glow = []; for (const p of chand) { const L = new THREE.PointLight(0xffc98a, 0, 16, 1.6); L.position.copy(p).add(V(0, -0.5, 0)); root.add(L); glow.push(L); }
  // cake table with a three-tier fondant cake
  const cakeAt = V(-6.5, 0, 6.2).add(TENT);
  const ct = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.8, 48), linenMat); ct.position.set(cakeAt.x, 0.46, cakeAt.z); ct.castShadow = true; root.add(ct); col.circle(cakeAt.x, cakeAt.z, 0.82);
  const fondant = new THREE.MeshPhysicalMaterial({ color: 0xfffaf2, roughness: 0.45, sheen: 1, sheenColor: new THREE.Color(0xfff2e6), clearcoat: 0.1 });
  let cy = 0.86;
  for (const [r, h] of [[0.36, 0.26], [0.27, 0.24], [0.18, 0.22]]) {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 64), fondant); tier.position.set(cakeAt.x, cy + h / 2, cakeAt.z); tier.castShadow = true; root.add(tier);
    const pearl = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 64), new THREE.MeshStandardMaterial({ color: 0xf6efe4, roughness: 0.2, metalness: 0.3 })); pearl.rotation.x = Math.PI / 2; pearl.position.set(cakeAt.x, cy + 0.01, cakeAt.z); root.add(pearl);
    cakeRoses.push({ p: V(cakeAt.x + r * 0.7, cy + h, cakeAt.z + r * 0.4), n: low ? 2 : 4, r: 0.07, s: 0.55, up: 0.6 });
    cy += h;
  }
  cakeRoses.push({ p: V(cakeAt.x, cy + 0.04, cakeAt.z), n: low ? 3 : 6, r: 0.08, s: 0.65, up: 0.9 });
  // buffet
  const bu = V(7.5, 0, 7.4).add(TENT);
  const buf = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.78, 0.9), linenMat); buf.position.set(bu.x, 0.45, bu.z); buf.castShadow = true; root.add(buf); col.box(bu.x, bu.z, 2.12, 0.47);
  const dome = new THREE.SphereGeometry(0.24, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let i = 0; i < 4; i++) { const d = new THREE.Mesh(dome, brassMat); d.position.set(bu.x - 1.5 + i, 0.86, bu.z); d.castShadow = true; root.add(d); }
  place("assets/models/wine_bottles_01.glb", [at(bu.x + 1.9, 0.84, bu.z, 0.5, 0.8)]);
  if (!low) place("assets/models/potted_plant_01.glb", [at(-W + 0.8, 0.06, D - 0.8 + TENT.z, 0), at(W - 0.8, 0.06, D - 0.8 + TENT.z, 1), at(-W + 0.8, 0.06, -D + 0.8 + TENT.z, 2), at(W - 0.8, 0.06, -D + 0.8 + TENT.z, 3)], { col: { shrink: 0.7, circle: true } });
  // fairy lights under the roof
  for (let i = 0; i < 9; i++) { const z = -D + 1 + i * ((2 * D - 2) / 8); for (let k = 0; k <= 20; k++) { const t = k / 20, x = -W + 0.5 + t * (2 * W - 1), y = eave + (peak - eave) * (1 - Math.max(Math.abs(x) / W, Math.abs(z) / D)) - 0.35 - Math.sin(t * Math.PI * 4) ** 2 * 0.25; bulbPts.push(V(x, y, z + TENT.z)); } }
  const bulbGeo = new THREE.SphereGeometry(0.045, 8, 6);
  const bulbMesh = new THREE.InstancedMesh(bulbGeo, lightMat, bulbPts.length);
  bulbPts.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); bulbMesh.setMatrixAt(i, m4); }); bulbMesh.computeBoundingSphere(); root.add(bulbMesh);
  // path from ceremony to marquee
  const path = new THREE.Mesh(new THREE.PlaneGeometry(3, 12), new THREE.MeshStandardMaterial({ map: tex("assets/stone.jpg", { repeat: 4 }), roughness: 0.85 })); path.material.map.repeat.set(1, 4);
  path.rotation.x = -Math.PI / 2; path.position.set(0, 0.015, 20); path.receiveShadow = true; root.add(path);
  if (!low) place("assets/models/flower_gazania.glb", [-1, 1].flatMap((s) => [15.5, 18, 20.5, 23].map((z, i) => at(s * 2, 0, z, i * 1.3, 1.2))));
  place("assets/models/periwinkle_plant.glb", [-1, 1].flatMap((s) => [16.7, 19.2, 21.8].map((z, i) => at(s * 2.1, 0, z, i, 1.4))));

  // ---------- TREES ----------
  const trees = new Trees(root);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const N = low ? 26 : 44;
  for (let i = 0; i < N; i++) { const a = rnd() * Math.PI * 2, r = 34 + rnd() * 26; const x = Math.cos(a) * r, z = Math.sin(a) * r + 12;
    trees.add(["jacaranda", "willow", "jacaranda", "cypress"][i % 4], x, z, 0.8 + rnd() * 0.5); col.circle(x, z, 0.4); }
  for (const [x, z] of [[-9, -15], [9, -15], [-13, -6], [13, -6]]) { trees.add("cypress", x, z, 0.8); col.circle(x, z, 0.45); }
  trees.add("willow", -19, 6, 1.1); trees.add("jacaranda", -18, 21, 1); trees.add("jacaranda", 16, 14, 1.05);
  col.circle(-19, 6, 0.45); col.circle(-18, 21, 0.4); col.circle(16, 14, 0.4);

  // ---------- ROSES ----------
  const roseGroups = [];
  const addRoses = (spots, seedN) => { if (!spots.length) return; const g = roseClusters(spots, PALETTES.blush.flower, seedN); root.add(g); roseGroups.push(g); };
  addRoses(roseSpots, 3); addRoses(signRoses, 5); addRoses(tableRoses, 9); addRoses(cakeRoses, 11);

  // ---------- config ----------
  function applyConfig(cfg = {}) {
    const pal = PALETTES[cfg.palette] || PALETTES.blush;
    for (const g of roseGroups) { g.userData.petalMat.color.setHex(pal.flower); g.userData.petalMat.emissive.setHex(pal.flower); }
    runnerMat.color.setHex(pal.ribbon).lerp(new THREE.Color(1, 1, 1), 0.55);
    lightMat.color.setHex(pal.light);
    const night = cfg.time === "evening";
    hemi.intensity = night ? 0.45 : 1.1; sun.intensity = night ? 0.35 : 2.7; fill.intensity = night ? 0.25 : 0.6;
    sun.color.setHex(night ? 0x9fb2ff : 0xffdcb2); hemi.color.setHex(night ? 0x6a74a8 : 0xdfe8ff);
    scene.environmentIntensity = night ? 0.35 : 0.75; sky.setNight(night ? 1 : 0);
    for (const L of glow) L.intensity = night ? 9 : 2.5;
    canvasMat.emissiveIntensity = night ? 0.35 : 0.12;
    scene.fog.color.setHex(night ? 0x1c1d33 : 0xe9cdb8);
    let dateStr = "";
    if (cfg.date) dateStr = new Date(cfg.date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
    drawSign(cfg.names, dateStr); drawScreen(cfg.names); setScreen(cfg.screen || null);
  }
  applyConfig({});
  const update = (dt, t, cam) => { trees.update(cam); sky.update(dt, cam); };
  return { root, seats, sitSpots, colliders: col, sky, setRenderer: (r) => sky.setRenderer(r), sun, hemi, bulbs: bulbMesh, lightMat, flowers: [], applyConfig, setScreen, screen, places: PLACES, update, danceFloor: { x: TENT.x, z: TENT.z - 2, w: 7, d: 6 } };
}
export function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
