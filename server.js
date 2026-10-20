// V-Matrimony backend: REST (bookings, payments, admin) + realtime "domain" room.
// Roles mirror Vircadia assignment clients: domain (join/auth), avatar mixer
// (pose snapshots), message mixer (chat, reactions, cues), entity server (venue config).

const CREDITS_PER_USD = 2000; // 1000 credits = $0.50
const DEPOSIT_PCT = 0.10;
const SANDBOX_SECONDS = 10 * 3600;
const BASE_HOURS = 2;
const PENDING_TTL_MIN = 45;

const DEFAULT_PACKAGES = [
  { id: "diy", name: "Venue Day", tier: "hands-off", usd: 39, capacity: 40, hours: 2,
    blurb: "Your private venue for 2 hours. 10h rehearsal sandbox, host controls, guest links." },
  { id: "hosted", name: "Hosted Ceremony", tier: "hands-on", usd: 149, capacity: 40, hours: 2,
    blurb: "Everything in Venue Day plus a live staff producer, run-of-show call and directed cameras." },
];
const EXTRA_HOUR_USD = 9;
const VENUES = [{ id: "garden", name: "Golden Hour Garden", capacity: 40 }];

export const schema = [
  "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);",
  "CREATE TABLE IF NOT EXISTS admins (username TEXT PRIMARY KEY, user_id TEXT, granted_by TEXT, created_at INTEGER);",
  "CREATE TABLE IF NOT EXISTS blocked_dates (date TEXT PRIMARY KEY, reason TEXT);",
  "CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, user_id TEXT, username TEXT, date TEXT NOT NULL, start_utc INTEGER NOT NULL," +
    " package_id TEXT, venue_id TEXT, couple_names TEXT, extra_hours INTEGER DEFAULT 0, total_credits INTEGER, paid_credits INTEGER DEFAULT 0," +
    " status TEXT DEFAULT 'pending', sandbox_used INTEGER DEFAULT 0, sandbox_last INTEGER DEFAULT 0, force_open INTEGER DEFAULT 0," +
    " waive_balance INTEGER DEFAULT 0, config TEXT, staff_notes TEXT, created_at INTEGER);",
  "CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_per_day ON bookings(date) WHERE status != 'cancelled';",
  "CREATE INDEX IF NOT EXISTS bookings_user ON bookings(user_id);",
  "CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, booking_id TEXT, user_id TEXT, username TEXT, comment_id TEXT UNIQUE," +
    " credits INTEGER, verified INTEGER DEFAULT 0, method TEXT, note TEXT, created_at INTEGER);",
  "CREATE TABLE IF NOT EXISTS guestbook (id INTEGER PRIMARY KEY AUTOINCREMENT, booking_id TEXT, user_id TEXT, username TEXT, message TEXT, created_at INTEGER);",
].join("\n");

const J = (d, s = 200) => Response.json(d, { status: s });
const now = () => Date.now();
const usd2cr = (u) => Math.round(u * CREDITS_PER_USD);

async function getSetting(env, k, dflt) {
  const v = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(k).first("value");
  if (v == null) return dflt;
  try { return JSON.parse(v); } catch { return dflt; }
}
const setSetting = (env, k, v) =>
  env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(k, JSON.stringify(v)).run();

async function pricing(env) {
  const p = await getSetting(env, "pricing", null);
  return p || { packages: DEFAULT_PACKAGES, extraHourUsd: EXTRA_HOUR_USD };
}

function who(req) {
  const h = (k) => req.headers.get(k);
  const userId = h("x-websim-user-id");
  const anon = h("x-websim-user-is-anonymous") === "true";
  return { userId: anon ? null : userId, username: anon ? null : h("x-websim-username"),
    isOwner: !!userId && !anon && userId === h("x-websim-project-owner-id") };
}
async function isAdmin(env, u) {
  if (u.isOwner) return true;
  if (!u.username) return false;
  const r = await env.DB.prepare("SELECT user_id FROM admins WHERE username=?").bind(u.username.toLowerCase()).first();
  if (!r) return false;
  if (!r.user_id) await env.DB.prepare("UPDATE admins SET user_id=? WHERE username=?").bind(u.userId, u.username.toLowerCase()).run();
  return true;
}

