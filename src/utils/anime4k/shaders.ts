// GLSL Shaders for Anime4K WebGL2 Pipeline (Authentic bloc97 PushColor & Adaptive Sharpening)

export const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_texCoord;

void main() {
  v_texCoord = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Pass 0: Clamp Highlights / De-Ringing
// Clamps overshoot highlights to neighbor max to prevent ringing artifacts
export const CLAMP_HIGHLIGHTS_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_texSize;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec2 d = 1.0 / u_texSize;
  vec4 cc = texture(u_texture, v_texCoord);

  vec4 t  = texture(u_texture, v_texCoord - vec2(0.0, d.y));
  vec4 b  = texture(u_texture, v_texCoord + vec2(0.0, d.y));
  vec4 l  = texture(u_texture, v_texCoord - vec2(d.x, 0.0));
  vec4 r  = texture(u_texture, v_texCoord + vec2(d.x, 0.0));

  vec4 tl = texture(u_texture, v_texCoord + vec2(-d.x, -d.y));
  vec4 tr = texture(u_texture, v_texCoord + vec2(d.x, -d.y));
  vec4 bl = texture(u_texture, v_texCoord + vec2(-d.x, d.y));
  vec4 br = texture(u_texture, v_texCoord + vec2(d.x, d.y));

  vec4 maxNeighbor = max(max(max(t, b), max(l, r)), max(max(tl, tr), max(bl, br)));

  fragColor = vec4(min(cc.rgb, maxNeighbor.rgb), 1.0);
}
`;

// Pass 1: Anime4K Push Color / Thin Lines (bloc97 algorithm)
// Detects blurry gradients along edges and pushes color to thin out lines and sharpen contours
export const RESTORE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_texSize;

in vec2 v_texCoord;
out vec4 fragColor;

float getLum(vec4 rgb) {
  return (rgb.r * 2.0 + rgb.g * 3.0 + rgb.b) / 6.0;
}

vec4 getRGBL(sampler2D tex, vec2 pos) {
  vec4 col = texture(tex, pos);
  return vec4(col.rgb, getLum(col));
}

float min3v(vec4 a, vec4 b, vec4 c) { return min(min(a.a, b.a), c.a); }
float max3v(vec4 a, vec4 b, vec4 c) { return max(max(a.a, b.a), c.a); }

vec4 getLargest(vec4 cc, vec4 lightest, vec4 a, vec4 b, vec4 c, float strength) {
  vec4 newColor = cc * (1.0 - strength) + ((a + b + c) / 3.0) * strength;
  if (newColor.a > lightest.a) {
    return newColor;
  }
  return lightest;
}

void main() {
  vec2 d = 1.0 / u_texSize;
  vec4 cc = getRGBL(u_texture, v_texCoord);

  vec4 t  = getRGBL(u_texture, v_texCoord + vec2(0.0, -d.y));
  vec4 b  = getRGBL(u_texture, v_texCoord + vec2(0.0, d.y));
  vec4 l  = getRGBL(u_texture, v_texCoord + vec2(-d.x, 0.0));
  vec4 r  = getRGBL(u_texture, v_texCoord + vec2(d.x, 0.0));

  vec4 tl = getRGBL(u_texture, v_texCoord + vec2(-d.x, -d.y));
  vec4 tr = getRGBL(u_texture, v_texCoord + vec2(d.x, -d.y));
  vec4 bl = getRGBL(u_texture, v_texCoord + vec2(-d.x, d.y));
  vec4 br = getRGBL(u_texture, v_texCoord + vec2(d.x, d.y));

  vec4 lightestColor = cc;
  float strength = 0.75;

  // Kernel 0 and 4 (Vertical)
  float maxDark = max3v(br, b, bl);
  float minLight = min3v(tl, t, tr);
  if (minLight > cc.a && minLight > maxDark) {
    lightestColor = getLargest(cc, lightestColor, tl, t, tr, strength);
  } else {
    maxDark = max3v(tl, t, tr);
    minLight = min3v(br, b, bl);
    if (minLight > cc.a && minLight > maxDark) {
      lightestColor = getLargest(cc, lightestColor, br, b, bl, strength);
    }
  }

  // Kernel 1 and 5 (Diagonal 1)
  maxDark = max3v(cc, l, b);
  minLight = min3v(r, t, tr);
  if (minLight > maxDark) {
    lightestColor = getLargest(cc, lightestColor, r, t, tr, strength);
  } else {
    maxDark = max3v(cc, r, t);
    minLight = min3v(bl, l, b);
    if (minLight > maxDark) {
      lightestColor = getLargest(cc, lightestColor, bl, l, b, strength);
    }
  }

  // Kernel 2 and 6 (Horizontal)
  maxDark = max3v(l, tl, bl);
  minLight = min3v(r, br, tr);
  if (minLight > cc.a && minLight > maxDark) {
    lightestColor = getLargest(cc, lightestColor, r, br, tr, strength);
  } else {
    maxDark = max3v(r, br, tr);
    minLight = min3v(l, tl, bl);
    if (minLight > cc.a && minLight > maxDark) {
      lightestColor = getLargest(cc, lightestColor, l, tl, bl, strength);
    }
  }

  // Kernel 3 and 7 (Diagonal 2)
  maxDark = max3v(cc, l, t);
  minLight = min3v(r, br, b);
  if (minLight > maxDark) {
    lightestColor = getLargest(cc, lightestColor, r, br, b, strength);
  } else {
    maxDark = max3v(cc, r, b);
    minLight = min3v(t, l, tl);
    if (minLight > maxDark) {
      lightestColor = getLargest(cc, lightestColor, t, l, tl, strength);
    }
  }

  fragColor = vec4(lightestColor.rgb, 1.0);
}
`;

