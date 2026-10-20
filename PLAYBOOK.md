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

The protocol is the same for the paid realm (websim room) and the sandbox (PeerJS). In the sandbox, the host's browser runs `LocalDomain`, a copy of the room logic. Rehearsals therefore behave exactly like the day. A future Vircadia bridge only needs to translate this message set.

Rendering is **Three.js r160** with native WebXR.

## 3. Platform matrix

| Device | Detection | Controls | Default |
|---|---|---|---|
| Desktop | default | WASD/arrows, drag or double-click pointer-lock to look, Shift to run, Enter to chat, ←/→ to cut cameras | Choice |
| Mobile | coarse pointer / UA | left virtual stick, drag to look | Choice |
| VR (Quest, Pico, Wolvic) | `navigator.xr` immersive-vr | left stick to move, right stick to snap-turn; head and hands are networked | Choice + "Enter in VR" |
| TV | UA (Tizen/webOS/Fire TV/Android TV) or `?tv` | D-pad: ←/→ cameras, ↑ focuses the dock, OK selects | Watch only |

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
3. **Rehearse** (Rehearse button, up to 10 h metered): the host opens the PeerJS sandbox and shares the invite link with the wedding party. They walk the aisle, try every Moment, style the venue (palette, golden hour or evening, sign, screen), then **Save style for the event day**.
4. **Share**: *Copy guest link* (`?e=VW-XXXXXX`) goes in invitations.
5. **Day of**: doors open 15 min before the start; the venue stays open for 2 h + extras. The host runs:
   - Seat everyone → 🎻 Processional → vows (camera: Altar) → 💋 The kiss → 👏 Applause → Release seats → Party camera on the dance floor.
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
| Ceremony | The producer takes **Cameras for watchers** (Wide → Aisle during the processional → Altar for the vows → Guests for reactions) and fires the Moments on the officiant's lines |
| Reception | Release seats, Party camera, Sparklers for the exit |
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
- The venue is under ~60k triangles, with instanced chairs, trees and bulbs, 512² textures, and one shadow-casting sun (shadows are off on mobile).
- Remote avatars are interpolated 150 ms in the past for smooth motion.

## 9. Assets and licensing

Everything is generated or written for this project. Nothing comes from third-party models:
- Geometry: procedural (code in `js/engine/venue.js`, `avatars.js`).
- Textures, sky, florals: AI-generated (`assets/*`).
- Sound: AI-generated (`assets/sfx/*`).
- Libraries: Three.js (MIT), PeerJS (MIT), marked (MIT).

## 10. Roadmap after the MVP
1. Spatial voice: WebRTC SFU or PeerJS mesh for the wedding party plus a broadcast stream for the officiant.
2. More venues (beach, chapel, ballroom) built from the same generators, with AI-generated texture sets.
3. Real payments (Stripe) replacing the tip mock. The `payments` table already records the method.
4. Avatar customizer, and photo-wall frames from websim uploads.
5. Recording / restream to YouTube for 100+ watchers.
6. Optional Vircadia bridge that translates this message set into domain-server packets.
