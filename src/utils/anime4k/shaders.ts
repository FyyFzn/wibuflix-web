// GLSL Shaders for Anime4K WebGL2 Pipeline (Mode A: Fast Restore & Upscale)

export const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_texCoord;

void main() {
  v_texCoord = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Pass 1: Thin lines & Restore gradient edges (Anime4K Mode A Restore)
export const RESTORE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_texSize;

in vec2 v_texCoord;
out vec4 fragColor;

float getLuma(vec4 color) {
  return dot(color.rgb, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec2 d = 1.0 / u_texSize;
  vec4 cc = texture(u_texture, v_texCoord);

  // 3x3 kernel sampling
  vec4 tl = texture(u_texture, v_texCoord + vec2(-d.x, -d.y));
  vec4 tc = texture(u_texture, v_texCoord + vec2(0.0, -d.y));
  vec4 tr = texture(u_texture, v_texCoord + vec2(d.x, -d.y));
  vec4 ml = texture(u_texture, v_texCoord + vec2(-d.x, 0.0));
  vec4 mr = texture(u_texture, v_texCoord + vec2(d.x, 0.0));
  vec4 bl = texture(u_texture, v_texCoord + vec2(-d.x, d.y));
  vec4 bc = texture(u_texture, v_texCoord + vec2(0.0, d.y));
  vec4 br = texture(u_texture, v_texCoord + vec2(d.x, d.y));

  float l_tl = getLuma(tl);
  float l_tc = getLuma(tc);
  float l_tr = getLuma(tr);
  float l_ml = getLuma(ml);
  float l_mr = getLuma(mr);
  float l_bl = getLuma(bl);
  float l_bc = getLuma(bc);
  float l_br = getLuma(br);

  float gx = (l_tr + 2.0 * l_mr + l_br) - (l_tl + 2.0 * l_ml + l_bl);
  float gy = (l_bl + 2.0 * l_bc + l_br) - (l_tl + 2.0 * l_tc + l_tr);
  vec2 grad = vec2(gx, gy);
  float gradLen = length(grad);

  if (gradLen > 0.02) {
    vec2 norm = grad / gradLen;
    // Push sampling coordinates towards the edge boundary (Anime4K gradient push)
    vec2 pushedCoord = v_texCoord - norm * d * 0.85;
    vec4 pushedColor = texture(u_texture, pushedCoord);
    
    // Adaptive edge blend: sharpen line art, preserve smooth flat anime fills
    float edgeFactor = clamp(gradLen * 3.0, 0.0, 0.9);
    fragColor = mix(cc, pushedColor, edgeFactor);
  } else {
    fragColor = cc;
  }
}
`;

// Pass 2: Upscale 2x & Contrast-Adaptive Sharpening (Catmull-Rom Bicubic + CAS)
export const UPSCALE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_texSize;

in vec2 v_texCoord;
out vec4 fragColor;

float getLuma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

// 4-tap Catmull-Rom high-fidelity bicubic filter (removes bilinear blur)
vec4 sampleCatmullRom(sampler2D tex, vec2 uv, vec2 texSize) {
  vec2 samplePos = uv * texSize;
  vec2 tc = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - tc;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;

  vec2 w0 = f2 - 0.5 * (f3 + f);
  vec2 w1 = 1.5 * f3 - 2.5 * f2 + 1.0;
  vec2 w3 = 0.5 * (f3 - f2);
  vec2 w2 = 1.0 - w0 - w1 - w3;

  vec2 s0 = w0 + w1;
  vec2 s1 = w2 + w3;

  vec2 f0 = w1 / (w0 + w1);
  vec2 f1 = w3 / (w2 + w3);

  vec2 t0 = tc - 1.0 + f0;
  vec2 t1 = tc + 1.0 + f1;

  return (s0.x * s0.y) * texture(tex, vec2(t0.x, t0.y) / texSize) +
         (s1.x * s0.y) * texture(tex, vec2(t1.x, t0.y) / texSize) +
         (s0.x * s1.y) * texture(tex, vec2(t0.x, t1.y) / texSize) +
         (s1.x * s1.y) * texture(tex, vec2(t1.x, t1.y) / texSize);
}

void main() {
  vec2 d = 1.0 / u_texSize;

  // 1. Catmull-Rom bicubic upscale from intermediate texture
  vec4 color = sampleCatmullRom(u_texture, v_texCoord, u_texSize);

  // 2. Contrast-Adaptive Sharpening (CAS / Anime4K line boost)
  vec4 top = texture(u_texture, v_texCoord - vec2(0.0, d.y * 0.75));
  vec4 btm = texture(u_texture, v_texCoord + vec2(0.0, d.y * 0.75));
  vec4 lft = texture(u_texture, v_texCoord - vec2(d.x * 0.75, 0.0));
  vec4 rgt = texture(u_texture, v_texCoord + vec2(d.x * 0.75, 0.0));

  float lumaC = getLuma(color.rgb);
  float lumaT = getLuma(top.rgb);
  float lumaB = getLuma(btm.rgb);
  float lumaL = getLuma(lft.rgb);
  float lumaR = getLuma(rgt.rgb);

  float minLuma = min(lumaC, min(min(lumaT, lumaB), min(lumaL, lumaR)));
  float maxLuma = max(lumaC, max(max(lumaT, lumaB), max(lumaL, lumaR)));

  float contrast = maxLuma - minLuma;
  if (contrast > 0.02) {
    float peakWeight = clamp(min(minLuma, 1.0 - maxLuma) / max(contrast, 0.001), 0.0, 1.0);
    float sharpAmount = -0.40 * peakWeight;

    vec4 filtered = (color + (top + btm + lft + rgt) * sharpAmount) / (1.0 + 4.0 * sharpAmount);
    fragColor = clamp(filtered, 0.0, 1.0);
  } else {
    fragColor = clamp(color, 0.0, 1.0);
  }
}
`;