// Pass 2: Luminance-Adaptive Unsharp & Contrast Sharpening
export const UPSCALE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_texSize;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec2 d = 1.0 / u_texSize;

  vec4 c  = texture(u_texture, v_texCoord);
  vec4 t  = texture(u_texture, v_texCoord - vec2(0.0, d.y));
  vec4 b  = texture(u_texture, v_texCoord + vec2(0.0, d.y));
  vec4 l  = texture(u_texture, v_texCoord - vec2(d.x, 0.0));
  vec4 r  = texture(u_texture, v_texCoord + vec2(d.x, 0.0));

  vec4 tl = texture(u_texture, v_texCoord + vec2(-d.x, -d.y));
  vec4 tr = texture(u_texture, v_texCoord + vec2(d.x, -d.y));
  vec4 bl = texture(u_texture, v_texCoord + vec2(-d.x, d.y));
  vec4 br = texture(u_texture, v_texCoord + vec2(d.x, d.y));

  // Luminance-adaptive edge detection
  vec3 lum = vec3(0.299, 0.587, 0.114);
  float edge = dot(abs(t.rgb - b.rgb) + abs(l.rgb - r.rgb), lum);
  float edgeWeight = clamp(edge * 4.0, 0.0, 1.0);

  // Compute 9-point local blur
  vec4 crossNeighbors = (t + b + l + r) * 0.25;
  vec4 diagNeighbors  = (tl + tr + bl + br) * 0.25;
  vec4 blur = crossNeighbors * 0.70 + diagNeighbors * 0.30;
  vec4 detail = c - blur;

  // Adaptive sharpening: gentle on flat areas, strong on edges
  vec4 sharp = c + detail * mix(0.3, 1.2, edgeWeight);

  // Anti-ringing constraint with tight headroom for micro-contrast
  vec4 minNeighbor = min(min(min(t, b), min(l, r)), min(min(tl, tr), min(bl, br)));
  vec4 maxNeighbor = max(max(max(t, b), max(l, r)), max(max(tl, tr), max(bl, br)));

  fragColor = clamp(sharp, max(minNeighbor - 0.02, 0.0), min(maxNeighbor + 0.02, 1.0));
}
`;
