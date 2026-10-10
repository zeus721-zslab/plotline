// 그가 실패작이라 부른 밤 렌더러(WebGL2 직접, 라이브러리 없음 · D-42). 시제품 proto.template.html 의 메시 · 카메라를 옮겼다.
// 목표 자세(setTarget)를 부드럽게 따라가며 그리고, 장면이 움직일 때(자세가 아직 다르거나 흐름 · 별빛 · 흔들림이 켜져 있을 때)만
// 다음 프레임을 요청한다. 탭이 숨으면 멈춘다. 끝 장 별빛 한 번(flare)은 시간으로 진행하고, 끝나면 모든 움직임이 멈춘다.
import villageLights from './village-lights.json' with { type: 'json' };
import {
	cameraOf,
	COVER_POSE,
	FIELD_OF_VIEW_RAD,
	focusFor,
	followPose,
	followShot,
	FRAME_MARGIN,
	IMAGE_HEIGHT_PX,
	PAINTING_ASPECT,
	posesSettled,
	shotAlong,
	shotsSettled,
	type Pose,
	type SceneTarget,
	type Shot
} from './starryScene.ts';
import {
	BACKGROUND_FRAGMENT,
	BACKGROUND_VERTEX,
	CYPRESS_FRAGMENT,
	CYPRESS_VERTEX,
	FRAME_FRAGMENT,
	FRAME_VERTEX,
	LIGHT_COUNT_MAX,
	STAR_COUNT
} from './starryShaders.ts';

const TEXTURE_DIR = '/stories/starry-night/textures';
// 그리기 폭(장치 픽셀)이 이 이상이면 2400 그림(가까이 갔을 때 붓 질감), 아니면 1200
const LARGE_ART_MIN_BUFFER_PX = 1200;
// 휴대폰 배율 상한
const MAX_PIXEL_RATIO = 2;
const BACKGROUND_GRID = { columns: 256, rows: 203 };
const CYPRESS_GRID = { columns: 40, rows: 80 };
// 사이프러스 앞층이 차지하는 uv 범위(cypress.png 알파 경계, 1200 × 950 기준 x 0~568 · y 47~949)
const CYPRESS_SPAN = { u0: 0, u1: 569 / 1200, v0: 47 / IMAGE_HEIGHT_PX, v1: 1 };
// 테마 바탕색 #070b16(theme.css --story-bg)과 같은 값
const CHANNEL_MAX = 255;
const CLEAR_RGB: [number, number, number] = [7 / CHANNEL_MAX, 11 / CHANNEL_MAX, 22 / CHANNEL_MAX];
// 자세를 따라가는 빠르기(초당 비율): 스크롤 떨림만 걸러 준다(R3, STEP 89 2.6 의 약 60%)
const FOLLOW_PER_SECOND = 1.6;
const SETTLE_TOLERANCE = 0.0005;
const EFFECT_ON = 0.002;
const MAX_FRAME_SECONDS = 0.1;
const MILLISECONDS_PER_SECOND = 1000;
// 끝 장 별빛 한 번: 커지는 시간 · 머무는 시간 · 꺼지는 시간(초)
const FLARE_RISE_SECONDS = 0.6;
const FLARE_HOLD_SECONDS = 0.5;
const FLARE_FALL_SECONDS = 1.8;
const NEAR_PLANE = 0.01;
const FAR_PLANE = 50;

// 별 · 달(1200 × 950 픽셀 x, y, 빛 반지름 px, 세기): 시제품 v1.1 확정값. 첫 줄이 달.
const STARS: ReadonlyArray<[number, number, number, number]> = [
	[1085, 170, 135, 1.5],
	[424, 504, 78, 0.85],
	[128, 43, 55, 0.9],
	[285, 168, 48, 0.9],
	[730, 82, 55, 0.85],
	[845, 221, 48, 0.85],
	[392, 311, 42, 0.75],
	[160, 453, 42, 0.75],
	[495, 63, 36, 0.65],
	[274, 27, 36, 0.65],
	[412, 40, 36, 0.65],
	[57, 430, 32, 0.55]
];

