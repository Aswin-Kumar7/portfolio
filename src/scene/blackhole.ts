import { gsap } from '../lib/gsap'
import { progress } from '../lib/boot'
import { GL, type Program, type Target } from './gl'
import type { Framing, SceneControls } from './state'

/*
 * The hero: a ray-traced Schwarzschild black hole in deep space.
 *
 * Art direction: dark, quiet space so the headline stays readable; a thin,
 * finely striated accretion disk (Interstellar-style); crisp stars; a faint
 * galaxy band kept low, behind the disk.
 *
 *   1. bakes (once)  — a faint galaxy sky (equirect) and a polar disk texture with
 *                      fine concentric striations. Baked in strips so mounting never hitches.
 *   2. main pass     — per-pixel photon paths (leapfrog), disk crossings with mip-correct
 *                      texture filtering, Doppler beaming + gravitational redshift, Keplerian
 *                      shear, orbiting hot spots, photon ring, lensed sky and anti-aliased
 *                      stars. The shadow edge and photon ring — where one ray per pixel
 *                      aliases — get two extra rays across the ring. HDR output.
 *   3. bloom         — a gentle bloom (three's UnrealBloomPass recipe), added back into the HDR target.
 *   4. finish        — ACES, contrast-adaptive sharpening, vignette and grain at native res.
 *
 * One canvas serves the page: the hero and the footer are never on screen together, so the
 * canvas moves to whichever is in view. The shaders compile and the textures bake once, and
 * where the browser supports it the compile runs off the main thread (the loader keeps moving).
 */

// ---------------------------------------------------------------- GLSL: noise
const NOISE = /* glsl */ `
  // 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT)
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
  float fbm(vec3 p, int octaves) {
    float s = 0.0, a = 0.5, norm = 0.0;
    for (int i = 0; i < 9; i++) {
      if (i >= octaves) break;
      s += a * snoise(p);
      norm += a;
      p = p * 2.03 + vec3(1.7, 9.2, 4.3);
      a *= 0.5;
    }
    return 0.5 + 0.5 * s / norm;
  }
  float ridged(vec3 p, int octaves) {
    float s = 0.0, a = 0.5, norm = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      float n = 1.0 - abs(snoise(p));
      s += a * n * n;
      norm += a;
      p = p * 2.11 + vec3(3.1, 1.3, 7.7);
      a *= 0.5;
    }
    return s / norm;
  }
`

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

// ------------------------------------------------------------ sky bake (faint)
const SKY_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform mat3 uGal;
  uniform float uOctaves;
  ${NOISE}

  void main() {
    float lon = (vUv.x - 0.5) * 6.2831853;
    float lat = (vUv.y - 0.5) * 3.1415926;
    vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
    int oct = int(uOctaves);

    // a faint Milky Way band, almost in the disk plane so it stays low in the frame
    vec3 g = uGal * d;
    float glat = asin(clamp(g.y, -1.0, 1.0));
    float warp = fbm(g * 2.0, 4) - 0.5;
    float width = 0.085 + 0.05 * fbm(g * 1.3 + 7.0, 3);
    float band = exp(-pow((glat + warp * 0.06) / width, 2.0));
    float halo = exp(-pow(glat / (width * 3.0), 2.0));
    // octave counts are band-limited to the bake's resolution (no texel noise to magnify)
    float clouds = fbm(g * vec3(9.0, 16.0, 9.0), oct);
    float fine = fbm(g * 40.0, 3);
    float starlight = band * (0.2 + 1.2 * clouds) * (0.6 + 0.6 * fine) + halo * 0.06;

    vec3 gd = vec3(g.x, g.y * 2.6, g.z);
    float lanes = ridged(gd * 4.5, oct);
    float rift = exp(-pow((glat + warp * 0.05) / (width * 0.3), 2.0)) * smoothstep(0.35, 0.75, fbm(gd * 3.4 + 5.0, 5));
    float absorb = clamp(smoothstep(0.45, 0.9, lanes) * band * 0.9 + rift * 0.8, 0.0, 0.93);
    vec3 col = starlight * vec3(0.55, 0.68, 1.0) * 0.03 * (1.0 - absorb);

    // barely-there deep-blue nebula wisps
    vec3 q = d * 2.0;
    vec3 w = vec3(fbm(q + 1.7, 4), fbm(q + 9.2, 4), fbm(q + 4.1, 4)) - 0.5;
    float n1 = fbm(q * 1.3 + w * 1.8, oct);
    float fil = ridged(q * 6.0 + w * 2.5, 4);
    col += vec3(0.02, 0.07, 0.28) * smoothstep(0.55, 0.92, n1) * (0.35 + 0.8 * fil) * 0.09 * (0.35 + 0.65 * halo);

    col += vec3(0.0022, 0.004, 0.010);
    float density = 0.35 + band * (1.4 + clouds);
    gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), clamp(density / 4.0, 0.0, 1.0));
  }
