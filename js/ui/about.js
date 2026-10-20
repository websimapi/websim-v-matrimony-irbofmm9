import { fmtUsd, fmtCredits } from "../api.js";

export async function openAbout(ctx) {
  const c = ctx.cfg;
  const el = ctx.openSheet(`
    <h2>A wedding venue that lives in your browser</h2>
    <p>Guests open a link — on a laptop, phone, VR headset or TV — and arrive at the same golden-hour garden. Walk the aisle with a body of your own, or sit back and watch through our directed cameras.</p>
    <h3>How it works</h3>
    <p><b>1. Reserve a day.</b> One couple per day; a 10% deposit holds it, pay the rest whenever you like before the event.</p>
    <p><b>2. Rehearse.</b> You get 10 hours of private sandbox time to style the venue and invite your wedding party to practice.</p>
    <p><b>3. Celebrate.</b> On the day the venue opens for ${c.baseHours} hours (+ any extra hours) for up to 40 guests, with host controls for every moment.</p>
    <h3>Packages</h3>
    ${c.packages.map((p) => '<p><b>' + p.name + "</b> — " + fmtUsd(p.credits, c.creditsPerUsd) + " (" + fmtCredits(p.credits) + "). " + p.blurb + "</p>").join("")}
    <p class="muted">Extra hours ${fmtCredits(c.extraHourCredits)} each. Payments are currently made with websim tip credits.</p>
    <div class="row" style="margin-top:12px"><button class="btn" id="ab-pb">Read the operations playbook</button></div>`);
  el.querySelector("#ab-pb").onclick = async () => {
    const [{ marked }, md] = await Promise.all([import("marked"), fetch("PLAYBOOK.md").then((r) => r.text())]);
    ctx.openSheet('<div class="md">' + marked.parse(md) + "</div>", { wide: true });
  };
}
