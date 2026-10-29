# V-Matrimony — Virtual Wedding Operations Playbook

## 1. How fully virtual wedding venues work (research summary)

Fully virtual weddings come in three main forms:

| Model | Examples / pattern | Strengths | Weaknesses |
|---|---|---|---|
| Video-call ceremony | Zoom/Meet + slides | Zero learning curve | No sense of place, no "being there" |
| Livestream broadcast | YouTube/Vimeo of a physical or rendered set | Scales to thousands, TV-friendly | Passive, no presence |
| Social 3D venue | VRChat/Rec Room/Spatial/Vircadia/Hubs-style worlds | Presence, avatars, walking the aisle, VR | Installs, accounts, motion learning curve, harder to run |

Successful operators mix all three: **a 3D venue that people can also just watch**. A typical event has:

- **The couple and wedding party** (5–10 people), who need full presence: a body, the aisle, the altar.
- **Engaged guests** (15–25), who walk around, sit, react and chat.
- **Passive guests** (grandparents, TV viewers), who need a cinematic broadcast view with no controls at all.

This is why V-Matrimony gives every guest two equal choices: **Walk in** (a body) or **Watch** (a directed spectator camera). TV devices always get Watch.

### What makes these events go wrong
1. **Access friction**: installs, accounts, unclear links. → We use one browser link, with no install and no account needed to watch.
2. **Nobody knows when "the moment" happens**: → host **Moments** cues (processional, petals, kiss) play sound and effects for everyone at the same time.
3. **Guests wander mid-vows**: → **Seat everyone** locks walking guests into chairs.
4. **Bad camera work for watchers**: → an **auto-director** cuts between 7 cinematic shots, and the host or staff can take over and direct every watcher's camera.
5. **No rehearsal**: → **10 hours of private sandbox** before the day.
6. **Double-booked staff**: → **one booking per calendar day**, enforced by a unique database index.

### What established platforms teach us (research, Oct 2026)

| Platform | How weddings run there | What V-Matrimony takes from it |
|---|---|---|
| **Second Life** | Full-service wedding businesses (e.g. Costa Bella Weddings) sell several themed venues plus rehearsal, officiant, photography and a DJ. DIY couples buy venue kits with an officiant pose, bridal-party poses, aisle walks, a scripted guestbook and a cake table. Ceremonies are run from **one controller HUD** with dozens of animations instead of many separate pose balls. Couple dances use pose-ball systems; dance HUDs are separate. | One host panel drives everything (Moments, cameras, seating). Build mode is the "venue kit": the couple decorates without a builder. Guestbook, cake and aisle are built in. |
| **VRChat** | Commercial services (e.g. V婚式 Ding) script the moments: entrance, ring exchange, signing a pledge, bouquet toss, flower shower, plus photography. Public chapel worlds have pews, a canopy and prep rooms. VRChat's event guide stresses capacity, instance type and assigned staff roles. | Moments now include ring exchange, pronouncement, bouquet toss, first dance, cake cutting, bubble send-off and sky lanterns. Staff roles stay explicit (host / staff / guest). |
| **Decentraland, Virbela** | Showcase weddings drew large crowds, but reports say the day "didn't go strictly according to plan". The metaverse still needs to mature to host ceremonies reliably. | Reliability first: rehearsals, standalone fallback when the desktop bridge drops, reconnects, late-join state. |
| **General VR wedding advice** | Do test runs, give guests clear instructions, and make it personal (custom avatars, favours). | 10 h sandbox, Walk/Watch choice, onboarding toasts, outfits and face photo. |

### Gap check against what wedding platforms ship (28 Oct 2026)

Second Life venue kits (gazebo, gothic, barn, winter-pavilion and pool sets), The Sims 4 *My Wedding Stories* and VRChat chapel worlds, compared with V-Matrimony:

