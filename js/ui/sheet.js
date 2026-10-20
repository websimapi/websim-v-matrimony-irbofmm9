// Bottom-sheet manager + toast
const wrap = document.getElementById("sheet-wrap"), el = document.getElementById("sheet");
let onClose = null;
export function openSheet(html, { wide = false, close } = {}) {
  el.className = "sheet" + (wide ? " wide" : "");
  el.innerHTML = '<button class="x" aria-label="Close">×</button>' + html;
  el.querySelector(".x").onclick = closeSheet;
  wrap.hidden = false; onClose = close || null;
  return el;
}
export function closeSheet() { if (wrap.hidden) return; wrap.hidden = true; el.innerHTML = ""; const f = onClose; onClose = null; f?.(); }
export const sheetOpen = () => !wrap.hidden;
wrap.addEventListener("pointerdown", (e) => { if (e.target === wrap) closeSheet(); });
addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
let tt;
export function toast(msg, ms = 2600) {
  const t = document.getElementById("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(tt); tt = setTimeout(() => (t.hidden = true), ms);
}
