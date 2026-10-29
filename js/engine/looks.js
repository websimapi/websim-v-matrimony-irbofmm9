import * as THREE from "three";
import { tex } from "./assets.js";

// Character looks on the GPU. Region masks baked offline from each outfit's own mesh
// (work/creator/bake-masks.py → assets/creator/masks/<outfit>/) say exactly which texels are skin, iris,
// lips, brows, painted hair, eyelids, cheeks, beard area, outer top, inner top, bottom and shoes; the
// material shader recolours them toward the creator's colours while keeping the texture's shading.
// Every setting is a uniform, so changes are instant and nothing is repainted on the CPU.
let REFS = null; // per-outfit mean colours of each region (the recolour references)
const refs = () => (REFS ||= fetch("assets/creator/masks/masks.json").then((r) => r.json()).catch(() => ({})));
const MASKS = new Map();
const mask = (id, name) => { const k = id + "/" + name; if (!MASKS.has(k)) MASKS.set(k, tex(`assets/creator/masks/${id}/${name}.png`, { srgb: false, flipY: false })); return MASKS.get(k); };

const HEAD_U = ["Skin", "Hair", "Lips", "Brows", "Iris", "Shadow", "Blush", "Beard"];
const BODY_U = ["Skin", "Top", "Inner", "Bottom", "Shoes"];
const COMMON = `
float lkL(vec3 c) { return dot(c, vec3(.2126, .7152, .0722)); }
// recolour toward t, keeping the texel's light/dark detail relative to the region's mean (ref) and a
// little of its own hue variation (veins, flush, fabric weave)
vec3 lkTo(vec3 c, vec3 base, vec3 ref, vec3 t, float w) {
  if (w <= 0.) return c;
  float r = clamp((lkL(base) + .015) / (lkL(ref) + .015), 0., 3.);
  vec3 hue = ((base + .004) / (lkL(base) + .004)) / ((ref + .004) / (lkL(ref) + .004));
  return mix(c, t * r * mix(vec3(1.), clamp(hue, vec3(.5), vec3(2.)), .3), clamp(w, 0., 1.));
}`;
const decl = (names) => names.map((n) => `uniform vec4 lk${n}; uniform vec3 lk${n}Ref;`).join("\n");

const HEAD_FRAG = `{
  vec3 base = diffuseColor.rgb / max(diffuse, vec3(1e-3)), c = base;
  vec4 mA = texture2D(lkMaskA, vMapUv), mB = texture2D(lkMaskB, vMapUv);
  c = lkTo(c, base, lkSkinRef, lkSkin.rgb, mA.r * lkSkin.a);
  // painted hair: tinted to the hair colour, or (under another hairstyle) a close-cropped scalp
  vec3 skinNow = lkSkin.a > 0. ? lkSkin.rgb * mix(1., (lkL(base) + .015) / (lkL(lkSkinRef) + .015), .6) : lkSkinRef;
  // under strand hair the painted hair becomes a hair-coloured scalp (fills gaps between strands)
  if (lkScalp > .5) c = mix(c, mix(skinNow * .8, lkHair.a > 0. ? lkHair.rgb : lkHairRef * 1.6, lkScalp > 1.5 ? .25 : .6), mA.g);
  else if (lkHair.a > 0.) c = lkTo(c, base, lkHairRef, lkHair.rgb, mA.g * lkHair.a);
  else c = mix(c, base, mA.g); // untinted: the painted hair stays exactly as drawn (soft hairline)
  // lips keep a natural, slightly darker and redder shade of the new skin tone
  c = mix(c, c * vec3(.95, .68, .66), mA.b * min(lkSkin.a, 1.) * .65);
  c = lkTo(c, base, lkBrowsRef, lkBrows.rgb, mA.a * lkBrows.a);
  c = lkTo(c, base, lkLipsRef, lkLips.rgb, mA.b * lkLips.a);
  c = lkTo(c, base, lkIrisRef, lkIris.rgb * 1.15, mB.r * lkIris.a);
  // makeup: eyeshadow (multiply), liner along the lash line, blush (soft colour wash)
  c = mix(c, c * lkShadow.rgb * 1.6, mB.g * lkShadow.a);
  c = mix(c, c * .25, smoothstep(.55, .95, mB.g) * lkLiner);
  c = mix(c, mix(c, lkBlush.rgb * (lkL(c) / max(lkL(lkBlush.rgb), .02)) * .9, .7), mB.b * lkBlush.a);
  // stubble: fine speckle in the beard area
  float n = fract(sin(dot(floor(vMapUv * 1400.), vec2(12.9898, 78.233))) * 43758.5453);
  c = mix(c, lkBeard.rgb * .55, mB.a * lkBeard.a * (.35 + .65 * n));
  diffuseColor.rgb = c * diffuse;
}`;
const BODY_FRAG = `{
  vec3 base = diffuseColor.rgb / max(diffuse, vec3(1e-3)), c = base;
  vec4 mA = texture2D(lkMaskA, vMapUv); float shoes = texture2D(lkMaskB, vMapUv).r;
  c = lkTo(c, base, lkSkinRef, lkSkin.rgb, mA.r * lkSkin.a);
  c = lkTo(c, base, lkTopRef, lkTop.rgb, mA.g * lkTop.a);
  c = lkTo(c, base, lkInnerRef, lkInner.rgb, mA.b * lkInner.a);
  c = lkTo(c, base, lkBottomRef, lkBottom.rgb, mA.a * lkBottom.a);
  c = lkTo(c, base, lkShoesRef, lkShoes.rgb, shoes * lkShoes.a);
  diffuseColor.rgb = c * diffuse;
}`;

