// 넘을 수 없는 선 8장 물결 장면(WebGL, 시제품 flow.src.html :1867-2040). 물통 안 물빛(코스틱)과 초음파 물결 줄무늬를 셰이더로 그린다.
// WebGL 컨텍스트나 셰이더를 만들 수 없으면 null 을 돌려주고, 장면은 같은 수식을 한 번만 계산한 Canvas 정지 물빛 무늬로 대체한다.
import { context2d, ctx, H, makeCanvas, roundRectPath, W, type Rect } from './linePaint.ts';

const VERT = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';
const FRAG = `precision highp float;
uniform vec2 uRes; uniform float uScale; uniform vec2 uView; uniform float uTime;
uniform vec4 uRectB; uniform vec4 uRectA; uniform float uAlphaA;
uniform float uWave; uniform float uFront; uniform float uStripe; uniform float uBright;
float caustic(vec2 p, float t) {
  vec2 i = p; float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
vec3 waterColor(vec2 css, vec4 rect, float t) {
  vec2 uv = (css - rect.xy) / rect.w * 22.0;
  float band = sin(css.y / uStripe * 6.2831853);
  float frontY = uView.y * (1.0 - uFront * 1.15);
  float reach = smoothstep(frontY - 40.0, frontY + 40.0, css.y);
  float w = uWave * reach;
  float stand = band * (0.72 + 0.28 * cos(t * 7.0));
  uv.y += w * 0.18 * stand;
  uv.x += w * 0.5 * stand * sin(t * 1.3);
  float c1 = caustic(uv - 250.0, t * 0.5);
  float c2 = caustic(uv - 250.0 + vec2(0.05, 0.03), t * 0.5);
  float depth = clamp((css.y - (rect.y - rect.w * 0.5)) / rect.w, 0.0, 1.0);
  vec3 col = mix(vec3(0.04, 0.11, 0.14), vec3(0.008, 0.022, 0.035), depth);
  float lit = (1.0 + w * 1.1 * stand) * (0.85 - 0.45 * depth);
  col += vec3(c2 * 0.6, c1 * 0.88, c1) * lit;
  col += vec3(0.22, 0.5, 0.6) * pow(0.5 + 0.5 * stand, 6.0) * w * 0.2;
  float rays = pow(0.5 + 0.5 * sin(css.x / uView.x * 7.0 + sin(css.y * 0.003 + t * 0.12) * 2.0 + t * 0.05), 8.0);
  col += vec3(0.12, 0.25, 0.3) * rays * (1.0 - depth) * 0.6;
  return col;
}
vec3 tank(vec3 col, vec2 css, vec4 rect, float alpha, float t) {
  float d = sdBox(css - rect.xy, rect.zw * 0.5, min(10.0, rect.z * 0.08));
  float inside = 1.0 - smoothstep(-1.0, 1.0, d);
  if (inside > 0.0) col = mix(col, waterColor(css, rect, t), inside * alpha);
  float rim = exp(-abs(d) / 1.6) * 0.3 + exp(-max(d, 0.0) / 18.0) * 0.07;
  return col + vec3(0.55, 0.75, 0.85) * rim * alpha;
}
void main() {
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale;
  vec2 vc = css / uView - 0.5;
  vec3 col = vec3(0.039, 0.031, 0.027) * (1.0 - dot(vc, vc) * 1.2);
  col = tank(col, css, uRectB, 1.0, uTime);
  if (uAlphaA > 0.0) col = tank(col, css, uRectA, uAlphaA, uTime);
  gl_FragColor = vec4(col * uBright, 1.0);
}`;
type UniformName =
	| 'uRes'
	| 'uScale'
	| 'uView'
	| 'uTime'
	| 'uRectB'
	| 'uRectA'
	| 'uAlphaA'
	| 'uWave'
	| 'uFront'
	| 'uStripe'
	| 'uBright';
// 물빛 셰이더가 느린 기기면 해상도를 낮춘다: 40프레임 평균이 26ms 를 넘으면 0.8배씩, 하한 0.5배
const GL_SLOW_FRAME_MS = 26;
const GL_MIN_SCALE = 0.5;
const GL_SCALE_STEP = 0.8;
const GL_SAMPLE_FRAMES = 40;

/** 물 장면 한 프레임의 값: 물통 B(크게 본 물통)와 A, 물결 세기 · 앞선 위치 · 줄무늬 간격 · 밝기 */
export type WaterState = {
	rectB: Rect;
	rectA: Rect;
	alphaA: number;
	wave: number;
	front: number;
	stripe: number;
	bright: number;
};

export type WaveGl = {
	canvas: HTMLCanvasElement;
	gl: WebGLRenderingContext;
	uniforms: Record<UniformName, WebGLUniformLocation | null>;
	scale: number;
	frames: number[];
};

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type);
	if (shader === null) throw new Error('shader could not be created');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true)
		throw new Error(String(gl.getShaderInfoLog(shader)));
	return shader;
}