type Light = { x: number; y: number; r: number };
type Mesh = { vertexArray: WebGLVertexArrayObject; count: number };
type Program = { program: WebGLProgram; uniforms: Map<string, WebGLUniformLocation> };
type FlareState = { kind: 'idle' } | { kind: 'running'; seconds: number } | { kind: 'done' };
type Textures = {
	art: WebGLTexture;
	behind: WebGLTexture;
	cypress: WebGLTexture;
	depth: WebGLTexture;
	flow: WebGLTexture;
	sky: WebGLTexture;
};

export class StarryRendererError extends Error {}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type);
	if (shader === null) throw new StarryRendererError('createShader failed');
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
		throw new StarryRendererError(`shader compile failed: ${gl.getShaderInfoLog(shader)}`);
	}
	return shader;
}

function createProgram(
	gl: WebGL2RenderingContext,
	vertexSource: string,
	fragmentSource: string
): Program {
	const program = gl.createProgram();
	gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
	gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
	gl.bindAttribLocation(program, 0, 'aPosition');
	gl.bindAttribLocation(program, 1, 'aUv');
	gl.linkProgram(program);
	if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
		throw new StarryRendererError(`program link failed: ${gl.getProgramInfoLog(program)}`);
	}
	const uniforms = new Map<string, WebGLUniformLocation>();
	const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
	for (let index = 0; index < count; index += 1) {
		const info = gl.getActiveUniform(program, index);
		if (info === null) continue;
		// 배열 uniform 은 이름이 "uStarList[0]" 으로 온다 → 배열 이름으로 둔다
		const name = info.name.replace(/\[0\]$/, '');
		const location = gl.getUniformLocation(program, info.name);
		if (location !== null) uniforms.set(name, location);
	}
	return { program, uniforms };
}

/** uniform 위치. 셰이더가 쓰지 않아 빠진 이름이면 null(WebGL 은 null 위치 설정을 무시한다). */
function locationOf(
	uniforms: Map<string, WebGLUniformLocation>,
	name: string
): WebGLUniformLocation | null {
	const location = uniforms.get(name);
	return location === undefined ? null : location;
}

function createMesh(
	gl: WebGL2RenderingContext,
	interleaved: Float32Array,
	indices: Uint32Array
): Mesh {
	const vertexArray = gl.createVertexArray();
	gl.bindVertexArray(vertexArray);
	gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
	gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
	gl.enableVertexAttribArray(1);
	gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
	gl.bindVertexArray(null);
	return { vertexArray, count: indices.length };
}

/** 그림 위 uv 범위를 격자 메시로(세계 좌표: 그림 높이 1, 가운데 0) */
function buildGrid(
	gl: WebGL2RenderingContext,
	columns: number,
	rows: number,
	span: { u0: number; u1: number; v0: number; v1: number }
): Mesh {
	const positions = new Float32Array(columns * rows * 4);
	let offset = 0;
	for (let row = 0; row < rows; row += 1) {
		const v = span.v0 + ((span.v1 - span.v0) * row) / (rows - 1);
		for (let column = 0; column < columns; column += 1) {
			const u = span.u0 + ((span.u1 - span.u0) * column) / (columns - 1);
			positions.set([(u - 0.5) * PAINTING_ASPECT, 0.5 - v, u, v], offset);
			offset += 4;
		}
	}
	const indices = new Uint32Array((columns - 1) * (rows - 1) * 6);
	offset = 0;
	for (let row = 0; row < rows - 1; row += 1) {
		for (let column = 0; column < columns - 1; column += 1) {
			const topLeft = row * columns + column;
			const bottomLeft = topLeft + columns;
			indices.set(
				[topLeft, bottomLeft, topLeft + 1, topLeft + 1, bottomLeft, bottomLeft + 1],
				offset
			);
			offset += 6;
		}
	}
	return createMesh(gl, positions, indices);
}

