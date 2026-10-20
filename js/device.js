// Device classes: vr | desktop | mobile | tv
const ua = navigator.userAgent;
const params = new URLSearchParams(location.search);
export const isTV = params.has("tv") || /SMART-TV|SmartTV|Tizen|Web0S|WebOS|AFT[A-Z]|BRAVIA|CrKey|GoogleTV|Android TV|HbbTV|Roku/i.test(ua);
export const isQuest = /OculusBrowser|Quest|Pico|Wolvic/i.test(ua);
export const isMobile = !isTV && !isQuest && (matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad|Mobile/i.test(ua));
export const device = isTV ? "tv" : isQuest ? "vr" : isMobile ? "mobile" : "desktop";
export async function vrSupported() {
  try { return !!(await navigator.xr?.isSessionSupported("immersive-vr")); } catch { return false; }
}