/** WebGL 물결 준비. 컨텍스트 · 셰이더를 만들 수 없으면 null(정지 그림으로 대체) */
export function initWaveGl(canvas: HTMLCanvasElement): WaveGl | null {
	let gl: WebGLRenderingContext | null;
	try {
		gl = canvas.getContext('webgl', {
			alpha: false,
			antialias: false,
			depth: false,
			preserveDrawingBuffer: false
		});
	} catch (error) {
		console.warn('WebGL is not available, using a still water picture', error);
		return null;
	}
	if (gl === null) return null;
	const program = gl.createProgram();
	try {
		gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
		gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
		gl.linkProgram(program);
		if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true)
			throw new Error(String(gl.getProgramInfoLog(program)));
	} catch (error) {
		console.warn('water shader setup failed, using a still water picture', error);
		return null;
	}
	gl.useProgram(program);
	const buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	const location = gl.getAttribLocation(program, 'aPos');
	gl.enableVertexAttribArray(location);
	gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
	const context = gl;
	const at = (name: UniformName): WebGLUniformLocation | null =>
		context.getUniformLocation(program, name);
	const uniforms: Record<UniformName, WebGLUniformLocation | null> = {
		uRes: at('uRes'),
		uScale: at('uScale'),
		uView: at('uView'),
		uTime: at('uTime'),
		uRectB: at('uRectB'),
		uRectA: at('uRectA'),
		uAlphaA: at('uAlphaA'),
		uWave: at('uWave'),
		uFront: at('uFront'),
		uStripe: at('uStripe'),
		uBright: at('uBright')
	};
	return { canvas, gl, uniforms, scale: 1, frames: [] };
}

export function resizeWaveGl(wave: WaveGl): void {
	wave.canvas.width = Math.max(1, Math.round(W * wave.scale));
	wave.canvas.height = Math.max(1, Math.round(H * wave.scale));
	wave.gl.viewport(0, 0, wave.canvas.width, wave.canvas.height);
}

/** 물 장면이 보이는 동안의 프레임 간격(ms)을 모아, 느리면 해상도를 낮춘다 */
export function noteWaveFrame(wave: WaveGl, frameMs: number): void {
	wave.frames.push(frameMs);
	if (wave.frames.length < GL_SAMPLE_FRAMES) return;
	const average = wave.frames.reduce((sum, value) => sum + value, 0) / wave.frames.length;
	wave.frames = [];
	if (average > GL_SLOW_FRAME_MS && wave.scale > GL_MIN_SCALE) {
		wave.scale = Math.max(GL_MIN_SCALE, wave.scale * GL_SCALE_STEP);
		resizeWaveGl(wave);
	}
}

export function renderWater(wave: WaveGl, w: WaterState, t: number): void {
	const { gl, uniforms, canvas } = wave;
	gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
	gl.uniform1f(uniforms.uScale, canvas.width / W);
	gl.uniform2f(uniforms.uView, W, H);
	gl.uniform1f(uniforms.uTime, t);
	gl.uniform4f(uniforms.uRectB, w.rectB.x, w.rectB.y, w.rectB.w, w.rectB.h);
	gl.uniform4f(uniforms.uRectA, w.rectA.x, w.rectA.y, w.rectA.w, w.rectA.h);
	gl.uniform1f(uniforms.uAlphaA, w.alphaA);
	gl.uniform1f(uniforms.uWave, w.wave);
	gl.uniform1f(uniforms.uFront, w.front);
	gl.uniform1f(uniforms.uStripe, w.stripe);
	gl.uniform1f(uniforms.uBright, w.bright);
	gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// ───────── WebGL 이 없을 때 쓰는 정지 물빛 무늬(같은 수식을 한 번만 계산) ─────────
let waterFallback: HTMLCanvasElement | null = null;
function causticJS(px: number, py: number): number {
	let ix = px;
	let iy = py;
	let c = 1;
	for (let n = 0; n < 4; n++) {
		const nx = px + Math.cos(-ix) + Math.sin(iy);
		const ny = py + Math.sin(-iy) + Math.cos(ix);
		ix = nx;
		iy = ny;
		c += 1 / Math.hypot(px / (Math.sin(ix) / 0.005), py / (Math.cos(iy) / 0.005));
	}
	c /= 4;
	c = 1.17 - Math.pow(c, 1.4);
	return Math.pow(Math.abs(c), 8);
}
function buildWaterFallback(): HTMLCanvasElement {
	const size = 200;
	const c = makeCanvas(size, size);
	const g = context2d(c);
	const image = g.createImageData(size, size);
	for (let j = 0; j < size; j++) {
		for (let i = 0; i < size; i++) {
			const v = Math.min(1, causticJS((i / size - 0.5) * 22 - 250, (j / size - 0.5) * 22 - 250));
			const depth = j / size;
			const o = (j * size + i) * 4;
			image.data[o] = Math.min(255, (0.04 + v * 0.6) * 255 * (1 - depth * 0.4));
			image.data[o + 1] = Math.min(255, (0.11 + v * 0.88) * 255 * (1 - depth * 0.4));
			image.data[o + 2] = Math.min(255, (0.14 + v) * 255 * (1 - depth * 0.4));
			image.data[o + 3] = 255;
		}
	}
	g.putImageData(image, 0, 0);
	return c;
}
/** 정지 물빛 무늬(처음 쓸 때 한 번 만든다). 9장 물통 빛에도 쓴다 */
export function waterFallbackImage(): HTMLCanvasElement {
	if (waterFallback === null) waterFallback = buildWaterFallback();
	return waterFallback;
}
export function drawWaterFallback(w: WaterState): void {
	const image = waterFallbackImage();
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
	ctx.fillStyle = '#0a0807';
	ctx.fillRect(0, 0, W, H);
	const paint = (rect: Rect, alpha: number): void => {
		if (alpha <= 0.003) return;
		ctx.save();
		roundRectPath(
			ctx,
			rect.x - rect.w / 2,
			rect.y - rect.h / 2,
			rect.w,
			rect.h,
			Math.min(10, rect.w * 0.08)
		);
		ctx.clip();
		ctx.globalAlpha = alpha;
		ctx.drawImage(
			image,
			rect.x - (rect.h / 2) * (rect.w / rect.h),
			rect.y - rect.h / 2,
			rect.w,
			rect.h
		);
		ctx.restore();
	};
	paint(w.rectB, 1);
	paint(w.rectA, w.alphaA);
	if (w.bright < 1) {
		ctx.globalAlpha = 1 - w.bright;
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, W, H);
	}
}
