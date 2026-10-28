// Character creator data: one compact, versioned JSON "spec" per character. It is saved
// locally (IndexedDB), optionally to the account (server /api/characters), shared in the
// room as part of the guest's identity, and rendered by Human (humans.js).
import { AVATARS } from "./humans.js";

const clamp = (v, a, b, d = 0) => (Number.isFinite(+v) ? Math.max(a, Math.min(b, +v)) : d);
const hex = (v) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null);

// slider definitions: [key, label, min, max, default]; values are unitless -1..1 unless noted
export const SLIDERS = {
  body: [["height", "Height", -1, 1, 0], ["weight", "Weight", -1, 1, 0], ["muscle", "Muscle", -1, 1, 0], ["shoulders", "Shoulder width", -1, 1, 0],
    ["chest", "Chest", -1, 1, 0], ["waist", "Waist", -1, 1, 0], ["hips", "Hips", -1, 1, 0], ["legs", "Leg length", -1, 1, 0], ["arms", "Arm length", -1, 1, 0],
    ["neck", "Neck length", -1, 1, 0], ["headSize", "Head size", -1, 1, 0]],
  face: [["width", "Face width", -1, 1, 0], ["length", "Face length", -1, 1, 0], ["depth", "Face depth", -1, 1, 0]],
  eyes: [["size", "Eye size", -1, 1, 0], ["spacing", "Eye spacing", -1, 1, 0], ["height", "Eye height", -1, 1, 0], ["depth", "Eye depth", -1, 1, 0], ["tilt", "Eye rotation", -1, 1, 0]],
  makeup: [["lipAmount", "Lipstick", 0, 1, 0], ["blush", "Blush", 0, 1, 0], ["shadowAmount", "Eyeshadow", 0, 1, 0], ["liner", "Eyeliner", 0, 1, 0]],
};
export const SKIN_TONES = ["#f6d7c3", "#efc4a4", "#e2ab84", "#c98e66", "#a8714c", "#8a5638", "#6b3f27", "#4b2b1a"];
export const HAIR_COLORS = ["#0f0b09", "#2b1a12", "#4a2c1a", "#7a4a26", "#a8723f", "#d2a565", "#e8cf9a", "#b6b0a6", "#e9e5df", "#8c2f1d", "#c4462c", "#3a3f8f", "#c34a8c", "#3f8f6a"];
export const EYE_COLORS = ["#4b2e1b", "#6d4a2c", "#8a6a3c", "#5a7a3a", "#3e7a6e", "#3b6aa0", "#7aa0c8", "#6b6f78", "#9a4f8a"];
export const LIP_COLORS = ["#b5525e", "#c9305a", "#8e2b3a", "#d97a74", "#a85a4f", "#6b2734", "#e0a09a"];
export const CLOTH_COLORS = ["#111114", "#2b2f3a", "#1f2d4d", "#3b4a6b", "#6b2034", "#8c6a4f", "#c9b79c", "#f4efe6", "#b5c7d6", "#8fa889", "#e6b8c2", "#c9a24b", "#7a3e8c", "#d9d9d9"];
export const METALS = { gold: "#d4a75a", silver: "#d8dde3", rose: "#e3a58f", black: "#2b2b2e" };
export const TATTOO_REGIONS = { lForearm: "Left forearm", rForearm: "Right forearm", lUpperArm: "Left upper arm", rUpperArm: "Right upper arm",
  chest: "Chest", back: "Back", neck: "Neck", lCalf: "Left calf", rCalf: "Right calf", lHand: "Left hand", rHand: "Right hand" };
// hairstyles: the outfits' own hair re-fitted to any head (assets/creator/hair/rb-<outfit>.glb)
export const HAIR_STYLES = [["original", "Outfit's own"], ["rb-Business_Male_02", "Short crop"], ["rb-Business_Male_01", "Side part"], ["rb-Business_Male_03", "Classic cut"],
  ["rb-Business_Female_04", "Pixie"], ["rb-Business_Female_01", "Shoulder bob"], ["rb-Business_Female_02", "Long layers"], ["rb-Business_Female_03", "Long straight"], ["rb-Female_Party_02", "Long curls"], ["bald", "Shaved"], ["hc-bun", "Low bun"], ["hc-updo", "Soft updo"], ["hc-braid", "Long braid"], ["hc-pixie", "Textured pixie"], ["hc-slick-back", "Slick back"], ["hc-afro", "Natural afro"]];
export const FACIAL_HAIR = [["none", "Clean shaven"], ["stubble", "Stubble"], ["mustache", "Mustache"], ["goatee", "Goatee"], ["short", "Short beard"], ["full", "Full beard"]];

