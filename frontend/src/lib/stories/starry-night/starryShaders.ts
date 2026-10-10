// 그가 실패작이라 부른 밤 셰이더(WebGL2 · GLSL ES 3.00). 출발점은 시제품 proto.template.html 이고, 흐름 · 별빛 값은 시제품 v1.1 확정값이다.
// 층: 배경(사이프러스 자리를 메운 그림 + 깊이 메시) → 사이프러스 앞층(별도 평면, 조금 앞) → 액자 띠.
// 별빛 · 쇠창살 그림자는 배경 · 앞층이 같은 함수를 쓴다(SHARED_SOURCE).

export const STAR_COUNT = 12;
export const LIGHT_COUNT_MAX = 16;

const SHARED_SOURCE = `
const vec2 IMAGE_PX = vec2(1200.0, 950.0);
const vec3 MOON_COLOR = vec3(1.0, 0.86, 0.45);
const vec3 STAR_COLOR = vec3(1.0, 0.93, 0.7);
// zslab 확정 조정: 별빛 세기 배율 0.5 + 넓은 반투명 번짐 층(반지름의 약 2.8배까지)
const float STAR_GAIN = 0.5;
const float VEIL_REACH = 2.8;
const float VEIL_OPACITY = 0.2;
const float VEIL_MAX = 0.4;
const float FLARE_GAIN = 2.5;
uniform float uTime;
uniform float uStars;
uniform float uFlare;
uniform vec4 uStarList[${STAR_COUNT}];
uniform float uBars;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 local = fract(p);
  vec2 blend = local * local * (3.0 - 2.0 * local);
  float a = hash(cell);
  float b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0));
  float d = hash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

// 별빛: 시제품 v1.1 항(core · bloom · ripple · twinkle)을 더하고, 그 아래 넓은 반투명 번짐을 섞는다.
vec3 withStarLight(vec3 color, vec2 uv) {
  float amount = uStars * (1.0 + FLARE_GAIN * uFlare);
  if (amount < 0.001) return color;
  vec2 px = uv * IMAGE_PX;
  vec3 glow = vec3(0.0);
  float veil = 0.0;
  vec3 veilColor = STAR_COLOR;
  for (int i = 0; i < ${STAR_COUNT}; i++) {
    vec4 star = uStarList[i];
    float d = length(px - star.xy) / star.z;
    if (d > VEIL_REACH) continue;
    float index = float(i);
    float core = exp(-d * d * 4.0);
    float bloom = exp(-d * 1.8);
    float ripple = (0.5 + 0.5 * sin(d * 11.0 - uTime * 2.2 + index * 1.7)) * exp(-d * 1.3) * smoothstep(0.25, 0.7, d);
    float twinkle = 0.7 + 0.3 * sin(uTime * (1.1 + 0.29 * index) + 2.3 * index);
    vec3 tint = i == 0 ? MOON_COLOR : STAR_COLOR;
    glow += tint * star.w * twinkle * (core * 0.55 + bloom * 0.35 + ripple * 0.28);
    float fade = 1.0 - smoothstep(0.0, VEIL_REACH, d);
    float local = star.w * VEIL_OPACITY * fade * fade;
    if (local > veil) veilColor = tint;
    veil = max(veil, local);
  }
  color = mix(color, veilColor, min(veil * amount, VEIL_MAX));
  color += glow * STAR_GAIN * amount;
  return color / (1.0 + max(color - 1.0, vec3(0.0)) * 0.6);
}

// 쇠창살 창 그림자(상상): 기울어진 세로 창살 다섯 줄과 가로 창틀 하나
float barsShade(vec2 uv) {
  if (uBars < 0.001) return 1.0;
  float skewed = uv.x + (uv.y - 0.5) * 0.15;
  float column = abs(fract(skewed * 6.0) - 0.5);
  float vertical = 1.0 - smoothstep(0.035, 0.07, column);
  float horizontal = 1.0 - smoothstep(0.012, 0.03, abs(uv.y - 0.42));
  float bar = max(vertical, horizontal);
  return 1.0 - uBars * (0.12 + 0.55 * bar);
}
`;

