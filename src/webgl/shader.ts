/**
 * Nebula sky shader, used by every sky surface on the site (hero backdrop, cards, tiles,
 * project covers). Clouds are domain-warped noise stretched into long-exposure streaks that
 * bend into arcs around a vanishing point, or rounded into puffy nebulae (`uPuff`), lit by
 * the preset's palette with an optional core glow (`uSun`) and a sprinkle of stars.
 */

export const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const fragmentShader = /* glsl */ `
varying vec2 vUv;

uniform vec2  uRes;
uniform float uTime;
uniform float uSeed;
uniform vec4  uCrop;
uniform float uAspect;
uniform vec2  uMouse;

uniform vec3 uZenith;
uniform vec3 uZenith2;
uniform vec3 uSky;
uniform vec3 uHaze;
uniform vec3 uShade;
uniform vec3 uLit;
uniform vec3 uHi;
uniform vec3 uBase;
uniform vec3 uSunCol;

uniform vec2  uVanish;
uniform float uStretch;
uniform float uAngle;
uniform float uScale;
uniform float uCoverage;
uniform float uSoftness;
uniform float uOpacity;
uniform float uSpeed;
uniform float uPuff;
uniform float uWarp;
uniform float uBand;
uniform vec2  uFade;
uniform vec2  uFadeTop;
uniform float uStars;
uniform vec3  uSun;
uniform float uVignette;
uniform float uGlow;
uniform float uCurve;
uniform float uPink;
uniform float uTopDim;

// --- hashing (Dave Hoskins, "hash without sine") -------------------------
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// --- quintic gradient noise, ~[-0.7, 0.7] ---------------------------------
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i) * 2.0 - 1.0, f);
  float b = dot(hash22(i + vec2(1.0, 0.0)) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Anisotropy-preserving fbm (no octave rotation) — used for streaks.
float fbmS(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * gnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

// Isotropic fbm — used for colour zones and puffy clouds.
float fbmR(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    s += a * gnoise(p);
    p = m * p * 2.02 + 3.1;
    a *= 0.5;
  }
  return s;
}

float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * gnoise(p);
    p = p * 2.07 + 5.3;
    a *= 0.5;
  }
  return s;
}

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float star(vec2 p, float threshold) {
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  float r = hash12(id + 7.13 + uSeed);
  if (r < threshold) return 0.0;
  vec2 o = (hash22(id + 3.7) - 0.5) * 0.6;
  float dd = length(f - o);
  float tw = 0.55 + 0.45 * sin(uTime * (0.7 + r * 2.2) + r * 71.0);
  float size = mix(0.05, 0.11, fract(r * 13.7));
  return (smoothstep(size, 0.0, dd) + smoothstep(size * 4.0, 0.0, dd) * 0.18) * tw;
}

void main() {
  vec2 uv = uCrop.xy + vUv * uCrop.zw;
  float t = uTime * uSpeed;
  float scenePx = uRes.y / uCrop.w;

  vec2 sp = vec2((uv.x - 0.5) * uAspect, uv.y);
  vec2 vp = vec2((uVanish.x - 0.5) * uAspect, uVanish.y) + uMouse * vec2(0.035, 0.018);
  vec2 d = rot(uAngle) * (sp - vp);

  // ---------------------------------------------------------------- clouds
  // streaks run along x and bend into arcs (uCurve) around the vanishing point
  vec2 cp = vec2(d.y - uCurve * d.x * d.x, d.x) * 2.2;

  vec2 q = cp * uScale;
  q.y = q.y / uStretch - t;
  q += uSeed * 13.1;

  vec2 w = vec2(fbm3(q * 0.55 + vec2(0.0, t * 0.12)), fbm3(q * 0.55 + vec2(5.2, 1.3)));
  float n = fbmS(q + uWarp * w);
  if (uPuff > 0.001) {
    vec2 pq = cp * uScale * 0.9 + uSeed * 7.0 + w * 0.6 + vec2(t * 0.35, 0.0);
    n = mix(n, fbmR(pq), uPuff);
  }
  float n01 = clamp(n + 0.5, 0.0, 1.0);

  float dens = smoothstep(uCoverage - uSoftness, uCoverage + uSoftness, n01);
  float gaps = 1.0 - smoothstep(0.08, uCoverage - 0.02, n01);

  // ------------------------------------------------------------- sky base
  float gy = uv.y;
  vec3 top = mix(uZenith, uZenith2, smoothstep(0.05, 0.95, uv.x));
  vec3 sky = mix(uHaze, uSky, smoothstep(uVanish.y - 0.05, uVanish.y + 0.32, gy));
  sky = mix(sky, top, smoothstep(uVanish.y + 0.18, 1.0, gy));

  // big soft colour zones: where the palette leans to lit vs. shade
  float zone = fbmR(vec2(uv.x * uAspect, uv.y) * 0.9 + uSeed * 3.0 + vec2(t * 0.04, 0.0)) + 0.5;
  float pinkBand = exp(-pow((gy - uVanish.y - 0.06) / 0.2, 2.0));
  zone = clamp(zone + (uv.x - 0.5) * 0.25 + pinkBand * uPink, 0.0, 1.0);

  // sun / horizon glow
  vec2 sunP = vec2((uSun.x - 0.5) * uAspect, uSun.y);
  float sd = length(sp - sunP);
  float sunGlow = uSun.z * (exp(-sd * 3.2) * 0.55 + exp(-sd * 14.0) * 0.9);
  sky += uSunCol * sunGlow;

  vec3 cloud = mix(uShade, uLit, smoothstep(0.32, 0.78, zone));
  cloud = mix(cloud, uHi, smoothstep(0.52, 0.96, n01) * smoothstep(0.25, 0.65, zone));
  cloud += uSunCol * uSun.z * exp(-sd * 2.4) * 0.6;

  if (uPuff > 0.001) {
    // cheap self-shadowing: brighter on the side facing the light
    vec2 lq = cp * uScale * 0.9 + uSeed * 7.0 + w * 0.6 + vec2(t * 0.35, 0.0) + vec2(0.06, 0.09);
    float n2 = fbmR(lq) + 0.5;
    float lit = clamp((n01 - n2) * 5.0 + 0.5, 0.0, 1.0);
    cloud = mix(cloud * 0.72, mix(cloud, uHi, 0.55) * 1.12, lit * uPuff + (1.0 - uPuff) * 0.5);
  }

  float band = mix(1.0, smoothstep(uVanish.y - 0.04, uVanish.y + 0.16, gy) * (1.0 - uTopDim * smoothstep(0.6, 1.02, gy)), uBand);
  vec3 col = mix(sky, cloud, dens * uOpacity * band);
  col = mix(col, uZenith * 0.85, gaps * 0.55 * band);
  // luminous haze where the streaks converge
  float vd = length((sp - vp) * vec2(0.55, 1.6));
  col += uHi * uGlow * exp(-vd * 3.2) * smoothstep(uFade.x, uFade.y + 0.1, gy);

  // -------------------------------------------------------------- stars
  if (uStars > 0.001) {
    vec2 spx = vec2(uv.x * uAspect, uv.y) * scenePx;
    float s = star(spx / 26.0, 0.93) + star(spx / 61.0 + 11.0, 0.9) * 1.3;
    float mask = (1.0 - dens * 0.8) * smoothstep(uVanish.y + 0.02, uVanish.y + 0.45, gy);
    col += vec3(1.0, 0.96, 1.0) * s * mask * uStars;
  }

  // ---------------------------------------------------------- finishing
  col = mix(uBase, col, smoothstep(uFade.x, uFade.y, gy));
  col = mix(col, uBase, smoothstep(uFadeTop.x, uFadeTop.y, gy));
  vec2 vq = vUv - 0.5;
  col *= 1.0 - uVignette * dot(vq, vq) * 1.6;
  col += (hash12(gl_FragCoord.xy + fract(uTime * 7.0) * 91.0) - 0.5) / 180.0;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