`

// ------------------------------------------------------------ disk texture bake
const DISK_FRAG = /* glsl */ `
  varying vec2 vUv;          // x: orbit angle (wraps), y: log radius
  uniform float uRadial;     // texels across the radius: caps the finest striation at Nyquist
  ${NOISE}
  void main() {
    float a = vUv.x * 6.2831853 + vUv.y * 1.6;          // gentle spiral winding
    float v = vUv.y;
    vec2 c1 = vec2(cos(a), sin(a));
    float nyq = uRadial * 0.45;
    float turb = fbm(vec3(c1 * 2.6, v * 22.0), 4);
    // concentric striations: long along the orbit, thin across it
    float fRings = min(120.0, nyq * 0.25);
    float rings = fbm(vec3(c1 * 1.8, v * fRings) + turb * 0.6, 3);
    float fFine = nyq * 0.5;
    float fine = fbm(vec3(c1 * 1.3, v * fFine) + rings * 0.4, 2);
    vec2 c2 = vec2(cos(a + 1.3), sin(a + 1.3));
    float knots = fbm(vec3(c2 * 12.0, v * 40.0), 4);
    gl_FragColor = vec4(turb, rings, smoothstep(0.55, 0.9, knots), fine);
  }
`

// ------------------------------------------------------------------ main pass
const MAIN_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uSky;
  uniform sampler2D uDisk;
  uniform vec2 uRes;
  uniform float uTime, uIntro, uScroll, uLook, uDist, uSteps, uFocal;
  uniform vec2 uMouse;

  float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
  vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }

  const float RIN = 2.6;
  const float ROUT = 15.5;
  const float TAU = 6.2831853;
  const float BCRIT = 2.598;             // critical impact parameter: the edge of the shadow
  const float LOGSPAN = 1.7857;          // log(ROUT / RIN)

  vec3 thermal(float t) {
    t = max(t, 0.0);
    vec3 c0 = vec3(0.004, 0.010, 0.06);
    vec3 c1 = vec3(0.03, 0.09, 0.40);
    vec3 c2 = vec3(0.20, 0.42, 0.95);
    vec3 c3 = vec3(0.68, 0.85, 1.0);
    vec3 c4 = vec3(1.0);
    if (t < 0.22) return mix(c0, c1, t / 0.22);
    if (t < 0.5) return mix(c1, c2, (t - 0.22) / 0.28);
    if (t < 0.82) return mix(c2, c3, (t - 0.5) / 0.32);
    return mix(c3, c4, clamp((t - 0.82) / 0.45, 0.0, 1.0));
  }

  vec3 starTint(float h) {
    if (h < 0.35) return vec3(0.64, 0.77, 1.0);
    if (h < 0.78) return vec3(0.95, 0.97, 1.0);
    if (h < 0.94) return vec3(1.0, 0.91, 0.78);
    return vec3(1.0, 0.72, 0.5);
  }

  // ---- the accretion disk at a plane crossing ------------------------------------
  // beam = width of the pixel's ray bundle where it meets the disk
  vec4 disk(vec3 hit, float r, vec3 dir, float beam) {
    float phi = atan(hit.z, hit.x);
    float v = log(r / RIN) / LOGSPAN;
    // the footprint is an ellipse on the plane: stretched along the in-plane view direction
    // by 1/|dir.y|. Explicit gradients let the GPU filter it anisotropically.
    vec2 er = hit.xz / r;
    vec2 et = vec2(-er.y, er.x);
    vec2 m = dir.xz;
    float ml = length(m);
    m = ml > 1e-4 ? m / ml : et;
    vec2 ax1 = m * beam / max(abs(dir.y), 0.02);
    vec2 ax2 = vec2(-m.y, m.x) * beam;
    vec2 gx = vec2(dot(ax1, et) / (r * TAU), dot(ax1, er) / (r * LOGSPAN));
    vec2 gy = vec2(dot(ax2, et) / (r * TAU), dot(ax2, er) / (r * LOGSPAN));
    // Keplerian shear, sampled in two phases so the streaks never wind up forever
    float omega = pow(r, -1.5) * 1.6;
    const float T = 8.0;
    float ph1 = fract(uTime / T);
    float ph2 = fract(uTime / T + 0.5);
    float w1 = 1.0 - abs(2.0 * ph1 - 1.0);
    vec4 s = textureGrad(uDisk, vec2((phi - omega * ph1 * T) / TAU, v), gx, gy) * w1
           + textureGrad(uDisk, vec2((phi - omega * ph2 * T) / TAU + 0.37, v), gx, gy) * (1.0 - w1);

    float radial = smoothstep(RIN, RIN + 0.8, r) * (1.0 - smoothstep(ROUT * 0.55, ROUT, r));
    float streaks = (0.3 + 0.7 * s.g) * (0.62 + 0.38 * s.a);
    float turb = 0.45 + 0.75 * s.r;

    // a few hot spots orbiting in the inner disk
    float spots = 0.0;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float rk = 3.5 + fk * 1.4;
      float ang = phi - (fk * 2.1 + pow(rk, -1.5) * 1.6 * uTime);
      ang = mod(ang + 3.14159265, TAU) - 3.14159265;
      float d2 = pow((r - rk) / 0.38, 2.0) + pow(ang * rk / (0.8 + fk * 0.3), 2.0);
      spots += exp(-d2) * (1.0 - fk * 0.25);
    }

    float dens = radial * (turb * streaks + spots * 0.45);
    float temp = pow(RIN / r, 0.8) * (0.8 + 0.35 * s.b) + spots * 0.35;

    // relativistic Doppler beaming + gravitational redshift
    vec3 vdir = normalize(vec3(-hit.z, 0.0, hit.x));
    float beta = min(sqrt(0.5 / max(r - 1.0, 0.35)), 0.7);
    float gam = inversesqrt(1.0 - beta * beta);
    float g = sqrt(max(1.0 - 1.0 / r, 0.02)) / (gam * (1.0 - beta * dot(vdir, -dir)));

    vec3 col = thermal(temp * g) * pow(g, 3.0) * temp * 1.8 * dens;
    return vec4(col, clamp(dens * 1.05, 0.0, 1.0));
  }

  // ---- one photon path ----------------------------------------------------------
  // deflection a straight ray from p along d still picks up on its way to infinity:
  // (2/b + k/b^2) x the share of the path integral that lies ahead
  vec3 farBend(vec3 p, vec3 d, float k) {
    float s = dot(p, d);
    vec3 perp = p - d * s;
    float b2 = max(dot(perp, perp), 1e-6);
    float b = sqrt(b2);
    float F = s * (2.0 * s * s + 3.0 * b2) / pow(s * s + b2, 1.5);
    return -perp / b * (2.0 / b + k / b2) * (2.0 - F) * 0.25;
  }

  struct Hit { vec3 col; float trans; float captured; vec3 dir; float minR; };

  Hit trace(vec3 ro, vec3 rd, float dist, float pixAngle, float maxSteps) {
    Hit o;
    o.col = vec3(0.0);
    o.trans = 1.0;
    o.captured = 0.0;
    o.minR = 1e3;
    vec3 hv = cross(ro, rd);
    float h2 = dot(hv, hv);

    if (h2 > 16.5 * 16.5) {
      // can't reach the disk: a straight line plus the deflection it picks up from the camera
      // onward (2nd-order Schwarzschild), matching the marched rays so there's no seam
      o.dir = normalize(rd + farBend(ro, rd, 2.945));
      return o;
    }

    vec3 pos = ro;
    vec3 vel = rd;
    float b = sqrt(h2);
    float bPx = dist * pixAngle;        // impact parameter spanned by one pixel
    float travelled = 0.0;
    float outbound = 0.0;               // distance travelled since periapsis
    float r = length(pos);
    vec3 acc = -1.5 * h2 * pos / pow(r, 5.0);
    for (int i = 0; i < 320; i++) {
      if (float(i) >= maxSteps || o.trans < 0.01) break;
      if (r < 1.0) { o.captured = 1.0; o.minR = 0.0; break; }
      // heading out past the disk: nothing left to hit, the rest of the bend is analytic
      if (r > ROUT + 1.0 && dot(pos, vel) > 0.0) break;
      // fine steps where the field is strong, long strides out where it's weak
      float dt = clamp(0.08 * r * mix(1.0, 2.5, smoothstep(3.5, 10.0, r)), 0.012, 3.0);
      // leapfrog (kick–drift–kick); the closing kick's force is reused as the next opening one
      vel += acc * (0.5 * dt);
      vec3 npos = pos + vel * dt;
      float r2n = dot(npos, npos);
      float rn = sqrt(r2n);
      acc = -1.5 * h2 * npos / (r2n * r2n * rn);
      vel += acc * (0.5 * dt);
      travelled += dt;
      outbound += dot(pos, vel) > 0.0 ? dt : 0.0;
      // near the photon sphere, closest approach along the segment (not just at the steps)
      // keeps the photon ring a smooth line
      if (r < 2.4) {
        vec3 seg = npos - pos;
        o.minR = min(o.minR, length(pos + seg * clamp(-dot(pos, seg) / dot(seg, seg), 0.0, 1.0)));
      }
      if (pos.y * npos.y < 0.0) {
        vec3 hit = mix(pos, npos, pos.y / (pos.y - npos.y));
        float hr = length(hit.xz);
        if (hr > RIN && hr < ROUT) {
          // ray bundle width: grows with distance, and after swinging past the hole it also
          // fans out by dα/db (weak field + the log divergence near the photon sphere)
          float fan = 2.0 / h2 + 1.0 / max(b - BCRIT, bPx);
          vec4 dc = disk(hit, hr, normalize(vel), travelled * pixAngle + outbound * bPx * fan);
          o.col += o.trans * dc.rgb;
          o.trans *= 1.0 - dc.a;
        }
      }
      pos = npos;
      r = rn;
    }
    // the rest of the way out is weak-field: add it analytically
    vec3 d = normalize(vel);
    o.dir = o.captured > 0.5 ? d : normalize(d + farBend(pos, d, 2.945));
    return o;
  }

  // ---- background ---------------------------------------------------------------
  vec2 equirect(vec3 d) {
    return vec2(atan(d.z, d.x) / TAU + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5);
  }

  // stars live on an equi-angular cube map: flat 2D cells of near-constant angular size,
  // each star kept well inside its cell so its footprint is never cut into a square.
  // Faces are oriented (horizontal, vertical) so diffraction spikes stay upright.
  vec3 starLayer(vec3 d, float n, float prob, float fw, float intrinsic, float bright, float seed, bool spikes) {
    vec3 a = abs(d);
    vec2 uv;
    float face;
    if (a.x >= a.y && a.x >= a.z) { uv = d.zy / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
    else if (a.y >= a.z) { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
    else { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
    // (4/pi) atan(uv), polynomial: the warp only has to be consistent, not exact
    vec2 w = uv + 0.3476 * uv * (1.0 - abs(uv));
    vec2 cell = floor(w * n);
    vec3 key = vec3(cell, face * 997.0 + seed);
    float h = hash13(key);
    if (h > prob) return vec3(0.0);
    // offset in radians: the equi-angular warp is ~pi/4 rad per unit everywhere
    vec2 off = (w - (cell + 0.3 + 0.4 * hash33(key * 1.37).xy) / n) * 0.78539816;

    float cellAngle = 0.78539816 / n;
    float size = intrinsic * (0.4 + 0.6 * fract(h * 131.7));
    float sigma = max(size, fw * 0.5);
    float mag = (0.06 + pow(fract(h * 71.3 + 0.13), 4.0)) * bright;
    // energy-conserving blur; once the footprint nears the cell size (strong lensing), fade out
    float flux = mag * (size * size) / (sigma * sigma) * (1.0 - smoothstep(0.1, 0.2, sigma / cellAngle));
    float tw = 0.8 + 0.2 * sin(uTime * (1.1 + fract(h * 17.0) * 4.0) + h * 91.0);
    vec3 tint = starTint(fract(h * 37.7));
    vec3 c = tint * flux * exp(-0.5 * dot(off, off) / (sigma * sigma)) * tw;
    if (spikes && mag > 0.8 * bright) {
      vec2 o = off / sigma;
      float lenFade = 1.0 - smoothstep(0.0, 0.3 * cellAngle, length(off));
      c += tint * (exp(-abs(o.x) / 12.0) * exp(-o.y * o.y) + exp(-abs(o.y) / 12.0) * exp(-o.x * o.x)) * flux * 0.16 * tw * lenFade;
    }
    return c;
  }

  vec3 background(vec3 dir, vec2 dx, vec2 dy, float fw) {
    vec4 t = textureGrad(uSky, equirect(dir), dx, dy);
    vec3 sky = pow(t.rgb, vec3(2.2));
    float density = t.a * 4.0;
    return sky
      + starLayer(dir, 40.0, 0.03, fw, 0.0005, 2.4, 1.0, true)
      + starLayer(dir, 90.0, 0.03 * clamp(density, 0.5, 2.5), fw, 0.00032, 0.85, 7.0, false)
      + starLayer(dir, 170.0, 0.04 * clamp(density, 0.4, 3.0), fw, 0.0002, 0.36, 13.0, false);
  }

  bool seesSky(Hit h) { return h.captured < 0.5 && h.trans > 0.004; }

  vec3 shade(Hit h, vec3 bg) {
    vec3 ring = vec3(0.55, 0.8, 1.0) * exp(-abs(h.minR - 1.53) * 22.0) * 0.7;
    return h.col + h.trans * (bg * (1.0 - h.captured) + ring);
  }

  mat3 lookAt(vec3 ro, vec3 ta) {
    vec3 f = normalize(ta - ro);
    vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
    return mat3(r, cross(f, r), f);
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    float intro = smoothstep(0.0, 1.0, uIntro);
    float pixAngle = 1.0 / (uFocal * uRes.y);

    // camera: dolly in on the intro, a slow orbit so the lensed sky keeps drifting,
    // and on scroll it rises above the disk and dives closer
    float dist = mix(uDist * 1.7, uDist, intro) * (1.0 - uScroll * 0.4);
    float elev = 0.072 + uScroll * 0.17 + uMouse.y * 0.015 + 0.008 * sin(uTime * 0.07);
    float az = uTime * 0.012 + uMouse.x * 0.1;
    vec3 ro = vec3(sin(az) * cos(elev), sin(elev), -cos(az) * cos(elev)) * dist;
    mat3 cam = lookAt(ro, vec3(0.0, uLook * dist, 0.0));
    vec3 rd = normalize(cam * vec3((frag - 0.5 * uRes) / uRes.y, uFocal));

    Hit h = trace(ro, rd, dist, pixAngle, uSteps);
    // background derivatives in uniform control flow (seam-safe across the equirect wrap)
    vec2 uv = equirect(h.dir);
    vec2 dx = dFdx(uv), dy = dFdy(uv);
    dx.x -= floor(dx.x + 0.5);
    dy.x -= floor(dy.x + 0.5);
    float fw = max(length(fwidth(h.dir)), pixAngle);
    vec3 col = shade(h, seesSky(h) ? background(h.dir, dx, dy, fw) : vec3(0.0));

    // one ray per pixel aliases along the shadow edge and photon ring. Both are circles
    // around the hole, so they only change fast radially: two extra rays across the ring
    // (±1/3 px, radially) anti-alias that thin annulus
    float b = length(cross(ro, rd));
    float px = dist * pixAngle;
    if (b > BCRIT - 1.0 * px && b < BCRIT + 3.5 * px) {
      vec3 hole = transpose(cam) * -ro;
      vec2 holePx = hole.xy / hole.z * uFocal * uRes.y + 0.5 * uRes;
      vec2 radial = normalize(frag - holePx + 1e-4);
      vec3 acc = col;
      for (int k = 0; k < 2; k++) {
        vec2 o = radial * (float(k) * 0.68 - 0.34);
        vec3 rdk = normalize(cam * vec3((frag + o - 0.5 * uRes) / uRes.y, uFocal));
        Hit hk = trace(ro, rdk, dist, pixAngle, uSteps * 0.6);
        acc += shade(hk, seesSky(hk) ? background(hk.dir, dx, dy, fw) : vec3(0.0));
      }
      col = acc / 3.0;
    }

    col *= mix(0.06, 1.0, intro);
    gl_FragColor = vec4(col, 1.0);
  }
`

