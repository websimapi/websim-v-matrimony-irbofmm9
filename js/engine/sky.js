import * as THREE from "three";

// Procedural sky: physically-inspired gradient, sun disc + glow, two animated
// cloud layers (cumulus lit from the sun, high cirrus), stars + moon at night,
// and three rings of distant hills with aerial perspective. Also bakes an
// environment map from itself so every material picks up matching sky light.
const VERT = `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position,0.)).xyz); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`;
const FRAG = `
uniform vec3 sunDir; uniform float time; uniform float night; uniform vec3 moonDir;
varying vec3 vDir;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0., a=.5; mat2 r=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<6;i++){ s+=a*n2(p); p=r*p; a*=.5; } return s; }
vec3 skyCol(vec3 d){
  float y = max(d.y, 0.);
  float sunH = sunDir.y;
  // day palette shifts toward warm as the sun lowers
  vec3 zen = mix(vec3(.11,.24,.52), vec3(.2,.38,.7), clamp(sunH*2.,0.,1.));
  vec3 hor = mix(vec3(1.,.6,.36), vec3(.82,.86,.94), clamp(sunH*1.3,0.,1.));
  vec3 c = mix(hor, zen, pow(y, .45));
  float mu = max(dot(d, sunDir), 0.);
  // warm band near the horizon, strongest toward the sun
  float band = exp(-y*7.) * (0.35 + 0.65*pow(mu, 3.));
  c += vec3(1.,.48,.2) * band * .7 * (1.-clamp(sunH*2.,0.,1.)*.5);
  c += vec3(1.,.66,.38) * pow(mu, 16.) * .38;   // mie glow
  c += vec3(1.,.8,.55) * pow(mu, 260.) * .8;   // halo
  return c;
}
vec3 nightCol(vec3 d){
  float y = max(d.y,0.);
  vec3 c = mix(vec3(.10,.09,.18), vec3(.015,.025,.07), pow(y,.5));
  c += vec3(.35,.18,.28) * exp(-y*9.) * .35; // last light on the horizon
  // stars
  vec2 g = vec2(atan(d.z,d.x)*120., asin(clamp(d.y,-1.,1.))*120.);
  vec2 id = floor(g); float r = h21(id);
  if(r > .985){ vec2 f = fract(g)-.5; float s = smoothstep(.12,0.,length(f)); float tw = .6+.4*sin(time*2.+r*90.); c += vec3(.9,.92,1.) * s * tw * (r-.985)*70. * smoothstep(0.,.25,y); }
  // milky way
  float mw = exp(-pow(dot(d, normalize(vec3(.5,.3,-.8))),2.)*18.) * fbm(d.xz*6.+d.y*3.);
  c += vec3(.25,.22,.32) * mw * .35 * smoothstep(0.,.3,y);
  // moon
  float md = dot(d, moonDir);
  c += vec3(1.,.97,.9) * smoothstep(.99955,.9997,md) + vec3(.35,.4,.55) * pow(max(md,0.), 60.) * .4;
  return c;
}
void main(){
  vec3 d = normalize(vDir);
  vec3 day = skyCol(d), nt = nightCol(d);
  vec3 c = mix(day, nt, night);
  // sun disc
  float mu = dot(d, sunDir);
  c += vec3(1.,.86,.62) * smoothstep(.99935,.9997,mu) * 6. * (1.-night);
  // clouds (projected onto a dome)
  if(d.y > 0.){
    vec2 uv = d.xz / (d.y + .12);
    vec2 w = vec2(time*.004, time*.0015);
    float base = fbm(uv*1.15 + w);
    float detail = fbm(uv*4.5 + w*2.3);
    float cov = smoothstep(.56, .82, base*.8 + detail*.3);
    // light: sample toward the sun to self-shadow
    vec2 sd = normalize(sunDir.xz + 1e-4) * .08;
    float shade = fbm((uv+sd)*1.15 + w)*.8 + fbm((uv+sd)*4.5 + w*2.3)*.3;
    float lit = clamp(1. - (shade - (base*.8+detail*.3))*6., .25, 1.3);
    float fade = smoothstep(0., .18, d.y);
    vec3 sunTint = mix(vec3(1.,.72,.5), vec3(1.,.97,.92), clamp(sunDir.y*2.5,0.,1.));
    vec3 cdark = mix(vec3(.68,.6,.66), vec3(.12,.12,.18), night);
    vec3 clit = mix(sunTint*1.05, vec3(.22,.24,.34), night);
    float rim = pow(max(mu,0.),8.) * (1.-cov) * 2.;
    vec3 cc = mix(cdark, clit, lit*.75) + sunTint*rim*(1.-night);
    c = mix(c, cc, cov * fade * .92);
    // cirrus streaks
    float ci = fbm(vec2(uv.x*.7, uv.y*3.) + w*1.6 + 7.);
    float cir = smoothstep(.6,.88,ci) * .3 * fade * (1.-cov);
    c = mix(c, mix(sunTint, vec3(.3,.3,.4), night), cir);
  } else {
    c = mix(day, nt, night) * .8; // below the horizon (hidden by hills)
  }
  // palette above is authored in display (sRGB) space; convert to linear for the renderer
  c = pow(max(c, 0.), vec3(2.2)) * 1.2;
  gl_FragColor = vec4(c, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const SUN_DIR = new THREE.Vector3(-0.72, 0.3, 0.42).normalize();

export function buildSky(scene, { low = false } = {}) {
  const uniforms = { sunDir: { value: SUN_DIR.clone() }, moonDir: { value: new THREE.Vector3(0.5, 0.45, -0.6).normalize() }, time: { value: 0 }, night: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(320, 48, 24), mat);
  dome.renderOrder = -10; dome.frustumCulled = false; scene.add(dome);

  // distant hills: 3 rings, further = hazier and bluer
  const hills = new THREE.Group(); scene.add(hills);
  const hillMats = [];
  const rings = [[118, 9, 0x3a5a2c, 0.12], [165, 20, 0x4b6a52, 0.32], [230, 38, 0x6a7f98, 0.55]];
  rings.forEach(([R, H, col, haze], k) => {
    const seg = low ? 96 : 200;
    const g = new THREE.CylinderGeometry(R, R, 1, seg, 2, true);
    const p = g.attributes.position, colors = [];
    const base = new THREE.Color(col), hz = new THREE.Color(0xf0c7a6);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
      const top = p.getY(i) > 0;
      let nz = Math.sin(a * 3 + k * 2) * 0.35 + Math.sin(a * 7.3 + k) * 0.25 + Math.sin(a * 17.1 + k * 5) * 0.12 + Math.sin(a * 41 + k * 3) * 0.04;
      // a ragged treeline on the nearest ridge
      if (k === 0) nz += Math.abs(Math.sin(a * 173)) * 0.09 + Math.abs(Math.sin(a * 311 + 1.3)) * 0.06;
      const h = top ? H * (0.55 + nz) + 2 : -6;
      p.setY(i, h);
      const c = base.clone().lerp(hz, top ? haze : Math.min(1, haze + 0.3));
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
    hillMats.push(m);
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = -9 + k * 0; hills.add(mesh);
  });
  // outer meadow between the lawn and the hills
  const meadow = new THREE.Mesh(new THREE.RingGeometry(90, 240, 96, 1), new THREE.MeshLambertMaterial({ color: 0x5e7a3e }));
  meadow.rotation.x = -Math.PI / 2; meadow.position.y = -0.03; meadow.receiveShadow = false; scene.add(meadow);

  let pmrem = null, envRT = null, renderer = null;
  const envScene = new THREE.Scene();
  const envDome = new THREE.Mesh(dome.geometry, mat); envScene.add(envDome);
  function bake() {
    if (!renderer) return;
    pmrem ||= new THREE.PMREMGenerator(renderer);
    const old = envRT; envRT = pmrem.fromScene(envScene, 0, 0.1, 400);
    scene.environment = envRT.texture; old?.dispose();
  }
  function setNight(n) {
    if (n === uniforms.night.value && envRT) return;
    uniforms.night.value = n;
    const day = new THREE.Color(1, 1, 1), nt = new THREE.Color(0.16, 0.16, 0.26);
    for (const m of hillMats) m.color.copy(day).lerp(nt, n);
    meadow.material.color.setHex(0x5e7a3e).lerp(new THREE.Color(0x10141c), n);
    bake();
  }
  return {
    dome, hills, uniforms,
    setRenderer(r) { renderer = r; bake(); },
    setNight,
    update(dt, cam) { uniforms.time.value += dt; dome.position.copy(cam); hills.position.set(cam.x * 0.05, 0, cam.z * 0.05); },
  };
}
