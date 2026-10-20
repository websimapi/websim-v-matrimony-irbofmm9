import * as THREE from "three";
import { AVATARS, Human } from "../engine/humans.js";
import { idbGet, idbSet } from "../net/idb.js";
import { esc } from "../api.js";

// Look editor: pick an outfit and (optionally) scan your face with the camera.
// The scan is MediaPipe Face Landmarker (Apache-2.0) running locally; only the
// cropped 512px face photo + 468 landmarks are uploaded, as one small JSON file.
export const PREFS_KEY = "guest:prefs";
export async function loadPrefs(ctx) {
  const p = (await idbGet(PREFS_KEY).catch(() => null)) || {};
  return { name: p.name || ctx.user?.username || "", look: (p.look ?? Math.floor(Math.random() * AVATARS.length)) % AVATARS.length, face: p.face || null, faceData: p.faceData || null };
}
export const savePrefs = (p) => idbSet(PREFS_KEY, p).catch(() => {});

const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
let lmP;
function landmarker() {
  return (lmP ||= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import(MP + "/vision_bundle.mjs");
    const fs = await FilesetResolver.forVisionTasks(MP + "/wasm");
    return FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: "GPU" }, runningMode: "VIDEO", numFaces: 1 });
  })().catch((e) => { lmP = null; throw e; }));
}

// crop a square around the face, re-normalise landmarks to the crop
function cropFace(src, sw, sh, pts) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const cx = ((x0 + x1) / 2) * sw, cy = ((y0 + y1) / 2) * sh, size = Math.max((x1 - x0) * sw, (y1 - y0) * sh) * 1.25;
  const c = document.createElement("canvas"); c.width = c.height = 512;
  c.getContext("2d").drawImage(src, cx - size / 2, cy - size / 2, size, size, 0, 0, 512, 512);
  const lm = [];
  for (let i = 0; i < 468; i++) { const p = pts[i]; lm.push(+(((p.x * sw - (cx - size / 2)) / size)).toFixed(4), +(((p.y * sh - (cy - size / 2)) / size)).toFixed(4), +((p.z * sw) / size).toFixed(4)); }
  return { v: 1, img: c.toDataURL("image/jpeg", 0.86), lm, ar: 1 };
}

function preview(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.setSize(canvas.clientWidth, canvas.clientHeight, false);
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e8, 0x8a7a6a, 1.6));
  const key = new THREE.DirectionalLight(0xffe2c4, 2.2); key.position.set(1.5, 2.5, -2.5); scene.add(key);
  const cam = new THREE.PerspectiveCamera(30, canvas.clientWidth / canvas.clientHeight, 0.05, 20);
  let h = null, alive = true, t = 0, close = false;
  const set = async (look, face) => {
    h?.dispose(); h = new Human({ name: "", look, face }); h.root.remove(h.tag); scene.add(h.root);
    await h.ready;
  };
  const loop = () => {
    if (!alive || !canvas.isConnected) { alive = false; r.dispose(); h?.dispose(); return; }
    t += 0.016; if (h) { h.root.rotation.y = Math.PI + Math.sin(t * 0.6) * 0.5; h.animate(0.016); }
    const hy = h?.def.h || 1.7;
    cam.position.set(0, close ? hy - 0.08 : hy * 0.55, close ? -0.75 : -4.2); cam.lookAt(0, close ? hy - 0.1 : hy * 0.5, 0);
    r.render(scene, cam); requestAnimationFrame(loop);
  };
  loop();
  return { set, zoom: (z) => (close = z) };
}