function buildFrame(gl: WebGL2RenderingContext): Mesh {
	const halfWidth = PAINTING_ASPECT / 2 + FRAME_MARGIN;
	const halfHeight = 0.5 + FRAME_MARGIN;
	// prettier-ignore
	const positions = new Float32Array([
		-halfWidth, halfHeight, 0, 0, halfWidth, halfHeight, 1, 0,
		-halfWidth, -halfHeight, 0, 1, halfWidth, -halfHeight, 1, 1
	]);
	return createMesh(gl, positions, new Uint32Array([0, 2, 1, 1, 2, 3]));
}

function loadImage(url: string): Promise<HTMLImageElement> {
	const image = new Image();
	image.src = url;
	return image.decode().then(() => image);
}

function createTexture(
	gl: WebGL2RenderingContext,
	image: HTMLImageElement,
	format: 'rgba' | 'red',
	withMipmaps: boolean
): WebGLTexture {
	const texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
	const internal = format === 'rgba' ? gl.RGBA8 : gl.R8;
	const source = format === 'rgba' ? gl.RGBA : gl.RED;
	gl.texImage2D(gl.TEXTURE_2D, 0, internal, source, gl.UNSIGNED_BYTE, image);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	if (withMipmaps) {
		gl.generateMipmap(gl.TEXTURE_2D);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
	} else {
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	}
	return texture;
}

function perspective(aspect: number): number[] {
	const focal = 1 / Math.tan(FIELD_OF_VIEW_RAD / 2);
	const rangeInverse = 1 / (NEAR_PLANE - FAR_PLANE);
	// prettier-ignore
	return [
		focal / aspect, 0, 0, 0,
		0, focal, 0, 0,
		0, 0, (NEAR_PLANE + FAR_PLANE) * rangeInverse, -1,
		0, 0, 2 * NEAR_PLANE * FAR_PLANE * rangeInverse, 0
	];
}

function lookAt(eye: [number, number, number], target: [number, number, number]): number[] {
	let zx = eye[0] - target[0];
	let zy = eye[1] - target[1];
	let zz = eye[2] - target[2];
	const zLength = Math.hypot(zx, zy, zz);
	zx /= zLength;
	zy /= zLength;
	zz /= zLength;
	// 위쪽 = (0, 1, 0)
	const xLength = Math.hypot(zz, zx);
	const xx = zz / xLength;
	const xz = -zx / xLength;
	const yx = zy * xz;
	const yy = zz * xx - zx * xz;
	const yz = -zy * xx;
	// prettier-ignore
	return [
		xx, yx, zx, 0,
		0, yy, zy, 0,
		xz, yz, zz, 0,
		-(xx * eye[0] + xz * eye[2]),
		-(yx * eye[0] + yy * eye[1] + yz * eye[2]),
		-(zx * eye[0] + zy * eye[1] + zz * eye[2]),
		1
	];
}

function multiply(first: number[], second: number[]): number[] {
	const out = new Array<number>(16);
	for (let column = 0; column < 4; column += 1) {
		for (let row = 0; row < 4; row += 1) {
			let sum = 0;
			for (let k = 0; k < 4; k += 1) sum += first[k * 4 + row] * second[column * 4 + k];
			out[column * 4 + row] = sum;
		}
	}
	return out;
}

/** 초점 자리 옮기기(clip 공간에서 x, y 를 w 배만큼 민다) */
function shiftMatrix(shift: [number, number]): number[] {
	return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, shift[0], shift[1], 0, 1];
}