export function defaultSpec(look = 0) {
  const s = { v: 1, base: Math.abs(look | 0) % AVATARS.length, body: {}, face: {}, eyes: {}, makeup: {},
    skin: { tone: null, amount: 0.6 }, eyeColor: null,
    hair: { style: "original", color: null, dye: null, dyeMode: "tips", length: 0 },
    facial: { style: "none", color: null },
    makeupColors: { lips: "#b5525e", shadow: "#6b4a6e", blush: "#d9776f" },
    outfit: { top: null, bottom: null, shoes: null },
    acc: [], tattoos: [] };
  for (const [group, list] of Object.entries(SLIDERS)) for (const [k, , , , d] of list) s[group][k] = d;
  return s;
}

// accept anything from storage or the network; return a safe, complete spec
export function sanitizeSpec(input, fallbackLook = 0) {
  const d = defaultSpec(input?.base ?? fallbackLook);
  if (!input || typeof input !== "object") return d;
  d.base = Math.abs(input.base | 0) % AVATARS.length;
  for (const [group, list] of Object.entries(SLIDERS)) for (const [k, , a, b, def] of list) d[group][k] = clamp(input[group]?.[k], a, b, def);
  d.skin = { tone: hex(input.skin?.tone), amount: clamp(input.skin?.amount, 0, 1, 0.6) };
  d.eyeColor = hex(input.eyeColor);
  const hs = HAIR_STYLES.map((h) => h[0]), fs = FACIAL_HAIR.map((h) => h[0]);
  d.hair = { style: hs.includes(input.hair?.style) ? input.hair.style : "original", color: hex(input.hair?.color), dye: hex(input.hair?.dye),
    dyeMode: ["tips", "roots", "streaks"].includes(input.hair?.dyeMode) ? input.hair.dyeMode : "tips", length: clamp(input.hair?.length, -1, 1, 0) };
  d.facial = { style: fs.includes(input.facial?.style) ? input.facial.style : "none", color: hex(input.facial?.color) };
  d.makeupColors = { lips: hex(input.makeupColors?.lips) || d.makeupColors.lips, shadow: hex(input.makeupColors?.shadow) || d.makeupColors.shadow, blush: hex(input.makeupColors?.blush) || d.makeupColors.blush };
  d.outfit = { top: hex(input.outfit?.top), bottom: hex(input.outfit?.bottom), shoes: hex(input.outfit?.shoes) };
  d.acc = (Array.isArray(input.acc) ? input.acc : []).slice(0, 16).filter((a) => a && /^[a-z0-9_-]{1,32}$/.test(a.id))
    .map((a) => ({ id: a.id, slot: String(a.slot || "").slice(0, 16), metal: METALS[a.metal] ? a.metal : "gold", color: hex(a.color) }));
  d.tattoos = (Array.isArray(input.tattoos) ? input.tattoos : []).slice(0, 8).filter((t) => TATTOO_REGIONS[t?.region])
    .map((t) => ({ art: typeof t.art === "string" && (/^[a-z0-9_-]{1,32}$/.test(t.art) || (/^data:image\/(png|jpeg|webp);base64,/.test(t.art) && t.art.length < 24000)) ? t.art : "rose",
      region: t.region, x: clamp(t.x, 0, 1, 0.5), y: clamp(t.y, 0, 1, 0.5), scale: clamp(t.scale, 0.1, 1.5, 0.6), rot: clamp(t.rot, -180, 180, 0), opacity: clamp(t.opacity, 0.1, 1, 0.9), color: hex(t.color) }));
  return d;
}

// compact transport form for the room (drops defaults); always re-sanitized on receipt
export function packSpec(spec) {
  const s = sanitizeSpec(spec), d = defaultSpec(s.base), out = { v: 1, base: s.base };
  for (const k of Object.keys(s)) if (!["v", "base"].includes(k) && JSON.stringify(s[k]) !== JSON.stringify(d[k])) out[k] = s[k];
  return out;
}

// readable character codes for sharing (copy/paste) and backups
export const specToCode = (spec) => "VMC1." + btoa(unescape(encodeURIComponent(JSON.stringify(packSpec(spec))))).replace(/=+$/, "");
export function codeToSpec(code) {
  const m = /^VMC1\.([A-Za-z0-9+/]+)$/.exec(String(code).trim());
  if (!m) return null;
  try { return sanitizeSpec(JSON.parse(decodeURIComponent(escape(atob(m[1]))))); } catch { return null; }
}