// ---------------------------------------------------------------- finish pass
const FINISH_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tScene;
  uniform vec2 uTexel;
  uniform float uTime, uSharpen, uExposure;
  float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

  void main() {
    vec2 c = vUv - 0.5;
    float r2 = dot(c, c);
    vec2 ca = c * r2 * 0.006;
    vec3 center = texture(tScene, vUv).rgb;
    vec3 col = vec3(texture(tScene, vUv - ca).r, center.g, texture(tScene, vUv + ca).b);

    // contrast-adaptive sharpening, backing off on bright highlights
    vec3 n = texture(tScene, vUv + vec2(uTexel.x, 0.0)).rgb + texture(tScene, vUv - vec2(uTexel.x, 0.0)).rgb
           + texture(tScene, vUv + vec2(0.0, uTexel.y)).rgb + texture(tScene, vUv - vec2(0.0, uTexel.y)).rgb;
    col += (center - n * 0.25) * uSharpen / (1.0 + luma(center) * 3.0);
    col = max(col, 0.0);

    col = aces(col * uExposure);
    col = pow(col, vec3(1.0 / 2.2));
    col *= 1.0 - 0.34 * smoothstep(0.08, 0.5, r2 * 1.5);
    col += (hash12(gl_FragCoord.xy + fract(uTime * 13.0) * 97.0) - 0.5) * 0.016;
    gl_FragColor = vec4(col, 1.0);
  }
