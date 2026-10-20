// In-browser domain for sandbox sessions. Mirrors server.js room logic so
// rehearsals behave exactly like the paid venue, but runs on the host's device.
const q = (n) => Math.round(n * 100) / 100;
export class LocalDomain {
  constructor({ token, hostName }) {
    this.token = token; this.players = new Map(); this.links = new Map();
    this.state = { cue: null, shot: null, screen: null, locked: false }; this.dirty = new Set(); this.config = null;
    this.timer = setInterval(() => this.tick(), 100);
  }
  ident(p) { return { id: p.id, name: p.name, mode: p.mode, device: p.device, look: p.look, role: p.role, seat: p.seat }; }
  bcast(m, except) { for (const [id, l] of this.links) if (id !== except && this.players.has(id)) l(m); }
  connect(id, sendFn, meta = {}) {
    this.links.set(id, sendFn);
    return (m) => this.message(id, m, meta);
  }
  message(id, m, meta) {
    const send = this.links.get(id); if (!send) return;
    let me = this.players.get(id);
    if (m.type === "join") {
      const isHost = !!meta.host;
      if (!isHost && meta.token !== this.token) return send({ type: "denied", reason: "This invite link is no longer valid" });
      if (this.players.size >= 40 && !isHost) return send({ type: "denied", reason: "Sandbox is full" });
      me = { id, name: String(m.name || "Guest").slice(0, 24), mode: m.mode === "body" ? "body" : "spectator", device: String(m.device || "desktop"),
        look: Math.abs(m.look | 0) % 12, role: isHost ? "host" : "guest", seat: -1, pose: null };
      this.players.set(id, me);
      send({ type: "welcome", id, role: me.role, players: [...this.players.values()].map((p) => this.ident(p)),
        poses: [...this.players.values()].filter((p) => p.pose).map((p) => [p.id, ...p.pose]), state: this.state, config: this.config, sandbox: true });
      this.bcast({ type: "join", player: this.ident(me) }, id);
      return;
    }
    if (!me) return;
    const staff = me.role === "host";
    switch (m.type) {
      case "p": if (me.mode === "body" && Array.isArray(m.v)) { me.pose = m.v.slice(0, 14).map((n) => q(+n || 0)); this.dirty.add(id); } return;
      case "mode": me.mode = m.mode === "body" ? "body" : "spectator"; if (me.mode !== "body") me.pose = null; this.bcast({ type: "ident", player: this.ident(me) }); return;
      case "chat": { const text = String(m.text || "").slice(0, 200).trim(); if (text) this.bcast({ type: "chat", from: me.name, role: me.role, text }); return; }
      case "react": this.bcast({ type: "react", id, r: m.r }); return;
      case "gb": this.bcast({ type: "gb", entry: { username: me.name, message: String(m.message || "").slice(0, 400) } }); return;
    }
    if (!staff) return;
    const s = this.state;
    switch (m.type) {
      case "cue": s.cue = { name: m.name, at: Date.now() }; this.bcast({ type: "cue", cue: s.cue, by: me.name }); break;
      case "shot": s.shot = m.shot ?? null; this.bcast({ type: "shot", shot: s.shot }); break;
      case "screen": s.screen = m.url || null; this.bcast({ type: "screen", url: s.screen }); break;
      case "seat": { s.locked = !!m.locked; let i = 0; for (const p of this.players.values()) if (p.mode === "body" && p.role === "guest") p.seat = s.locked ? i++ : -1;
        this.bcast({ type: "seats", locked: s.locked, seats: [...this.players.values()].map((p) => [p.id, p.seat]) }); break; }
      case "kick": this.onkick?.(m.id); break;
      case "config": this.config = m.config; this.bcast({ type: "config", config: m.config }, id); break;
    }
  }
  drop(id) { this.links.delete(id); if (this.players.delete(id)) this.bcast({ type: "left", id }); }
  tick() {
    if (!this.dirty.size) return;
    const p = []; for (const id of this.dirty) { const pl = this.players.get(id); if (pl?.pose) p.push([id, ...pl.pose]); }
    this.dirty.clear(); if (p.length) this.bcast({ type: "s", t: Date.now(), p });
  }
  close() { clearInterval(this.timer); }
}