export function openLook(ctx, prefs) {
  return new Promise((resolve) => {
    const p = { ...prefs };
    let stream = null, raf = 0;
    const stop = () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); stream = null; };
    const el = ctx.openSheet(`<div class="look">
      <div class="look-top"><canvas class="look-3d"></canvas>
        <div class="look-cam" hidden><video playsinline muted></video><div class="look-oval"></div><div class="look-msg">Starting camera…</div></div></div>
      <div class="look-actions">
        <button class="btn" id="lk-scan">${p.face || p.faceData ? "Rescan face" : "Scan my face"}</button>
        <label class="btn">Use a photo<input type="file" accept="image/*" id="lk-file" hidden></label>
        ${p.face || p.faceData ? '<button class="btn" id="lk-clear">Remove face</button>' : ""}
      </div>
      <div class="muted small">Your photo stays on your avatar for this venue only.</div>
      <div class="look-grid">${AVATARS.map((a, i) => `<button class="look-opt ${i === p.look ? "on" : ""}" data-i="${i}" title="${esc(a.label)}"><img src="assets/avatars/${a.id}/thumb.jpg" alt="${esc(a.label)}" loading="lazy"></button>`).join("")}</div>
      <button class="btn primary" id="lk-done" style="width:100%">Done</button>
    </div>`, { close: () => { stop(); resolve(prefs); } });
    const pv = preview(el.querySelector(".look-3d"));
    const refresh = () => pv.set(p.look, p.faceData || p.face);
    refresh();
    el.querySelectorAll(".look-opt").forEach((b) => (b.onclick = () => {
      p.look = +b.dataset.i; el.querySelectorAll(".look-opt").forEach((x) => x.classList.toggle("on", x === b)); refresh();
    }));
    const camBox = el.querySelector(".look-cam"), video = camBox.querySelector("video"), msg = camBox.querySelector(".look-msg");
    const got = async (d) => {
      p.faceData = d; p.face = null; pv.zoom(true); await refresh();
      el.querySelector("#lk-scan").textContent = "Rescan face";
    };
    el.querySelector("#lk-scan").onclick = async () => {
      if (stream) return;
      camBox.hidden = false; msg.textContent = "Starting camera…";
      try {
        const [lm, s] = await Promise.all([landmarker(), navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 960, height: 720 } })]);
        stream = s; video.srcObject = s; await video.play();
        await lm.setOptions({ runningMode: "VIDEO" });
        let good = 0;
        const tick = () => {
          if (!stream) return;
          const r = lm.detectForVideo(video, performance.now());
          const pts = r.faceLandmarks?.[0];
          if (pts) {
            const w = Math.abs(pts[454].x - pts[234].x), roll = Math.abs(pts[263].y - pts[33].y), yaw = Math.abs((pts[1].x - pts[234].x) / w - 0.5);
            const ok = w > 0.18 && roll < 0.03 && yaw < 0.08;
            msg.textContent = w <= 0.18 ? "Come a little closer" : !ok ? "Look straight at the camera" : "Hold still…";
            good = ok ? good + 1 : 0;
            if (good > 18) { const d = cropFace(video, video.videoWidth, video.videoHeight, pts); stop(); camBox.hidden = true; got(d); return; }
          } else { msg.textContent = "Face the camera in good light"; good = 0; }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) { stop(); camBox.hidden = true; ctx.toast(e?.name === "NotAllowedError" ? "Camera permission was denied" : "Face scan unavailable on this device"); console.warn(e); }
    };
    el.querySelector("#lk-file").onchange = async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      try {
        const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
        const lm = await landmarker(); await lm.setOptions({ runningMode: "IMAGE" });
        const pts = lm.detect(img).faceLandmarks?.[0];
        if (!pts) return ctx.toast("No face found in that photo");
        got(cropFace(img, img.naturalWidth, img.naturalHeight, pts));
      } catch (err) { console.warn(err); ctx.toast("Couldn't read that photo"); }
    };
    el.querySelector("#lk-clear")?.addEventListener("click", () => { p.face = null; p.faceData = null; pv.zoom(false); refresh(); });
    el.querySelector("#lk-done").onclick = async () => {
      const b = el.querySelector("#lk-done"); b.disabled = true;
      stop();
      if (p.faceData && !p.face) {
        b.textContent = "Saving face…";
        try {
          const blob = new File([JSON.stringify(p.faceData)], "face.json", { type: "application/json" });
          p.face = await window.websim.upload(blob);
        } catch (e) { console.warn("face upload", e); ctx.toast("Sign in to share your face with other guests"); }
      }
      await savePrefs(p);
      resolve(p); ctx.closeSheet();
    };
  });
}