export const BACKGROUND_VERTEX = `#version 300 es
in vec2 aPosition;
in vec2 aUv;
uniform mat4 uViewProjection;
uniform sampler2D uDepth;
uniform float uLift;
uniform vec2 uGridStep;
out vec2 vUv;
out float vEdge;
const float DEPTH_SCALE = 0.18;
// 그림 가장자리(캔버스 테두리)는 깊이 추정이 튀어 들쭉날쭉하므로 이 폭(uv) 안에서 깊이를 0 으로 눕힌다
const float BORDER_FADE = 0.04;
void main() {
  vec2 inner = min(aUv, 1.0 - aUv);
  float border = smoothstep(0.0, BORDER_FADE, min(inner.x, inner.y));
  float depth = textureLod(uDepth, aUv, 0.0).r;
  float acrossX = abs(textureLod(uDepth, aUv + vec2(uGridStep.x, 0.0), 0.0).r - textureLod(uDepth, aUv - vec2(uGridStep.x, 0.0), 0.0).r);
  float acrossY = abs(textureLod(uDepth, aUv + vec2(0.0, uGridStep.y), 0.0).r - textureLod(uDepth, aUv - vec2(0.0, uGridStep.y), 0.0).r);
  vEdge = max(acrossX, acrossY) * border;
  vUv = aUv;
  gl_Position = uViewProjection * vec4(aPosition, (depth - 0.5) * DEPTH_SCALE * uLift * border, 1.0);
}`;

export const BACKGROUND_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
in float vEdge;
uniform sampler2D uArt;
uniform sampler2D uBehind;
uniform sampler2D uCypress;
uniform sampler2D uFlow;
uniform sampler2D uSky;
uniform float uLift;
uniform float uFlowAmount;
uniform float uStreaks;
uniform float uLights;
uniform float uLightsActive;
uniform int uLightCount;
uniform vec4 uLightList[${LIGHT_COUNT_MAX}];
out vec4 outColor;
${SHARED_SOURCE}
// 시제품 v1.1 흐름: 한 주기 30px · 초당 0.6주기 · 속도 배율 1.0(1200px 기준 약 18px/초)
const float FLOW_PIXELS_PER_CYCLE = 30.0;
const float FLOW_CYCLES_PER_SECOND = 0.6;
const float FLOW_SPEED_SCALE = 1.0;
// 깊이가 이만큼 넘게 끊기는 삼각형은 그리지 않는다(가장자리 늘어남 방지)
const float EDGE_LIMIT = 0.25;
const int STREAK_STEPS = 16;
const float STREAK_STEP_PX = 4.0;
const float STREAK_CELL_PX = 7.0;
const float STREAK_GAIN = 0.4;
const vec3 STREAK_COLOR = vec3(0.86, 0.93, 1.0);
const vec3 WINDOW_LIGHT = vec3(1.0, 0.78, 0.36);

// 사이프러스 자리(앞층 알파가 닿는 곳)는 메운 그림, 그 밖은 원본 그림
vec3 baseColor(vec2 uv) {
  vec3 art = texture(uArt, uv).rgb;
  float cover = texture(uCypress, uv).a;
  if (cover < 0.001) return art;
  return mix(art, texture(uBehind, uv).rgb, smoothstep(0.0, 0.05, cover));
}

vec3 flowed(vec2 uv, vec4 field) {
  vec2 direction = field.rg * 2.0 - 1.0;
  float speed = smoothstep(0.1, 0.7, field.b);
  vec2 stepUv = direction * speed * FLOW_PIXELS_PER_CYCLE * FLOW_SPEED_SCALE / IMAGE_PX;
  // 자리마다 위상을 값 노이즈로 어긋나게 한다(한꺼번에 깜박이지 않게)
  float offset = valueNoise(uv * vec2(7.0, 5.5));
  float phase0 = fract(uTime * FLOW_CYCLES_PER_SECOND + offset);
  float phase1 = fract(phase0 + 0.5);
  vec3 color0 = baseColor(uv - stepUv * phase0);
  vec3 color1 = baseColor(uv - stepUv * phase1);
  float weight0 = 1.0 - abs(1.0 - 2.0 * phase0);
  return mix(color1, color0, weight0);
}

// 방향장을 따라 거슬러 올라가며 드문 밝은 점을 모은다(움직이는 선 적분): 소용돌이 결을 따라 흐르는 빛 줄기
float streakAt(vec2 uv) {
  float sum = 0.0;
  vec2 position = uv;
  for (int k = 0; k < STREAK_STEPS; k++) {
    vec2 direction = texture(uFlow, position).rg * 2.0 - 1.0;
    position -= direction * STREAK_STEP_PX / IMAGE_PX;
    float seed = pow(valueNoise(position * IMAGE_PX / STREAK_CELL_PX), 8.0);
    sum += seed * fract(float(k) / float(STREAK_STEPS) + uTime * 0.35);
  }
  return sum / float(STREAK_STEPS);
}