`

// ------------------------------------------------------ GLSL: bloom (three's UnrealBloomPass)
const HIGHPASS_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float luminosityThreshold;
  uniform float smoothWidth;
  varying vec2 vUv;
  float luminance(const in vec3 rgb) { return dot(vec3(0.2126, 0.7152, 0.0722), rgb); }
  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    float alpha = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, luminance(texel.xyz));
    gl_FragColor = mix(vec4(0.0), texel, alpha);
  }
`

const BLUR_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D colorTexture;
  uniform vec2 invSize;
  uniform vec2 direction;
  uniform float centerWeight;
  uniform float gaussianOffsets[KERNEL_PAIRS];
  uniform float gaussianWeights[KERNEL_PAIRS];
  void main() {
    vec3 diffuseSum = texture2D(colorTexture, vUv).rgb * centerWeight;
    for (int i = 0; i < KERNEL_PAIRS; i++) {
      vec2 uvOffset = direction * invSize * gaussianOffsets[i];
      diffuseSum += (texture2D(colorTexture, vUv + uvOffset).rgb + texture2D(colorTexture, vUv - uvOffset).rgb) * gaussianWeights[i];
    }
    gl_FragColor = vec4(diffuseSum, 1.0);
  }
`

const COMPOSITE_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D blurTexture1, blurTexture2, blurTexture3, blurTexture4, blurTexture5;
  uniform float bloomStrength;
  uniform float bloomRadius;
  uniform float bloomFactors[5];
  float lerpBloomFactor(const in float factor) { return mix(factor, 1.2 - factor, bloomRadius); }
  void main() {
    vec3 bloom = 3.0 * bloomStrength * (
      lerpBloomFactor(bloomFactors[0]) * texture2D(blurTexture1, vUv).rgb +
      lerpBloomFactor(bloomFactors[1]) * texture2D(blurTexture2, vUv).rgb +
      lerpBloomFactor(bloomFactors[2]) * texture2D(blurTexture3, vUv).rgb +
      lerpBloomFactor(bloomFactors[3]) * texture2D(blurTexture4, vUv).rgb +
      lerpBloomFactor(bloomFactors[4]) * texture2D(blurTexture5, vUv).rgb
    );
    gl_FragColor = vec4(bloom, max(bloom.r, max(bloom.g, bloom.b)));
  }
`

