// GLSL Shaders for Anime4K WebGL2 Pipeline (Mode A: Fast Line Thinning & Upscale)

export const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_texCoord;

void main() {
  v_texCoord = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Pass 1: Line Thinning & Deblur (Restores crisp anime contour lines without ghosting)
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

  float l_cc = getLuma(cc);
  float l_tl = getLuma(tl);
  float l_tc = getLuma(tc);
  float l_tr = getLuma(tr);
  float l_ml = getLuma(ml);
  float l_mr = getLuma(mr);
  float l_bl = getLuma(bl);
  float l_bc = getLuma(bc);
  float l_br = getLuma(br);

  float minLuma = min(l_cc, min(min(min(l_tl, l_tc), min(l_tr, l_ml)), min(min(l_mr, l_bl), min(l_bc, l_br))));
  float maxLuma = max(l_cc, max(max(max(l_tl, l_tc), max(l_tr, l_ml)), max(max(l_mr, l_bl), max(l_bc, l_br))));
  float delta = maxLuma - minLuma;

  // Thin out blurry line transitions by pushing luminance towards edge extrema
  if (delta > 0.05) {
    float t = clamp((l_cc - minLuma) / delta, 0.0, 1.0);
    // Smoothstep S-curve: values < 0.5 pulled darker (thin line), > 0.5 pulled brighter (clean fill)
    float pushedT = t * t * (3.0 - 2.0 * t);
    float targetLuma = minLuma + pushedT * delta;
    
    // Adjust color luminance while strictly preserving chroma/hue
    float lumaRatio = targetLuma / max(l_cc, 0.001);
    vec3 adjusted = clamp(cc.rgb * mix(1.0, lumaRatio, 0.70), 0.0, 1.0);
    fragColor = vec4(adjusted, cc.a);
  } else {
    fragColor = cc;
  }
}
`;

// Pass 2: 1080p Upscale with Contrast-Adaptive Sharpening (CAS) and Anti-Ringing
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

  // Sample center and cross neighbors
  vec4 c = texture(u_texture, v_texCoord);
  vec4 t = texture(u_texture, v_texCoord - vec2(0.0, d.y));
  vec4 b = texture(u_texture, v_texCoord + vec2(0.0, d.y));
  vec4 l = texture(u_texture, v_texCoord - vec2(d.x, 0.0));
  vec4 r = texture(u_texture, v_texCoord + vec2(d.x, 0.0));

  // Diagonal samples for 9-tap edge reconstruction
  vec4 tl = texture(u_texture, v_texCoord + vec2(-d.x, -d.y));
  vec4 tr = texture(u_texture, v_texCoord + vec2(d.x, -d.y));
  vec4 bl = texture(u_texture, v_texCoord + vec2(-d.x, d.y));
  vec4 br = texture(u_texture, v_texCoord + vec2(d.x, d.y));

  float lc = getLuma(c.rgb);
  float lt = getLuma(t.rgb);
  float lb = getLuma(b.rgb);
  float ll = getLuma(l.rgb);
  float lr = getLuma(r.rgb);

  // Local min & max contrast
  float minLuma = min(lc, min(min(lt, lb), min(ll, lr)));
  float maxLuma = max(lc, max(max(lt, lb), max(ll, lr)));
  float contrast = maxLuma - minLuma;

  // High-pass unsharp sharpening with anti-ringing clamp
  if (contrast > 0.02) {
    vec4 crossAvg = (t + b + l + r) * 0.25;
    vec4 diagAvg = (tl + tr + bl + br) * 0.25;
    vec4 localBlur = mix(crossAvg, diagAvg, 0.35);

    // High frequency boost (0.95 for sharp anime line art)
    vec4 sharp = c + (c - localBlur) * 0.95;

    // Anti-ringing clamp: enforce output strictly inside local color bounds
    vec4 minColor = min(c, min(min(t, b), min(l, r)));
    vec4 maxColor = max(c, max(max(t, b), max(l, r)));
    fragColor = clamp(sharp, minColor, maxColor);
  } else {
    fragColor = c;
  }
}
`;