function code() {
  const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let s = "VW-";
  for (const x of crypto.getRandomValues(new Uint8Array(6))) s += a[x % a.length];
  return s;
}

function window_(b) {
  const start = b.start_utc, end = start + (BASE_HOURS + (b.extra_hours || 0)) * 3600e3;
  return { start, end, doors: start - 15 * 60e3 };
}
function due(b) { return Math.max(0, b.total_credits - b.paid_credits); }
function publicBooking(b, full) {
  const w = window_(b);
  const o = { id: b.id, couple_names: b.couple_names, date: b.date, start_utc: b.start_utc, end_utc: w.end,
    venue_id: b.venue_id, status: b.status, config: b.config ? JSON.parse(b.config) : null, host: b.username };
  if (full) Object.assign(o, { package_id: b.package_id, extra_hours: b.extra_hours, total_credits: b.total_credits,
    paid_credits: b.paid_credits, due_credits: due(b), deposit_credits: Math.ceil(b.total_credits * DEPOSIT_PCT),
    sandbox_used: b.sandbox_used, sandbox_total: SANDBOX_SECONDS, force_open: b.force_open, waive_balance: b.waive_balance,
    staff_notes: b.staff_notes, user_id: b.user_id });
  return o;
}
function venueState(b, t = now()) {
  if (!b || b.status === "cancelled") return { open: false, reason: "No such event" };
  if (b.status === "pending") return { open: false, reason: "Awaiting deposit" };
  if (b.force_open) return { open: true, endsAt: window_(b).end };
  if (due(b) > 0 && !b.waive_balance) return { open: false, reason: "Balance due before the venue opens" };
  const w = window_(b);
  if (t < w.doors) return { open: false, reason: "Doors open 15 minutes before start", opensAt: w.doors };
  if (t > w.end) return { open: false, reason: "This event has ended" };
  return { open: true, endsAt: w.end };
}

async function cleanupPending(env) {
  await env.DB.prepare("DELETE FROM bookings WHERE status='pending' AND paid_credits=0 AND created_at < ? AND id NOT IN (SELECT booking_id FROM payments)")
    .bind(now() - PENDING_TTL_MIN * 60e3).run();
}
async function recalc(env, id) {
  const paid = await env.DB.prepare("SELECT COALESCE(SUM(credits),0) s FROM payments WHERE booking_id=? AND verified=1").bind(id).first("s");
  const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(id).first();
  if (!b) return null;
  let status = b.status;
  if (status !== "cancelled") status = paid >= Math.ceil(b.total_credits * DEPOSIT_PCT) ? "confirmed" : "pending";
  await env.DB.prepare("UPDATE bookings SET paid_credits=?, status=? WHERE id=?").bind(paid, status, id).run();
  bookingCache.delete(id);
  return { ...b, paid_credits: paid, status };
}

// Look tip comments up on websim's public comments API.
async function fetchTips(env, userId) {
  const pid = await getSetting(env, "project_id", null);
  if (!pid) return { error: "Project id unknown - open the page once as the owner" };
  for (const host of ["https://websim.com", "https://api.websim.com"]) {
    try {
      const r = await fetch(host + "/api/v1/projects/" + pid + "/comments?only_tips=true&first=100" + (userId ? "&author_id=" + userId : ""));
      if (!r.ok) { console.warn("tips fetch", host, r.status); continue; }
      const d = await r.json();
      return { list: (d.comments?.data || []).map((x) => x.comment) };
    } catch (e) { console.warn("tips fetch failed", host, String(e)); }
  }
  return { error: "Comments API unreachable" };
}
async function recordTip(env, c) {
  const mm = /VW-[A-Z0-9]{6}/.exec(c.raw_content || "");
  const credits = c.card_data?.credits_spent || 0;
  if (!mm || !credits) return null;
  const b = await env.DB.prepare("SELECT id FROM bookings WHERE id=?").bind(mm[0]).first();
  if (!b) return null;
  await env.DB.prepare("INSERT INTO payments(booking_id,user_id,username,comment_id,credits,verified,method,created_at) VALUES(?,?,?,?,?,1,'tip',?)" +
    " ON CONFLICT(comment_id) DO UPDATE SET verified=1, credits=excluded.credits, booking_id=excluded.booking_id")
    .bind(b.id, c.author?.id || null, c.author?.username || null, c.id, credits, now()).run();
  return recalc(env, b.id);
}

