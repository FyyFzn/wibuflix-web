// GLSL Shaders for Anime4K WebGL2 Pipeline (Mode A: Fast Restore & Upscale)

export const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_texCoord;

void main() {
  v_texCoord = (a_position + 1.0) * 0.5;
  // Canvas coordinate system has top-left origin, flip Y for texture sampling
  v_texCoord.y = 1.0 - v_texCoord.y;
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

  // Sobel edge detect
  float xGrad = (tr.r + 2.0 * mr.r + br.r) - (tl.r + 2.0 * ml.r + bl.r);
  float yGrad = (bl.r + 2.0 * bc.r + br.r) - (tl.r + 2.0 * tc.r + tr.r);
  float edge = clamp(length(vec2(xGrad, yGrad)), 0.0, 1.0);

  // High-pass line thinning
  vec4 avg = (tl + tc + tr + ml + mr + bl + bc + br) * 0.125;
  vec4 restored = mix(cc, cc + (cc - avg) * 0.45, edge);

  fragColor = clamp(restored, 0.0, 1.0);
}
`;

// Pass 2: Upscale 2x & Push Gradients towards edge maxima
export const UPSCALE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform vec2 u_texSize;

in vec2 v_texCoord;
out vec4 fragColor;

float getLuma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec2 d = 1.0 / u_texSize;
  vec4 c = texture(u_texture, v_texCoord);

  // Gradient Push: sample cardinal neighbors
  vec4 top = texture(u_texture, v_texCoord - vec2(0.0, d.y));
  vec4 btm = texture(u_texture, v_texCoord + vec2(0.0, d.y));
  vec4 lft = texture(u_texture, v_texCoord - vec2(d.x, 0.0));
  vec4 rgt = texture(u_texture, v_texCoord + vec2(d.x, 0.0));

  float lumaC = getLuma(c.rgb);
  float lumaT = getLuma(top.rgb);
  float lumaB = getLuma(btm.rgb);
  float lumaL = getLuma(lft.rgb);
  float lumaR = getLuma(rgt.rgb);

  // Edge contrast sharpening
  float minLuma = min(min(lumaT, lumaB), min(lumaL, lumaR));
  float maxLuma = max(max(lumaT, lumaB), max(lumaL, lumaR));

  if (maxLuma - minLuma > 0.08) {
    // Push toward highest local contrast point
    vec4 sharp = c;
    if (lumaT > lumaC && lumaT >= maxLuma) sharp = mix(sharp, top, 0.3);
    if (lumaB > lumaC && lumaB >= maxLuma) sharp = mix(sharp, btm, 0.3);
    if (lumaL > lumaC && lumaL >= maxLuma) sharp = mix(sharp, lft, 0.3);
    if (lumaR > lumaC && lumaR >= maxLuma) sharp = mix(sharp, rgt, 0.3);
    fragColor = clamp(sharp, 0.0, 1.0);
  } else {
    fragColor = c;
  }
}
`;