const COPY_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  varying vec2 vUv;
  void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
`

/** Gaussian taps merged pairwise into bilinear fetches, as UnrealBloomPass builds them. */
function blurKernel(radius: number) {
  const sigma = radius / 3
  const c: number[] = []
  for (let i = 0; i < radius; i++) c.push((0.39894 * Math.exp((-0.5 * i * i) / (sigma * sigma))) / sigma)
  const offsets: number[] = []
  const weights: number[] = []
  for (let i = 1; i < radius; i += 2) {
    const wa = c[i]!
    const wb = i + 1 < radius ? c[i + 1]! : 0
    offsets.push((i * wa + (i + 1) * wb) / (wa + wb))
    weights.push(wa + wb)
  }
  return { center: c[0]!, offsets, weights }
}

/** Bright-pass, five blurred mips, composite, added back onto the scene. */
class Bloom {
  private bright: Target
  private horizontal: Target[] = []
  private vertical: Target[] = []
  private highpass: Program
  private blurs: { program: Program; kernel: ReturnType<typeof blurKernel> }[] = []
  private composite: Program
  private copy: Program

  constructor(
    private g: GL,
    private strength = 0.42,
    private radius = 0.5,
    private threshold = 1,
  ) {
    this.bright = g.target(1, 1, { half: true })
    for (let i = 0; i < 5; i++) {
      this.horizontal.push(g.target(1, 1, { half: true }))
      this.vertical.push(g.target(1, 1, { half: true }))
    }
    this.highpass = g.program(QUAD_VERT, HIGHPASS_FRAG)
    for (const r of [6, 10, 14, 18, 22]) {
      const kernel = blurKernel(r)
      this.blurs.push({ program: g.program(QUAD_VERT, BLUR_FRAG, { KERNEL_PAIRS: kernel.offsets.length }), kernel })
    }
    this.composite = g.program(QUAD_VERT, COMPOSITE_FRAG)
    this.copy = g.program(QUAD_VERT, COPY_FRAG)
  }

  get programs() {
    return [this.highpass, ...this.blurs.map((b) => b.program), this.composite, this.copy]
  }

  setSize(width: number, height: number) {
    let x = Math.round(width / 2)
    let y = Math.round(height / 2)
    this.g.resize(this.bright, x, y)
    for (let i = 0; i < 5; i++) {
      this.g.resize(this.horizontal[i]!, x, y)
      this.g.resize(this.vertical[i]!, x, y)
      x = Math.round(x / 2)
      y = Math.round(y / 2)
    }
  }

  render(scene: Target) {
    const { g } = this
    const gl = g.gl

    g.bind(this.bright)
    this.highpass.use()
    g.texture(0, scene)
    this.highpass.u1i('tDiffuse', 0)
    this.highpass.u1f('luminosityThreshold', this.threshold)
    this.highpass.u1f('smoothWidth', 0.01)
    g.draw()

    let input = this.bright
    this.blurs.forEach(({ program, kernel }, i) => {
      const h = this.horizontal[i]!
      const v = this.vertical[i]!
      program.use()
      program.u1i('colorTexture', 0)
      program.u2f('invSize', 1 / h.w, 1 / h.h)
      program.u1f('centerWeight', kernel.center)
      program.u1fv('gaussianOffsets', kernel.offsets)
      program.u1fv('gaussianWeights', kernel.weights)
      g.bind(h)
      g.texture(0, input)
      program.u2f('direction', 1, 0)
      g.draw()
      g.bind(v)
      g.texture(0, h)
      program.u2f('direction', 0, 1)
      g.draw()
      input = v
    })

    g.bind(this.horizontal[0]!)
    this.composite.use()
    this.vertical.forEach((t, i) => {
      g.texture(i, t)
      this.composite.u1i(`blurTexture${i + 1}`, i)
    })
    this.composite.u1f('bloomStrength', this.strength)
    this.composite.u1f('bloomRadius', this.radius)
    this.composite.u1fv('bloomFactors', [1, 0.8, 0.6, 0.4, 0.2])
    g.draw()

    // added onto the scene (premultiplied additive: ONE, ONE)
    g.bind(scene)
    this.copy.use()
    g.texture(0, this.horizontal[0]!)
    this.copy.u1i('tDiffuse', 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    g.draw()
    gl.disable(gl.BLEND)
  }
}

// ------------------------------------------------------------------- the scene
interface HostOptions {
  framing: Framing
  controls: SceneControls
  /** The first frame has been drawn into this host. */
  onReady?: () => void
}

interface Host extends HostOptions {
  el: HTMLElement
  visible: boolean
  shown: boolean
}

const STRIPS = 4
const SKY_SIZE = [2048, 1024] as const

/** The galaxy's frame: its core sits low behind the disk, its plane tilted 12°. Column-major. */
function galacticFrame() {
  const tilt = (12 * Math.PI) / 180
  const north = [-Math.sin(tilt), Math.cos(tilt), 0]
  const norm = (v: number[]) => {
    const l = Math.hypot(v[0]!, v[1]!, v[2]!)
    return v.map((x) => x / l)
  }
  const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!]
  const inPlane = norm(cross(north, [0, 0, 1]))
  const core = norm([inPlane[0]! * Math.sin(0.5), inPlane[1]! * Math.sin(0.5), -Math.cos(0.5) + inPlane[2]! * Math.sin(0.5)])
  const gz = norm(cross(core, north))
  // rows: core, north, gz
  return [core[0]!, north[0]!, gz[0]!, core[1]!, north[1]!, gz[1]!, core[2]!, north[2]!, gz[2]!]
}

class BlackHole {
  readonly canvas = document.createElement('canvas')
  private g!: GL
  private sky!: Program
  private disk!: Program
  private main!: Program
  private finish!: Program
  private bloom!: Bloom
  private skyRT!: Target
  private diskRT!: Target
  private sceneRT!: Target
  private diskSize: readonly [number, number]
  private gal = galacticFrame()

  private hosts: Host[] = []
  private active: Host | null = null
  private io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const host = this.hosts.find((h) => h.el === e.target)
      if (host) host.visible = e.isIntersecting
    }
  })
  private ro = new ResizeObserver(([entry]) => {
    if (!entry) return
    this.width = Math.max(1, entry.contentRect.width)
    this.height = Math.max(1, entry.contentRect.height)
    this.applySize()
    this.dirty = true
  })

  private still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  private compact = window.matchMedia('(max-width: 767px)').matches
  private outDpr = Math.min(window.devicePixelRatio || 1, this.compact ? 2 : 1.5)
  private maxQuality = this.compact ? 0.75 : 1
  private minQuality = this.compact ? 0.45 : 0.55
  private quality = this.maxQuality
  private ceiling = this.maxQuality
  private width = 1
  private height = 1
  private bufW = 1
  private bufH = 1

  private compiled = false
  private failed = false
  private lost = false
  private baked = 0
  private dirty = true
  private start = performance.now()
  private pointer = { x: 0, y: 0 }
  private pointerTarget = { x: 0, y: 0 }

  // adaptive resolution
  private last = 0
  private warmup = 60 // frames after the bake: shader compile and page settle aren't the GPU's steady state
  private fastWindows = 0
  private stableWindows = 0
  private frameTimes: number[] = []

  constructor() {
    this.canvas.className = 'absolute inset-0 block h-full w-full'
    this.canvas.setAttribute('aria-hidden', 'true')
    this.diskSize = this.compact ? [1024, 512] : [2048, 1024]
    this.init()

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.lost = true
    })
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false
      this.init(true)
    })
    if (!this.still) {
      window.addEventListener(
        'pointermove',
        (e) => {
          this.pointerTarget.x = (e.clientX / window.innerWidth) * 2 - 1
          this.pointerTarget.y = -((e.clientY / window.innerHeight) * 2 - 1)
        },
        { passive: true },
      )
    }
    gsap.ticker.add(this.tick)
  }

  /** (Re)creates every GPU resource: on start, and after a lost context comes back. */
  private init(restored = false) {
    if (restored || !this.g) this.g = new GL(this.canvas)
    const g = this.g
    const aniso = Math.min(8, g.maxAnisotropy)
    const baked = { mipmaps: true, repeatS: true, anisotropy: aniso }
    this.skyRT = g.target(SKY_SIZE[0], SKY_SIZE[1], baked)
    this.diskRT = g.target(this.diskSize[0], this.diskSize[1], baked)
    this.sceneRT = g.target(1, 1, { half: true })
    this.sky = g.program(QUAD_VERT, SKY_FRAG)
    this.disk = g.program(QUAD_VERT, DISK_FRAG)
    this.main = g.program(QUAD_VERT, MAIN_FRAG)
    this.finish = g.program(QUAD_VERT, FINISH_FRAG)
    this.bloom = new Bloom(g)
    this.compiled = false
    this.baked = 0
    this.dirty = true
    this.applySize()
    progress('scene', 0.15)
  }

  attach(el: HTMLElement, opts: HostOptions) {
    const host: Host = { ...opts, el, visible: false, shown: false }
    this.hosts.push(host)
    this.io.observe(el)
    return () => {
      this.io.unobserve(el)
      this.hosts = this.hosts.filter((h) => h !== host)
      if (this.active === host) {
        this.active = null
        this.ro.disconnect()
        this.canvas.remove()
      }
    }
  }

  // -------------------------------------------------------------------- sizing
  private applySize() {
    this.bufW = Math.max(1, Math.floor(this.width * this.outDpr))
    this.bufH = Math.max(1, Math.floor(this.height * this.outDpr))
    this.canvas.width = this.bufW
    this.canvas.height = this.bufH
    const w = Math.max(2, Math.round(this.bufW * this.quality))
    const h = Math.max(2, Math.round(this.bufH * this.quality))
    this.g.resize(this.sceneRT, w, h)
    this.bloom.setSize(w, h)
  }

  /** The canvas lives in the first host that's on screen. */
  private pickHost() {
    const host = this.hosts.find((h) => h.visible) ?? null
    if (host && host !== this.active) {
      this.active = host
      host.el.appendChild(this.canvas)
      this.ro.disconnect()
      this.ro.observe(host.el)
      const rect = host.el.getBoundingClientRect()
      this.width = Math.max(1, rect.width)
      this.height = Math.max(1, rect.height)
      this.applySize()
      this.dirty = true
    }
    return host
  }

  // ---------------------------------------------------------------- start-up
  private allPrograms() {
    return [this.sky, this.disk, this.main, this.finish, ...this.bloom.programs]
  }

  private checkCompiled() {
    const programs = this.allPrograms()
    const ready = programs.filter((p) => p.ready()).length // throws if one failed
    progress('scene', 0.15 + 0.45 * (ready / programs.length))
    this.compiled = ready === programs.length
    return this.compiled
  }

  private bakeStep() {
    const { g } = this
    const gl = g.gl
    if (this.baked === 0) {
      g.bind(this.diskRT)
      this.disk.use()
      this.disk.u1f('uRadial', this.diskSize[1])
      g.draw()
      g.mipmaps(this.diskRT)
    }
    const h = SKY_SIZE[1] / STRIPS
    g.bind(this.skyRT)
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(0, this.baked * h, SKY_SIZE[0], h)
    this.sky.use()
    this.sky.uMat3('uGal', this.gal)
    this.sky.u1f('uOctaves', 4)
    g.draw()
    gl.disable(gl.SCISSOR_TEST)
    g.mipmaps(this.skyRT)
    this.baked++
    progress('scene', 0.6 + 0.3 * (this.baked / STRIPS))
  }

  // ------------------------------------------------------------------ frames
  private render(now: number, host: Host) {
    const { g } = this
    const t = this.still ? 18 : (now - this.start) / 1000
    this.pointer.x += (this.pointerTarget.x - this.pointer.x) * 0.035
    this.pointer.y += (this.pointerTarget.y - this.pointer.y) * 0.035

    g.bind(this.sceneRT)
    const m = this.main
    m.use()
    g.texture(0, this.skyRT)
    g.texture(1, this.diskRT)
    m.u1i('uSky', 0)
    m.u1i('uDisk', 1)
    m.u2f('uRes', this.sceneRT.w, this.sceneRT.h)
    m.u1f('uTime', t)
    m.u1f('uIntro', host.controls.intro.v)
    m.u1f('uScroll', host.controls.scroll.v)
    m.u2f('uMouse', this.pointer.x, this.pointer.y)
    m.u1f('uLook', host.framing === 'footer' ? 0.1 : 0.27)
    m.u1f('uDist', host.framing === 'footer' ? 30 : 24)
    m.u1f('uSteps', this.compact ? 160 : 260)
    m.u1f('uFocal', 0.909)
    g.draw()

    this.bloom.render(this.sceneRT)

    g.bind(null, this.bufW, this.bufH)
    const f = this.finish
    f.use()
    g.texture(0, this.sceneRT)
    f.u1i('tScene', 0)
    f.u2f('uTexel', 1 / this.sceneRT.w, 1 / this.sceneRT.h)
    f.u1f('uTime', t)
    f.u1f('uSharpen', 0.45)
    f.u1f('uExposure', 1.05)
    g.draw()

    this.dirty = false
    if (!host.shown) {
      host.shown = true
      progress('scene', 1)
      host.onReady?.()
    }
  }

  /** Drop resolution when the GPU can't hold ~50fps; win it back once there's headroom. */
  private settle(sorted: number[]) {
    const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 16
    const p90 = sorted[Math.floor(sorted.length * 0.9)] ?? 16
    if (p50 > 20 && this.quality > this.minQuality) {
      this.ceiling = Math.min(this.ceiling, this.quality * 0.97)
      this.quality = Math.max(this.minQuality, this.quality * 0.9)
      this.fastWindows = this.stableWindows = 0
      this.applySize()
    } else if (p90 < 17.8 && this.quality < this.ceiling) {
      if (++this.fastWindows >= 3) {
        this.quality = Math.min(this.ceiling, this.quality * 1.05)
        this.fastWindows = 0
        this.applySize()
      }
    } else {
      this.fastWindows = 0
      if (++this.stableWindows >= 12 && this.ceiling < this.maxQuality) {
        this.ceiling = Math.min(this.maxQuality, this.ceiling * 1.04)
        this.stableWindows = 0
      }
    }
  }

  private tick = () => {
    if (this.failed || this.lost) return
    const host = this.pickHost()
    if (!host) return
    try {
      if (!this.compiled && !this.checkCompiled()) return
    } catch (err) {
      this.failed = true
      console.warn('[scene] black hole unavailable', err)
      progress('scene', 1)
      return
    }
    if (this.baked < STRIPS) {
      this.bakeStep()
      if (this.baked === STRIPS && this.still) this.render(performance.now(), host)
      return
    }
    if (this.still) {
      if (this.dirty || !host.shown) this.render(performance.now(), host)
      return
    }
    const now = performance.now()
    if (this.warmup > 0) this.warmup--
    else if (this.last && now - this.last < 250) {
      this.frameTimes.push(now - this.last)
      if (this.frameTimes.length >= 45) {
        this.settle([...this.frameTimes].sort((a, b) => a - b))
        this.frameTimes.length = 0
      }
    }
    this.last = now
    this.render(now, host)
  }
}

let instance: BlackHole | undefined

/**
 * Show the black hole in `el` (the hero's ground, the footer's stage). Throws when WebGL2
 * is unavailable, so the caller keeps its CSS stand-in.
 */
export function attachBlackHole(el: HTMLElement, opts: HostOptions) {
  instance ??= new BlackHole()
  return instance.attach(el, opts)
}