// Randomize: small nudges globally, bigger changes per category (choice-overload fix)
export function randomize(spec, group = null) {
  const s = sanitizeSpec(spec), r = (a) => (Math.random() * 2 - 1) * a, pick = (l) => l[(Math.random() * l.length) | 0];
  const amt = group ? 0.8 : 0.3;
  for (const [g, list] of Object.entries(SLIDERS)) if (!group || g === group) for (const [k, , a, b] of list) s[g][k] = clamp(s[g][k] + r(amt), a, b);
  if (!group || group === "hair") { s.hair.style = pick(HAIR_STYLES)[0]; s.hair.color = pick(HAIR_COLORS); s.hair.dye = Math.random() < 0.2 ? pick(HAIR_COLORS) : null; }
  if (!group || group === "skin") s.skin.tone = pick(SKIN_TONES);
  if (!group || group === "eyes") s.eyeColor = pick(EYE_COLORS);
  if (!group || group === "outfit") s.outfit = { top: pick(CLOTH_COLORS), bottom: pick(CLOTH_COLORS), shoes: pick(CLOTH_COLORS) };
  return s;
}

// starting points: each outfit base, styled
export const PRESETS = [
  { name: "Classic groom", spec: { base: 1, body: { height: 0.2 }, hair: { style: "rb-Business_Male_02", color: "#2b1a12" }, facial: { style: "stubble", color: "#2b1a12" }, outfit: { top: "#111114" } } },
  { name: "Garden bride", spec: { base: 4, hair: { style: "rb-Female_Party_02", color: "#a8723f" }, makeup: { lipAmount: 0.6, blush: 0.4, shadowAmount: 0.3, liner: 0.4 }, outfit: { top: "#f4efe6" }, acc: [{ id: "veil", slot: "hat" }, { id: "pearls", slot: "necklace", metal: "silver" }] } },
  { name: "Best man", spec: { base: 3, hair: { style: "rb-Business_Male_02", color: "#0f0b09" }, facial: { style: "short", color: "#0f0b09" }, outfit: { top: "#1f2d4d" } } },
  { name: "Maid of honour", spec: { base: 2, hair: { style: "rb-Business_Female_01", color: "#4a2c1a" }, makeup: { lipAmount: 0.5, blush: 0.3 }, outfit: { top: "#e6b8c2" } } },
  { name: "Silver fox", spec: { base: 5, body: { weight: 0.2 }, hair: { style: "rb-Business_Male_02", color: "#b6b0a6" }, facial: { style: "full", color: "#b6b0a6" } } },
  { name: "Grandma Rose", spec: { base: 6, body: { height: -0.4, weight: 0.2 }, hair: { style: "rb-Female_Party_02", color: "#e9e5df" }, makeup: { lipAmount: 0.4 }, outfit: { top: "#8fa889" } } },
  { name: "Bold & inked", spec: { base: 8, hair: { style: "rb-Business_Female_02", color: "#8c2f1d", dye: "#c34a8c", dyeMode: "tips" }, tattoos: [{ art: "rose", region: "lForearm" }], acc: [{ id: "nosestud", slot: "nose", metal: "silver" }] } },
  { name: "Guest in navy", spec: { base: 7, hair: { style: "rb-Business_Female_01", color: "#2b1a12" }, outfit: { top: "#1f2d4d", bottom: "#1f2d4d" } } },
  { name: "Flower girl", spec: { base: 2, hair: { style: "rb-Business_Female_03", color: "#a8723f" }, outfit: { top: "#f4efe6", bottom: "#c9b79c" } } },
  { name: "Officiant", spec: { base: 7, hair: { style: "rb-Business_Male_02", color: "#0f0b09" }, outfit: { top: "#111114", bottom: "#1f2d4d" } } },
  { name: "Bridesmaid in sage", spec: { base: 4, hair: { style: "rb-Business_Female_04", color: "#5a3a22" }, outfit: { top: "#9caf88" } } },
  { name: "Groomsman in grey", spec: { base: 3, hair: { style: "rb-Business_Male_03", color: "#3b2a1e" }, facial: { style: "stubble", color: "#3b2a1e" }, outfit: { top: "#6e7275", bottom: "#6e7275" } } },
  { name: "Mother of the bride", spec: { base: 6, body: { height: -0.2 }, hair: { style: "rb-Business_Female_03", color: "#7a5a3c" }, makeup: { lipAmount: 0.5 }, outfit: { top: "#b48aa8" } } },
  // new presets go above this line
];
// presets are keyed by their name
export function presetById(id) {
  return PRESETS.find(p => p.name === id) || null;
}