async function api(req, env) {
  const url = new URL(req.url), p = url.pathname, m = req.method;
  const u = who(req);
  const body = m === "GET" ? {} : await req.json().catch(() => ({}));
  const seg = p.split("/").filter(Boolean);

  if (p === "/api/config" && m === "GET") {
    await cleanupPending(env);
    const pr = await pricing(env);
    const from = new Date(now() - 86400e3).toISOString().slice(0, 10);
    const taken = (await env.DB.prepare("SELECT date FROM bookings WHERE status!='cancelled' AND date>=?").bind(from).all()).results.map((r) => r.date);
    const blocked = (await env.DB.prepare("SELECT date FROM blocked_dates WHERE date>=?").bind(from).all()).results.map((r) => r.date);
    return J({ packages: pr.packages.map((x) => ({ ...x, credits: usd2cr(x.usd) })), extraHourUsd: pr.extraHourUsd, extraHourCredits: usd2cr(pr.extraHourUsd),
      creditsPerUsd: CREDITS_PER_USD, depositPct: DEPOSIT_PCT, sandboxSeconds: SANDBOX_SECONDS, baseHours: BASE_HOURS,
      venues: VENUES, taken, blocked, me: { ...u, isAdmin: await isAdmin(env, u) } });
  }

  if (p === "/api/me" && m === "POST") {
    if (u.isOwner && typeof body.project_id === "string" && body.project_id.length < 80) await setSetting(env, "project_id", body.project_id);
    return J({ ...u, isAdmin: await isAdmin(env, u) });
  }

  // ---- bookings ----
  if (p === "/api/bookings" && m === "POST") {
    if (!u.userId) return J({ error: "Sign in to book" }, 401);
    const pr = await pricing(env);
    const pkg = pr.packages.find((x) => x.id === body.package_id);
    if (!pkg) return J({ error: "Pick a package" }, 400);
    const date = String(body.date || "");
    const start = Number(body.start_utc);
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) || !Number.isFinite(start)) return J({ error: "Pick a date and time" }, 400);
    if (start < now() + 24 * 3600e3) return J({ error: "Book at least 24 hours ahead" }, 400);
    const extra = Math.max(0, Math.min(6, Math.floor(Number(body.extra_hours) || 0)));
    const names = String(body.couple_names || "").trim().slice(0, 60);
    if (!names) return J({ error: "Add the couple's names" }, 400);
    if (await env.DB.prepare("SELECT 1 FROM blocked_dates WHERE date=?").bind(date).first()) return J({ error: "That date is unavailable" }, 409);
    await cleanupPending(env);
    const total = usd2cr(pkg.usd + extra * pr.extraHourUsd);
    const id = code();
    try {
      await env.DB.prepare("INSERT INTO bookings(id,user_id,username,date,start_utc,package_id,venue_id,couple_names,extra_hours,total_credits,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'pending',?)")
        .bind(id, u.userId, u.username, date, start, pkg.id, "garden", names, extra, total, now()).run();
    } catch (e) { return J({ error: "Sorry - that day was just taken" }, 409); }
    const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(id).first();
    return J({ booking: publicBooking(b, true) });
  }

  if (p === "/api/bookings/mine" && m === "GET") {
    if (!u.userId) return J({ bookings: [] });
    const { results } = await env.DB.prepare("SELECT * FROM bookings WHERE user_id=? AND status!='cancelled' ORDER BY start_utc").bind(u.userId).all();
    return J({ bookings: results.map((b) => ({ ...publicBooking(b, true), venue: venueState(b) })) });
  }

  if (seg[1] === "bookings" && seg[2] && !seg[3] && m === "GET") {
    const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(seg[2].toUpperCase()).first();
    if (!b) return J({ error: "Event not found" }, 404);
    const mine = !!u.userId && u.userId === b.user_id;
    const adm = await isAdmin(env, u);
    return J({ booking: publicBooking(b, mine || adm), venue: venueState(b), role: mine ? "host" : adm ? "staff" : "guest" });
  }

  if (seg[1] === "bookings" && seg[3] === "config" && m === "POST") {
    const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(seg[2]).first();
    if (!b || (b.user_id !== u.userId && !(await isAdmin(env, u)))) return J({ error: "Not allowed" }, 403);
    const cfg = JSON.stringify(body.config || {});
    if (cfg.length > 8000) return J({ error: "Config too large" }, 400);
    await env.DB.prepare("UPDATE bookings SET config=? WHERE id=?").bind(cfg, b.id).run();
    bookingCache.delete(b.id);
    return J({ ok: true });
  }

  // ---- payments (tip comments) ----
  if (p === "/api/payments/claim" && m === "POST") {
    if (!u.userId) return J({ error: "Sign in" }, 401);
    const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(String(body.booking_id || "")).first();
    if (!b) return J({ error: "No such booking" }, 404);
    const cid = String(body.comment_id || "");
    if (!cid) return J({ error: "Missing comment" }, 400);
    const f = await fetchTips(env, u.userId);
    const c = f.list?.find((x) => x.id === cid);
    if (c) {
      const rb = await recordTip(env, c);
      if (rb) return J({ verified: true, booking: publicBooking(rb, true) });
    }
    const claimed = Math.max(0, Math.floor(Number(body.credits) || 0));
    await env.DB.prepare("INSERT OR IGNORE INTO payments(booking_id,user_id,username,comment_id,credits,verified,method,note,created_at) VALUES(?,?,?,?,?,0,'tip',?,?)")
      .bind(b.id, u.userId, u.username, cid, claimed, f.error || "not visible yet", now()).run();
    return J({ verified: false, message: "Payment received - it will be confirmed shortly." });
  }

  if (p === "/api/payments/sync" && m === "POST") {
    if (!u.userId) return J({ error: "Sign in" }, 401);
    const f = await fetchTips(env, u.userId);
    if (f.error) return J({ error: f.error });
    let n = 0;
    for (const c of f.list.slice(0, 30)) if (/VW-[A-Z0-9]{6}/.test(c.raw_content || "") && (await recordTip(env, c))) n++;
    const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(String(body.booking_id || "")).first();
    return J({ matched: n, booking: b && b.user_id === u.userId ? publicBooking(b, true) : null });
  }

  // ---- sandbox metering ----
  if (p === "/api/sandbox/tick" && m === "POST") {
    const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(String(body.booking_id || "")).first();
    if (!b || (b.user_id !== u.userId && !(await isAdmin(env, u)))) return J({ error: "Not your booking" }, 403);
    if (b.status !== "confirmed") return J({ error: "Pay the deposit to unlock the sandbox" }, 402);
    const t = now();
    const add = b.sandbox_last && t - b.sandbox_last < 120e3 ? Math.min(120, Math.round((t - b.sandbox_last) / 1000)) : 0;
    const used = Math.min(SANDBOX_SECONDS, b.sandbox_used + add);
    await env.DB.prepare("UPDATE bookings SET sandbox_used=?, sandbox_last=? WHERE id=?").bind(used, body.stop ? 0 : t, b.id).run();
    return J({ used, total: SANDBOX_SECONDS, remaining: SANDBOX_SECONDS - used });
  }

  // ---- guestbook ----
  if (seg[1] === "guestbook" && seg[2]) {
    const id = seg[2];
    if (m === "GET") {
      const { results } = await env.DB.prepare("SELECT username,message,created_at FROM guestbook WHERE booking_id=? ORDER BY id DESC LIMIT 200").bind(id).all();
      return J({ entries: results });
    }
    if (m === "POST") {
      if (!u.userId) return J({ error: "Sign in to sign the guestbook" }, 401);
      const msg = String(body.message || "").trim().slice(0, 400);
      if (!msg) return J({ error: "Write something sweet" }, 400);
      await env.DB.prepare("INSERT INTO guestbook(booking_id,user_id,username,message,created_at) VALUES(?,?,?,?,?)").bind(id, u.userId, u.username, msg, now()).run();
      return J({ ok: true });
    }
  }

  // ---- admin ----
  if (seg[1] === "admin") {
    if (!(await isAdmin(env, u))) return J({ error: "Admins only" }, 403);
    const a = seg[2];
    if (a === "overview" && m === "GET") {
      const bookings = (await env.DB.prepare("SELECT * FROM bookings WHERE start_utc > ? ORDER BY start_utc LIMIT 300").bind(now() - 30 * 86400e3).all()).results;
      const payments = (await env.DB.prepare("SELECT * FROM payments ORDER BY id DESC LIMIT 200").all()).results;
      const blocked = (await env.DB.prepare("SELECT * FROM blocked_dates ORDER BY date").all()).results;
      const admins = (await env.DB.prepare("SELECT username,granted_by,created_at FROM admins ORDER BY created_at").all()).results;
      return J({ bookings: bookings.map((b) => ({ ...publicBooking(b, true), venue: venueState(b) })), payments, blocked, admins,
        pricing: await pricing(env), projectId: await getSetting(env, "project_id", null), live: liveSummary(), me: u });
    }
    if (a === "booking" && seg[3] && m === "POST") {
      const id = seg[3];
      const f = [], v = [];
      for (const k of ["status", "extra_hours", "force_open", "waive_balance", "staff_notes", "couple_names", "start_utc", "date"]) {
        if (body[k] !== undefined) { f.push(k + "=?"); v.push(body[k]); }
      }
      if (f.length) {
        try { await env.DB.prepare("UPDATE bookings SET " + f.join(",") + " WHERE id=?").bind(...v, id).run(); }
        catch (e) { return J({ error: "Date conflict" }, 409); }
      }
      if (body.extra_hours !== undefined) {
        const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(id).first();
        const pr = await pricing(env); const pkg = pr.packages.find((x) => x.id === b.package_id) || pr.packages[0];
        await env.DB.prepare("UPDATE bookings SET total_credits=? WHERE id=?").bind(usd2cr(pkg.usd + b.extra_hours * pr.extraHourUsd), id).run();
      }
      bookingCache.delete(id);
      if (body.status !== "cancelled") await recalc(env, id);
      return J({ ok: true });
    }
    if (a === "payment" && m === "POST") {
      if (body.verify_id) {
        await env.DB.prepare("UPDATE payments SET verified=?, credits=COALESCE(?,credits) WHERE id=?").bind(body.reject ? -1 : 1, body.credits ?? null, body.verify_id).run();
        const pmt = await env.DB.prepare("SELECT booking_id FROM payments WHERE id=?").bind(body.verify_id).first();
        if (pmt) await recalc(env, pmt.booking_id);
        return J({ ok: true });
      }
      const credits = Math.floor(Number(body.credits) || 0);
      if (!body.booking_id || !credits) return J({ error: "booking_id and credits required" }, 400);
      await env.DB.prepare("INSERT INTO payments(booking_id,user_id,username,comment_id,credits,verified,method,note,created_at) VALUES(?,?,?,?,?,1,'manual',?,?)")
        .bind(body.booking_id, u.userId, u.username, "manual-" + now(), credits, String(body.note || "").slice(0, 200), now()).run();
      await recalc(env, body.booking_id);
      return J({ ok: true });
    }
    if (a === "sync-tips" && m === "POST") {
      const f = await fetchTips(env, null);
      if (f.error) return J({ error: f.error });
      let n = 0;
      for (const c of f.list.slice(0, 40)) if (await recordTip(env, c)) n++;
      return J({ matched: n, scanned: f.list.length });
    }
    if (a === "block") {
      if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(body.date))) return J({ error: "date required" }, 400);
      if (m === "POST") await env.DB.prepare("INSERT OR REPLACE INTO blocked_dates(date,reason) VALUES(?,?)").bind(body.date, String(body.reason || "").slice(0, 100)).run();
      if (m === "DELETE") await env.DB.prepare("DELETE FROM blocked_dates WHERE date=?").bind(body.date).run();
      return J({ ok: true });
    }
    if (a === "pricing" && m === "POST") {
      const pk = (body.packages || []).slice(0, 8).map((x) => ({ id: String(x.id).slice(0, 20), name: String(x.name).slice(0, 40), tier: x.tier === "hands-on" ? "hands-on" : "hands-off",
        usd: Math.max(0, Number(x.usd) || 0), capacity: Math.min(40, Math.max(2, Number(x.capacity) || 40)), hours: BASE_HOURS, blurb: String(x.blurb || "").slice(0, 200) }));
      if (!pk.length) return J({ error: "Need at least one package" }, 400);
      await setSetting(env, "pricing", { packages: pk, extraHourUsd: Math.max(0, Number(body.extraHourUsd) || 0) });
      return J({ ok: true });
    }
    if (a === "admins") {
      const name = String(body.username || "").replace(/^@/, "").trim().toLowerCase();
      if (!name) return J({ error: "username required" }, 400);
      if (m === "POST") await env.DB.prepare("INSERT OR IGNORE INTO admins(username,granted_by,created_at) VALUES(?,?,?)").bind(name, u.username, now()).run();
      if (m === "DELETE") await env.DB.prepare("DELETE FROM admins WHERE username=?").bind(name).run();
      return J({ ok: true });
    }
  }
  return J({ error: "Not found" }, 404);
}