// give a material the looks shader once; returns its uniforms (updated in place afterwards)
function install(mat, kind, id, R) {
  if (mat.userData.lk) return mat.userData.lk;
  const names = kind === "head" ? HEAD_U : BODY_U, u = {};
  u.lkMaskA = { value: mask(id, kind + "-a") }; u.lkMaskB = { value: mask(id, kind + "-b") };
  const ref = R?.[id]?.[kind] || {};
  for (const n of names) {
    u["lk" + n] = { value: new THREE.Vector4(0, 0, 0, 0) };
    const r = ref[n.toLowerCase()] || [0.2, 0.2, 0.2];
    u["lk" + n + "Ref"] = { value: new THREE.Vector3(...r) };
  }
  if (kind === "head") { u.lkScalp = { value: 0 }; u.lkLiner = { value: 0 }; }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + decl(names) + "\nuniform sampler2D lkMaskA; uniform sampler2D lkMaskB;" + (kind === "head" ? "\nuniform float lkScalp; uniform float lkLiner;" : "") + COMMON)
      .replace("#include <map_fragment>", "#include <map_fragment>\n" + (kind === "head" ? HEAD_FRAG : BODY_FRAG))
      // the humans' soft wrap lighting (humans.js), kept here because this replaces its hook
      .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * 0.22;");
  };
  mat.customProgramCacheKey = () => "looks-" + kind;
  mat.needsUpdate = true;
  return (mat.userData.lk = u);
}

const C = new THREE.Color();
const set = (u, name, hex, w = 1) => { const v = u["lk" + name].value; if (hex && w > 0) { C.set(hex); v.set(C.r, C.g, C.b, w); } else v.set(0, 0, 0, 0); };

// apply a spec's colours to a loaded Human (materials become per-character on first use)
export async function applyLooks(h, spec) {
  const R = await refs(), id = h.def.id;
  if (!R[id]) return false;
  const bodies = []; h.obj.traverse((m) => { if (m.isMesh && m.userData.part === "body" && m.visible) bodies.push(m); });
  // the body material is shared per outfit until a character customises it
  if (bodies.length && !h.bodyMat) { h.bodyMat = bodies[0].material.clone(); for (const m of bodies) m.material = h.bodyMat; }
  const hu = h.headMat ? install(h.headMat, "head", id, R) : null, bu = h.bodyMat ? install(h.bodyMat, "body", id, R) : null;
  const skinW = spec.skin.tone ? 0.35 + 0.65 * spec.skin.amount : 0;
  const hairCol = spec.hair.color || null;
  if (hu) {
    set(hu, "Skin", spec.skin.tone, skinW);
    set(hu, "Hair", hairCol || "#2b1a12", hairCol ? 1 : 0);
    hu.lkScalp.value = spec.hair.style === "bald" ? 2 : 1; // every customised character wears strand hair (or a shaved scalp)
    set(hu, "Brows", spec.browColor || hairCol, spec.browColor || hairCol ? 0.85 : 0);
    set(hu, "Lips", spec.makeupColors.lips, spec.makeup.lipAmount * 0.9);
    set(hu, "Iris", spec.eyeColor, spec.eyeColor ? 1 : 0);
    set(hu, "Shadow", spec.makeupColors.shadow, spec.makeup.shadowAmount * 0.75);
    hu.lkLiner.value = spec.makeup.liner * 0.85;
    set(hu, "Blush", spec.makeupColors.blush, spec.makeup.blush * 0.6);
    const stub = spec.facial.style === "stubble" ? 0.75 : spec.facial.style === "none" ? 0 : 0.45; // under beards: no bare-skin gaps
    set(hu, "Beard", spec.facial.color || hairCol || "#2b1a12", stub);
  }
  if (bu) {
    set(bu, "Skin", spec.skin.tone, skinW);
    set(bu, "Top", spec.outfit.top); set(bu, "Inner", spec.outfit.inner); set(bu, "Bottom", spec.outfit.bottom); set(bu, "Shoes", spec.outfit.shoes);
  }
  return true;
}
