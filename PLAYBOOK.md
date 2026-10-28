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
   - **Build mode** (🛠 Edit venue, or press **B**) works like Sims build/buy mode. Choose from a catalog of about 40 items: ceremony pieces (chuppah, heart arch, gazebo, floral pillars, flower wall, aisle lanterns), seating, tables and cake, florals, 3D trees, lighting (chandeliers, lanterns, candles, string lights, colour uplights) and effects (petal shower, cold sparklers, fireflies, bubbles, confetti, low mist).
   - Placing and editing: click to place (Shift+click places more), `,` `.` turn 45°, `[` `]` resize, **R** recolours, **T** cycles finishes, Alt places off-grid, **G** changes the grid, 1/2/3 switch the move/rotate/scale gizmo. Ctrl+D duplicates, Delete removes, Ctrl+Z / Ctrl+Y undo / redo.
   - Like Sims: **drag any item** across the floor; a floating bar above the selection has turn ↺ ↻, duplicate, colour, finish and delete.
   - The inspector has colour swatches, a custom colour, and **finishes**: satin, linen, gold, silver, walnut, marble stone and gloss, using the HD textures.
   - Sky & mood also sets the **aisle runner** (petal print, ivory satin, blush, bare lawn) and the **dance floor** (parquet, white gloss, black gloss).
   - **Sky & mood** sets the time (Live / Ceremony time / Golden / Evening), clouds, fog and mist, breeze and the flower palette.
   - Edits appear live for everyone in the rehearsal and are saved with the venue style for the day (`config.layout`, `config.env`).
4. **Share**: *Copy guest link* (`?e=VW-XXXXXX`) goes in invitations.
5. **Day of**: doors open 15 min before the start; the venue stays open for 2 h + extras. The host runs:
   - Seat everyone → 🎻 Processional → vows (camera: Altar) → 💍 Ring exchange → 💋 The kiss → 🕊 Pronounced → 👏 Applause → Release seats → 💐 Bouquet toss → 💃 First dance (spotlight; guests gather on the floor) → 🍰 Cake cutting → 🫧 Bubble send-off or 🏮 Sky lanterns after dark.
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

## 9. Assets and licensing

- Avatars: Microsoft Rocketbox (MIT). Desktop HD albedo maps use the original 2048² body/head textures from commit `0943055db6ec570bcef9f2c8b41c9e5467c808f9` in `assets/avatars_hd/` (JPEG quality 85, 20 maps, about 11.3 MB). Original light-tier maps, normal maps and opacity remain in `assets/avatars/`; the MIT license is included with the HD maps. Source: https://github.com/microsoft/Microsoft-Rocketbox .
- Furniture models in `assets/models`: Poly Haven (CC0).
- Props in `assets/props` and 3D trees in `assets/trees3d`: generated for this project in Blender from code (`work/blender/props.py`, `trees.py`). Catalog thumbnails are rendered by the same scripts (`assets/catalog`).
- HD textures in `assets/hd`: Poly Haven (CC0) for stone, walnut, planks, linen, parquet, satin and bark; ambientCG (CC0) Grass004 lawn.
- Older 512 px textures, tree photos and florals: AI-generated (`assets/*`). Sound: AI-generated (`assets/sfx/*`); chimes are synthesized live.
- Sky, clouds, fog, sun and moon: procedural shaders with real ephemeris (`js/engine/sky.js`, `astro.js`, `fog.js`).
- Libraries: Three.js (MIT), PeerJS (MIT), marked (MIT), Vircadia web SDK (Apache-2.0).

## 10. Roadmap
Done in Oct 2026: native Vircadia domain, desktop bridge and desktop link script; build mode; 12 Moments; real-time sky; 3D trees; HD textures; realistic guest motion and gestures.
1. Re-export the venue to the native domain (it still shows the earlier export: static sky, billboard trees, no build-mode layout), then stream skeleton joint rotations, so puppets and desktop guests animate natively instead of moving as statues. Ship walk/idle FBX clips for the link script's figures.
2. Couple and wedding-party actions: aisle walk for two, officiant spot, bridal-party spots (marker items in build mode that seat people automatically), slow-dance pairs.
3. Photo booth: capture a framed still with a venue backdrop for guests to download.
4. More venues (beach, chapel, ballroom) built with the same Blender generators; save and load build-mode templates.
5. Spatial voice on Websim (WebRTC SFU or PeerJS mesh). The native domain already has audio.
6. Real payments (Stripe) replacing the tip mock. The `payments` table already records the method.
7. Recording / restream to YouTube for 100+ watchers.
8. A stable public address for the desktop domain (named Cloudflare tunnel or hosted domain server).