export default {
  async fetch(req, env) {
    try { return await api(req, env); }
    catch (e) { console.error(e?.stack || e); return J({ error: String(e?.message || e) }, 500); }
  },
};

// ======================= Realtime domain =======================
// One websim room, multiplexed by event code. Hot state in memory only.
const bookingCache = new Map(); // id -> {b, at}
const players = new Map(); // conn.id -> player
const conns = new Map();
const events = new Map(); // eventId -> { cue, shot, screen, locked, dirty:Set }
const CAPACITY = 40;

async function loadBooking(env, id) {
  const c = bookingCache.get(id);
  if (c && now() - c.at < 30e3) return c.b;
  const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=?").bind(id).first();
  bookingCache.set(id, { b, at: now() });
  return b;
}
async function adminConn(env, conn) {
  if (conn.isOwner) return true;
  if (!conn.username) return false;
  return !!(await env.DB.prepare("SELECT 1 FROM admins WHERE username=?").bind(conn.username.toLowerCase()).first());
}
function liveSummary() {
  const o = {};
  for (const p of players.values()) { o[p.ev] = o[p.ev] || { bodies: 0, spectators: 0 }; o[p.ev][p.mode === "body" ? "bodies" : "spectators"]++; }
  return o;
}
function evState(id) {
  let e = events.get(id);
  if (!e) { e = { cue: null, shot: null, screen: null, locked: false, dirty: new Set() }; events.set(id, e); }
  return e;
}
function inEvent(id) { const o = []; for (const p of players.values()) if (p.ev === id) o.push(p); return o; }
function sendEv(id, msg, except) {
  const s = JSON.stringify(msg);
  for (const p of players.values()) if (p.ev === id && p.id !== except) conns.get(p.id)?.send(s);
}
const ident = (p) => ({ id: p.id, name: p.name, mode: p.mode, device: p.device, look: p.look, role: p.role, seat: p.seat, face: p.face || null });
const LOOKS = 10;
const PLACES = ["ceremony", "cocktail", "reception", "dance", "cake"];
const q = (n) => Math.round(n * 100) / 100;