| They have | V-Matrimony today | Status |
|---|---|---|
| Couple **sync animations**: holding hands, kneeling, ring exchange, vows, kiss (SL kits ship 7–17, plus an officiant pose) | **Added 28 Oct**: ring exchange (hands meet), holding hands through the vows, the kiss (step in, embrace); the bouquet goes to the maid of honour for the rings | Done (C14), including kneeling (🙏 Blessing, at the kneeling bench if placed) and an officiant who reads, blesses and pronounces → C14 |
| **Pews** with 3 animated seats each, kids' sit poses | Chairs, benches and sofas seat one; one sit pose | Church pew (3 seats) added 28 Oct; sit-pose variety → C18 |
| Kneeling bench, officiant podium, unity candles | Lectern, unity candles; **kneeling bench added** 28 Oct | Done (kneel pose → C14) |
| Themed venues you unpack in one click (gazebo, chapel, barn, beach, pool, winter) | **Build-mode templates added 28 Oct**: Stone chapel, Beach, Rustic barn, Winter, Boho, Garden entrance, Pool party (C17) | Done, including couples' own saved layouts (My templates) |
| Cultural canopies: chuppah, **mandap** | Chuppah (rebuilt with drapes); **mandap added** 28 Oct | Done |
| **DJ booth** and live music stream; dance-ball systems; couple dances | DJ booth and grand piano added 28 Oct; **synced music player added 28 Oct** (host plays a link, every guest hears the same moment, own volume) | Done (C15); couple dance → roadmap 2 |
| Photo spots and backdrops, static photo poses | Flower wall; photo frame, floral swing, **neon greenery wall, balloon garland arch, moon gate, drape backdrop** added 28 Oct | Photo booth capture → roadmap 3 |
| Cake table, champagne tower, **toasting** (Sims), gift and card table, dessert and champagne walls (rental catalogues) | Cake, champagne tower (rebuilt), **toasting set and gift table added** 28 Oct | Toast moment with flutes in hand → C16 + H17 |
| Bouquet in hand, held flutes and sparklers | **Held props** 28 Oct: the bride carries the bouquet, a new 🥂 Toast Moment puts flutes in every hand, sparklers for the send-off | Done (C22); couple sync poses → C14; desktop app doesn't show them yet |
| Cuddle seats for the couple (SL pool and swing sets) | Floral swing; **velvet sofa (seats two) and lounge set** added 28 Oct | Couple cuddle pose → C18 |
| Grand entrance (carriage, limo) | **Wedding carriage and vintage "Just Married" car** added 28 Oct (static) | Done (H21); arrival animation → roadmap 2 |
| Reception rental staples: Chiavari and cross-back chairs, farm banquet tables, lounge furniture, cocktail tables, seating chart, guestbook table, band stage (2026 rental catalogues) | **All added 28 Oct** (batch 4) | Done (H20) |
| Garden landscape: lamp posts, gates, fences, footbridge, pond, topiaries, urns, fire pit, parasols | **Added 28 Oct** (batches 6–7) | Done (H10) |
| Cultural ceremony pieces (tea ceremony, mandap and marigolds, mehndi seating, diyas, jumping the broom, handfasting, ketubah) and seasonal themes (winter, pool) | **Added 28 Oct** (batch 8) | Done; more on request |
| Prep rooms (VRChat chapel) | — | Later, with the chapel kit |

The catalog is in [docs/CATALOG.md](docs/CATALOG.md) and the Moments are in [docs/MOMENTS.md](docs/MOMENTS.md).