function lightUniforms(lights: Light[]): Float32Array {
	// 켜지는 순서: 왼쪽에서 오른쪽(카메라가 지나가는 방향, R6)
	const ordered = [...lights].sort((first, second) => first.x - second.x).slice(0, LIGHT_COUNT_MAX);
	const values = new Float32Array(LIGHT_COUNT_MAX * 4);
	ordered.forEach((light, order) => values.set([light.x, light.y, light.r, order], order * 4));
	return values;
}

function flareEnvelope(seconds: number): { flare: number; stars: number } {
	const rise = Math.min(1, seconds / FLARE_RISE_SECONDS);
	const fallStart = FLARE_RISE_SECONDS + FLARE_HOLD_SECONDS;
	const fall = Math.min(1, Math.max(0, (seconds - fallStart) / FLARE_FALL_SECONDS));
	const eased = fall * fall * (3 - 2 * fall);
	return { flare: rise * (1 - eased), stars: 1 - eased };
}

export class StarryRenderer {
	readonly #canvas: HTMLCanvasElement;
	readonly #gl: WebGL2RenderingContext;
	readonly #background: Program;
	readonly #cypress: Program;
	readonly #frame: Program;
	readonly #grid: Mesh;
	readonly #cypressGrid: Mesh;
	readonly #frameMesh: Mesh;
	readonly #starValues: Float32Array;
	readonly #lightValues: Float32Array;
	readonly #lightCount: number;
	#textures: Textures | null = null;
	#current: Pose = COVER_POSE;
	#target: SceneTarget = { pose: COVER_POSE, path: { from: COVER_POSE, to: COVER_POSE, ratio: 1 } };
	// 카메라 자리는 자세와 따로, 가둔 끝점 사이 경로(shotAlong)를 따라간다. null 이면 다음 프레임에 바로 놓는다.
	#currentShot: Shot | null = null;
	#targetShot: Shot | null = null;
	#time = 0;
	#flare: FlareState = { kind: 'idle' };
	#frameRequest = 0;
	#lastTimestamp = 0;
	#paused = false;
	#draws = 0;

	constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
		this.#canvas = canvas;
		this.#gl = gl;
		this.#background = createProgram(gl, BACKGROUND_VERTEX, BACKGROUND_FRAGMENT);
		this.#cypress = createProgram(gl, CYPRESS_VERTEX, CYPRESS_FRAGMENT);
		this.#frame = createProgram(gl, FRAME_VERTEX, FRAME_FRAGMENT);
		this.#grid = buildGrid(gl, BACKGROUND_GRID.columns, BACKGROUND_GRID.rows, {
			u0: 0,
			u1: 1,
			v0: 0,
			v1: 1
		});
		this.#cypressGrid = buildGrid(gl, CYPRESS_GRID.columns, CYPRESS_GRID.rows, CYPRESS_SPAN);
		this.#frameMesh = buildFrame(gl);
		this.#starValues = new Float32Array(STARS.flat());
		const lights: Light[] = villageLights;
		this.#lightValues = lightUniforms(lights);
		this.#lightCount = Math.min(lights.length, LIGHT_COUNT_MAX);
		this.#clear();
	}

	/** 텍스처를 읽는다. 그리기 폭에 따라 2400 · 1200 그림을 고른다. */
	async load(): Promise<void> {
		this.#resize();
		const artFile =
			this.#canvas.width >= LARGE_ART_MIN_BUFFER_PX ? 'art-2400.webp' : 'art-1200.webp';
		const [art, behind, cypress, depth, flow, sky] = await Promise.all(
			[artFile, 'art-behind-1200.webp', 'cypress.png', 'depth.png', 'flow.png', 'sky-mask.png'].map(
				(file) => loadImage(`${TEXTURE_DIR}/${file}`)
			)
		);
		const gl = this.#gl;
		this.#textures = {
			art: createTexture(gl, art, 'rgba', true),
			behind: createTexture(gl, behind, 'rgba', true),
			cypress: createTexture(gl, cypress, 'rgba', true),
			depth: createTexture(gl, depth, 'red', false),
			flow: createTexture(gl, flow, 'rgba', false),
			sky: createTexture(gl, sky, 'red', false)
		};
		// 첫 표시(새로고침 · 스크롤 복원으로 중간에서 열기 포함)는 따라가지 않고 목표 자세 · 카메라 자리에 바로 놓는다.
		// 카메라 자리는 화면 비율 · 초점을 아는 첫 프레임(#advance)에서 목표로 놓이고, 따라가기는 그다음 프레임부터다.
		this.#current = this.#target.pose;
		this.#currentShot = null;
		this.requestDraw();
	}

	/** 목표 자세. instant 면 따라가지 않고 바로 놓는다(두 장 이상 건너뜀). */
	setTarget(target: SceneTarget, instant: boolean): void {
		this.#target = target;
		if (instant) {
			this.#current = target.pose;
			this.#currentShot = null;
		}
		this.requestDraw();
	}

	/** 끝 장 편지 문장을 지났는가. 처음 true 가 되면 별빛이 한 번 크게 빛났다가 꺼진다. 다시 false 면 처음으로 돌린다. */
	setFlare(passed: boolean): void {
		if (passed && this.#flare.kind === 'idle') this.#flare = { kind: 'running', seconds: 0 };
		if (!passed && this.#flare.kind !== 'idle') this.#flare = { kind: 'idle' };
		this.requestDraw();
	}

	setPaused(paused: boolean): void {
		this.#paused = paused;
		if (paused) {
			cancelAnimationFrame(this.#frameRequest);
			this.#frameRequest = 0;
			this.#lastTimestamp = 0;
		} else {
			this.requestDraw();
		}
	}

	requestDraw(): void {
		if (this.#frameRequest !== 0 || this.#paused || this.#textures === null) return;
		this.#frameRequest = requestAnimationFrame((timestamp) => this.#draw(timestamp));
	}

	dispose(): void {
		cancelAnimationFrame(this.#frameRequest);
		this.#frameRequest = 0;
		this.#paused = true;
	}

	#resize(): void {
		const ratio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
		const width = Math.round(this.#canvas.clientWidth * ratio);
		const height = Math.round(this.#canvas.clientHeight * ratio);
		if (this.#canvas.width !== width || this.#canvas.height !== height) {
			this.#canvas.width = width;
			this.#canvas.height = height;
			// 크기를 바꾸면 그리기 버퍼가 검정으로 비워진다 → 텍스처를 읽는 동안에도 바탕색으로 보이게 바로 칠한다.
			this.#clear();
		}
	}

	#clear(): void {
		const gl = this.#gl;
		gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
		gl.clearColor(CLEAR_RGB[0], CLEAR_RGB[1], CLEAR_RGB[2], 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	}

	/** 별빛 배율(끝 장 flare 가 끝나면 0)과 flare 세기 */
	#flareLevels(): { flare: number; stars: number } {
		if (this.#flare.kind === 'running') return flareEnvelope(this.#flare.seconds);
		return this.#flare.kind === 'done' ? { flare: 0, stars: 0 } : { flare: 0, stars: 1 };
	}

	#animating(starsScale: number): boolean {
		const current = this.#current;
		return (
			this.#flare.kind === 'running' ||
			current.flow > EFFECT_ON ||
			current.stars * starsScale > EFFECT_ON ||
			current.cypressSway > EFFECT_ON ||
			current.streaks > EFFECT_ON ||
			current.lightsActive * current.lights > EFFECT_ON
		);
	}

	#advance(seconds: number): void {
		this.#current = followPose(this.#current, this.#target.pose, seconds, FOLLOW_PER_SECOND);
		// 화면 비율 · 초점이 바뀌어도 끝점을 매 프레임 다시 가두므로 목표가 따라 바뀐다
		const aspect = this.#canvas.width / this.#canvas.height;
		const targetShot = shotAlong(this.#target.path, aspect, focusFor(this.#canvas.clientWidth));
		this.#targetShot = targetShot;
		this.#currentShot =
			this.#currentShot === null
				? targetShot
				: followShot(this.#currentShot, targetShot, seconds, FOLLOW_PER_SECOND);
		if (this.#flare.kind === 'running') {
			const elapsed = this.#flare.seconds + seconds;
			const total = FLARE_RISE_SECONDS + FLARE_HOLD_SECONDS + FLARE_FALL_SECONDS;
			this.#flare = elapsed >= total ? { kind: 'done' } : { kind: 'running', seconds: elapsed };
		}
		if (this.#animating(this.#flareLevels().stars)) this.#time += seconds;
	}

	#draw(timestamp: number): void {
		this.#frameRequest = 0;
		const textures = this.#textures;
		if (textures === null || this.#paused) return;
		const seconds =
			this.#lastTimestamp === 0
				? 0
				: Math.min(MAX_FRAME_SECONDS, (timestamp - this.#lastTimestamp) / MILLISECONDS_PER_SECOND);
		this.#lastTimestamp = timestamp;
		this.#resize();
		this.#advance(seconds);
		const shot = this.#currentShot;
		const targetShot = this.#targetShot;
		if (shot === null || targetShot === null) return;
		this.#render(textures, shot);
		this.#draws += 1;
		this.#canvas.dataset.draws = String(this.#draws);
		this.#canvas.dataset.flare = this.#flare.kind;
		const levels = this.#flareLevels();
		const moving =
			!posesSettled(this.#current, this.#target.pose, SETTLE_TOLERANCE) ||
			!shotsSettled(shot, targetShot, SETTLE_TOLERANCE) ||
			this.#animating(levels.stars);
		this.#canvas.dataset.moving = String(moving);
		if (moving) this.requestDraw();
		else this.#lastTimestamp = 0;
	}

	#viewProjection(shot: Shot): number[] {
		const aspect = this.#canvas.width / this.#canvas.height;
		const camera = cameraOf(shot, this.#current);
		// 화면 확인(Playwright)에서 실제 카메라 바라보는 점 · 높이를 읽는다
		this.#canvas.dataset.camera = [camera.target[0], camera.target[1], camera.height]
			.map((value) => value.toFixed(4))
			.join(',');
		return multiply(
			shiftMatrix(camera.shift),
			multiply(perspective(aspect), lookAt(camera.eye, camera.target))
		);
	}

	#render(textures: Textures, shot: Shot): void {
		const gl = this.#gl;
		const viewProjection = new Float32Array(this.#viewProjection(shot));
		this.#clear();
		gl.enable(gl.DEPTH_TEST);
		gl.disable(gl.BLEND);
		if (this.#current.frame > EFFECT_ON) this.#renderFrame(viewProjection);
		this.#renderBackground(textures, viewProjection);
		// 앞층은 배경 위에 그대로 덮는다(깊이 비교 없이, 알파로 섞음)
		gl.disable(gl.DEPTH_TEST);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		this.#renderCypress(textures, viewProjection);
	}

	#renderFrame(viewProjection: Float32Array): void {
		const gl = this.#gl;
		const { program, uniforms } = this.#frame;
		const innerHalfWidth = PAINTING_ASPECT / 2;
		gl.useProgram(program);
		gl.uniformMatrix4fv(locationOf(uniforms, 'uViewProjection'), false, viewProjection);
		gl.uniform1f(locationOf(uniforms, 'uFrame'), Math.min(1, this.#current.frame));
		gl.uniform2f(
			locationOf(uniforms, 'uInner'),
			innerHalfWidth / (innerHalfWidth + FRAME_MARGIN),
			0.5 / (0.5 + FRAME_MARGIN)
		);
		gl.uniform3f(locationOf(uniforms, 'uClear'), CLEAR_RGB[0], CLEAR_RGB[1], CLEAR_RGB[2]);
		gl.bindVertexArray(this.#frameMesh.vertexArray);
		gl.drawElements(gl.TRIANGLES, this.#frameMesh.count, gl.UNSIGNED_INT, 0);
	}

	/** 두 프로그램이 같이 쓰는 별빛 · 창살 uniform */
	#setSharedUniforms(uniforms: Map<string, WebGLUniformLocation>): void {
		const gl = this.#gl;
		const levels = this.#flareLevels();
		gl.uniform1f(locationOf(uniforms, 'uTime'), this.#time);
		gl.uniform1f(locationOf(uniforms, 'uStars'), this.#current.stars * levels.stars);
		gl.uniform1f(locationOf(uniforms, 'uFlare'), levels.flare);
		gl.uniform4fv(locationOf(uniforms, 'uStarList'), this.#starValues, 0, STAR_COUNT * 4);
		gl.uniform1f(locationOf(uniforms, 'uBars'), this.#current.bars);
	}

	#bindTextures(
		uniforms: Map<string, WebGLUniformLocation>,
		bindings: [string, WebGLTexture][]
	): void {
		const gl = this.#gl;
		bindings.forEach(([name, texture], unit) => {
			gl.activeTexture(gl.TEXTURE0 + unit);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.uniform1i(locationOf(uniforms, name), unit);
		});
	}

	#renderBackground(textures: Textures, viewProjection: Float32Array): void {
		const gl = this.#gl;
		const { program, uniforms } = this.#background;
		const current = this.#current;
		gl.useProgram(program);
		gl.uniformMatrix4fv(locationOf(uniforms, 'uViewProjection'), false, viewProjection);
		gl.uniform1f(locationOf(uniforms, 'uLift'), current.lift);
		gl.uniform2f(
			locationOf(uniforms, 'uGridStep'),
			1 / (BACKGROUND_GRID.columns - 1),
			1 / (BACKGROUND_GRID.rows - 1)
		);
		gl.uniform1f(locationOf(uniforms, 'uFlowAmount'), current.flow);
		gl.uniform1f(locationOf(uniforms, 'uStreaks'), current.streaks);
		gl.uniform1f(locationOf(uniforms, 'uLights'), current.lights);
		gl.uniform1f(locationOf(uniforms, 'uLightsActive'), current.lightsActive);
		gl.uniform1i(locationOf(uniforms, 'uLightCount'), this.#lightCount);
		gl.uniform4fv(locationOf(uniforms, 'uLightList'), this.#lightValues);
		this.#setSharedUniforms(uniforms);
		this.#bindTextures(uniforms, [
			['uArt', textures.art],
			['uBehind', textures.behind],
			['uCypress', textures.cypress],
			['uFlow', textures.flow],
			['uSky', textures.sky],
			['uDepth', textures.depth]
		]);
		gl.bindVertexArray(this.#grid.vertexArray);
		gl.drawElements(gl.TRIANGLES, this.#grid.count, gl.UNSIGNED_INT, 0);
	}

	#renderCypress(textures: Textures, viewProjection: Float32Array): void {
		const gl = this.#gl;
		const { program, uniforms } = this.#cypress;
		gl.useProgram(program);
		gl.uniformMatrix4fv(locationOf(uniforms, 'uViewProjection'), false, viewProjection);
		gl.uniform1f(locationOf(uniforms, 'uLift'), this.#current.lift);
		gl.uniform1f(locationOf(uniforms, 'uSway'), this.#current.cypressSway);
		gl.uniform2f(locationOf(uniforms, 'uSpanV'), CYPRESS_SPAN.v0, CYPRESS_SPAN.v1);
		this.#setSharedUniforms(uniforms);
		this.#bindTextures(uniforms, [['uCypress', textures.cypress]]);
		gl.bindVertexArray(this.#cypressGrid.vertexArray);
		gl.drawElements(gl.TRIANGLES, this.#cypressGrid.count, gl.UNSIGNED_INT, 0);
	}
}