vec3 withWindowLights(vec3 color, vec2 uv) {
  if (uLightsActive < 0.001) return color;
  vec2 px = uv * IMAGE_PX;
  float steps = float(uLightCount) + 1.0;
  for (int i = 0; i < ${LIGHT_COUNT_MAX}; i++) {
    if (i >= uLightCount) break;
    vec4 light = uLightList[i];
    float d = length(px - light.xy) / light.z;
    if (d > 5.0) continue;
    float on = clamp((uLights * steps - (light.w + 0.5)) * 1.5, 0.0, 1.0);
    float inside = 1.0 - smoothstep(0.6, 1.2, d);
    color *= mix(1.0, mix(0.3, 1.0, on), inside * uLightsActive);
    float flicker = 0.92 + 0.08 * sin(uTime * 3.1 + light.w * 2.7);
    color += WINDOW_LIGHT * on * uLightsActive * flicker * (exp(-d * d * 1.5) * 0.45 + exp(-d * 0.9) * 0.2);
  }
  return color;
}

void main() {
  if (vEdge * uLift > EDGE_LIMIT) discard;
  vec3 color = baseColor(vUv);
  float sky = texture(uSky, vUv).r;
  vec4 field = texture(uFlow, vUv);
  float flowMix = sky * uFlowAmount;
  if (flowMix > 0.001) color = mix(color, flowed(vUv, field), flowMix);
  if (uStreaks * sky > 0.001) {
    float streak = smoothstep(0.012, 0.05, streakAt(vUv)) * smoothstep(0.1, 0.6, field.b);
    color += STREAK_COLOR * streak * uStreaks * sky * STREAK_GAIN;
  }
  color = withWindowLights(color, vUv);
  color = withStarLight(color, vUv);
  outColor = vec4(color * barsShade(vUv), 1.0);
}`;

export const CYPRESS_VERTEX = `#version 300 es
in vec2 aPosition;
in vec2 aUv;
uniform mat4 uViewProjection;
uniform float uLift;
uniform float uTime;
uniform float uSway;
uniform vec2 uSpanV;
out vec2 vUv;
// 앞층이 배경보다 앞에 서는 거리(세계 단위) · 꼭대기 흔들림 폭
const float CYPRESS_Z = 0.06;
const float SWAY_WORLD = 0.012;
void main() {
  // 아래(뿌리)는 고정, 위로 갈수록 크게 흔들린다(불꽃처럼 두 주기를 겹친다)
  float height = 1.0 - clamp((aUv.y - uSpanV.x) / (uSpanV.y - uSpanV.x), 0.0, 1.0);
  float wave = sin(uTime * 1.7 + aUv.y * 9.0) * 0.7 + sin(uTime * 2.9 + aUv.y * 17.0) * 0.3;
  vec2 position = aPosition + vec2(wave * height * height * SWAY_WORLD * uSway, 0.0);
  vUv = aUv;
  gl_Position = uViewProjection * vec4(position, CYPRESS_Z * uLift, 1.0);
}`;

export const CYPRESS_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uCypress;
out vec4 outColor;
${SHARED_SOURCE}
void main() {
  vec4 tree = texture(uCypress, vUv);
  if (tree.a < 0.002) discard;
  vec3 color = withStarLight(tree.rgb, vUv) * barsShade(vUv);
  outColor = vec4(color, tree.a);
}`;

export const FRAME_VERTEX = `#version 300 es
in vec2 aPosition;
in vec2 aUv;
uniform mat4 uViewProjection;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = uViewProjection * vec4(aPosition, -0.004, 1.0);
}`;

export const FRAME_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uFrame;
uniform vec2 uInner;
uniform vec3 uClear;
out vec4 outColor;
void main() {
  vec2 centered = abs(vUv - 0.5) * 2.0;
  // 액자 띠만 그린다: 안쪽을 덮으면 깊이로 뒤로 물러난 하늘을 가린다
  if (centered.x < uInner.x && centered.y < uInner.y) discard;
  float bevel = smoothstep(0.0, 1.0, max((centered.x - uInner.x) / (1.0 - uInner.x), (centered.y - uInner.y) / (1.0 - uInner.y)));
  vec3 dark = vec3(0.17, 0.11, 0.05);
  vec3 light = vec3(0.56, 0.42, 0.22);
  vec3 color = mix(light, dark, bevel) * (0.85 + 0.15 * sin(vUv.x * 300.0 + vUv.y * 40.0));
  outColor = vec4(mix(uClear, color, uFrame), 1.0);
}`;
