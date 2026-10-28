// V-Matrimony desktop link — Vircadia Interface client script.
// Attend a Websim-hosted venue from the native desktop app with no bridge:
// Edit > Running Scripts > From URL, then paste
//   <this script URL>?site=<link.html URL>&e=VW-XXXXXX[&assets=<published avatar folder>]
// The script opens link.html in a hidden web view that joins the Websim room as
// you. Websim guests appear as local (only-you-see-them) animated figures; your
// avatar's position and chat go to the Websim room. When the event is already
// bridged into this domain the link stays passive to avoid duplicate people.
(function () {
    "use strict";
    var params = {};
    (Script.resolvePath("").split("?")[1] || "").split("&").forEach(function (kv) {
        var p = kv.split("="); if (p[0]) params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
    });
    var SITE = params.site, EVENT = (params.e || "").toUpperCase();
    var ASSETS = params.assets || SITE.replace(/[^\/]*(\?.*)?$/, "") + "assets/native/";
    var LOOKS = ["Business_Female_01", "Business_Male_01", "Business_Female_02", "Business_Male_02", "Female_Party_02",
        "Business_Male_03", "Business_Female_03", "Business_Male_05", "Business_Female_04", "Business_Male_06"];
    var CLIPMODE = params.clipmode || "clip"; // diagnostics: none (no overrides) | rest | clip (skinned FBX) | flip (pose frames, the default)
    var HIPS = 0.885, FACE_OFFSET = Number(params.face || 180), POSE_FACE = Number(params.pface || 0); // pose frames face -Z like a Vircadia avatar at yaw 0 (the skinned FBX faces +Z, hence its 180)
    // baked joint clips (clip-<outfit>.json: idle / walk / sit) from the same retargeting the bridge uses
    var clips = {}, avatarRest = null;
    // avatar rest rotations per outfit/joint (the clips are relative to these)
    (function () { var r = new XMLHttpRequest(); r.open("GET", ASSETS + "native-joints.json"); r.onreadystatechange = function () { if (r.readyState === 4 && r.status === 200) { try { var d = JSON.parse(r.responseText); avatarRest = {}; Object.keys(d).forEach(function (id) { avatarRest[id] = {}; d[id].forEach(function (j) { avatarRest[id][j[0]] = { x: j[2][0], y: j[2][1], z: j[2][2], w: j[2][3] }; }); }); } catch (e) {} } }; r.send(); })();
    function loadClip(look) {
        var id = LOOKS[look % LOOKS.length];
        if (clips[id]) return;
        clips[id] = "loading";
        var req = new XMLHttpRequest(); req.open("GET", ASSETS + "clip-" + id + ".json");
        req.onreadystatechange = function () { if (req.readyState === 4) { try { clips[id] = req.status === 200 ? JSON.parse(req.responseText).clips : null; } catch (e) { clips[id] = null; } } };
        req.send();
    }
    // baked pose flipbooks (poses.json: static GLB frames per outfit, H5). Interface renders a skinned model
    // entity on its side, so when these exist a figure is one hidden static entity per frame and
    // only the current frame is shown. clipmode=clip keeps the old joint-override path.
    var poses = null;
    (function () { var r = new XMLHttpRequest(); r.open("GET", ASSETS + "poses.json"); r.onreadystatechange = function () { if (r.readyState === 4 && r.status === 200) { try { poses = JSON.parse(r.responseText); } catch (e) {} } }; r.send(); })();
    var FLIP = CLIPMODE === "clip" && !params.clipmode ? true : CLIPMODE === "flip";
    function flipbook(f, look) {
        var set = poses && poses[LOOKS[look % LOOKS.length]]; if (!set) return false;
        f.frames = { idle: [], walk: [], sit: [] };
        set.clips.forEach(function (c) {
            var d = c.dimensions, id = Entities.addEntity({ type: "Model", name: "Websim guest frame", modelURL: ASSETS + c.file,
                dimensions: { x: d.x, y: d.y, z: d.z }, position: Vec3.sum(MyAvatar.position, { x: 0, y: -50, z: 0 }),
                collisionless: true, grab: { grabbable: false }, visible: false }, "local");
            (f.frames[c.clip] || (f.frames[c.clip] = [])).push({ id: id, c: c.center || [0, d.y / 2, 0] });
        });
        f.shown = null; return true;
    }
    if (!SITE || !/^VW-[A-Z0-9]{6}$/.test(EVENT)) {
        Window.alert("V-Matrimony link needs ?site=<link page>&e=VW-XXXXXX in the script URL.");
        return;
    }
    var view = new OverlayWebWindow({ title: "V-Matrimony link", source: SITE + (SITE.indexOf("?") < 0 ? "?" : "&") + "native=1", width: 420, height: 260, visible: params.show === "1" });
    var people = {}, me = null, bridged = false, ready = false, lastSent = 0, lastKey = "";

    function send(m) { view.emitScriptEvent(JSON.stringify(m)); }
    function lookIndex() {
        var url = String(MyAvatar.skeletonModelURL);
        for (var i = 0; i < LOOKS.length; i++) if (url.indexOf(LOOKS[i] + ".") >= 0) return i;
        return 0;
    }
    function yawOf(q) { return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z)); }
    function join() {
        send({ type: "link-join", event: EVENT, name: MyAvatar.sessionDisplayName || MyAvatar.displayName || "Desktop guest",
            look: lookIndex(), mode: bridged ? "spectator" : "body" });
    }

    // ---- Websim guests as local animated figures ----
    function figure(p) {
        if (bridged || p.id === me || p.mode !== "body" || p.role === "native") return remove(p.id);
        var f = people[p.id];
        if (f && f.look === p.look && f.name === p.name) return;
        remove(p.id);
        f = people[p.id] = { role: p.role, look: p.look, name: p.name, buf: [], anim: "idle", sized: false, map: null, t0: Date.now() };
        loadClip(p.look);
        if (FLIP && flipbook(f, p.look)) {
            f.model = f.frames.idle[0].id;
            f.tag = Entities.addEntity({ type: "Text", text: p.name, lineHeight: 0.09, dimensions: { x: 0.8, y: 0.14, z: 0.01 },
                position: Vec3.sum(MyAvatar.position, { x: 0, y: -50, z: 0 }), billboardMode: "full", backgroundAlpha: 0.35,
                textColor: { red: 255, green: 250, blue: 240 }, unlit: true, collisionless: true }, "local");
            return;
        }
        f.model = Entities.addEntity({ type: "Model", name: "Websim guest " + p.name, modelURL: ASSETS + LOOKS[p.look % LOOKS.length] + ".fbx",
            position: Vec3.sum(MyAvatar.position, { x: 0, y: -50, z: 0 }), collisionless: true, grab: { grabbable: false }, visible: false }, "local");
        f.tag = Entities.addEntity({ type: "Text", parentID: f.model, text: p.name, lineHeight: 0.09, dimensions: { x: 0.8, y: 0.14, z: 0.01 },
            localPosition: { x: 0, y: 1.05, z: 0 }, billboardMode: "full", backgroundAlpha: 0.35, textColor: { red: 255, green: 250, blue: 240 },
            unlit: true, collisionless: true }, "local");
    }
    // ---- held props (the web venue's held.js, approximated): the figures are static pose frames, so a prop
    // is a local entity kept at the figure's right hand (bouquet: in front of the waist) ----
    var SITE_BASE = SITE.replace(/[^\/]*(\?.*)?$/, "");
    var PROP_URL = { flute: "champagne_flute", sparkler: "sparkler", bouquet: "bouquet_round" };
    var PROP_AT = { flute: { x: 0.24, y: 1.08, z: -0.22 }, sparkler: { x: 0.26, y: 1.25, z: -0.2 }, bouquet: { x: 0.0, y: 0.95, z: -0.24 } };
    function holdProp(f, kind, ms) {
        dropProp(f);
        f.prop = { kind: kind, until: ms ? Date.now() + ms : 0, id: Entities.addEntity({ type: "Model", name: "Websim guest prop", modelURL: SITE_BASE + "assets/props/hand/" + PROP_URL[kind] + ".glb",
            position: Vec3.sum(MyAvatar.position, { x: 0, y: -50, z: 0 }), collisionless: true, grab: { grabbable: false } }, "local") };
    }
    function dropProp(f) { if (f && f.prop) { Entities.deleteEntity(f.prop.id); f.prop = null; } }
    function propsCue(name) {
        Object.keys(people).forEach(function (id) {
            var f = people[id], bride = f.role === "host" && /Female/.test(LOOKS[f.look % LOOKS.length]);
            if (name === "toast") holdProp(f, "flute", 14000);
            else if (name === "sparklers") holdProp(f, "sparkler", 12000);
            else if (name === "processional" && bride) holdProp(f, "bouquet", 0);
            else if (name === "bouquet" && f.prop && f.prop.kind === "bouquet") dropProp(f);
        });
        // couple poses (H26 frames, used when poses.json has them): hosts' figures kneel / join hands / kiss
        var COUPLE = { blessing: ["kneel", 10000], rings: ["handsjoin", 30000], kiss: ["kiss", 5200] };
        Object.keys(people).forEach(function (id) {
            var f = people[id]; if (f.role !== "host" || !f.frames) return;
            var c = COUPLE[name];
            if (c && f.frames[c[0]] && f.frames[c[0]].length) f.pose = { clip: c[0], until: Date.now() + c[1], from: name === "rings" ? Date.now() + 3600 : 0 };
            else if (name !== "rings") f.pose = null;
        });
        print("VMAT_LINK props " + JSON.stringify({ cue: name, holding: Object.keys(people).filter(function (id) { return people[id].prop; }).length }));
    }
    // ---- music: the room's song played with Interface audio (the hidden web view can't autoplay).
    // Files only (.wav/.mp3/.ogg; endless radio streams can't be preloaded); &music=0..1 sets the volume ----
    var MUSIC_VOL = params.music !== undefined ? Math.max(0, Math.min(1, Number(params.music) || 0)) : 0.6;
    var song = null; // { url, sound, injector, startedAt, pos }
    function stopSong() { if (song && song.injector) song.injector.stop(); song = null; }
    function playSong(st, received) {
        if (!st || !st.url || !st.playing || MUSIC_VOL <= 0) { stopSong(); if (st && st.url && !st.playing) print("VMAT_LINK music paused"); return; }
        if (song && song.url === st.url && song.injector && song.injector.playing) return;
        stopSong();
        var s = { url: st.url, sound: SoundCache.getSound(st.url) }; song = s;
        var start = function () {
            if (song !== s) return;
            var offset = (st.pos || 0) + (Date.now() - received) / 1000;
            s.injector = Audio.playSound(s.sound, { localOnly: true, volume: MUSIC_VOL, position: MyAvatar.position, secondOffset: Math.max(0, offset) });
            print("VMAT_LINK music native playing " + JSON.stringify({ url: st.url, offset: Math.round(offset * 10) / 10 }));
        };
        if (s.sound.downloaded) start(); else s.sound.ready.connect(start);
    }
    // keep the (non-positional) song at the listener
    Script.setInterval(function () { if (song && song.injector && song.injector.playing) song.injector.setOptions({ position: MyAvatar.position, volume: MUSIC_VOL }); }, 500);

    function remove(id) {
        var f = people[id]; if (!f) return;
        Entities.deleteEntity(f.tag); dropProp(f);
        if (f.frames) Object.keys(f.frames).forEach(function (k) { f.frames[k].forEach(function (fr) { Entities.deleteEntity(fr.id); }); });
        else Entities.deleteEntity(f.model);
        delete people[id];
    }
    function clear() { Object.keys(people).forEach(remove); }

    function roomMessage(m) {
        switch (m.type) {
            case "welcome":
                me = m.id; clear();
                bridged = !!(m.link && m.link.mode === "bridged");
                if (bridged && m.role !== "bridge") print("VMAT_LINK bridged event: passive mode");
                m.players.forEach(figure);
                playSong(m.state && m.state.music, Date.now());
                (m.poses || []).forEach(function (v) { var f = people[v[0]]; if (f) f.buf.push({ t: Date.now(), v: v.slice(1) }); });
                print("VMAT_LINK welcome " + JSON.stringify({ id: me, players: m.players.length, link: m.link }));
                break;
            case "link":
                var was = bridged; bridged = m.link.mode === "bridged";
                if (was !== bridged) join();
                break;
            case "join": case "ident": figure(m.player); break;
            case "cue": propsCue(m.cue && m.cue.name); break;
            case "music": playSong(m.music, Date.now()); break;
            case "left": remove(m.id); break;
            case "s":
                m.p.forEach(function (v) { var f = people[v[0]]; if (f) { f.buf.push({ t: Date.now(), v: v.slice(1) }); if (f.buf.length > 8) f.buf.shift(); } });
                break;
            case "chat":
                if (m.role === "native" && bridged) break;
                Messages.sendLocalMessage("Chat", JSON.stringify({ type: "TransmitChatMessage", avatarID: null, displayName: m.from + " (Websim)", message: m.text, position: MyAvatar.position, channel: "Domain" }));
                print("VMAT_LINK chat " + m.from + ": " + m.text);
                break;
            case "denied": Window.displayAnnouncement("V-Matrimony: " + m.reason); break;
        }
    }
    view.webEventReceived.connect(function (text) {
        var m; try { m = JSON.parse(text); } catch (e) { return; }
        if (m.type === "link-ready") { ready = true; join(); }
        else if (m.type === "room") roomMessage(m.m);
        else if (m.type === "link-closed") { me = null; clear(); }
        else if (m.type === "link-error") print("VMAT_LINK error " + m.reason);
        else if (m.type === "link-music") print("VMAT_LINK music " + (m.blocked ? "blocked by the web view's autoplay policy" : "playing"));
    });

    // ---- my chat to Websim ----
    Messages.subscribe("Chat");
    Messages.messageReceived.connect(function (ch, text, sender) {
        if (ch !== "Chat" || sender !== MyAvatar.sessionUUID || bridged) return;
        var m; try { m = JSON.parse(text); } catch (e) { return; }
        if (m.type === "TransmitChatMessage" && m.message) send({ type: "room", room: { type: "chat", text: String(m.message).slice(0, 200) } });
    });

    // ---- per-frame: my pose out, Websim figures in ----
    var update = function (dt) {
        var now = Date.now();
        if (ready && me && !bridged && now - lastSent > 100) {
            var p = MyAvatar.position, v = [p.x, p.y - HIPS, p.z, yawOf(MyAvatar.orientation), 0, 0].map(function (n) { return Math.round(n * 100) / 100; });
            var key = v.join(",");
            if (key !== lastKey || now - lastSent > 2000) { send({ type: "room", room: { type: "p", v: v } }); lastKey = key; }
            lastSent = now;
        }
        Object.keys(people).forEach(function (id) {
            var f = people[id], b = f.buf; if (!b.length) return;
            var t = now - 150, a = b[0], c = b[b.length - 1];
            for (var i = 0; i < b.length - 1; i++) if (b[i].t <= t && b[i + 1].t >= t) { a = b[i]; c = b[i + 1]; break; }
            var k = c.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (c.t - a.t))) : 1;
            var x = a.v[0] + (c.v[0] - a.v[0]) * k, y = a.v[1] + (c.v[1] - a.v[1]) * k, z = a.v[2] + (c.v[2] - a.v[2]) * k;
            var speed = Math.sqrt(Math.pow(c.v[0] - a.v[0], 2) + Math.pow(c.v[2] - a.v[2], 2)) / Math.max(0.05, (c.t - a.t) / 1000);
            if (f.frames) {
                var a2 = (c.v[5] & 1) ? "sit" : speed > 0.35 && now - c.t < 600 ? "walk" : "idle";
                if (a2 !== f.anim) { f.anim = a2; f.t0 = now; }
                var list = f.frames[f.anim] && f.frames[f.anim].length ? f.frames[f.anim] : f.frames.idle;
                if (f.pose) { if (now > f.pose.until) f.pose = null; else if (f.anim !== "walk" && now >= f.pose.from) list = f.frames[f.pose.clip]; }
                // walk: 8 frames per cycle at the guest's speed (about 1.1 s per cycle at 1.35 m/s)
                var cyc = 1.1 / Math.min(1.7, Math.max(0.6, speed / 1.35));
                var fr = list[f.anim === "walk" ? Math.floor(((now - f.t0) / 1000 / cyc) * list.length) % list.length : 0];
                var yaw = c.v[3] * 180 / Math.PI + POSE_FACE, rot = Quat.fromPitchYawRollDegrees(0, yaw, 0);
                var off = Vec3.multiplyQbyV(rot, { x: fr.c[0], y: fr.c[1], z: fr.c[2] });
                Entities.editEntity(fr.id, { position: { x: x + off.x, y: y + off.y, z: z + off.z }, rotation: rot, visible: true });
                if (f.shown && f.shown !== fr.id) Entities.editEntity(f.shown, { visible: false });
                f.shown = fr.id; f.model = fr.id;
                Entities.editEntity(f.tag, { position: { x: x, y: y + 2.0, z: z } });
                if (f.prop) {
                    if (f.prop.until && now > f.prop.until) dropProp(f);
                    else { var pa = PROP_AT[f.prop.kind], po = Vec3.multiplyQbyV(rot, pa); Entities.editEntity(f.prop.id, { position: { x: x + po.x, y: y + po.y, z: z + po.z }, rotation: rot }); }
                }
                return;
            }
            var props = Entities.getEntityProperties(f.model, ["naturalDimensions", "dimensions"]);
            var h = props.naturalDimensions && props.naturalDimensions.y > 0.5 ? props.naturalDimensions : null;
            if (h && !f.sized) { Entities.editEntity(f.model, { dimensions: h, visible: true }); f.sized = true; }
            var anim = (c.v[5] & 1) ? "sit" : speed > 0.35 && now - c.t < 600 ? "walk" : "idle";
            if (anim !== f.anim) { f.anim = anim; f.t0 = now; }
            var edit = { position: { x: x, y: y + (h ? h.y / 2 : 0.85), z: z }, rotation: Quat.fromPitchYawRollDegrees(0, c.v[3] * 180 / Math.PI + FACE_OFFSET, 0) };
            var set = clips[LOOKS[f.look % LOOKS.length]], clip = set && set !== "loading" ? set[anim] : null;
            if (clip && f.sized && CLIPMODE !== "none") {
                var restA = avatarRest && avatarRest[LOOKS[f.look % LOOKS.length]];
                if (!f.map && restA) {
                    // model entities use their own joint frames: keep each joint's rest rotation so
                    // the clip's change from the avatar rest pose can be re-expressed in that frame
                    var names = Entities.getJointNames(f.model) || [];
                    f.map = names.map(function (n) { return clip.joints[n] && restA[n] ? n : null; });
                    f.rest = names.map(function (n, j) { return Entities.getLocalJointRotation(f.model, j); });
                    f.fix = names.map(function (n, j) { return f.map[j] ? Quat.multiply(Quat.inverse(restA[n]), f.rest[j]) : null; });
                }
                // walking plays at the guest's speed so feet don't slide
                var rate = anim === "walk" ? Math.min(1.7, Math.max(0.6, speed / 1.35)) : 1;
                var frame = Math.floor(((now - f.t0) / 1000) * clip.fps * rate) % clip.frames;
                var rots = [], setFlags = [];
                for (var j = 0; f.map && j < f.map.length; j++) {
                    var q = f.map[j] && clip.joints[f.map[j]][frame];
                    rots.push(q && CLIPMODE !== "rest" ? Quat.multiply({ x: q[0], y: q[1], z: q[2], w: q[3] }, f.fix[j]) : f.rest[j]); setFlags.push(!!q);
                }
                edit.jointRotations = rots; edit.jointRotationsSet = setFlags;
            }
            Entities.editEntity(f.model, edit);
        });
    };
    Script.update.connect(update);
    // status line for diagnostics (Running Scripts log)
    Script.setInterval(function () {
        print("VMAT_LINK status " + JSON.stringify({ joined: !!me, bridged: bridged, figures: Object.keys(people).map(function (id) {
            var f = people[id], p = Entities.getEntityProperties(f.model, ["position", "visible", "naturalDimensions"]);
            return { name: f.name, model: f.model, visible: p.visible, position: p.position, size: p.naturalDimensions, anim: f.anim, samples: f.buf.length };
        }) }));
    }, 10000);
    Script.scriptEnding.connect(function () { clear(); stopSong(); Messages.unsubscribe("Chat"); view.close(); });
    print("VMAT_LINK started " + JSON.stringify({ site: SITE, event: EVENT, assets: ASSETS }));
}());