More sources: [SL wedding gazebo venue](https://marketplace.secondlife.com/s/Wedding-Gazebo-Venu-Small-Pink-Boxed/4877034) · [SL gothic venue with couple sync animations](https://marketplace.secondlife.com/s/Red-Passion-Gothic-Wedding-Venue-and-Reception-Site/4406075) · [SL Raleigh barn set](https://marketplace.secondlife.com/s/Trompe-Loeil-Raleigh-Wedding-Set-V11-mesh/6951947) · [SL winter ceremony set](https://marketplace.secondlife.com/s/Aphrodite-Roses-Lace-WeddingCeremony-Set/14105523) · [SL pool venue](https://marketplace.secondlife.com/p/MC-Wedding-Pool-Venue-Unpacker-HUDadd-me/22099333) · [Sims 4 My Wedding Stories guide](https://snootysims.com/wiki/sims-4/the-sims-4-my-wedding-stories/) · [My Wedding Stories livestream summary](https://simscommunity.info/2022/02/12/the-sims-4-my-wedding-stories-livestream-summary/)

Legal note: virtual ceremonies are generally **not legally binding**. Couples marry legally offline; V-Matrimony hosts the celebration.

Sources: [Second Life Marketplace wedding venues](https://marketplace.secondlife.com/s/Wedding-4-Landscape-Venue-Romance/25915456) · [SL ceremony pose system](https://marketplace.secondlife.com/s/PROMO-DF-Products-Wedding-Ceremony-Pose-System-Boxed-Everything-you-need-for-a-Wedding-Ceremony/4505921) · [Costa Bella Weddings (SL blog)](https://community.secondlife.com/blogs/entry/12435-weddings-made-in-second-life-costa-bella-weddings/) · [SL wedding planning forums](https://forums-archive.secondlife.com/119/f9/237267/1.html) · [VRChat event hosting guide](https://wiki.vrchat.com/wiki/Guides:VRChat_Event_Hosting) · [VRChat wedding chapel review](https://ryanschultz.com/2018/02/24/vrchat-pick-of-the-day-the-official-church-of-marriage/) · [Decentraland wedding](https://www.inkl.com/news/decentraland-hosts-first-metaverse-wedding-in-the-us-meta-marriage) · [VR wedding advice](https://generate.nextatlas.com/feed/celebratory-events/revolutionize-your-wedding-with-virtual-reality)

## 2. Architecture decision: Vircadia

The Vircadia Web SDK (Apache-2.0, `@vircadia/web-sdk@2024.1.2`) connects to a Vircadia **domain server** with binary UDT packets over WebRTC data channels. It uses a separate channel for each assignment client: domain, avatar mixer, audio mixer, entity server and message mixer. The SDK has packet codecs for 36 packet types (DomainConnectRequest, BulkAvatarData, EntityData…).

To run that unchanged on websim, server.js would have to re-implement the domain server handshake, UDT sequencing and the binary avatar mixer, all over a JSON-only, single-threaded room. That is a multi-month port with no benefit for a 40-guest MVP. **Decision:** keep Vircadia's *architecture* and drop its *wire protocol*:

| Vircadia role | V-Matrimony equivalent |
|---|---|
| Domain server (auth, join) | `room.onMessage("join")`: checks the booking, date window, payment and capacity |
| Avatar mixer | 10 Hz pose input → 10 Hz delta snapshots (only avatars that moved) |
| Message mixer | chat, reactions, cues, camera direction, seating |
| Entity server | venue config (palette, time of day, sign, screen) stored in `bookings.config` |
| Audio mixer | not in the MVP (see roadmap) |

The protocol is the same for the paid realm (websim room) and the sandbox (PeerJS). In the sandbox, the host's browser runs `LocalDomain`, a copy of the room logic. Rehearsals therefore behave exactly like the day.

**Native Vircadia (implemented Oct 2026).** A real native-core domain runs on the host's desktop (Docker). It is reached through an HTTPS/WSS gateway (`work/gateway`). Supported connection routes:

| Route | How |
|---|---|
| Websim guest → Websim venue | `server.js` room, **standalone**, no desktop needed |
| Websim guest → venue **+ desktop bridge** | Host/staff opens `?bridge=VW-…&domain=wss://…/signal` on a desktop. Each Websim walker becomes a puppet avatar in the native domain; native attendees appear on Websim with live poses; chat is relayed both ways (including Vircadia's standard `Chat` channel). Heartbeat 3 s; after 12 s of silence the room falls back to standalone; native attendees are held 20 s for reconnects. |
| Websim guest → native domain directly | "Join a ceremony → Vircadia domain" (`?native`) with the Vircadia web SDK |
| Desktop Vircadia app → venue, no bridge | Load `assets/native-link/vmatrimony-link.js?site=<…/link.html>&e=VW-…` in Interface (Running Scripts). A hidden web view joins the Websim room as that guest. |
| Desktop app ↔ desktop app | Standard native domain |

All routes have automated tests (`work/local/tests/*.mjs`); see `outputs/RUNNING-AND-VERIFICATION.md`.

Rendering is **Three.js r160** with native WebXR.

## 3. Platform matrix

| Device | Detection | Controls | Default |
|---|---|---|---|
| Desktop | default | WASD/arrows, drag or double-click pointer-lock to look, Shift to run, Enter to chat, ←/→ to cut cameras | Choice |
| Mobile | coarse pointer / UA | left virtual stick, drag to look | Choice |
| VR (Quest, Pico, Wolvic) | `navigator.xr` immersive-vr | left stick to move, right stick to snap-turn; head and hands are networked | Choice + "Enter in VR" |
| TV | UA (Tizen/webOS/Fire TV/Android TV) or `?tv` | D-pad: ←/→ cameras, ↑ focuses the dock, OK selects | Watch only |
| Vircadia desktop app | native domain (bridge) or link script | native controls, voice, the domain's venue | Walk |

### Guest perspectives (walkthrough, 27 Oct 2026)
Each persona was run end to end (`work/local/tests/walkthrough.mjs`, screenshots in `outputs/walkthrough/`):

| Persona | What they experienced | Fixed |
|---|---|---|
| Grandma on a phone (Watch) | Empty screen for up to 24 s before the invitation; crushed top line; tight portrait shots; petals rendered as squares | Invitation in about 2 s with a loading card; one-line header; portrait shots keep landscape framing; real petal shapes |
| Adult in a desktop browser (Walk) | Grey light poles with floating bulbs, wet-looking lawn, flat beige marquee ceiling, blank welcome easel | White posts with wires, matte lawn, chiffon swags in the marquee, easel shows the couple's names and date |
| The couple (host) | Host panel clear; 12 Moments; build mode in rehearsal | Build mode now opens on a fixed overview, items drag directly, finishes and surfaces added |
| TV viewer | Tiny invitation for viewing from the sofa | 10-foot sizing for the invitation, header and chat on TVs |
| Desktop Vircadia app | Camera inside its own avatar (a dark cone of clothing); avatars T-posed; old venue export | Outfits re-rigged (feet were above the head); venue re-export and joint streaming are next |
| Everyone watching | Directed cameras could pass through guests | The camera keeps out of a soft capsule around every person |

Guests no longer see technical states like "standalone". Only hosts and staff see the bridge status; guests see "🖥 N on the desktop app".

## 4. Packages and pricing (credits are mocked through websim tips: 1,000 credits = $0.50)

| Package | Tier | Price | Includes |
|---|---|---|---|
| Venue Day | Hands-off (DIY) | $39 = 78,000 cr | 2 h venue, 10 h sandbox, host controls, 40 guests |
| Hosted Ceremony | Hands-on | $149 = 298,000 cr | + staff producer, run-of-show call, directed cameras |
| Extra hour | add-on | $9 = 18,000 cr | per hour, max +6 |

- A **deposit of at least 10%** confirms the date. An unpaid hold expires after 45 minutes.
- Pay the balance in any number of parts. **The venue opens only when the balance is paid** (unless an admin waives it).
- Admins edit prices in **Admin → Pricing**.

## 5. Hands-off playbook (DIY — fully automated)

1. **Book**: the couple picks a package and date (≥ 24 h ahead) → a booking code `VW-XXXXXX` is issued.
2. **Pay**: a tip comment is prefilled with the code. server.js matches tips against the public comments API. If a tip can't be verified, it goes to **Admin → Payments** for a one-click approve.
3. **Rehearse** (Rehearse button, up to 10 h metered): the host opens the PeerJS sandbox and shares the invite link with the wedding party. They walk the aisle, try every Moment, style the venue (palette, sky, sign, screen), then **Save style for the event day**.
   - **Build mode** (🛠 Edit venue, or press **B**) works like Sims build/buy mode. Choose from a catalog of about 180 items (full list: [docs/CATALOG.md](docs/CATALOG.md)): ceremony pieces (chuppah, mandap, pergola, heart arch, gazebo, kneeling bench, floral pillars, flower wall, aisle lanterns), seating (chairs, three-seat church pews, benches, sofas), tables and cake (gift table, toasting set, champagne tower), florals, 3D trees, lighting (chandeliers, floor candelabras, lanterns, candles, string lights, colour uplights), **Music & photos** (DJ booth, grand piano, giant photo frame, floral swing, photo booth, band stage, LOVE marquee letters, lawn games: giant tumbling blocks, cornhole, croquet; kids' teepee), **Lounge & reception** (velvet sofa and armchairs, marble coffee table, rug, cocktail tables; plus Chiavari and cross-back chairs, a farm banquet table set for eight, dessert table, guestbook table, seating chart, neon greenery wall, band stage — [docs/RECEPTION_LOUNGE.md](docs/RECEPTION_LOUNGE.md)), **Chapel & structures** (a peaked sailcloth tent and a clear-top tent; build a stone chapel from wall bays, end wall, entrance, roof and floor bays, with a pipe organ and stained glass — [docs/CHAPEL_KIT.md](docs/CHAPEL_KIT.md)), boho and modern pieces (macramé arch, pampas vase, floral cloud, ghost chairs, ice swan, donut wall, candy bar, Moroccan lanterns, kids' teepee, poufs — [docs/BOHO_MODERN.md](docs/BOHO_MODERN.md)), **Traditions & themes** (tea ceremony set, marigold curtain, mehndi floor lounge, diya lamps, wedding broom, handfasting table, illuminated document easel, woven fabric backdrop, floating candles, winter fireplace, and a winter set: snowy pine, birch arch, sleigh, cocoa bar, birch candles, fur bench — [docs/TRADITIONS.md](docs/TRADITIONS.md)), **Garden & entrance** (wedding carriage, vintage car, lamp posts, gate, picket fence, footbridge, lily pond, boulders, stepping stones, urns, topiaries, wishing well, parasol bistro set, fire pit, and a pool set: 6 × 3 m pool, sun loungers, floral pool float), **Beach & barn** (driftwood arch, tiki torches, shell aisle markers, a cabana, hay bales that seat two, whisky barrels, mason-jar lights, wooden signs, wagon-wheel lights; guide: [docs/BEACH_BARN_KIT.md](docs/BEACH_BARN_KIT.md)) and effects (petal shower, cold sparklers, fireflies, bubbles, confetti, low mist). Pews and hay bales fill in order with **Seat everyone**, like the chairs.
   - **Templates** (🏛 in build mode): one click places a whole themed set around the ceremony lawn — Stone chapel, Beach, Rustic barn, Winter, Boho, Garden entrance, Pool party, Ballroom, Lakeside ([docs/TEMPLATES.md](docs/TEMPLATES.md)). Some swap the rose arch for their own; Ctrl+Z undoes a template, the same button removes it, and *Restore removed* brings back built-in pieces. **My templates** in the same panel saves the venue as it is (layout and sky & mood) under a name — on the device, and in the account when signed in — and *Load* brings it back in one step (Ctrl+Z undoes).
   - **Terrain** (⛰ in build mode): raise, lower, smooth, flatten, roughen and level the lawn, and paint grass, meadow, earth, sand or stone. The dais, aisle, path and marquee always stay flat; furniture and trees ride the ground. Keys: [docs/BUILD_SHORTCUTS.md](docs/BUILD_SHORTCUTS.md).
   - Placing and editing: click to place (Shift+click places more), `,` `.` turn 45°, `[` `]` resize, **R** recolours, **T** cycles finishes, Alt places off-grid, **G** changes the grid, 1/2/3 switch the move/rotate/scale gizmo. Ctrl+D duplicates, Delete removes, Ctrl+Z / Ctrl+Y undo / redo.
   - Like Sims: **drag any item** across the floor; a floating bar above the selection has turn ↺ ↻, duplicate, colour, finish and delete.
   - The inspector has colour swatches, a custom colour, and **finishes**: satin, linen, gold, silver, walnut, marble stone and gloss, using the HD textures.
   - Sky & mood also sets the **aisle runner** (petal print, ivory satin, blush, bare lawn) and the **dance floor** (parquet, white gloss, black gloss).
   - **Sky & mood** sets the time (Live / Ceremony time / Golden / Evening), clouds, fog and mist, breeze and the flower palette.
   - Edits appear live for everyone in the rehearsal and are saved with the venue style for the day (`config.layout`, `config.env`).
4. **Share**: *Copy guest link* (`?e=VW-XXXXXX`) goes in invitations.
5. **Day of**: doors open 15 min before the start; the venue stays open for 2 h + extras. The host runs:
   - Seat everyone → 🎻 Processional → vows (camera: Altar) → 💍 Ring exchange → 🙏 Blessing (optional: the couple kneel) → 💋 The kiss → 🕊 Pronounced → 👏 Applause → Release seats → 💐 Bouquet toss → 💃 First dance (spotlight; guests gather on the floor) → 🍰 Cake cutting → 🥂 Toast → 🫧 Bubble send-off or 🏮 Sky lanterns after dark.
   - Music: Host → **Music**, paste a direct audio link (.mp3/.ogg or a radio stream) or upload a song; **Play now** or **Add to queue** (the queue plays on by itself, Skip ⏭ jumps ahead); every guest hears the same moment and sets their own volume with 🎶 ([docs/MUSIC.md](docs/MUSIC.md)). Only play music you have the rights to.
   - Couple poses: at 💍 the couple's hands meet for the rings and they hold hands through the vows; at 💋 they step in and embrace ([docs/COUPLE_POSES.md](docs/COUPLE_POSES.md)).
   - Held props: the bride carries the bouquet from the processional to the toss; at the **Toast** everyone raises a champagne flute; at **Sparklers** everyone holds a lit sparkler ([docs/HELD_PROPS.md](docs/HELD_PROPS.md)).
   - Guests react with their bodies: they clap on applause, cheer at the kiss and the pronouncement, look to the altar for the rings, and gesture when they chat.
6. **After**: the guestbook stays readable in the event.

No staff action is required at any step.

## 6. Hands-on playbook (Hosted Ceremony)

| When | Staff action |
|---|---|
| Booking + 24 h | Admin → Bookings → Manage: confirm the payment plan; add a producer name and run-of-show to **Staff notes** |
| T-7 days | Join the couple's sandbox (Admin → *Open sandbox*) for a 30-min run-through: cue timing, shot list, screen media |
| T-1 day | Check that the balance is paid or waived. Add extra hours if requested (the total updates automatically) |
| T-30 min | Join as staff (allowed before the doors open). Check the screen, palette, and audio cues |
| T-15 min | Doors open. Greet arrivals in chat; help VR/TV guests |
| Ceremony | The producer takes **Cameras for watchers** (Wide → Aisle during the processional → Altar for the vows → Guests for reactions) and fires the Moments on the officiant's lines (rings, kiss, pronouncement) |
| Desktop guests | If any guests use the Vircadia desktop app, staff start the **desktop bridge** before doors open and watch its status panel (room linked, domain connected, puppets, desktop attendees). If it drops, the Websim venue carries on standalone and the bridge reconnects on its own. |
| Reception | Release seats, Bouquet toss, First dance, Cake cutting, Party camera, then Sparklers, Bubbles or Sky lanterns for the exit |
| Wrap | Remove disruptive guests if needed (Remove), and close out the notes |

**Staffing rule:** one booking per day, so one producer is dedicated to one couple. Block days off in **Admin → Calendar**.

## 7. Admin operations

- **Admins**: the project owner is always an admin. Grant others in **Admin → Admins** by @username; they get the panel and staff entry to every venue.
- **Payments**: *Scan tip comments* re-matches every tip that contains a booking code. Use *Record a payment* for off-platform payments.
- **Overrides** for each booking: force open, waive balance, move the date (conflicts are rejected), extra hours, cancel/restore.
- **Admin sandbox** (dock → *Sandbox*, Admin → Overview, or `?sandbox=admin`): an unmetered test venue with full host controls and invite links. It needs no booking or date.
- **Live now**: shows the walking/watching counts for any open venue.

## 8. Capacity and performance budget

- 40 participants per event, enforced in the room (host and staff always get in).
- Pose input is 10 Hz and sent only on change; snapshots go out at 10 Hz with only the avatars that moved. 40 users stay under ~400 msgs/s, well within the room limits.
- Measured Oct 2026, desktop tier: about 600k triangles and about 110 draw calls with 14 animated guests. That covers about 50 instanced 3D trees (Blender-built, about 3–4k tris each), 2K PBR textures (about 15 MB) and one shadow-casting sun or moon.
- Light tier (mobile, TV, software GPU, `?quality=low`): photo-billboard trees, 512² textures, fewer cloud raymarch steps, no shadows on mobile.
- Remote avatars are interpolated 150 ms in the past for smooth motion. Arms are solved per frame from directions (no baked clips).
- The sky re-bakes its atmosphere only when the sun moves; the environment map refreshes every 20 s.
- Lights: every real light is unrolled into every shader. Changing the light count recompiles all of them, a multi-second freeze, which hit build mode and the first-dance spotlight. Build-mode lights therefore share a fixed pool of 4 real point lights (nearest and brightest to the viewer), every source shows a halo, the marquee uses one shared light, and the first-dance spotlight is a volumetric beam rather than a light.
- First load: shader compilation (about 70–120 programs at about 200 ms each on integrated GPUs) blocked the invitation for up to 24 s. The first render now waits until the invitation is on screen (about 2 s). Trees outside the shadow area don't cast shadows.

### Release routine (every round of work, owner's rule since 28 Oct 2026)
1. Run the regression tests for what changed (list: `work/local/tests/README.md`), including the desktop routes (`desktop-link.mjs`, `desktop-routes.mjs`, private virtual display).
2. Re-export the native world so the desktop Vircadia venue matches the web venue: [docs/NATIVE_SYNC.md](docs/NATIVE_SYNC.md).
3. Publish to Websim: `python3 work/gateway/stage.py && cp -r uploads work/websim-stage/`, then `websim-cli projects sync --no-open -m "…"` in `work/websim-stage`.
4. Update this playbook, `TASKS.md` (helper list) and `LOCAL_TASKS.md` (keep proven work queued for the local model; review every local patch before applying).

## 9. Assets and licensing

- Avatars: Microsoft Rocketbox (MIT). Desktop HD albedo maps use the original 2048² body/head textures from commit `0943055db6ec570bcef9f2c8b41c9e5467c808f9` in `assets/avatars_hd/` (JPEG quality 85, 20 maps, about 11.3 MB). Original light-tier maps, normal maps and opacity remain in `assets/avatars/`; the MIT license is included with the HD maps. Source: https://github.com/microsoft/Microsoft-Rocketbox .
- Furniture models in `assets/models`: Poly Haven (CC0).
- Hair cards `assets/creator/hair/hc-*` and `strand-atlas.png`: original layered card geometry and procedural strand atlas (`work/helper/hair-cards.py`, `hair-atlas.py`), made for this project. Creator runtime integration is pending coordinator review.
- Tattoo presets in `assets/creator/tattoos`: original line art drawn with PIL in `work/helper/tattoos.py` (no external designs); transparent 512² PNGs.
- Creator accessories in `assets/creator/acc`: original geometry authored for this project with Blender MCP materials and `work/helper/accessories.py`; no external artwork or textures.
- Ten additional venue props in `assets/props` (lectern, unity candles, ring pillow, petal cones, ribbon chair, sweetheart table, bar cart, monogram, lantern tree, candle wall): original Blender geometry in `work/helper/catalog-batch1.py`, using the shared MCP-baked normal/roughness tiles.
- Batch-2 props in `assets/props` (church pew, kneeling bench, mandap, pergola, DJ booth, grand piano, photo frame, floral swing, gift table, toasting set, floor candelabra) and the rebuilt chuppah, heart arch, champagne tower and welcome sign: original Blender geometry from code (`work/blender/props-batch2.py`), using the shared PBR tiles; previous versions of the four rebuilt props are kept in the coordinator's scratchpad backup.
- Batch-3 props (coordinator, 28 Oct): the Beach & barn kit in `assets/props` and seven hand props in `assets/props/hand/`: original Blender geometry in `work/blender/props-batch3.py` (same helpers and PBR tiles); thumbnails in `assets/catalog`, review sheets in `outputs/props-batch3/`.
- Batches 4–7 (coordinator, 28 Oct, `work/blender/props-batch4.py` … `props-batch7.py`): reception and lounge, ceremony and chapel kit, entrance and landscape, finishing pieces. Original Blender geometry; materials from the HD kit `work/blender/hd_kit.py` using the CC0 scans already credited above (resized to 1K in `assets/props/textures-hd/`). Stained-glass windows are original procedural art (`assets/props/textures-hd/stained_*.jpg`). Review renders: `outputs/props-batch4…7/contact.png`, in-venue shots `outputs/showcase/`.
- Batches 8–9 (coordinator, 28 Oct): traditions and themes (`props-batch8.py`), remodels of the ring pillow, sweetheart table and fountain (`props-batch9.py`). Batches 2–3 were retextured with the same HD kit (real wood, stone and linen scans). Panel art (stained glass, illuminated document, strip-woven textile) is original and reproducible with `work/blender/make-art.py`.
- Batch 10 (coordinator, 28 Oct, `props-batch10.py`): boho and modern pieces from the 2026 trend research.
- Batch 11 (coordinator, 28 Oct, `props-batch11.py`): pool and winter sets (from the Second Life pool and winter-pavilion venue sets).
- Batch 12 (coordinator, 28 Oct, `props-batch12.py`): reception entertainment (LOVE letters, lawn games, signature cocktail bar, sparkler station).
- Batch 13 (coordinator, 28 Oct, `props-batch13.py`): sailcloth and clear-top tents, LED dance floor, grazing table, tall centrepiece, dove cage, hot-air balloon.
- Batch 14 (coordinator, 28 Oct, `props-batch14.py`): ballroom and lakeside sets (crystal chandelier, marble column, mirror seating chart, grand staircase, marble floor, lake, dock, rowboat).
- Desktop-link pose frames in `assets/native/pose-*.glb` (+ `pose-textures/`): baked by GPT Sol from the Rocketbox outfits (H5, `work/helper/pose-flipbook.py`). H26 ceremony candidates (kneel, handsjoin, kiss) use the same MIT source assets and existing procedural browser poses; reproducible exports in `work/helper/h26-export.js` and `h26-bake.py`, staged under `work/helper/h26-candidate/` for coordinator review.
- Prop PBR tiles: original procedural fabric weave, wood grain, stone, brushed metal and petal detail authored with Blender MCP; baking/export source `work/helper/props-pbr.py`.
- Props in `assets/props` and 3D trees in `assets/trees3d`: generated for this project in Blender from code (`work/blender/props.py`, `trees.py`). Catalog thumbnails are rendered by the same scripts (`assets/catalog`).
- HD textures in `assets/hd`: Poly Haven (CC0) for stone, walnut, planks, linen, parquet, satin and bark; ambientCG (CC0) Grass004 lawn.
- Older 512 px textures, tree photos and florals: AI-generated (`assets/*`). Sound: AI-generated (`assets/sfx/*`); chimes are synthesized live.
- Sky, clouds, fog, sun and moon: procedural shaders with real ephemeris (`js/engine/sky.js`, `astro.js`, `fog.js`).
- Libraries: Three.js (MIT), PeerJS (MIT), marked (MIT), Vircadia web SDK (Apache-2.0).

## 10. Roadmap
Done in Oct 2026: native Vircadia domain, desktop bridge and desktop link script; build mode with terrain tools; 14 Moments (Toast and Blessing added 28 Oct) with held props (bouquet, flutes, sparklers) and couple poses (rings, hand-holding, kiss); real-time sky; 3D trees; HD textures; realistic guest motion, gestures and facial expressions; the character creator; about 180 catalog items in 14 tabs (reception and lounge, a modular chapel, garden and entrance, traditions and themes, beach and barn); terrain (heights and paint) in the native world; animated pose figures in the desktop link (pews, mandap, DJ booth, piano, photo frame, swing).
1. Native domain: re-exported 28 Oct with the terrain (any couple's saved venue exports with `&config=`, runbook [docs/NATIVE_SYNC.md](docs/NATIVE_SYNC.md)); desktop-link figures play the baked pose frames. Next: natural arms in the walk frames (H22), and a per-event native world (export each booking's venue before its day). Done earlier: live sky, 3D trees, HD furniture and skeleton streaming for bridge puppets.
2. Couple and wedding-party actions (done 28 Oct: ring exchange, hand-holding through the vows, the kiss, bouquet/flutes/sparklers in hand — C14, C22). Kneeling (Blessing) and the officiant are done too. Next: aisle walk for two, bridal-party marker spots, slow-dance pairs, and couple poses for desktop-app guests (needs baked frames, H26; held props already show for them).
2a. Music: the synced player is done (C15, 28 Oct), and the music now comes from the nearest DJ booth, piano or band stage (volume by distance, so any link works). A playlist queue (auto-advance, skip, remove) and song uploads were added on 28 Oct. Desktop-app guests (desktop link) now hear the music too, played with the app's own audio (files; endless radio streams can't be preloaded there).
3. Photo booth: capture a framed still with a venue backdrop for guests to download.
4. More venues: chapel, beach, barn, pool, winter, boho, ballroom and lakeside are done as kits and one-click templates (28 Oct). Couples can also save and load their own layouts (My templates, 28 Oct).
5. Spatial voice on Websim (WebRTC SFU or PeerJS mesh). The native domain already has audio.
6. Real payments (Stripe) replacing the tip mock. The `payments` table already records the method.
7. Recording / restream to YouTube for 100+ watchers.
8. A stable public address for the desktop domain (named Cloudflare tunnel or hosted domain server).

## Character creator (rebuilt 29 Oct)
Every colour setting now works on every outfit: skin tone, eye colour, lipstick, eyeshadow, liner, blush, stubble, brow colour, hair colour on the outfit's painted hair, and clothing (jacket/top, NEW shirt or inner layer, trousers/skirt, shoes). The Face tab has real shape controls: face shape, jaw & chin, nose, mouth & lips, brows and ears; the Eyes tab has size, spacing, height, depth and tilt. Body tab: weight, muscle, chest, waist, hips, belly and glutes now reshape the body itself (not just stretch the clothes); height, legs, arms, neck and shoulders still set lengths. Accessories are fitted to each character's own ears, nose, eyes, skull, neck, chest and fingers (they follow face changes too), and earrings, rings and bracelets now work at all (they were silently dropped before). Still in progress: realistic hair that fits every head with cut and length controls.
