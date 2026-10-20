// Sandbox transport: PeerJS (WebRTC) star topology + IndexedDB. Not connected
// to the websim realtime room. Host = authority running LocalDomain.
import { Peer } from "peerjs";
import { LocalDomain } from "./localdomain.js";
import { idbGet, idbSet } from "./idb.js";

const rand = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => (b % 36).toString(36)).join("");

export async function sandboxSession(bookingId) {
  const key = "sandbox:" + bookingId;
  let s = await idbGet(key);
  if (!s) { s = { peerId: "vwsbx-" + bookingId.toLowerCase() + "-" + rand(6), token: rand(16), created: Date.now(), invites: [] }; await idbSet(key, s); }
  return s;
}
export async function rotateSandboxToken(bookingId) {
  const s = await sandboxSession(bookingId); s.token = rand(16); await idbSet("sandbox:" + bookingId, s); return s;
}
export function inviteUrl(s) {
  const u = new URL(location.href); u.search = ""; u.hash = "";
  u.searchParams.set("sb", s.peerId); u.searchParams.set("t", s.token); return u.toString();
}

export async function hostSandbox(bookingId, join, handlers) {
  const s = await sandboxSession(bookingId);
  const dom = new LocalDomain({ token: s.token });
  const conns = new Map();
  dom.onkick = (id) => { conns.get(id)?.send({ type: "kicked" }); setTimeout(() => conns.get(id)?.close(), 200); };
  const peer = await new Promise((res, rej) => {
    const p = new Peer(s.peerId, { debug: 0 });
    p.on("open", () => res(p));
    p.on("error", (e) => { if (e.type === "unavailable-id") rej(new Error("This sandbox is already open in another tab")); else handlers.error?.(e); });
    setTimeout(() => rej(new Error("Could not reach the PeerJS broker")), 15000);
  });
  peer.on("connection", (c) => {
    let deliver = null; const queue = [];
    c.on("data", (m) => (deliver ? deliver(m) : queue.push(m)));
    c.on("open", () => {
      conns.set(c.peer, c);
      deliver = dom.connect(c.peer, (m) => c.open && c.send(m), { token: c.metadata?.t });
      queue.splice(0).forEach(deliver);
      handlers.peers?.(conns.size);
    });
    c.on("close", () => { conns.delete(c.peer); dom.drop(c.peer); handlers.peers?.(conns.size); });
  });
  const selfId = "host";
  const deliverSelf = dom.connect(selfId, (m) => queueMicrotask(() => handlers.message(m)), { host: true });
  deliverSelf(join);
  return { kind: "sandbox-host", session: s, send: (m) => deliverSelf(m),
    close: () => { dom.close(); peer.destroy(); }, peers: () => conns.size };
}

export async function joinSandbox(hostPeerId, token, join, handlers) {
  const peer = await new Promise((res, rej) => {
    const p = new Peer({ debug: 0 }); p.on("open", () => res(p)); p.on("error", (e) => rej(e));
    setTimeout(() => rej(new Error("Could not reach the PeerJS broker")), 15000);
  });
  const c = peer.connect(hostPeerId, { metadata: { t: token }, serialization: "json" });
  await new Promise((res, rej) => {
    c.on("open", res);
    peer.on("error", (e) => rej(new Error(e.type === "peer-unavailable" ? "The host's sandbox isn't open right now" : e.message)));
    setTimeout(() => rej(new Error("The host's sandbox isn't open right now")), 12000);
  });
  c.on("data", (m) => { if (m.type === "kicked") handlers.close?.("Removed by the host"); else handlers.message(m); });
  c.on("close", () => handlers.close?.("The host closed the sandbox"));
  c.send(join);
  return { kind: "sandbox-guest", send: (m) => c.open && c.send(m), close: () => peer.destroy() };
}