export const room = {
  tickMs: 100,
  async onConnect(conn) { conns.set(conn.id, conn); },
  async onMessage(conn, raw, room, env) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    let me = players.get(conn.id);
    if (m.type === "join") {
      const ev = String(m.event || "").toUpperCase().slice(0, 12);
      const b = await loadBooking(env, ev);
      const isHost = !!conn.userId && b?.user_id === conn.userId;
      const isStaff = await adminConn(env, conn);
      const st = venueState(b);
      if (!b) return conn.send({ type: "denied", reason: "Event not found" });
      if (!st.open && !isStaff) return conn.send({ type: "denied", reason: st.reason, opensAt: st.opensAt });
      if (inEvent(ev).length >= CAPACITY && !isHost && !isStaff) return conn.send({ type: "denied", reason: "The venue is full (40 guests)" });
      const name = room.censor(String(m.name || conn.username || "Guest")).slice(0, 24).trim() || "Guest";
      me = { id: conn.id, ev, name, mode: m.mode === "body" ? "body" : "spectator", device: String(m.device || "desktop").slice(0, 10),
        look: Math.abs(m.look | 0) % LOOKS, face: (typeof m.face === "string" && /^https:[/][/]/.test(m.face) ? m.face.slice(0, 400) : null), role: isHost ? "host" : isStaff ? "staff" : "guest", seat: -1, pose: null };
      players.set(conn.id, me);
      const e = evState(ev);
      conn.send({ type: "welcome", id: conn.id, role: me.role, players: inEvent(ev).map(ident),
        poses: inEvent(ev).filter((p) => p.pose).map((p) => [p.id, ...p.pose]),
        state: { cue: e.cue, shot: e.shot, screen: e.screen, locked: e.locked },
        config: b.config ? JSON.parse(b.config) : null, endsAt: st.endsAt || window_(b).end });
      sendEv(ev, { type: "join", player: ident(me) }, conn.id);
      return;
    }
    if (!me) return;
    const e = evState(me.ev);
    const staff = me.role === "host" || me.role === "staff";
    switch (m.type) {
      case "p": { // [x,y,z,yaw,pitch,flags, (vr) hx,hy,hz, lx,ly,lz, rx,ry,rz]
        if (me.mode !== "body" || !Array.isArray(m.v) || m.v.length > 15) return;
        const v = m.v.map((n) => (Number.isFinite(+n) ? q(+n) : 0));
        if (Math.abs(v[0]) > 80 || Math.abs(v[2]) > 80 || v[1] < -2 || v[1] > 20) return;
        me.pose = v; e.dirty.add(me.id); return;
      }
      case "mode":
        me.mode = m.mode === "body" ? "body" : "spectator"; if (me.mode !== "body") me.pose = null;
        sendEv(me.ev, { type: "ident", player: ident(me) }); return;
      case "look":
        me.look = Math.abs(m.look | 0) % LOOKS; me.face = (typeof m.face === "string" && /^https:[/][/]/.test(m.face) ? m.face.slice(0, 400) : null);
        sendEv(me.ev, { type: "ident", player: ident(me) }); return;
      case "chat": {
        const text = room.censor(String(m.text || "")).slice(0, 200).trim();
        if (text) sendEv(me.ev, { type: "chat", from: me.name, role: me.role, text }); return;
      }
      case "react": {
        const r = ["heart", "clap", "tears", "cheers", "ring"].includes(m.r) ? m.r : "heart";
        sendEv(me.ev, { type: "react", id: me.id, r }); return;
      }
      case "gb":
        sendEv(me.ev, { type: "gb", entry: { username: me.name, message: room.censor(String(m.message || "")).slice(0, 400) } }); return;
    }
    if (!staff) return;
    switch (m.type) {
      case "gather": if (PLACES.includes(m.place)) sendEv(me.ev, { type: "gather", place: m.place, by: me.name }); break;
      case "cue": e.cue = { name: String(m.name).slice(0, 20), at: now() }; sendEv(me.ev, { type: "cue", cue: e.cue, by: me.name }); break;
      case "shot": e.shot = m.shot == null ? null : String(m.shot).slice(0, 20); sendEv(me.ev, { type: "shot", shot: e.shot }); break;
      case "screen": e.screen = m.url ? String(m.url).slice(0, 500) : null; sendEv(me.ev, { type: "screen", url: e.screen }); break;
      case "seat": {
        e.locked = !!m.locked;
        let i = 0;
        for (const p of inEvent(me.ev)) if (p.mode === "body" && p.role === "guest") p.seat = e.locked ? i++ : -1;
        sendEv(me.ev, { type: "seats", locked: e.locked, seats: inEvent(me.ev).map((p) => [p.id, p.seat]) }); break;
      }
      case "kick": {
        const t = players.get(m.id);
        if (t && t.ev === me.ev && t.role === "guest") conns.get(t.id)?.close(4003, "Removed by the host");
        break;
      }
      case "config": sendEv(me.ev, { type: "config", config: m.config }, conn.id); break;
    }
  },
  async onTick() {
    for (const [id, e] of events) {
      if (!e.dirty.size) continue;
      const poses = [];
      for (const pid of e.dirty) { const p = players.get(pid); if (p?.pose) poses.push([pid, ...p.pose]); }
      e.dirty.clear();
      if (poses.length) sendEv(id, { type: "s", t: now(), p: poses });
    }
  },
  async onClose(conn) {
    const p = players.get(conn.id);
    players.delete(conn.id); conns.delete(conn.id);
    if (p) { sendEv(p.ev, { type: "left", id: conn.id }); if (!inEvent(p.ev).length) events.delete(p.ev); }
  },
};
