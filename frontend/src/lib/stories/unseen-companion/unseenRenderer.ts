// 보이지 않는 짝 배경 렌더러(Canvas 2D 한 장, D-43): 시제품 sirius-flow.src.html 의 그리기 코드를 그대로 옮겼다(그리기 수치 · 진행 구간 무변경).
// 장면 상태(unseenScene.ts)를 받아 언덕 · 별밭 · 원형 시야 · 아래 띠 · 덧그림을 합성한다. 그리기는 진행 값(비트 · p)이 바뀔 때만 한다(시간 의존 없음).
// 시제품과 다른 점: ① 글 상자 위치는 DOM 을 직접 찾지 않고 resize 인자로 받는다 ② 비트 상태가 담은 그릴 것(자료)을 여기서 그린다
// ③ 문구 대조로 숨긴 화면 표기(6장 속도 띠 · 4장 궤도 선)는 그리지 않는다 ④ 이월 2건(STEP 112): 가로 PC 의 안드로메다 하늘 자리를
// 그림 영역 안으로(STEP 113 천왕성도) · 6-4 점 색을 청록으로.
import {
	buildSceneA,
	buildSky,
	context2d,
	drawFigure,
	HILL_SIRIUS,
	makeLitSprite,
	rng,
	gaussOf,
	TELESCOPE_START_ANGLE,
	telescopeAimAngle
} from './unseenLayers.ts';
import {
	applyTransition,
	BEAT_IDS,
	BESSEL_YEAR,
	beatShowsBand,
	beatState,
	chapterTransition,
	clamp,
	landscapeScope,
	lerp,
	linear,
	logLerp,
	odometerDigits,
	phase,
	smooth,
	TAU,
	targetSpot,
	yearRoll,
	type BeatProgress,
	type Chart,
	type ClarkOptions,
	type Close,
	type GalaxyOptions,
	type GalleOptions,
	type MatchboxOptions,
	type Overlay,
	type SceneInput,
	type SceneState,
	type Scope,
	type ScopeLimit,
	type TargetKey,
	type Transition,
	type UranusOptions,
	type WaveOptions
} from './unseenScene.ts';
import type { StaticData } from './unseenStatic.ts';

/** 비트 글 상자(글 층 기준 좌표, transform 무관 offset 값). 화면 순서대로 30개 */
export type TextBox = { id: string; top: number; height: number; left: number; width: number };

export type UnseenRenderer = {
	resize: (boxes: TextBox[]) => void;
	render: (frame: BeatProgress) => void;
};

/** 문구 대조로 숨긴 화면 표기 */
export type HiddenMarks = { velocityBand: boolean; orbit: boolean };

type Point = [number, number];
type Rgb = [number, number, number];
type Transform = { k: number; tx: number; ty: number };
type Geometry = { scale: number; ox: number; oy: number };
type Rect = { left: number; right: number; top: number; bottom: number };

// ---------- 상수(시제품 그대로) ----------
const FONT =
	'-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
const CURVE_COLOR = 'rgba(226, 236, 255, 0.95)';
const DIM_COLOR = 'rgba(154, 166, 191, 0.9)';
const ACCENT = '#ffcf7a';
const LINE_WIDTH = 1.5;
// 화면 크기 규칙(모바일 390×844 가 기준: 아래 값은 모두 모바일에서 STEP 106 과 같은 결과가 되게 잡았다)
const MOBILE_WIDTH = 390;
const MOBILE_HEIGHT = 844;
const UI_SLOPE = 0.006 / 16; // 짧은 변이 390px 보다 1px 넓어질 때 글자 · 선 배율 증가분(CSS .txt 글자 clamp 와 같은 기울기)
const UI_MAX = 1.25; // 글자 · 선 · 클로즈업 별 배율 상한(20px / 16px)
// CSS .txt.top 과 같은 식
const TEXT_TOP_RATIO = 0.08;
const TEXT_TOP_OFFSET = 56;
const TEXT_TOP_MIN = 12;
const TEXT_TOP_MAX = 64;
const TEXT_BLOCK = 160; // 위 글 상자 자리(모바일 12 + 160 = 172, G7)
const BAND_MAX_WIDTH = 720; // 아래 띠 최대 폭
const FRAME_MAX_WIDTH = 720; // 가운데 장면(5-2 눌림 · 물결 길 맞춤)의 가로 틀 최대 폭
const SCOPE_MAX_RADIUS = 300; // 원형 시야 반지름 상한
// 가로 화면 원형 시야(STEP 110 S1): 고정 글 자리(TEXT_BLOCK) 대신 그 비트 글 상자의 실제 높이를, 띠가 없는 비트는 띠 자리까지 쓴다
const SCOPE_EDGE_GAP = 16; // 시야 테와 글 상자 · 띠 사이 여백(× UI). 테 바깥 그림자 선(r + 5.5)보다 넓게
// PC 글 배치(STEP 111 P1): CSS @media 와 같은 조건. 글이 왼쪽 열에 있어 위 글 자리를 빼지 않고, 그림은 글 열 오른쪽 영역 가운데에
export const WIDE_QUERY = '(min-width: 1024px) and (orientation: landscape)';
const PICTURE_GAP = 32; // 글 열 오른쪽 끝 · 화면 오른쪽 끝과 그림 영역 사이
const WIDE_SCOPE_EDGE = 32; // 시야 위 끝(화면 위), 띠 없는 비트의 아래 끝(화면 아래)과의 여백
const WIDE_SCOPE_BAND_GAP = 16; // 띠 쓰는 비트: 시야 아래 끝과 띠 위 사이
const GALAXY_MAX_SIZE = 190; // 7장 원반 반지름 상한(× UI)
const HILL_SCALE_MAX = 1.5; // 언덕 · 관측자 · 망원경 · 별 크기 배율 상한
const SKY_PIXEL_BUDGET = 16e6; // 하늘 별밭 미리 그림 최대 픽셀 수(넓은 화면 · 고밀도 화면 메모리 상한)
const MAX_DPR = 2;
const PATH_ABOVE_BAND_GAP = 30; // 2장 띠가 있을 때 물결 길 아래 끝과 띠 사이 여백(표기 글자 자리)
const PATH_BELOW_TEXT_GAP = 12; // 2-2 물결 길 위 끝(1750 년 쪽: 점 1.9 · 위치 고리 6 × UI)과 글 상자 사이 여백. 390 에서 축소 비율 0.80 이 되는 값
const MAX_SCENE_SCALE_A = 2; // 언덕 장면 미리 그림 해상도 상한(픽셀 밀도장이 무거움)
const MAX_SCENE_SCALE_SKY = 4; // 하늘 별밭은 대상 확대(ZOOM_TARGET)까지 선명하도록 크게
const ZOOM_TARGET = 3.2; // 하늘 → 대상 확대 배율
const SCOPE_START_RADIUS = 12; // 원형 시야가 열리기 시작하는 반지름
const LIT_COUNT = 160; // 6장 "행성 수천 개가 하나씩" 켜지는 점 개수(표현용)
// 정직성 표기의 배율(화면에 그대로 적는다)
const WOBBLE_SCALE_SIRIUS = 2; // 2·4·7장 시리우스 흔들림 확대 배율(3배 이상이면 근성점 부근에서 길이 고리를 그려 '물결'로 읽히지 않는다)
const WOBBLE_SCALE_PEG = 300; // 6장 51 페가시 흔들림 확대 배율
// 하늘(별밭) 위 대상 이름(자리는 unseenScene TARGET_SPOTS)
const TARGET_NAMES: Record<TargetKey, string> = {
	sirius: '시리우스',
	uranus: '천왕성',
	peg: '51 페가시',
	andromeda: '안드로메다'
};
const TARGET_KEYS: TargetKey[] = ['sirius', 'uranus', 'peg', 'andromeda'];
const SIRIUS_RGB: Rgb = [215, 228, 255];
const B_RGB: Rgb = [196, 214, 255];
// 언덕 → 하늘로 들어가는 동안의 별밭(STEP 110 S5): 뒤집은 판 8장을 이어 붙이고 별밭 비율 타원 마스크로 가장자리를 지운다
const SKY_MASK_START = 0.95; // 타원 반지름(별밭 반폭 · 반높이 단위). 처음은 별밭 안쪽
const SKY_MASK_END = 3; // 끝은 이어 붙인 판 바깥 끝
const SKY_MASK_CORE = 0.75; // 타원 반지름 중 완전히 보이는 안쪽 비율
const SKY_MASK_GROW: [number, number] = [0.5, 0.8]; // 타원이 커지는 dive 구간(언덕 장면은 0.8 에 다 사라진다)
// 6장 켜지는 점(STEP 111 P3): 51 페가시 자리에서 황금각 나선 순서로 바깥쪽으로
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const LIT_SPACING = 0.045; // 나선 간격(× 짧은 변): i 번째 점은 중심에서 간격 × √i
const LIT_SEARCH_LIMIT = 4000; // 건너뛰는 자리가 많아도 끝나도록 나선 자리 상한
const LIT_EDGE = 12; // 화면 가장자리 여백
const LIT_AVOID_GAP = 12; // 글 상자 · 띠와 떨어질 거리(글 흔들림 5px 포함)
const LIT_DOT = 14; // 점 그림 지름(× UI): 나머지 점
const LIT_FIRST_DOT = 20; // 처음 켜지는 51 페가시 점
const LIT_ALPHA = 0.85;
// 이월(STEP 112): 일반 점은 바탕 별(흰 · 푸른빛)과 다른 청록(#7fe3d6), 번짐도 같은 색. 첫 점(51 페가시)은 강조색 그대로
const LIT_CORE = 'rgba(127,227,214,1)';
const LIT_GLOW = 'rgba(127,227,214,0.32)';
// 2-2 띠
const DEVIATION_BUBBLE_ROOM = 44; // 띠 위쪽 말풍선 자리(× UI). 띠 안에서만 키움: 곡선 범위가 나머지 높이를 채운다
// 3장 천왕성 설명 그림
const URANUS = {
	sunU: -0.6,
	sunV: 0.55,
	radius: 0.81,
	from: 0.05,
	to: 1.55,
	pull: 0.72,
	pullWidth: 0.6,
	push: 0.12,
	predictedRadius: 1.5
};
const NEPTUNE_OFFSET = { u: 0.05, v: 0.03 }; // 계산한 자리에서 1도도 안 되는 거리(연출)
// 4장 궤도
const ORBIT_SCALE_FILL = 0.8;
const LABEL_DIRECTIONS = [0, 1, -1, 2, -2, 3, -3, 4];
const A_LABEL_COLOR = 'rgba(225,234,255,0.95)';
const B_LABEL_COLOR = 'rgba(196,214,255,0.95)';
// 5장
const SPECTRUM_STOPS = [
	'#5b3cff',
	'#2f6bff',
	'#22b8ff',
	'#2fe08a',
	'#d8f03a',
	'#ffb02e',
	'#ff4a2a',
	'#b3122a'
];
// 태양이 지구 크기까지 눌림(실제 비율: 태양 696,000km · 시리우스 B 5,600km · 지구 6,371km)
const RADIUS_KM = { sun: 696000, siriusB: 5600, earth: 6371 };
// 5-3 성냥갑(STEP 111 P2)
const MATCHBOX = {
	length: 150,
	height: 34,
	depth: 64,
	slantX: 0.5,
	slantY: 0.38,
	drawer: 0.62,
	rim: 2,
	lift: 30
}; // 모바일 px
const WEIGHT = { bottom: 84, top: 60, height: 62, ring: 11, endScale: 0.45 }; // 무게추 처음 크기(모바일 px) · 서랍 안 크기 배율
const MATCHBOX_SCALE_MAX = 1.6; // 넓은 화면 확대 상한(그림 틀 폭 / 390)
const MATCHBOX_LINE = 'rgba(175,170,235,0.6)';
// 6장
const PEG_STAR_FILL = 0.12; // 원형 시야 반지름에 대한 별 원판 반지름
const JUPITER_AU = 5.2;
// 7장 안드로메다 회전 원반
const GALAXY_TILT = 0.36;
const GALAXY_ANGLE = -0.55;
const GALAXY_SPEED = 0.42; // 바깥 별 각속도(연출 단위)
const GALAXY_CORE = 0.12; // 회전 곡선이 평평해지기 시작하는 반지름(비율)
const GALAXY_LIGHT_EDGE = 0.3; // 예상 곡선: 빛이 엷어지는 바깥에서 케플러식으로 감소
// 장 사이 연도
const YEAR_FONT_MOBILE = 56;
const YEAR_FONT_WIDE = 96;

const mapLinear =
	(d0: number, d1: number, s0: number, s1: number) =>
	(v: number): number =>
		s0 + ((v - d0) / (d1 - d0)) * (s1 - s0);
const spectrumShape =
	(peak: number, width: number) =>
	(u: number): number =>
		Math.exp(-Math.pow((u - peak) / width, 2));
const EXPECTED_SHAPE = spectrumShape(0.88, 0.42);
const ACTUAL_SHAPE = spectrumShape(0.08, 0.5);
const actualSpeed = (radius: number): number =>
	GALAXY_SPEED * (1 - Math.exp(-radius / GALAXY_CORE));
const expectedSpeed = (radius: number): number =>
	radius <= GALAXY_LIGHT_EDGE
		? actualSpeed(radius)
		: actualSpeed(GALAXY_LIGHT_EDGE) * Math.sqrt(GALAXY_LIGHT_EDGE / radius);
const rectsOverlap = (a: Rect, b: Rect): boolean =>
	a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// 3장 갈레 하늘 · 7장 원반 별(시드 고정)
const GALLE_STARS = (() => {
	const rand = rng(1846);
	return Array.from({ length: 24 }, () => {
		const angle = rand() * TAU;
		const radius = 0.15 + Math.sqrt(rand()) * 0.75;
		return {
			u: Math.cos(angle) * radius,
			v: Math.sin(angle) * radius,
			b: 0.35 + rand() * 0.65,
			wobble: rand()
		};
	});
})();
const GALAXY = (() => {
	const rand = rng(1970);
	const gauss = gaussOf(rand);
	return Array.from({ length: 1800 }, (_, i) => {
		const arm = i % 2;
		const radius = Math.min(1, 0.04 + Math.pow(rand(), 1.45) * 1.0);
		const spiral = i % 5 < 3;
		const theta = spiral
			? arm * Math.PI + Math.log(radius + 0.05) * 2.4 + gauss() * 0.35
			: rand() * TAU;
		return {
			radius,
			theta,
			size: 0.6 + Math.pow(rand(), 3) * 1.6,
			alpha: 0.25 + rand() * 0.6,
			warm: Math.max(0, 1 - radius * 1.6)
		};
	});
})();

type FieldStar = { u: number; v: number; size: number; alpha: number };
const SCOPE_FIELD = new Map<string, FieldStar[]>();
function scopeField(key: string): FieldStar[] {
	const cached = SCOPE_FIELD.get(key);
	if (cached !== undefined) return cached;
	const rand = rng(key.length * 7919 + key.charCodeAt(0) * 31 + key.charCodeAt(key.length - 1));
	const stars: FieldStar[] = [];
	for (let i = 0; i < 70; i++) {
		const angle = rand() * TAU;
		const radius = Math.sqrt(rand());
		stars.push({
			u: Math.cos(angle) * radius,
			v: Math.sin(angle) * radius,
			size: 0.4 + Math.pow(rand(), 3) * 1.2,
			alpha: 0.12 + rand() * 0.45
		});
	}
	SCOPE_FIELD.set(key, stars);
	return stars;
}

type Layout = {
	bandTop: number;
	bandH: number;
	textZone: number;
	hillUnit: number;
	hillScale: number;
	wide: boolean;
	area: { left: number; right: number };
	centerX: number;
	band: { left: number; right: number };
	frame: { left: number; width: number };
	scope: Scope;
	scopeBase: Scope;
	plot: { left: number; right: number; top: number; bottom: number };
	kc: { x: number; y: number };
	kr: number;
	zone: { top: number; bottom: number };
	zFull: number;
	landscape: boolean;
	pathGeo: Geometry;
	pathGeoB: Geometry;
	pathGeoUp: Geometry;
	pathGeoUpOwnText: Geometry;
	scopeLimits: ScopeLimit[];
	scopeMaxR: number;
	lit: { fx: number; fy: number }[];
};

/**
 * 렌더러 만들기. 그리기 함수는 시제품처럼 한 그리기 대상(ctx: 화면 · 띠 · 원형 시야 캔버스를 오간다)과 배치(L)를 함께 쓴다.
 * wide: 가로 PC 배치 여부(CSS 와 같은 조건, 화면이 바뀔 때마다 다시 읽는다)
 */
export function createUnseenRenderer(
	canvas: HTMLCanvasElement,
	data: StaticData,
	hidden: HiddenMarks,
	wide: () => boolean
): UnseenRenderer {
	const mainCtx = context2d(canvas);
	let ctx = mainCtx;
	let W = 0;
	let H = 0;
	let DPR = 1;
	let UI = 1;
	let SMALL_FONT = '';
	let LABEL_FONT = '';
	let BUBBLE_FONT = '';
	const fontPx = (size: number): string => `${size * UI}px ` + FONT;
	let L: Layout | null = null;
	let sceneA: HTMLCanvasElement | null = null;
	let sky: HTMLCanvasElement | null = null;
	let telescopeAim = TELESCOPE_START_ANGLE;
	let builtSize = '';
	// 지금 그리는 장면의 별밭 변환(대상 · 물결 길 머리 · 원반 자리를 이 변환으로 옮긴다)
	let currentSky: Transform = { k: 1, tx: 0, ty: 0 };
	const skyLayer = document.createElement('canvas');
	const skyLayerCtx = context2d(skyLayer);
	const bandCanvas = document.createElement('canvas');
	const bandCtx = context2d(bandCanvas);
	const scopeCanvas = document.createElement('canvas');
	const scopeCtx = context2d(scopeCanvas);
	const litSprite = makeLitSprite(LIT_CORE, LIT_GLOW);
	const litFirstSprite = makeLitSprite('rgba(255,207,122,1)', 'rgba(255,207,122,0.3)');

	// ---------- 자료 ----------
	const PATH = data.sirius.path;
	const ORBIT = data.sirius.orbit;
	const MASS_FRACTION_B = data.sirius.massFractionB;
	const PATH_START_YEAR = PATH.year[0];
	const PATH_STEP_YEARS = PATH.year[1] - PATH.year[0];
	const PEG = data.peg;
	const PEG_DAYS = PEG.velocity.day[PEG.velocity.day.length - 1];
	const input: SceneInput = {
		pathStartYear: PATH_START_YEAR,
		pathEndYear: PATH.year[PATH.year.length - 1],
		pegDays: PEG_DAYS
	};
	// 2장 띠: 곧은 길(질량 중심이 1750~1850 에 그리는 직선) 방향
	const PATH_DIRECTION = (() => {
		const last = PATH.year.length - 1;
		const east = PATH.baryEast[last] - PATH.baryEast[0];
		const north = PATH.baryNorth[last] - PATH.baryNorth[0];
		const length = Math.hypot(east, north);
		return { east: east / length, north: north / length };
	})();
	const yearIndex = (year: number): number =>
		clamp((year - PATH_START_YEAR) / PATH_STEP_YEARS, 0, PATH.year.length - 1);
	// 2-2 말풍선이 가리킬 곳: 베셀 시점까지 곧은 길에서 가장 멀리 벗어난 점
	const MAX_WOBBLE_INDEX = (() => {
		let best = 0;
		let bestValue = -1;
		const be = PATH.baryEast[PATH.year.length - 1] - PATH.baryEast[0];
		const bn = PATH.baryNorth[PATH.year.length - 1] - PATH.baryNorth[0];
		const length = Math.hypot(be, bn);
		for (let i = 0; i <= yearIndex(BESSEL_YEAR); i++) {
			const value = Math.abs(PATH.reflexEast[i] * bn - PATH.reflexNorth[i] * be) / length;
			if (value > bestValue) {
				bestValue = value;
				best = i;
			}
		}
		return best;
	})();
	// 2-2 띠: 반사 운동을 곧은 길 방향에 수직으로 잰 값(각초). 부호는 가장 크게 벗어난 점이 위로 오게 맞춘다
	const DEVIATION = (() => {
		const raw = PATH.year.map(
			(_, i) =>
				PATH.reflexEast[i] * PATH_DIRECTION.north - PATH.reflexNorth[i] * PATH_DIRECTION.east
		);
		const sign = raw[MAX_WOBBLE_INDEX] < 0 ? -1 : 1;
		return raw.map((value) => value * sign);
	})();
	const DEVIATION_SHOWN = DEVIATION.slice(0, Math.floor(yearIndex(BESSEL_YEAR)) + 1);
	const DEVIATION_MIN = Math.min(0, ...DEVIATION_SHOWN);
	const DEVIATION_MAX = Math.max(...DEVIATION_SHOWN);
	const ORBIT_EXTENT = (() => {
		let max = 0;
		for (let i = 0; i < ORBIT.year.length; i++) {
			max = Math.max(max, Math.hypot(ORBIT.east[i], ORBIT.north[i]) * (1 - MASS_FRACTION_B));
		}
		return max;
	})();

	function layout(): Layout {
		if (L === null) throw new Error('unseen renderer used before resize');
		return L;
	}

	// 캔버스 크기를 정하면 그리기 상태가 기본값(butt · miter)으로 돌아간다. 지금까지 그려진 모양을 바탕 상태로 명시한다:
	// 화면 캔버스는 drawFigure 에서 새어 나온 round 상태, 띠 캔버스는 선 끝 butt(STEP 107 모양) · 꺾임 round.
	// (원형 시야 캔버스는 round 를 쓴 적이 없어 기본값 그대로 둔다)
	function initDrawingState(context: CanvasRenderingContext2D, lineCap: CanvasLineCap): void {
		context.lineCap = lineCap;
		context.lineJoin = 'round';
	}

	// ---------- 배치 ----------
	function resize(boxes: TextBox[]): void {
		const rect = canvas.getBoundingClientRect();
		DPR = Math.min(window.devicePixelRatio || 1, MAX_DPR);
		W = rect.width;
		H = rect.height;
		canvas.width = Math.round(W * DPR);
		canvas.height = Math.round(H * DPR);
		initDrawingState(mainCtx, 'round');
		// 크기 규칙: 짧은 변(minSide) 기준, 모바일(짧은 변 390 이하)에서는 모든 배율이 1 이고 STEP 106 식과 같다
		const minSide = Math.min(W, H);
		UI = clamp(1 + (minSide - MOBILE_WIDTH) * UI_SLOPE, 1, UI_MAX);
		SMALL_FONT = fontPx(12.5);
		LABEL_FONT = '600 ' + fontPx(12);
		BUBBLE_FONT = '600 ' + fontPx(12.5);
		const textZone =
			clamp(H * TEXT_TOP_RATIO - TEXT_TOP_OFFSET, TEXT_TOP_MIN, TEXT_TOP_MAX) + TEXT_BLOCK * UI;
		const bandH = clamp(H * 0.31, 210, 280 * UI);
		const bandTop = H - bandH;
		// 그림 영역: PC 는 글 열 오른쪽(글 열 끝 + 32 ~ 화면 끝 − 32), 그 밖은 화면 전체(가운데 W / 2 · 폭 W 로 기존 식 그대로)
		const isWide = wide();
		const column = boxes[0];
		const area = isWide
			? { left: column.left + column.width + PICTURE_GAP, right: W - PICTURE_GAP }
			: { left: 0, right: W };
		const areaWidth = area.right - area.left;
		const centerX = isWide ? (area.left + area.right) / 2 : W / 2;
		const bandWidth = Math.min(areaWidth, BAND_MAX_WIDTH);
		const bandLeft = isWide ? centerX - bandWidth / 2 : (W - bandWidth) / 2;
		const frameWidth = Math.min(areaWidth, FRAME_MAX_WIDTH);
		const zoneH = bandTop - textZone;
		const scopeR = Math.min(minSide * 0.42, zoneH * 0.47, SCOPE_MAX_RADIUS);
		// 언덕 구도 폭: 세로 화면은 화면 폭, 가로 화면은 모바일 비율(390:844)로 높이에 맞춘 폭
		const hillUnit = Math.min(W, (H * MOBILE_WIDTH) / MOBILE_HEIGHT);
		const hillScale = Math.min(hillUnit / MOBILE_WIDTH, HILL_SCALE_MAX);
		const scope = { x: centerX, y: textZone + zoneH / 2, r: scopeR };
		const kr = hillUnit * 0.13;
		const next: Layout = {
			bandTop,
			bandH,
			textZone,
			hillUnit,
			hillScale,
			wide: isWide,
			area,
			centerX,
			band: { left: bandLeft, right: bandLeft + bandWidth },
			frame: { left: isWide ? centerX - frameWidth / 2 : (W - frameWidth) / 2, width: frameWidth },
			scope,
			scopeBase: scope,
			plot: {
				left: bandLeft + 36 * UI,
				right: bandLeft + bandWidth - 14 * UI,
				top: bandTop + 28 * UI,
				bottom: H - 30 * UI
			},
			kc: { x: W / 2 + (HILL_SIRIUS.fx - 0.5) * hillUnit, y: H * HILL_SIRIUS.fy },
			kr,
			zone: { top: textZone + 8, bottom: H - 44 },
			zFull: Math.hypot(W / 2, H / 2) / kr,
			landscape: W > H,
			pathGeo: { scale: 1, ox: 0, oy: 0 },
			pathGeoB: { scale: 1, ox: 0, oy: 0 },
			pathGeoUp: { scale: 1, ox: 0, oy: 0 },
			pathGeoUpOwnText: { scale: 1, ox: 0, oy: 0 },
			scopeLimits: [],
			scopeMaxR: SCOPE_MAX_RADIUS,
			lit: []
		};
		L = next;
		const textBottom = (id: string): number => {
			const box = boxes[BEAT_IDS.indexOf(id)];
			return box.top + box.height;
		};
		next.pathGeo = fitPathGeometry(false);
		next.pathGeoB = fitPathGeometry(true);
		// 2장 띠가 올라오면 물결 길은 띠 위 자리로 줄어 옮겨 간다(축척만 바뀌고 모양은 그대로)
		next.pathGeoUp = fitPathGeometry(false, bandTop - PATH_ABOVE_BAND_GAP);
		// 2-2 는 글이 한 줄이라 고정 글 자리(TEXT_BLOCK) 대신 실제 글 상자 아래부터 쓴다(STEP 110 S6). 2-3 · 2-4 는 pathGeoUp 그대로
		// PC 는 글이 옆 열에 있어 글 상자 아래 끝이 위 글 자리가 아니므로 2-3 자리(pathGeoUp) 그대로
		next.pathGeoUpOwnText = isWide
			? next.pathGeoUp
			: fitPathGeometry(
					false,
					bandTop - PATH_ABOVE_BAND_GAP,
					textBottom('2-2') + PATH_BELOW_TEXT_GAP
				);
		// 비트 상태를 미리 계산해 띠 쓰임을 보므로 L 의 다른 값이 모두 정해진 뒤에
		if (next.landscape) fitScopeLimits(minSide, boxes);
		next.lit = buildLitPoints(boxes[BEAT_IDS.indexOf('6-4')]);
		bandCanvas.width = Math.round(W * DPR);
		bandCanvas.height = Math.round(bandH * DPR);
		initDrawingState(bandCtx, 'butt');
		scopeCanvas.width = scopeCanvas.height = Math.ceil(scopeR * 2 * DPR);
		telescopeAim = telescopeAimAngle(W, H, hillScale, hillUnit, next.kc.x);
		const size = `${W}x${H}x${DPR}`;
		if (size !== builtSize) {
			builtSize = size;
			const scaleA = Math.min(DPR, MAX_SCENE_SCALE_A);
			// 하늘 별밭은 대상에서 ZOOM_TARGET 배로 확대되어 보인다. 가로 화면(PC, DPR 1 이 흔함)은 DPR × 2 로는 1.6 배 늘여 그려 별 가장자리가
			// 번지므로 DPR × ZOOM_TARGET 까지 미리 그린다(STEP 110 S2). 세로 화면은 기존 값 그대로
			const skyDensity = next.landscape ? DPR * ZOOM_TARGET : DPR * 2;
			const scaleSky = Math.min(
				skyDensity,
				MAX_SCENE_SCALE_SKY,
				Math.sqrt(SKY_PIXEL_BUDGET / (W * H))
			);
			const areaScale = Math.max(1, W / hillUnit);
			sceneA = buildSceneA(
				Math.round(W * scaleA),
				Math.round(H * scaleA),
				hillUnit * scaleA,
				hillScale * scaleA
			);
			sky = buildSky(
				Math.round(W * scaleSky),
				Math.round(H * scaleSky),
				hillScale * scaleSky,
				areaScale
			);
			skyLayer.width = canvas.width;
			skyLayer.height = canvas.height;
		}
	}

	// 가로 화면: 비트마다 시야가 쓸 수 있는 세로 범위(글 상자 아래 ~ 띠 위, 띠가 없으면 화면 아래)
	// PC(STEP 111 P1): 글이 옆에 있어 화면 위부터 쓰고, 반지름은 그림 영역 폭 절반을 넘지 않는다(글 열과 겹치지 않게)
	function fitScopeLimits(minSide: number, boxes: TextBox[]): void {
		const l = layout();
		const gap = SCOPE_EDGE_GAP * UI;
		l.scopeLimits = BEAT_IDS.map((id, i) => {
			const band = beatShowsBand(id, input);
			if (l.wide) {
				return {
					top: WIDE_SCOPE_EDGE,
					bottom: band ? l.bandTop - WIDE_SCOPE_BAND_GAP : H - WIDE_SCOPE_EDGE
				};
			}
			return { top: boxes[i].top + boxes[i].height + gap, bottom: (band ? l.bandTop : H) - gap };
		});
		l.scopeMaxR = Math.min(minSide * 0.42, SCOPE_MAX_RADIUS);
		if (l.wide) l.scopeMaxR = Math.min(l.scopeMaxR, (l.area.right - l.area.left) / 2);
	}

	// 균일 배율 변환 {k, tx, ty}: 화면 = 점 × k + t
	function setTransform(t: Transform): void {
		ctx.setTransform(DPR * t.k, 0, 0, DPR * t.k, DPR * t.tx, DPR * t.ty);
	}
	const IDENTITY: Transform = { k: 1, tx: 0, ty: 0 };
	const applyT = (t: Transform, x: number, y: number): Point => [x * t.k + t.tx, y * t.k + t.ty];

	// 언덕 카메라: dive 0 → 1 이면 시리우스가 화면 가운데로 오며 확대된다
	function transformA(dive: number): Transform {
		const l = layout();
		const z = Math.exp(dive * Math.log(l.zFull));
		const move = phase(dive, 0, 0.7);
		const sx = lerp(l.kc.x, W / 2, move);
		const sy = lerp(l.kc.y, H / 2, move);
		return { k: z, tx: sx - l.kc.x * z, ty: sy - l.kc.y * z };
	}
	// 하늘 별밭은 시리우스 둘레 작은 원 안에 들어 있다: 별밭 화면 전체 = 언덕의 그 원 안(1/zFull 배)
	function transformSkyInA(tA: Transform): Transform {
		const l = layout();
		const k = tA.k / l.zFull;
		return { k, tx: tA.tx + tA.k * l.kc.x - (k * W) / 2, ty: tA.ty + tA.k * l.kc.y - (k * H) / 2 };
	}
	// 별밭 위 대상 자리(가로 PC 의 천왕성 · 안드로메다는 그림 영역 안, unseenScene targetSpot)
	function targetPoint(key: TargetKey): Point {
		const l = layout();
		return targetSpot(key, W, H, l.wide ? l.area : null);
	}
	// 하늘 → 대상: 대상이 원형 시야 중심으로 오며 확대
	function transformFocus(key: TargetKey | null, focus: number): Transform {
		if (focus <= 0 || key === null) return IDENTITY;
		const l = layout();
		const [px, py] = targetPoint(key);
		const z = Math.exp(focus * Math.log(ZOOM_TARGET));
		const ax = lerp(W / 2, px, focus);
		const ay = lerp(H / 2, py, focus);
		// 확대 초점 가로 자리: 그림 영역 가운데(PC 외에는 centerX = W / 2 라 기존과 같다)
		const sx = lerp(W / 2, l.centerX, focus);
		const sy = lerp(H / 2, l.scope.y, focus);
		return { k: z, tx: sx - ax * z, ty: sy - ay * z };
	}

	// ---------- 빛점(클로즈업 별): 빛점 + 번짐(proto2 그대로) ----------
	function drawLightPoint(
		x: number,
		y: number,
		size: number,
		rgb: Rgb,
		brightness: number,
		haloScale?: number
	): void {
		const b = clamp(brightness, 0, 1.4);
		const sb = Math.sqrt(b);
		const [r, g, bl] = rgb;
		const base = ctx.globalAlpha;
		const halo = size * 7 * sb * (haloScale === undefined ? 1 : haloScale);
		if (halo > 0.5) {
			const grad = ctx.createRadialGradient(x, y, 0, x, y, halo);
			grad.addColorStop(0, `rgba(${r},${g},${bl},${0.36 * b})`);
			grad.addColorStop(0.3, `rgba(${r},${g},${bl},${0.11 * b})`);
			grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
			ctx.fillStyle = grad;
			ctx.beginPath();
			ctx.arc(x, y, halo, 0, TAU);
			ctx.fill();
		}
		// 망원경 회절 십자(옅게)
		ctx.globalAlpha = base * 0.22 * b;
		ctx.strokeStyle = `rgb(${r},${g},${bl})`;
		ctx.lineWidth = 1;
		const spike = size * 9 * sb;
		ctx.beginPath();
		ctx.moveTo(x - spike, y);
		ctx.lineTo(x + spike, y);
		ctx.moveTo(x, y - spike);
		ctx.lineTo(x, y + spike);
		ctx.stroke();
		ctx.globalAlpha = base;
		const core = Math.max(0.8, size * 2.2 * sb);
		const coreGrad = ctx.createRadialGradient(x, y, 0, x, y, core);
		coreGrad.addColorStop(0, `rgba(255,255,255,${Math.min(1, b)})`);
		coreGrad.addColorStop(0.35, `rgba(${r},${g},${bl},${0.85 * Math.min(1, b)})`);
		coreGrad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
		ctx.fillStyle = coreGrad;
		ctx.beginPath();
		ctx.arc(x, y, core, 0, TAU);
		ctx.fill();
	}

	// ---------- 작은 글자 · 말풍선 ----------
	function tag(text: string, x: number, y: number, align: CanvasTextAlign, alpha?: number): void {
		if (alpha !== undefined && alpha <= 0) return;
		const base = ctx.globalAlpha;
		ctx.globalAlpha = base * (alpha === undefined ? 1 : alpha);
		ctx.font = fontPx(12);
		ctx.textAlign = align;
		ctx.textBaseline = 'middle';
		ctx.lineWidth = 3;
		ctx.strokeStyle = 'rgba(3,5,12,0.8)';
		ctx.strokeText(text, x, y);
		ctx.fillStyle = 'rgba(170,180,204,0.92)';
		ctx.fillText(text, x, y);
		ctx.globalAlpha = base;
	}
	function label(
		text: string,
		x: number,
		y: number,
		align: CanvasTextAlign,
		alpha?: number,
		color?: string
	): void {
		if (alpha !== undefined && alpha <= 0) return;
		const base = ctx.globalAlpha;
		ctx.globalAlpha = base * (alpha === undefined ? 1 : alpha);
		ctx.font = LABEL_FONT;
		ctx.textAlign = align;
		ctx.textBaseline = 'middle';
		ctx.lineWidth = 3;
		ctx.strokeStyle = 'rgba(3,5,12,0.85)';
		ctx.strokeText(text, x, y);
		ctx.fillStyle = color === undefined ? 'rgba(235,233,228,0.95)' : color;
		ctx.fillText(text, x, y);
		ctx.globalAlpha = base;
	}
	// 말풍선(G3): 결론 한 문장. 상자와 가리키는 점을 가는 선으로 잇는다
	function bubble(
		text: string,
		ax: number,
		ay: number,
		options: { side: 'above'; alpha: number; gap?: number }
	): void {
		const l = layout();
		const alpha = options.alpha;
		if (alpha <= 0) return;
		const lines = text.split('\n');
		ctx.font = BUBBLE_FONT;
		const textW = Math.max(...lines.map((line) => ctx.measureText(line).width));
		const lineH = 17 * UI;
		const padX = 9 * UI;
		const padY = 6 * UI;
		const bw = textW + padX * 2;
		const bh = lines.length * lineH + padY * 2;
		const gap = options.gap === undefined ? 12 : options.gap;
		// 띠 안 말풍선: 띠 가로 범위 안에 둔다(시제품의 하늘 위 말풍선 · 다른 방향은 쓰는 곳이 없다)
		let bx = ax - bw / 2;
		let by = ay - gap - bh;
		bx = clamp(bx, l.band.left + 8, l.band.right - 8 - bw);
		by = clamp(by, l.bandTop + 6, H - 6 - bh);
		const base = ctx.globalAlpha;
		ctx.globalAlpha = base * alpha;
		const ex = clamp(ax, bx, bx + bw);
		const ey = clamp(ay, by, by + bh);
		ctx.strokeStyle = 'rgba(255, 243, 214, 0.8)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(ex, ey);
		ctx.lineTo(ax, ay);
		ctx.stroke();
		ctx.fillStyle = ACCENT;
		ctx.beginPath();
		ctx.arc(ax, ay, 2.6 * UI, 0, TAU);
		ctx.fill();
		ctx.fillStyle = 'rgba(255, 243, 214, 0.96)';
		ctx.beginPath();
		ctx.roundRect(bx, by, bw, bh, 8);
		ctx.fill();
		ctx.fillStyle = '#21170a';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		lines.forEach((line, i) => ctx.fillText(line, bx + padX, by + padY + i * lineH + 1));
		ctx.globalAlpha = base;
	}

	// ---------- 하늘(언덕 · 별밭) ----------
	function drawDivingSky(tSky: Transform, dive: number, alpha: number): void {
		if (sky === null) return;
		const g = skyLayerCtx;
		g.setTransform(1, 0, 0, 1, 0, 0);
		g.globalCompositeOperation = 'source-over';
		g.clearRect(0, 0, skyLayer.width, skyLayer.height);
		const scale = DPR * tSky.k;
		for (let i = -1; i <= 1; i++) {
			for (let j = -1; j <= 1; j++) {
				// 화면 밖 판은 건너뜀
				const left = tSky.tx + i * W * tSky.k;
				const top = tSky.ty + j * H * tSky.k;
				if (left > W || left + W * tSky.k < 0 || top > H || top + H * tSky.k < 0) continue;
				// 거울로 뒤집어 이어 붙인다(i = −1: x → −x, i = 1: x → 2W − x). 그대로 이어 붙이면 성운 얼룩이 판 가장자리에서 잘려
				// 이음매에 밝기 단차가 남는다(1-3 측정 평균 3~5 단계). 거울은 이음매 양쪽이 같은 값이라 단차가 없다
				const offsetX = i === 1 ? 2 * W : 0;
				const offsetY = j === 1 ? 2 * H : 0;
				const flipX = i === 0 ? 1 : -1;
				const flipY = j === 0 ? 1 : -1;
				g.setTransform(
					scale * flipX,
					0,
					0,
					scale * flipY,
					DPR * tSky.tx + scale * offsetX,
					DPR * tSky.ty + scale * offsetY
				);
				g.drawImage(sky, 0, 0, W, H);
			}
		}
		const radius = lerp(
			SKY_MASK_START,
			SKY_MASK_END,
			phase(dive, SKY_MASK_GROW[0], SKY_MASK_GROW[1])
		);
		// 별밭 가운데를 원점, 반폭 · 반높이를 1 로 둔 좌표에서 원 = 화면에서 별밭 비율 타원
		g.setTransform(
			(scale * W) / 2,
			0,
			0,
			(scale * H) / 2,
			DPR * (tSky.tx + (tSky.k * W) / 2),
			DPR * (tSky.ty + (tSky.k * H) / 2)
		);
		const mask = g.createRadialGradient(0, 0, 0, 0, 0, radius);
		mask.addColorStop(0, 'rgba(0,0,0,1)');
		mask.addColorStop(SKY_MASK_CORE, 'rgba(0,0,0,1)');
		mask.addColorStop(1, 'rgba(0,0,0,0)');
		g.globalCompositeOperation = 'destination-in';
		g.fillStyle = mask;
		const cover = 4 / tSky.k + SKY_MASK_END; // 화면 전체를 덮는 사각형(이 좌표에서 화면은 반지름 2 / k 안)
		g.fillRect(-cover, -cover, cover * 2, cover * 2);
		g.globalCompositeOperation = 'source-over';
		ctx.save();
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.globalAlpha = alpha;
		ctx.drawImage(skyLayer, 0, 0);
		ctx.restore();
	}

	// 6장 켜지는 점(STEP 111 P3): 무작위 대신 51 페가시 자리에서 황금각 나선 순서로 바깥쪽으로, 진행 값에 비례해 한 점씩.
	// 자리는 화면 크기로 정하고(resize), 글 상자 · 띠 영역과 화면 가장자리에 걸리는 나선 자리는 건너뛴다
	function buildLitPoints(text: TextBox): { fx: number; fy: number }[] {
		const l = layout();
		const [centerX, centerY] = targetPoint('peg');
		const spacing = LIT_SPACING * Math.min(W, H);
		const avoid: Rect[] = [
			{
				left: text.left - LIT_AVOID_GAP,
				right: text.left + text.width + LIT_AVOID_GAP,
				top: text.top - LIT_AVOID_GAP,
				bottom: text.top + text.height + LIT_AVOID_GAP
			},
			{
				left: l.band.left - LIT_AVOID_GAP,
				right: l.band.right + LIT_AVOID_GAP,
				top: l.bandTop - LIT_AVOID_GAP,
				bottom: H
			}
		];
		const points: { fx: number; fy: number }[] = [];
		for (let i = 0; i < LIT_SEARCH_LIMIT && points.length < LIT_COUNT; i++) {
			const radius = spacing * Math.sqrt(i);
			const angle = i * GOLDEN_ANGLE;
			const x = centerX + Math.cos(angle) * radius;
			const y = centerY + Math.sin(angle) * radius;
			const inside = x > LIT_EDGE && x < W - LIT_EDGE && y > LIT_EDGE && y < H - LIT_EDGE;
			// 첫 점(i = 0)은 51 페가시 자리 그대로
			if (
				i > 0 &&
				(!inside ||
					avoid.some((rect) => x > rect.left && x < rect.right && y > rect.top && y < rect.bottom))
			) {
				continue;
			}
			points.push({ fx: x / W, fy: y / H });
		}
		return points;
	}

	function drawLit(tSky: Transform, S: SceneState): void {
		if (S.lit <= 0) return;
		const l = layout();
		const base = ctx.globalAlpha;
		const shown = S.lit * l.lit.length; // 일정한 박자: 진행 값에 비례한 개수만큼 순서대로
		l.lit.forEach((item, i) => {
			const alpha = clamp(shown - i, 0, 1);
			if (alpha <= 0) return;
			const [x, y] = applyT(tSky, item.fx * W, item.fy * H);
			const size = (i === 0 ? LIT_FIRST_DOT : LIT_DOT) * UI;
			ctx.globalAlpha = base * alpha * LIT_ALPHA;
			ctx.drawImage(i === 0 ? litFirstSprite : litSprite, x - size / 2, y - size / 2, size, size);
		});
		ctx.globalAlpha = base;
	}

	function drawAndromedaSmudge(x: number, y: number, k: number, alpha: number): void {
		if (alpha <= 0) return;
		const base = ctx.globalAlpha;
		ctx.save();
		ctx.translate(x, y);
		ctx.rotate(-0.55);
		ctx.scale(1, 0.36);
		const radius = 15 * Math.min(k, ZOOM_TARGET);
		const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
		grad.addColorStop(0, 'rgba(255,240,215,0.85)');
		grad.addColorStop(0.25, 'rgba(225,215,235,0.35)');
		grad.addColorStop(1, 'rgba(160,170,220,0)');
		ctx.globalAlpha = base * alpha;
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.arc(0, 0, radius, 0, TAU);
		ctx.fill();
		ctx.restore();
		ctx.globalAlpha = base;
	}

	function drawTargets(tSky: Transform, S: SceneState): void {
		const base = ctx.globalAlpha;
		const k = tSky.k;
		for (const key of TARGET_KEYS) {
			const point = targetPoint(key);
			const [x, y] = applyT(tSky, point[0], point[1]);
			if (key === 'sirius' && S.siriusAlpha > 0) {
				ctx.globalAlpha = base * S.siriusAlpha;
				drawLightPoint(x, y, 1.6 * Math.min(k, 2.4), SIRIUS_RGB, 1.25);
			} else if (key === 'uranus') {
				ctx.globalAlpha = base;
				drawLightPoint(x, y, 0.8 * Math.min(k, 2), [196, 236, 228], 0.7, 0.6);
			} else if (key === 'peg') {
				ctx.globalAlpha = base;
				drawLightPoint(x, y, 1.0 * Math.min(k, 2), [255, 226, 160], 0.85, 0.7);
			} else if (key === 'andromeda') {
				ctx.globalAlpha = base;
				drawAndromedaSmudge(x, y, k, S.smudge);
			}
			ctx.globalAlpha = base;
			const ring = S.rings[key];
			if (ring !== undefined && ring > 0) {
				ctx.strokeStyle = 'rgba(255,214,150,.85)';
				ctx.lineWidth = 1.2;
				ctx.beginPath();
				ctx.arc(x, y, 13 * Math.min(k, 1.6), -Math.PI / 2, -Math.PI / 2 + TAU * ring);
				ctx.stroke();
				// 이름표는 대상이 별밭 오른쪽 절반이면 왼쪽에(시제품 fx > 0.5 와 같은 판정, 옮긴 자리 기준)
				const right = point[0] / W > 0.5;
				label(TARGET_NAMES[key], right ? x - 20 : x + 20, y, right ? 'right' : 'left', ring);
			}
		}
	}

	function drawHillSirius(tA: Transform, S: SceneState): void {
		const l = layout();
		const [x, y] = applyT(tA, l.kc.x, l.kc.y);
		const k = Math.min(tA.k, 4);
		drawLightPoint(x, y, 2.3 * k, SIRIUS_RGB, 1.4, 1.3);
		if (S.hillMark > 0) {
			ctx.globalAlpha = S.hillMark * 0.7;
			ctx.strokeStyle = 'rgba(255,214,150,1)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.arc(x, y, 15 * k, 0, TAU);
			ctx.stroke();
			ctx.globalAlpha = 1;
			label('시리우스', x, y + 15 * k + 12, 'center', S.hillMark);
		}
		// 8장: 맨눈에 보이지 않는 짝의 자리(점선 고리만)
		if (S.bSpot > 0) {
			const bx = x + 15 * k;
			const by = y - 8 * k;
			ctx.globalAlpha = S.bSpot;
			ctx.strokeStyle = 'rgba(196,214,255,0.9)';
			ctx.lineWidth = 1.2;
			ctx.setLineDash([2, 3]);
			ctx.beginPath();
			ctx.arc(bx, by, 6, 0, TAU);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.globalAlpha = 1;
		}
	}

	// 8장: 은하수 위로 옅은 윤곽이 한 번 스침(보이지 않는 덩어리)
	function drawHaloSweep(tA: Transform, amount: number, alpha: number): void {
		if (alpha <= 0) return;
		const [x0, y0] = applyT(tA, W * 0.92, H * 0.05);
		const [x1, y1] = applyT(tA, W * 0.12, H * 0.78);
		const x = lerp(x0, x1, amount);
		const y = lerp(y0, y1, amount);
		ctx.save();
		ctx.globalAlpha = alpha;
		// 언덕 구도 폭 기준(세로 화면은 hillUnit = W 라 그대로, 가로 화면은 화면 폭이 아닌 구도 폭에 맞춤 — STEP 110 S4)
		const radius = layout().hillUnit * 0.42;
		const grad = ctx.createRadialGradient(x, y, radius * 0.55, x, y, radius);
		grad.addColorStop(0, 'rgba(160,175,230,0)');
		grad.addColorStop(0.8, 'rgba(160,175,230,0.10)');
		grad.addColorStop(1, 'rgba(160,175,230,0)');
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.ellipse(x, y, radius, radius * 0.8, -0.9, 0, TAU);
		ctx.fill();
		ctx.strokeStyle = 'rgba(190,200,240,0.22)';
		ctx.lineWidth = 1;
		ctx.setLineDash([3, 6]);
		ctx.beginPath();
		ctx.ellipse(x, y, radius * 0.92, radius * 0.74, -0.9, 0, TAU);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.restore();
	}

	function drawSky(S: SceneState): void {
		const l = layout();
		ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
		ctx.fillStyle = '#03050c';
		ctx.fillRect(0, 0, W, H);
		const tA = transformA(S.dive);
		if (S.dive < 1 && sceneA !== null) {
			setTransform(tA);
			// 크게 확대된 언덕 장면은 거칠어 보이므로 시리우스 쪽으로 들어갈수록 어둡게 물러난다
			ctx.globalAlpha = 1 - phase(S.dive, 0.35, 0.8);
			ctx.drawImage(sceneA, 0, 0, W, H);
			drawFigure(
				ctx,
				W,
				H,
				l.hillScale,
				lerp(TELESCOPE_START_ANGLE, telescopeAim, S.aim),
				l.hillUnit
			);
			setTransform(IDENTITY);
			drawHillSirius(tA, S);
			drawHaloSweep(tA, S.sweep, S.sweepAlpha);
			ctx.globalAlpha = 1;
		}
		const skyAlpha = S.dive >= 1 ? 1 : phase(S.dive, 0.2, 0.55);
		if (skyAlpha > 0 && sky !== null) {
			const tSky = S.dive >= 1 ? transformFocus(S.focusKey, S.focus) : transformSkyInA(tA);
			currentSky = tSky;
			setTransform(tSky);
			if (S.dive < 1) {
				drawDivingSky(tSky, S.dive, skyAlpha);
			} else {
				ctx.globalAlpha = 1;
				ctx.drawImage(sky, 0, 0, W, H);
			}
			setTransform(IDENTITY);
			ctx.globalAlpha = skyAlpha;
			drawLit(tSky, S);
			drawTargets(tSky, S);
			ctx.globalAlpha = 1;
		}
		if (S.dim > 0) {
			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.fillStyle = `rgba(2,3,8,${S.dim})`;
			ctx.fillRect(0, 0, W, H);
		}
	}

	// ---------- 원형 시야(proto2 방식) ----------
	function drawClose(close: Close, cx: number, cy: number, R: number): void {
		switch (close.kind) {
			case 'uranus':
				drawUranusDiagram(cx, cy, R, close.o);
				return;
			case 'galle':
				closeGalle(close.o, cx, cy, R);
				return;
			case 'clark':
				closeClark(close.o, cx, cy, R);
				return;
			case 'sirius-b':
				closeB5(close.hot, cx, cy, R);
				return;
			case 'peg':
				closePeg(close.day, close.wobble, cx, cy, R);
				return;
		}
	}

	function drawScope(S: SceneState): void {
		if (S.scope <= 0 || S.close === null) return;
		const l = layout();
		const { x, y, r: R } = l.scope;
		// 가로 화면은 시야 반지름이 진행 값에 따라 바뀌므로 크기가 달라질 때만 다시 잡는다(세로 화면은 resize 값 그대로)
		const side = Math.ceil(R * 2 * DPR);
		if (scopeCanvas.width !== side) scopeCanvas.width = scopeCanvas.height = side;
		ctx = scopeCtx;
		ctx.setTransform(DPR, 0, 0, DPR, -(x - R) * DPR, -(y - R) * DPR);
		ctx.clearRect(x - R, y - R, R * 2, R * 2);
		const bg = ctx.createRadialGradient(x, y, 0, x, y, R);
		bg.addColorStop(0, '#0a0f22');
		bg.addColorStop(1, '#03050c');
		ctx.fillStyle = bg;
		ctx.beginPath();
		ctx.arc(x, y, R, 0, TAU);
		ctx.fill();
		if (S.fieldAlpha > 0) {
			for (const fieldStar of scopeField(S.scopeKey)) {
				ctx.globalAlpha = fieldStar.alpha * S.fieldAlpha;
				ctx.fillStyle = '#dfe7ff';
				ctx.beginPath();
				ctx.arc(x + fieldStar.u * R * 0.96, y + fieldStar.v * R * 0.96, fieldStar.size, 0, TAU);
				ctx.fill();
			}
		}
		ctx.globalAlpha = 1;
		drawClose(S.close, x, y, R);
		ctx.globalAlpha = 1;
		const vignette = ctx.createRadialGradient(x, y, R * 0.72, x, y, R);
		vignette.addColorStop(0, 'rgba(0,0,0,0)');
		vignette.addColorStop(1, 'rgba(0,0,0,0.7)');
		ctx.fillStyle = vignette;
		ctx.beginPath();
		ctx.arc(x, y, R, 0, TAU);
		ctx.fill();
		ctx = mainCtx;
		ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

		const sc = S.scope;
		// 4장 렌즈: 테 크기는 그대로 두고 안쪽만 서서히 밝아진다
		const r = S.scopeFixed ? R : lerp(SCOPE_START_RADIUS, R, smooth(sc));
		ctx.save();
		ctx.fillStyle = `rgba(2,3,8,${0.68 * (S.scopeFixed ? sc : phase(sc, 0, 0.6))})`;
		ctx.beginPath();
		ctx.rect(0, 0, W, H);
		ctx.arc(x, y, r, 0, TAU);
		ctx.fill('evenodd');
		ctx.restore();
		ctx.save();
		ctx.beginPath();
		ctx.arc(x, y, r, 0, TAU);
		ctx.clip();
		ctx.globalAlpha = S.scopeFixed ? sc : phase(sc, 0, 0.45);
		const k = r / R;
		ctx.drawImage(scopeCanvas, x - R * k, y - R * k, R * 2 * k, R * 2 * k);
		ctx.restore();
		ctx.globalAlpha = S.scopeFixed ? sc : 1;
		ctx.strokeStyle = 'rgba(0,0,0,0.45)';
		ctx.lineWidth = 5;
		ctx.beginPath();
		ctx.arc(x, y, r + 3, 0, TAU);
		ctx.stroke();
		ctx.strokeStyle = 'rgba(214,196,150,0.7)';
		ctx.lineWidth = 1.3;
		ctx.beginPath();
		ctx.arc(x, y, r, 0, TAU);
		ctx.stroke();
		ctx.globalAlpha = 1;
	}

	// ---------- 곡선 띠 공용(proto2) ----------
	function bandBase(): void {
		const l = layout();
		const { left, right } = l.band;
		ctx.fillStyle = 'rgba(6, 10, 24, 0.92)';
		if (left > 0) {
			// 넓은 화면: 가운데 카드(위 모서리만 둥글게)
			const radius = 12;
			ctx.beginPath();
			ctx.roundRect(left, l.bandTop, right - left, l.bandH, [radius, radius, 0, 0]);
			ctx.fill();
			ctx.strokeStyle = 'rgba(154, 166, 191, 0.22)';
			ctx.lineWidth = 1;
			ctx.stroke();
			return;
		}
		ctx.fillRect(0, l.bandTop, W, l.bandH);
		ctx.strokeStyle = 'rgba(154, 166, 191, 0.22)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, l.bandTop + 0.5);
		ctx.lineTo(W, l.bandTop + 0.5);
		ctx.stroke();
	}
	function axisWords(yWord: string, xWord: string | null): void {
		const l = layout();
		const p = l.plot;
		ctx.save();
		ctx.font = SMALL_FONT;
		ctx.fillStyle = DIM_COLOR;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.translate(l.band.left + 16 * UI, (p.top + p.bottom) / 2);
		ctx.rotate(-Math.PI / 2);
		ctx.fillText(yWord, 0, 0);
		ctx.restore();
		if (xWord !== null) {
			ctx.font = SMALL_FONT;
			ctx.fillStyle = DIM_COLOR;
			ctx.textAlign = 'right';
			ctx.textBaseline = 'bottom';
			ctx.fillText(xWord, p.right, H - 8);
		}
	}
	function bandTag(text: string): void {
		const l = layout();
		ctx.font = fontPx(12);
		ctx.fillStyle = 'rgba(154,166,191,0.75)';
		ctx.textAlign = 'right';
		ctx.textBaseline = 'top';
		ctx.fillText(text, l.band.right - 14 * UI, l.bandTop + 9 * UI);
	}
	function cursorDot(x: number, y: number): void {
		const l = layout();
		ctx.strokeStyle = 'rgba(255, 207, 122, 0.35)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(x + 0.5, l.plot.top - 4);
		ctx.lineTo(x + 0.5, l.plot.bottom);
		ctx.stroke();
		ctx.fillStyle = ACCENT;
		ctx.beginPath();
		ctx.arc(x, y, 3.2 * UI, 0, TAU);
		ctx.fill();
	}
	function strokeFunction(
		fn: (v: number) => number,
		from: number,
		to: number,
		mapX: (v: number) => number,
		mapY: (v: number) => number,
		options: { samples?: number; color?: string; width?: number; dash?: number[] }
	): void {
		const samples = options.samples === undefined ? 240 : options.samples;
		ctx.save(); // lineJoin 이 함수 밖으로 새지 않게
		ctx.strokeStyle = options.color === undefined ? CURVE_COLOR : options.color;
		ctx.lineWidth = (options.width === undefined ? LINE_WIDTH : options.width) * UI;
		ctx.lineJoin = 'round';
		ctx.setLineDash(options.dash === undefined ? [] : options.dash);
		ctx.beginPath();
		for (let i = 0; i <= samples; i++) {
			const v = lerp(from, to, i / samples);
			const x = mapX(v);
			const y = mapY(fn(v));
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.restore();
	}

	// ---------- 2 · 4 · 7장: 시리우스의 물결 길(실제 궤도값으로 계산, 흔들림 N배) ----------
	// 하늘 좌표(각초, 동쪽 · 북쪽 양수) → 화면: 북쪽이 위, 동쪽이 왼쪽
	function pathArcsec(i: number, kind: 'bary' | 'A' | 'B'): Point {
		const be = PATH.baryEast[i];
		const bn = PATH.baryNorth[i];
		if (kind === 'bary') return [be, bn];
		if (kind === 'A') {
			return [
				be + WOBBLE_SCALE_SIRIUS * PATH.reflexEast[i],
				bn + WOBBLE_SCALE_SIRIUS * PATH.reflexNorth[i]
			];
		}
		const shareB = 1 - MASS_FRACTION_B;
		return [
			be + WOBBLE_SCALE_SIRIUS * shareB * PATH.relEast[i],
			bn + WOBBLE_SCALE_SIRIUS * shareB * PATH.relNorth[i]
		];
	}
	function fitPathGeometry(includeB: boolean, bottomLimit?: number, topLimit?: number): Geometry {
		const l = layout();
		let minX = Infinity;
		let maxX = -Infinity;
		let minY = Infinity;
		let maxY = -Infinity;
		const kinds: ('A' | 'B')[] = includeB ? ['A', 'B'] : ['A'];
		for (let i = 0; i < PATH.year.length; i++) {
			for (const kind of kinds) {
				const [e, n] = pathArcsec(i, kind);
				minX = Math.min(minX, -e);
				maxX = Math.max(maxX, -e);
				minY = Math.min(minY, -n);
				maxY = Math.max(maxY, -n);
			}
		}
		const margin = 34;
		const top = topLimit === undefined ? l.zone.top + 16 : topLimit;
		const bottom = bottomLimit === undefined ? l.zone.bottom - 8 : bottomLimit;
		const scale = Math.min(
			(l.frame.width - margin * 2) / (maxX - minX),
			(bottom - top) / (maxY - minY)
		);
		const ox = l.centerX - (scale * (minX + maxX)) / 2;
		const oy = (top + bottom) / 2 - (scale * (minY + maxY)) / 2;
		return { scale, ox, oy };
	}
	const blendGeometry = (a: Geometry, b: Geometry, k: number): Geometry => ({
		scale: lerp(a.scale, b.scale, k),
		ox: lerp(a.ox, b.ox, k),
		oy: lerp(a.oy, b.oy, k)
	});
	// mix: 0 = A 길만 맞춤, 1 = A · B 길 함께 맞춤 / lift: 0 = 화면 아래까지, 1 = 2장 띠 위까지
	// upGeo: 띠 위 자리(없으면 pathGeoUp). 2-2 만 따로 준다
	function geoMix(mix: number, lift: number, upGeo?: Geometry): Geometry {
		const l = layout();
		const up = upGeo === undefined ? l.pathGeoUp : upGeo;
		const geo = blendGeometry(l.pathGeo, l.pathGeoB, mix);
		if (!(lift > 0)) return geo;
		return blendGeometry(geo, up, lift);
	}
	function pathScreen(geo: Geometry, index: number, kind: 'bary' | 'A' | 'B'): Point {
		const i0 = clamp(Math.floor(index), 0, PATH.year.length - 1);
		const i1 = Math.min(i0 + 1, PATH.year.length - 1);
		const f = index - i0;
		const [e0, n0] = pathArcsec(i0, kind);
		const [e1, n1] = pathArcsec(i1, kind);
		const e = lerp(e0, e1, f);
		const n = lerp(n0, n1, f);
		return [geo.ox - e * geo.scale, geo.oy - n * geo.scale];
	}

	// ---------- 2-2 띠: 곧은 길에서 벗어난 정도(실제 궤도값, 1750~1850 자료) ----------
	function deviationOfYear(year: number): number {
		const index = yearIndex(year);
		const i0 = Math.floor(index);
		const i1 = Math.min(i0 + 1, DEVIATION.length - 1);
		return lerp(DEVIATION[i0], DEVIATION[i1], index - i0);
	}
	// 곡선 범위(가장 낮은 값 ~ 가장 높은 값)를 말풍선 자리 아래 그림 높이에 맞춘다. 이심 궤도라 0선은 가운데가 아니다
	function deviationMap(): {
		mapX: (v: number) => number;
		mapY: (v: number) => number;
		mid: number;
	} {
		const p = layout().plot;
		const top = p.top + DEVIATION_BUBBLE_ROOM * UI;
		const bottom = p.bottom - 6 * UI;
		const amp = (bottom - top) / (DEVIATION_MAX - DEVIATION_MIN);
		const mapY = (value: number): number => bottom - (value - DEVIATION_MIN) * amp;
		return { mapX: mapLinear(PATH_START_YEAR, BESSEL_YEAR, p.left, p.right), mapY, mid: mapY(0) };
	}
	function chartDeviation(o: { year: number; cursor: number; bubble: number }): void {
		const p = layout().plot;
		axisWords('벗어남', '시간 →');
		bandTag('실제 궤도값으로 계산');
		const { mapX, mapY, mid } = deviationMap();
		// 0선 = 곧은 길
		ctx.strokeStyle = 'rgba(200,210,235,0.5)';
		ctx.lineWidth = UI;
		ctx.setLineDash([5, 6]);
		ctx.beginPath();
		ctx.moveTo(p.left, mid);
		ctx.lineTo(p.right, mid);
		ctx.stroke();
		ctx.setLineDash([]);
		// 곡선이 0선 위에서 시작하므로 왼쪽 끝 0선 아래에 단다
		ctx.font = fontPx(11.5);
		ctx.fillStyle = 'rgba(200,210,235,0.8)';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.fillText('곧은 길', p.left + 4 * UI, mid + 4 * UI);
		if (o.year > PATH_START_YEAR) {
			strokeFunction(deviationOfYear, PATH_START_YEAR, o.year, mapX, mapY, {
				width: 1.8,
				samples: Math.max(2, Math.round((o.year - PATH_START_YEAR) * 3))
			});
		}
		if (o.cursor > 0) {
			ctx.globalAlpha = o.cursor;
			cursorDot(mapX(o.year), mapY(deviationOfYear(o.year)));
			ctx.globalAlpha = 1;
		}
		const peakYear = PATH.year[MAX_WOBBLE_INDEX];
		bubble('곧게 가야 할 별이 흔들린다', mapX(peakYear), mapY(DEVIATION[MAX_WOBBLE_INDEX]), {
			side: 'above',
			alpha: o.bubble
		});
	}

	function strokePath(
		geo: Geometry,
		kind: 'bary' | 'A' | 'B',
		fromIndex: number,
		toIndex: number,
		options: { color: string; width?: number; dash?: number[] }
	): void {
		if (toIndex <= fromIndex) return;
		ctx.save(); // lineJoin 이 함수 밖으로 새지 않게
		ctx.strokeStyle = options.color;
		ctx.lineWidth = (options.width === undefined ? LINE_WIDTH : options.width) * UI;
		ctx.lineJoin = 'round';
		ctx.setLineDash(options.dash === undefined ? [] : options.dash);
		ctx.beginPath();
		for (let i = fromIndex; i <= toIndex; i += 1) {
			const [x, y] = pathScreen(geo, Math.min(i, toIndex), kind);
			if (i === fromIndex) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		const [xe, ye] = pathScreen(geo, toIndex, kind);
		ctx.lineTo(xe, ye);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.restore();
	}

	function drawWavePath(o: WaveOptions): void {
		if (o.alpha <= 0) return;
		const l = layout();
		const upGeo =
			o.ownTextBlend === undefined
				? undefined
				: blendGeometry(l.pathGeoUpOwnText, l.pathGeoUp, o.ownTextBlend);
		const geo = geoMix(o.mix, o.lift, upGeo);
		const base = ctx.globalAlpha;
		ctx.globalAlpha = o.alpha;
		const endIndex = yearIndex(o.year);
		const waveIndex = o.waveYear === undefined ? endIndex : yearIndex(o.waveYear);
		const lastIndex = PATH.year.length - 1;
		if (o.straight > 0) {
			ctx.globalAlpha = o.alpha * o.straight;
			strokePath(geo, 'bary', 0, lastIndex, {
				color: 'rgba(200,210,235,0.75)',
				width: 1.2,
				dash: [5, 6]
			});
			const [lx, ly] = pathScreen(geo, lastIndex * 0.3, 'bary');
			label(
				'곧은 길',
				lx - 10,
				ly + 6,
				'right',
				o.straight * (o.straightLabel === undefined ? 1 : o.straightLabel),
				'rgba(200,210,235,0.9)'
			);
		}
		if (o.bPath > 0) {
			ctx.globalAlpha = o.alpha * o.bPath;
			strokePath(geo, 'B', 0, endIndex, {
				color: 'rgba(196,214,255,0.7)',
				width: 1.2,
				dash: [2, 4]
			});
			const [bx, by] = pathScreen(geo, endIndex, 'B');
			drawLightPoint(bx, by, 1.3 * UI, B_RGB, 0.9, 0.7);
			const bRight = bx < l.centerX + 0.1 * l.frame.width;
			label(
				'시리우스 B',
				bRight ? bx + 12 : bx - 12,
				by,
				bRight ? 'left' : 'right',
				o.bPath,
				'rgba(196,214,255,0.95)'
			);
		}
		if (o.wave > 0) {
			ctx.globalAlpha = o.alpha * o.wave;
			strokePath(geo, 'A', 0, waveIndex, { color: 'rgba(235,242,255,0.95)', width: 1.7 });
		}
		if (o.cursor > 0) {
			const [cx, cy] = pathScreen(geo, waveIndex, 'A');
			ctx.globalAlpha = o.alpha * o.cursor;
			ctx.strokeStyle = ACCENT;
			ctx.lineWidth = 1.4 * UI;
			ctx.beginPath();
			ctx.arc(cx, cy, 6 * UI, 0, TAU);
			ctx.stroke();
		}
		if (o.dots > 0) {
			ctx.globalAlpha = o.alpha * o.dots;
			ctx.fillStyle = ACCENT;
			for (let year = PATH_START_YEAR; year <= Math.min(o.year, BESSEL_YEAR); year += 1) {
				const appear = clamp((o.year - year) / 1.5, 0, 1);
				const [x, y] = pathScreen(geo, yearIndex(year), 'A');
				ctx.globalAlpha = o.alpha * o.dots * appear;
				ctx.beginPath();
				ctx.arc(x, y, 1.9 * UI, 0, TAU);
				ctx.fill();
			}
		}
		ctx.globalAlpha = o.alpha;
		if (o.head > 0) {
			let [hx, hy] = pathScreen(geo, endIndex, 'A');
			if (o.headFromSirius === true && o.headBlend !== undefined) {
				const sirius = targetPoint('sirius');
				const from = applyT(currentSky, sirius[0], sirius[1]);
				hx = lerp(from[0], hx, o.headBlend);
				hy = lerp(from[1], hy, o.headBlend);
			}
			ctx.globalAlpha = o.alpha * o.head;
			drawLightPoint(hx, hy, 2.4 * UI, SIRIUS_RGB, 1.2);
			if (o.yearLabel > 0) tag(`${Math.floor(o.year)}년`, hx + 16, hy + 2, 'left', o.yearLabel);
		}
		if (o.ghost > 0) {
			const [gx, gy] = pathScreen(geo, yearIndex(BESSEL_YEAR), 'B');
			ctx.globalAlpha = o.alpha * o.ghost;
			ctx.strokeStyle = 'rgba(196,214,255,0.9)';
			ctx.lineWidth = 1.2;
			ctx.setLineDash([3, 4]);
			ctx.beginPath();
			ctx.arc(gx, gy, 11 * UI, 0, TAU);
			ctx.stroke();
			ctx.setLineDash([]);
			label(
				'보이지 않는 짝',
				clamp(gx, 50, W - 50),
				gy - 24,
				'center',
				o.ghost,
				'rgba(196,214,255,0.95)'
			);
		}
		ctx.globalAlpha = o.alpha;
		// 말풍선은 2-2 띠로 옮겼다(chartDeviation). 띠가 있으면 표기는 띠 바로 위로
		if (o.tag > 0) {
			tag(
				`흔들림을 ${WOBBLE_SCALE_SIRIUS}배 키워 그림 · 실제 궤도값으로 계산`,
				l.centerX,
				lerp(H - 22, l.bandTop - PATH_ABOVE_BAND_GAP / 2, o.lift),
				'center',
				o.tag
			);
		}
		ctx.globalAlpha = base;
	}

	// ---------- 3장: 천왕성 어긋남(설명 그림) · 갈레의 성도 ----------
	function uranusPoint(cx: number, cy: number, R: number, theta: number, actual: boolean): Point {
		const sx = cx + URANUS.sunU * R;
		const sy = cy + URANUS.sunV * R;
		const extra = actual
			? URANUS.push * Math.max(0, 1 - Math.abs(theta - URANUS.pull) / URANUS.pullWidth)
			: 0;
		const radius = (URANUS.radius + extra) * R;
		return [sx + Math.cos(theta) * radius, sy - Math.sin(theta) * radius];
	}
	function predictedSpot(cx: number, cy: number, R: number): Point {
		const sx = cx + URANUS.sunU * R;
		const sy = cy + URANUS.sunV * R;
		return [
			sx + Math.cos(URANUS.pull) * URANUS.radius * URANUS.predictedRadius * R,
			sy - Math.sin(URANUS.pull) * URANUS.radius * URANUS.predictedRadius * R
		];
	}
	function drawUranusDiagram(cx: number, cy: number, R: number, o: UranusOptions): void {
		const sx = cx + URANUS.sunU * R;
		const sy = cy + URANUS.sunV * R;
		drawLightPoint(sx, sy, R * 0.03, [255, 214, 140], 1, 0.9);
		label('태양', sx, sy + 18, 'center', 1, 'rgba(255,224,170,0.95)');
		const strokeArc = (
			actual: boolean,
			upTo: number,
			style: { color: string; width: number; dash?: number[] }
		): void => {
			ctx.strokeStyle = style.color;
			ctx.lineWidth = style.width;
			ctx.setLineDash(style.dash === undefined ? [] : style.dash);
			ctx.beginPath();
			const steps = 120;
			for (let i = 0; i <= steps; i++) {
				const theta = lerp(URANUS.from, upTo, i / steps);
				const [x, y] = uranusPoint(cx, cy, R, theta, actual);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();
			ctx.setLineDash([]);
		};
		ctx.globalAlpha = o.expected;
		strokeArc(false, URANUS.to, { color: 'rgba(200,210,235,0.8)', width: 1.2, dash: [3, 5] });
		const [ex, ey] = uranusPoint(cx, cy, R, 0.3, false);
		label('예상한 길', ex - 12, ey + 4, 'right', o.expected, 'rgba(200,210,235,0.95)');
		ctx.globalAlpha = 1;
		const theta = lerp(URANUS.from, URANUS.to, o.travel);
		strokeArc(true, theta, { color: 'rgba(170,236,224,0.95)', width: 1.6 });
		const [ux, uy] = uranusPoint(cx, cy, R, theta, true);
		drawLightPoint(ux, uy, R * 0.022, [196, 236, 228], 1, 0.7);
		label('천왕성', ux, uy + 16, 'center', 1, 'rgba(196,236,228,0.95)');
		const [ax, ay] = uranusPoint(cx, cy, R, URANUS.pull, true);
		label('실제 길', ax + 8, ay - 10, 'left', o.actualLabel, 'rgba(170,236,224,0.95)');
		if (o.spot > 0) {
			const [px, py] = predictedSpot(cx, cy, R);
			ctx.globalAlpha = o.spot;
			ctx.strokeStyle = ACCENT;
			ctx.lineWidth = 1.3;
			ctx.setLineDash([3, 3]);
			ctx.beginPath();
			ctx.arc(px, py, 12, 0, TAU);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.globalAlpha = 1;
			label('계산한 자리', px, py - 22, 'center', o.spot, ACCENT);
		}
		tag('설명 그림', cx, cy + R * 0.86, 'center', o.expected);
	}

	function closeGalle(o: GalleOptions, cx: number, cy: number, R: number): void {
		if (o.diagram > 0) {
			ctx.globalAlpha = o.diagram;
			drawUranusDiagram(cx, cy, R, { expected: 1, travel: 1, actualLabel: 0, spot: 1 });
			ctx.globalAlpha = 1;
		}
		const [px, py] = predictedSpot(cx, cy, R);
		if (o.sky > 0) {
			ctx.globalAlpha = o.sky;
			for (const item of GALLE_STARS) {
				drawLightPoint(
					cx + item.u * R,
					cy + item.v * R,
					0.7 + item.b * 0.6,
					[230, 236, 255],
					item.b,
					0.6
				);
			}
			ctx.globalAlpha = 1;
		}
		if (o.map > 0) {
			// 손그림 성도: 옅은 종이빛 격자 + 별 자리 동그라미(다레스트의 지도)
			ctx.globalAlpha = o.map * 0.85;
			ctx.strokeStyle = 'rgba(222,196,146,0.42)';
			ctx.lineWidth = 1;
			const step = R / 3;
			ctx.beginPath();
			for (let g = -3; g <= 3; g++) {
				ctx.moveTo(cx - R, cy + g * step + Math.sin(g) * 2);
				ctx.lineTo(cx + R, cy + g * step - Math.sin(g) * 2);
				ctx.moveTo(cx + g * step + Math.cos(g) * 2, cy - R);
				ctx.lineTo(cx + g * step - Math.cos(g) * 2, cy + R);
			}
			ctx.stroke();
			ctx.strokeStyle = 'rgba(232,206,150,0.9)';
			ctx.lineWidth = 1.1;
			GALLE_STARS.forEach((item, i) => {
				const drawn = clamp(o.mapDraw * GALLE_STARS.length - i, 0, 1);
				if (drawn <= 0) return;
				const x = cx + item.u * R + (item.wobble - 0.5) * 1.5;
				const y = cy + item.v * R;
				ctx.beginPath();
				ctx.arc(x, y, 3 + item.b * 2.5, 0, TAU * drawn);
				ctx.stroke();
			});
			ctx.globalAlpha = 1;
			tag('성도', cx - R * 0.62, cy - R * 0.62, 'center', o.map);
		}
		const nx = px + NEPTUNE_OFFSET.u * R;
		const ny = py + NEPTUNE_OFFSET.v * R;
		if (o.sky > 0 && o.zoom < 1) {
			const x = lerp(nx, cx, smooth(o.zoom));
			const y = lerp(ny, cy, smooth(o.zoom));
			const blue = o.light;
			ctx.globalAlpha = o.sky * (1 - smooth(linear(o.zoom, 0.6, 1)));
			drawLightPoint(x, y, 0.9 + 1.2 * blue + o.zoom * 6, [150, 190, 255], 0.75 + 0.5 * blue, 0.8);
			ctx.globalAlpha = 1;
			if (o.light > 0 && o.zoom <= 0) {
				ctx.globalAlpha = o.light * (0.6 + 0.4 * Math.cos(o.pulse * TAU * 2));
				ctx.strokeStyle = ACCENT;
				ctx.lineWidth = 1.3;
				ctx.beginPath();
				ctx.arc(nx, ny, 9 + 4 * o.light, 0, TAU);
				ctx.stroke();
				ctx.globalAlpha = 1;
			}
		}
		if (o.zoom > 0) {
			// 푸른 원판으로 확대
			const radius = lerp(4, R * 0.42, smooth(o.zoom));
			const x = lerp(nx, cx, smooth(o.zoom));
			const y = lerp(ny, cy, smooth(o.zoom));
			ctx.globalAlpha = smooth(linear(o.zoom, 0.2, 0.7));
			const disc = ctx.createRadialGradient(
				x - radius * 0.3,
				y - radius * 0.3,
				radius * 0.1,
				x,
				y,
				radius
			);
			disc.addColorStop(0, '#9cc4ff');
			disc.addColorStop(0.55, '#4a78d8');
			disc.addColorStop(1, '#1c2f72');
			ctx.fillStyle = disc;
			ctx.beginPath();
			ctx.arc(x, y, radius, 0, TAU);
			ctx.fill();
			ctx.strokeStyle = 'rgba(160,200,255,0.25)';
			ctx.lineWidth = Math.max(1, radius * 0.04);
			ctx.beginPath();
			ctx.arc(x, y, radius * 1.05, 0, TAU);
			ctx.stroke();
			ctx.globalAlpha = 1;
			label(
				'해왕성',
				x,
				y + radius + 16,
				'center',
				smooth(linear(o.zoom, 0.6, 1)),
				'rgba(170,205,255,0.95)'
			);
		}
	}

	// ---------- 4장: 렌즈 · 클라크의 밤 ----------
	function drawLens(alpha: number, glassAlpha: number): void {
		if (alpha <= 0) return;
		const { x, y, r: R } = layout().scope;
		ctx.save();
		// 렌즈 바깥은 어둡게(실루엣)
		ctx.fillStyle = `rgba(2,3,8,${0.6 * glassAlpha})`;
		ctx.beginPath();
		ctx.rect(0, 0, W, H);
		ctx.arc(x, y, R, 0, TAU);
		ctx.fill('evenodd');
		ctx.globalAlpha = alpha;
		// 유리 반사광만: 굽은 하이라이트 두 줄 + 가장자리 옅은 빛
		const edge = ctx.createRadialGradient(x, y, R * 0.86, x, y, R);
		edge.addColorStop(0, 'rgba(200,220,255,0)');
		edge.addColorStop(1, 'rgba(200,220,255,0.16)');
		ctx.fillStyle = edge;
		ctx.beginPath();
		ctx.arc(x, y, R, 0, TAU);
		ctx.fill();
		ctx.lineCap = 'round';
		ctx.strokeStyle = 'rgba(235,242,255,0.38)';
		ctx.lineWidth = 5;
		ctx.beginPath();
		ctx.arc(x, y, R * 0.8, Math.PI * 1.08, Math.PI * 1.42);
		ctx.stroke();
		ctx.strokeStyle = 'rgba(235,242,255,0.22)';
		ctx.lineWidth = 2.5;
		ctx.beginPath();
		ctx.arc(x, y, R * 0.68, Math.PI * 1.12, Math.PI * 1.3);
		ctx.stroke();
		ctx.strokeStyle = 'rgba(235,242,255,0.16)';
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.arc(x, y, R * 0.84, Math.PI * 0.1, Math.PI * 0.26);
		ctx.stroke();
		ctx.strokeStyle = 'rgba(214,196,150,0.55)';
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		ctx.arc(x, y, R, 0, TAU);
		ctx.stroke();
		ctx.lineCap = 'butt';
		ctx.restore();
	}

	// 4장 궤도: 질량 중심을 시야 중심에 두고, A 는 −(M_B/M)·상대 궤도, B 는 (M_A/M)·상대 궤도
	function orbitPosition(
		index: number,
		cx: number,
		cy: number,
		R: number,
		anchor?: number
	): { a: Point; b: Point } {
		const i0 = clamp(Math.floor(index), 0, ORBIT.year.length - 1);
		const i1 = Math.min(i0 + 1, ORBIT.year.length - 1);
		const f = index - i0;
		const e = lerp(ORBIT.east[i0], ORBIT.east[i1], f);
		const n = lerp(ORBIT.north[i0], ORBIT.north[i1], f);
		const scale = (R * ORBIT_SCALE_FILL) / ORBIT_EXTENT;
		// anchor 0: 1862 년 A 를 시야 중심에(망원경이 A 를 겨눔) · 1: 질량 중심을 시야 중심에
		const shift = 1 - (anchor === undefined ? 1 : anchor);
		const ox = -MASS_FRACTION_B * ORBIT.east[0] * scale * shift;
		const oy = -MASS_FRACTION_B * ORBIT.north[0] * scale * shift;
		const a: Point = [cx + ox + MASS_FRACTION_B * e * scale, cy + oy + MASS_FRACTION_B * n * scale];
		const b: Point = [
			cx + ox - (1 - MASS_FRACTION_B) * e * scale,
			cy + oy - (1 - MASS_FRACTION_B) * n * scale
		];
		return { a, b };
	}
	function strokeOrbit(
		cx: number,
		cy: number,
		R: number,
		upTo: number,
		which: 'a' | 'b',
		style: { color: string; width: number }
	): void {
		ctx.strokeStyle = style.color;
		ctx.lineWidth = style.width;
		ctx.setLineDash([]);
		ctx.beginPath();
		for (let i = 0; i <= upTo; i++) {
			const point = orbitPosition(i, cx, cy, R)[which];
			if (i === 0) ctx.moveTo(point[0], point[1]);
			else ctx.lineTo(point[0], point[1]);
		}
		const end = orbitPosition(upTo, cx, cy, R)[which];
		ctx.lineTo(end[0], end[1]);
		ctx.stroke();
		ctx.setLineDash([]);
	}
	// 4장 이름표 자리: 별에서 짧게 떨어진 8방향 후보 중 궤도 선 · 다른 별 · 다른 이름표 · 아래 표기와 겹치지 않고
	// 원형 시야 안에 드는 곳을 고른다(질량 중심에서 바깥쪽 방향을 먼저). 위치만으로 정하므로 되감아도 같은 자리
	type LabelRect = Rect & { text: string; align: CanvasTextAlign; x: number; y: number };
	type Placed = { score: number; rect: LabelRect; dirX: number; dirY: number };
	function labelRect(
		text: string,
		anchorX: number,
		anchorY: number,
		dirX: number,
		dirY: number
	): LabelRect {
		ctx.font = LABEL_FONT;
		const width = ctx.measureText(text).width;
		const height = 14 * UI;
		const align: CanvasTextAlign = dirX > 0.35 ? 'left' : dirX < -0.35 ? 'right' : 'center';
		const y = align === 'center' ? anchorY + Math.sign(dirY || 1) * height * 0.5 : anchorY;
		const left =
			align === 'left' ? anchorX : align === 'right' ? anchorX - width : anchorX - width / 2;
		return {
			text,
			align,
			x: anchorX,
			y,
			left,
			right: left + width,
			top: y - height / 2,
			bottom: y + height / 2
		};
	}
	function placeLabel(
		text: string,
		starPoint: Point,
		center: Point,
		obstacles: Point[],
		avoidRects: Rect[],
		cx: number,
		cy: number,
		R: number
	): Placed {
		const away = Math.hypot(starPoint[0] - center[0], starPoint[1] - center[1]) > 1;
		const base = away ? Math.atan2(starPoint[1] - center[1], starPoint[0] - center[0]) : 0;
		const gap = 15 * UI;
		const pad = 3;
		let best: Placed | null = null;
		for (const [order, step] of LABEL_DIRECTIONS.entries()) {
			const angle = base + (step * Math.PI) / 4;
			const dirX = Math.cos(angle);
			const dirY = Math.sin(angle);
			const rect = labelRect(
				text,
				starPoint[0] + dirX * gap,
				starPoint[1] + dirY * gap,
				dirX,
				dirY
			);
			let score = order * 0.5;
			for (const [x, y] of obstacles) {
				if (
					x > rect.left - pad &&
					x < rect.right + pad &&
					y > rect.top - pad &&
					y < rect.bottom + pad
				)
					score += 4;
			}
			for (const other of avoidRects) if (rectsOverlap(rect, other)) score += 1000;
			const corners: Point[] = [
				[rect.left, rect.top],
				[rect.right, rect.top],
				[rect.left, rect.bottom],
				[rect.right, rect.bottom]
			];
			if (corners.some(([x, y]) => Math.hypot(x - cx, y - cy) > R - 6)) score += 1000;
			if (best === null || score < best.score) best = { score, rect, dirX, dirY };
		}
		if (best === null) throw new Error('no label direction');
		return best;
	}
	// 두 별 위치와 이름표 자리(closeClark 와 4-3 드러남 덧그림이 같은 값을 쓴다)
	function clarkLayout(
		o: ClarkOptions,
		cx: number,
		cy: number,
		R: number
	): { index: number; a: Point; b: Point; aLabel: Placed; bLabel: Placed } {
		const index = o.trace * (ORBIT.year.length - 1);
		const { a, b } = orbitPosition(index, cx, cy, R, o.anchor);
		const center: Point = [
			(1 - MASS_FRACTION_B) * a[0] + MASS_FRACTION_B * b[0],
			(1 - MASS_FRACTION_B) * a[1] + MASS_FRACTION_B * b[1]
		];
		const obstacles: Point[] = [];
		for (let i = 0; i < ORBIT.year.length; i += 2) {
			const point = orbitPosition(i, cx, cy, R, o.anchor);
			obstacles.push(point.a, point.b);
		}
		const heavy = (point: Point): void => {
			for (let k = 0; k < 6; k++) obstacles.push(point);
		};
		heavy(a);
		heavy(b);
		heavy(center);
		ctx.font = fontPx(12);
		const tagWidth = ctx.measureText('실제 궤도값으로 그림').width;
		const tagRect: Rect = {
			left: cx - tagWidth / 2,
			right: cx + tagWidth / 2,
			top: cy + R * 0.88 - 8 * UI,
			bottom: cy + R * 0.88 + 8 * UI
		};
		const aLabel = placeLabel('시리우스 A', a, center, obstacles, [tagRect], cx, cy, R);
		const bLabel = placeLabel(
			'시리우스 B',
			b,
			center,
			obstacles,
			[tagRect, aLabel.rect],
			cx,
			cy,
			R
		);
		return { index, a, b, aLabel, bLabel };
	}
	// 이름표 + 별에서 이름표 쪽으로 짧은 지시선
	function drawPlacedLabel(starPoint: Point, placed: Placed, alpha: number, color: string): void {
		if (alpha <= 0) return;
		const base = ctx.globalAlpha;
		ctx.globalAlpha = base * alpha * 0.6;
		ctx.strokeStyle = color;
		ctx.lineWidth = UI;
		ctx.beginPath();
		ctx.moveTo(starPoint[0] + placed.dirX * 5 * UI, starPoint[1] + placed.dirY * 5 * UI);
		ctx.lineTo(starPoint[0] + placed.dirX * 12 * UI, starPoint[1] + placed.dirY * 12 * UI);
		ctx.stroke();
		ctx.globalAlpha = base;
		label(placed.rect.text, placed.rect.x, placed.rect.y, placed.rect.align, alpha, color);
	}
	function closeClark(o: ClarkOptions, cx: number, cy: number, R: number): void {
		const { index, a, b, aLabel, bLabel } = clarkLayout(o, cx, cy, R);
		// 문구 대조로 50년 궤도가 숨김 대상이면 궤도 선 · 표기만 그리지 않는다(별 자리 · 이름표는 그대로)
		if (o.trace > 0 && !hidden.orbit) {
			strokeOrbit(cx, cy, R, index, 'b', { color: 'rgba(196,214,255,0.75)', width: 1.3 });
			strokeOrbit(cx, cy, R, index, 'a', { color: 'rgba(235,242,255,0.8)', width: 1.3 });
			ctx.fillStyle = 'rgba(255,207,122,0.9)';
			ctx.beginPath();
			ctx.arc(cx, cy, 2, 0, TAU);
			ctx.fill();
		}
		if (o.bShow > 0) {
			const boost = o.bBoost;
			if (boost > 0) {
				// 연출: A 의 번짐을 B 둘레에서만 걷어 내 대비를 만든다
				const clearing = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], 16 * UI);
				clearing.addColorStop(0, `rgba(3,5,12,${0.6 * boost})`);
				clearing.addColorStop(1, 'rgba(3,5,12,0)');
				ctx.fillStyle = clearing;
				ctx.beginPath();
				ctx.arc(b[0], b[1], 16 * UI, 0, TAU);
				ctx.fill();
			}
			ctx.globalAlpha = o.bShow;
			drawLightPoint(
				b[0],
				b[1],
				(1.2 + 0.5 * boost) * UI,
				B_RGB,
				0.95 + 0.4 * boost,
				0.7 - 0.3 * boost
			);
			ctx.globalAlpha = 1;
			if (o.bMark > 0) {
				ctx.globalAlpha = o.bMark;
				ctx.strokeStyle = ACCENT;
				ctx.lineWidth = 1.2 * UI;
				ctx.beginPath();
				ctx.arc(b[0], b[1], 9 * UI, 0, TAU);
				ctx.stroke();
				ctx.globalAlpha = 1;
			}
		}
		drawLightPoint(a[0], a[1], (3.4 + 4 * o.aGlow) * UI, SIRIUS_RGB, 1.25, 1 + 1.6 * o.aGlow);
		drawPlacedLabel(a, aLabel, o.labels, A_LABEL_COLOR);
		drawPlacedLabel(b, bLabel, o.labels * o.bShow, B_LABEL_COLOR);
		if (!hidden.orbit) {
			tag('실제 궤도값으로 그림', cx, cy + R * 0.88, 'center', o.labels * smooth(o.trace * 3));
		}
	}
	// 4-3 B 드러남: 빛이 걷히는 동안(하얀 빛 위에) 짧은 십자 반짝임 · 한 번 퍼지는 고리 · 이름표. 모두 진행 값 p 로만 정한다(시간 누적 없음)
	function drawBReveal(o: ClarkOptions, p: number): void {
		const sparkle = phase(p, 0.35, 0.39) * (1 - phase(p, 0.44, 0.52));
		const ringK = linear(p, 0.36, 0.5);
		const ringAlpha = phase(p, 0.36, 0.38) * (1 - ringK);
		const core = phase(p, 0.35, 0.4) * (1 - phase(p, 0.5, 0.58));
		// 이름표: 하얀 빛(drawGlare) 다음에 그리고, 빛이 아직 남은 p 0.38 에 다 보이게(예전 0.37~0.43 은 0.38 에서 0.07 — STEP 110 S7)
		const nameAlpha = phase(p, 0.36, 0.38) * (1 - o.labels);
		if (sparkle <= 0 && ringAlpha <= 0 && core <= 0 && nameAlpha <= 0) return;
		const { x: cx, y: cy, r: R } = layout().scope;
		const { b, bLabel } = clarkLayout(o, cx, cy, R);
		ctx.save();
		if (ringAlpha > 0) {
			ctx.globalAlpha = ringAlpha;
			ctx.strokeStyle = ACCENT;
			ctx.lineWidth = 1.5 * UI;
			ctx.beginPath();
			ctx.arc(b[0], b[1], lerp(5, 28, ringK) * UI, 0, TAU);
			ctx.stroke();
		}
		if (sparkle > 0) {
			const arm = (6 + 14 * sparkle) * UI;
			const diagonal = arm * 0.4;
			ctx.globalAlpha = sparkle;
			ctx.strokeStyle = 'rgba(70,96,170,0.95)';
			ctx.lineWidth = 1.6 * UI;
			ctx.lineCap = 'round';
			ctx.beginPath();
			ctx.moveTo(b[0] - arm, b[1]);
			ctx.lineTo(b[0] + arm, b[1]);
			ctx.moveTo(b[0], b[1] - arm);
			ctx.lineTo(b[0], b[1] + arm);
			ctx.moveTo(b[0] - diagonal, b[1] - diagonal);
			ctx.lineTo(b[0] + diagonal, b[1] + diagonal);
			ctx.moveTo(b[0] - diagonal, b[1] + diagonal);
			ctx.lineTo(b[0] + diagonal, b[1] - diagonal);
			ctx.stroke();
		}
		if (core > 0) {
			ctx.globalAlpha = core;
			ctx.fillStyle = 'rgba(40,60,130,0.9)';
			ctx.beginPath();
			ctx.arc(b[0], b[1], 3.2 * UI, 0, TAU);
			ctx.fill();
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.arc(b[0], b[1], 1.8 * UI, 0, TAU);
			ctx.fill();
		}
		ctx.restore();
		drawPlacedLabel(b, bLabel, nameAlpha, B_LABEL_COLOR);
	}
	// 화면을 하얗게 덮는 시리우스의 빛
	function drawGlare(amount: number): void {
		if (amount <= 0) return;
		const { x, y } = layout().scope;
		ctx.save();
		ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
		const radius = Math.hypot(W, H);
		const grad = ctx.createRadialGradient(x, y, 0, x, y, radius * lerp(0.3, 1.1, amount));
		grad.addColorStop(0, `rgba(255,255,255,${Math.min(1, amount * 1.4)})`);
		grad.addColorStop(0.35, `rgba(236,243,255,${amount * 0.97})`);
		grad.addColorStop(1, `rgba(214,226,255,${amount * 0.85})`);
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, W, H);
		ctx.restore();
	}

	// ---------- 5장: 시리우스 B ----------
	function closeB5(hot: number, cx: number, cy: number, R: number): void {
		// 오른쪽 위 시야 밖의 A 빛이 가장자리로 번져 든다
		const glow = ctx.createRadialGradient(
			cx + R * 1.05,
			cy - R * 0.95,
			0,
			cx + R * 1.05,
			cy - R * 0.95,
			R * 0.9
		);
		glow.addColorStop(0, 'rgba(225,235,255,0.55)');
		glow.addColorStop(1, 'rgba(225,235,255,0)');
		ctx.fillStyle = glow;
		ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
		const rgb: Rgb = [
			Math.round(lerp(255, 214, hot)),
			Math.round(lerp(120, 228, hot)),
			Math.round(lerp(96, 255, hot))
		];
		drawLightPoint(cx, cy, R * 0.035, rgb, lerp(0.75, 1.15, hot), 1.1);
		label('시리우스 B', cx, cy + R * 0.2, 'center', 1, 'rgba(225,234,255,0.92)');
	}
	// 띠: 갈라진 빛(무지개) 위에 예상(붉은 쪽이 밝음) · 실제(푸른 쪽이 밝음) 밝기 모양. 설명 그림
	function chartSpectrum(o: Extract<Chart, { kind: 'spectrum' }>): void {
		const p = layout().plot;
		axisWords('밝기 →', null);
		bandTag('설명 그림');
		const stripTop = p.bottom - 26;
		const stripBottom = p.bottom - 6;
		const grad = ctx.createLinearGradient(p.left, 0, p.right, 0);
		SPECTRUM_STOPS.forEach((color, i) => grad.addColorStop(i / (SPECTRUM_STOPS.length - 1), color));
		ctx.globalAlpha = o.strip;
		ctx.fillStyle = grad;
		ctx.fillRect(p.left, stripTop, (p.right - p.left) * o.strip, stripBottom - stripTop);
		ctx.globalAlpha = 1;
		ctx.font = SMALL_FONT;
		ctx.fillStyle = DIM_COLOR;
		ctx.textBaseline = 'bottom';
		ctx.textAlign = 'left';
		ctx.fillText('파랑', p.left, H - 8);
		ctx.textAlign = 'right';
		ctx.fillText('빨강', p.right, H - 8);
		const mapX = mapLinear(0, 1, p.left, p.right);
		const mapY = mapLinear(0, 1, stripTop - 8, p.top + 12);
		if (o.expected > 0) {
			ctx.globalAlpha = o.expected;
			strokeFunction(EXPECTED_SHAPE, 0, o.expectedDraw, mapX, mapY, {
				color: 'rgba(255,140,120,0.9)',
				dash: [4, 4]
			});
			label('예상', mapX(0.88), mapY(1) - 10, 'center', o.expected, 'rgba(255,160,140,0.95)');
			ctx.globalAlpha = 1;
		}
		if (o.actual > 0) {
			ctx.globalAlpha = o.actual;
			strokeFunction(ACTUAL_SHAPE, 0, o.actualDraw, mapX, mapY, {
				color: CURVE_COLOR,
				width: 1.8
			});
			label('실제', mapX(0.08) + 18, mapY(1) - 10, 'left', o.actual);
			ctx.globalAlpha = 1;
		}
	}

	function drawCompression(alpha: number, squeeze: number): void {
		if (alpha <= 0) return;
		const l = layout();
		const k = smooth(squeeze);
		// 넓은 화면: 가운데 틀(최대 FRAME_MAX_WIDTH) 안에 두고 크기는 UI 배율까지만 키운다
		const startPx = Math.min(l.frame.width * 0.3, 120) * UI;
		const endPx = 46 * UI;
		const bodyKm = logLerp(RADIUS_KM.sun, RADIUS_KM.siriusB, k);
		const bodyPx = lerp(startPx, (endPx * RADIUS_KM.siriusB) / RADIUS_KM.earth, k);
		const pxPerKm = bodyPx / bodyKm;
		const cy = (l.zone.top + l.zone.bottom) / 2 - 20;
		const bx = l.frame.left + l.frame.width * 0.34;
		const ex = l.frame.left + l.frame.width * 0.8;
		const base = ctx.globalAlpha;
		ctx.globalAlpha = alpha;
		// 처음 태양 크기를 같은 축척으로 남긴 점선(눌릴수록 화면 밖으로 커진다)
		const ghost = RADIUS_KM.sun * pxPerKm;
		ctx.strokeStyle = 'rgba(255,214,140,0.5)';
		ctx.lineWidth = 1.2;
		ctx.setLineDash([4, 5]);
		ctx.beginPath();
		ctx.arc(bx, cy, ghost, 0, TAU);
		ctx.stroke();
		ctx.setLineDash([]);
		const hot = k;
		const inner = `rgb(255,${Math.round(lerp(236, 250, hot))},${Math.round(lerp(170, 255, hot))})`;
		const outer = `rgb(${Math.round(lerp(255, 170, hot))},${Math.round(lerp(170, 200, hot))},${Math.round(lerp(60, 255, hot))})`;
		const glowR = bodyPx * lerp(1.25, 2.4, hot);
		const glow = ctx.createRadialGradient(bx, cy, bodyPx * 0.9, bx, cy, glowR);
		glow.addColorStop(0, `rgba(255,240,220,${lerp(0.35, 0.5, hot)})`);
		glow.addColorStop(1, 'rgba(255,240,220,0)');
		ctx.fillStyle = glow;
		ctx.beginPath();
		ctx.arc(bx, cy, glowR, 0, TAU);
		ctx.fill();
		const disc = ctx.createRadialGradient(
			bx - bodyPx * 0.25,
			cy - bodyPx * 0.25,
			bodyPx * 0.1,
			bx,
			cy,
			bodyPx
		);
		disc.addColorStop(0, inner);
		disc.addColorStop(1, outer);
		ctx.fillStyle = disc;
		ctx.beginPath();
		ctx.arc(bx, cy, bodyPx, 0, TAU);
		ctx.fill();
		label(k < 0.5 ? '태양' : '시리우스 B', bx, cy + Math.max(bodyPx, 10) + 16, 'center', 1);
		// 지구(같은 축척)
		const earthPx = Math.max(1.6, RADIUS_KM.earth * pxPerKm);
		const earth = ctx.createRadialGradient(
			ex - earthPx * 0.3,
			cy - earthPx * 0.3,
			earthPx * 0.1,
			ex,
			cy,
			earthPx
		);
		earth.addColorStop(0, '#9fd0ff');
		earth.addColorStop(0.6, '#3c7fd6');
		earth.addColorStop(1, '#173a78');
		ctx.fillStyle = earth;
		ctx.beginPath();
		ctx.arc(ex, cy, earthPx, 0, TAU);
		ctx.fill();
		label('지구', ex, cy + Math.max(earthPx, 8) + 16, 'center', 1, 'rgba(170,205,255,0.95)');
		tag('실제 비율', l.centerX, l.zone.bottom - 4, 'center', 1);
		ctx.globalAlpha = base;
	}

	// 5-3 성냥갑(STEP 111 P2): 입체 상자(윗면 · 앞면 · 옆면 음영)의 서랍이 열리고 → "1 t" 무게추가 위에서 내려오며 줄어 서랍 안으로 →
	// 서랍이 닫히고 → 상자 틈에서 하얀 빛이 샌다. 모두 진행 값(0~1)
	function drawWeight(x: number, bottom: number, scale: number): void {
		const bottomWidth = WEIGHT.bottom * scale;
		const topWidth = WEIGHT.top * scale;
		const height = WEIGHT.height * scale;
		const ring = WEIGHT.ring * scale;
		// 고리(몸통이 아래쪽을 덮는다)
		ctx.strokeStyle = '#5a6074';
		ctx.lineWidth = 3.2 * scale;
		ctx.beginPath();
		ctx.arc(x, bottom - height - ring * 0.75, ring, 0, TAU);
		ctx.stroke();
		// 사다리꼴 쇳덩이: 왼쪽 위 빛
		const iron = ctx.createLinearGradient(x - bottomWidth / 2, 0, x + bottomWidth / 2, 0);
		iron.addColorStop(0, '#5a6074');
		iron.addColorStop(0.45, '#33384a');
		iron.addColorStop(1, '#14161f');
		ctx.fillStyle = iron;
		ctx.strokeStyle = MATCHBOX_LINE;
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		ctx.moveTo(x - bottomWidth / 2, bottom);
		ctx.lineTo(x + bottomWidth / 2, bottom);
		ctx.lineTo(x + topWidth / 2, bottom - height);
		ctx.lineTo(x - topWidth / 2, bottom - height);
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
		// 줄어드는 동안에도 글자를 유지한다(무게추 크기에 비례)
		ctx.font = `700 ${height * 0.42}px ${FONT}`;
		ctx.fillStyle = 'rgba(235,233,228,0.95)';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('1 t', x, bottom - height * 0.45);
	}
	function drawMatchbox(o: MatchboxOptions): void {
		if (o.alpha <= 0) return;
		const l = layout();
		const m = clamp(l.frame.width / MOBILE_WIDTH, 1, MATCHBOX_SCALE_MAX);
		const length = MATCHBOX.length * m;
		const height = MATCHBOX.height * m;
		const depth = MATCHBOX.depth * m;
		const rim = MATCHBOX.rim * m;
		const ox = depth * MATCHBOX.slantX;
		const oy = -depth * MATCHBOX.slantY;
		const drawerMax = length * MATCHBOX.drawer;
		const slide = drawerMax * smooth(o.open) * (1 - smooth(o.close));
		const x0 = l.centerX - (length + ox + drawerMax) / 2;
		const y0 = (l.zone.top + l.zone.bottom) / 2 + MATCHBOX.lift * m;
		type Corner = [number, number, number];
		// 상자 좌표(u 길이 · v 안쪽 깊이 · h 윗면에서 아래로) → 화면(비스듬한 투영)
		const at = (u: number, v: number, h: number): Point => [
			x0 + u + (v / depth) * ox,
			y0 + h + (v / depth) * oy
		];
		const trace = (points: Corner[]): void => {
			ctx.beginPath();
			points.forEach((point, i) => {
				const [x, y] = at(...point);
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			});
			ctx.closePath();
		};
		const face = (points: Corner[], fill: string, stroke = true): void => {
			trace(points);
			ctx.fillStyle = fill;
			ctx.fill();
			if (stroke) ctx.stroke();
		};
		const base = ctx.globalAlpha;
		ctx.save();
		ctx.globalAlpha = base * o.alpha;
		ctx.strokeStyle = MATCHBOX_LINE;
		ctx.lineWidth = 1.2;
		ctx.lineJoin = 'round';
		// 바닥 그림자
		const [shadowX, shadowY] = at(length / 2, depth / 2, height);
		ctx.fillStyle = 'rgba(0,0,0,0.35)';
		ctx.beginPath();
		ctx.ellipse(shadowX, shadowY + 4 * m, length / 2 + ox / 2 + 10 * m, 10 * m, 0, 0, TAU);
		ctx.fill();
		// 겉상자: 빛은 왼쪽 위에서(윗면 밝게 · 앞면 중간 · 오른쪽 옆면 어둡게)
		face(
			[
				[0, 0, 0],
				[length, 0, 0],
				[length, 0, height],
				[0, 0, height]
			],
			'#161a2c'
		);
		face(
			[
				[0, 0, 0],
				[0, depth, 0],
				[length, depth, 0],
				[length, 0, 0]
			],
			'#262b44'
		);
		face(
			[
				[length, 0, 0],
				[length, depth, 0],
				[length, depth, height],
				[length, 0, height]
			],
			'#0b0e1a'
		);
		// 윗면 상표 띠 · 앞면 마찰 띠(성냥갑 표시)
		face(
			[
				[length * 0.1, depth * 0.3, 0],
				[length * 0.1, depth * 0.7, 0],
				[length * 0.9, depth * 0.7, 0],
				[length * 0.9, depth * 0.3, 0]
			],
			'rgba(160,80,60,0.55)',
			false
		);
		face(
			[
				[length * 0.06, 0, height * 0.38],
				[length * 0.94, 0, height * 0.38],
				[length * 0.94, 0, height * 0.62],
				[length * 0.06, 0, height * 0.62]
			],
			'rgba(90,60,52,0.6)',
			false
		);
		const open = slide > 0.5;
		if (open) {
			// 서랍 속(겉상자 밖으로 나온 부분만): 어두운 바닥 + 안쪽 뒷벽
			const inside: Corner[] = [
				[length, 0, rim],
				[length + slide, 0, rim],
				[length + slide, depth, rim],
				[length, depth, rim]
			];
			face(inside, '#05060d');
			ctx.save();
			trace(inside);
			ctx.clip();
			face(
				[
					[length, depth, rim],
					[length + slide, depth, rim],
					[length + slide, depth, rim - oy * 0.6],
					[length, depth, rim - oy * 0.6]
				],
				'#151a2c',
				false
			);
			ctx.restore();
		}
		if (o.drop > 0) {
			const k = smooth(o.drop);
			const scale = lerp(1, WEIGHT.endScale, k) * m;
			// 무게추는 서랍 깊이 가운데(v = depth / 2)에 선 판. 서랍이 닫히는 만큼 함께 겉상자 안으로 들어가므로
			// 그 깊이에서 겉상자 끝(u = length)보다 바깥인 화면 부분만 보이게 자른다
			const x = at(length + drawerMax / 2, depth / 2, 0)[0] - (drawerMax - slide);
			const start = l.zone.top + 4 + (WEIGHT.ring * 2.2 + WEIGHT.height) * m;
			const land = at(0, depth / 2, height - rim)[1];
			ctx.save();
			ctx.globalAlpha = base * o.alpha * phase(o.drop, 0, 0.12);
			if (o.close > 0) {
				const edgeX = at(length, depth / 2, 0)[0];
				ctx.beginPath();
				ctx.rect(edgeX, 0, W - edgeX, H);
				ctx.clip();
			}
			drawWeight(x, lerp(start, land, k), scale);
			ctx.restore();
			ctx.strokeStyle = MATCHBOX_LINE;
			ctx.lineWidth = 1.2;
		}
		if (open) {
			// 서랍 앞면 · 끝면(무게추 아래쪽을 가린다)
			face(
				[
					[length, 0, rim],
					[length + slide, 0, rim],
					[length + slide, 0, height],
					[length, 0, height]
				],
				'#2a2540'
			);
			face(
				[
					[length + slide, 0, rim],
					[length + slide, depth, rim],
					[length + slide, depth, height],
					[length + slide, 0, height]
				],
				'#15122a'
			);
		}
		if (o.light > 0) {
			// 닫힌 서랍과 겉상자 사이 틈(오른쪽 끝면 안쪽 테두리)에서 하얀 빛
			const seam = 2.5 * m;
			const [glowX, glowY] = at(length, depth / 2, height / 2);
			ctx.globalCompositeOperation = 'lighter';
			ctx.globalAlpha = base * o.alpha * o.light;
			const glow = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, 70 * m);
			glow.addColorStop(0, 'rgba(235,242,255,0.5)');
			glow.addColorStop(1, 'rgba(235,242,255,0)');
			ctx.fillStyle = glow;
			ctx.beginPath();
			ctx.arc(glowX, glowY, 70 * m, 0, TAU);
			ctx.fill();
			trace([
				[length, seam, seam],
				[length, depth - seam, seam],
				[length, depth - seam, height - seam],
				[length, seam, height - seam]
			]);
			ctx.strokeStyle = 'rgba(235,242,255,0.25)';
			ctx.lineWidth = 6 * m;
			ctx.stroke();
			ctx.strokeStyle = 'rgba(250,252,255,0.95)';
			ctx.lineWidth = 1.6 * m;
			ctx.stroke();
		}
		ctx.restore();
		ctx.globalAlpha = base;
	}

	// ---------- 6장: 51 페가시 ----------
	const pegVelocity = (day: number): number => Math.sin((TAU * day) / PEG.periodDays); // 원 궤도 근사: K·sin, 위상만 쓴다
	function closePeg(day: number, wobble: number, cx: number, cy: number, R: number): void {
		const radius = R * PEG_STAR_FILL;
		const velocity = pegVelocity(day);
		// 시선 방향(앞뒤)을 옆에서 본 그림: 왼쪽이 지구 쪽. 멀어질수록 오른쪽
		const position = -Math.cos((TAU * day) / PEG.periodDays);
		const shift = radius * PEG.wobbleOverRadius * WOBBLE_SCALE_PEG * position * wobble;
		const x = cx + shift;
		const y = cy;
		const tint = velocity * wobble;
		const glow = ctx.createRadialGradient(x, y, radius * 0.9, x, y, radius * 3);
		glow.addColorStop(0, 'rgba(255,226,160,0.4)');
		glow.addColorStop(1, 'rgba(255,226,160,0)');
		ctx.fillStyle = glow;
		ctx.beginPath();
		ctx.arc(x, y, radius * 3, 0, TAU);
		ctx.fill();
		const disc = ctx.createRadialGradient(
			x - radius * 0.2,
			y - radius * 0.2,
			radius * 0.1,
			x,
			y,
			radius
		);
		disc.addColorStop(0, '#fffbe8');
		disc.addColorStop(0.7, '#ffd986');
		disc.addColorStop(1, '#f0a64a');
		ctx.fillStyle = disc;
		ctx.beginPath();
		ctx.arc(x, y, radius, 0, TAU);
		ctx.fill();
		if (Math.abs(tint) > 0.01) {
			ctx.globalAlpha = Math.abs(tint) * 0.35;
			ctx.fillStyle = tint < 0 ? '#5f8dff' : '#ff5a4a';
			ctx.beginPath();
			ctx.arc(x, y, radius, 0, TAU);
			ctx.fill();
			ctx.globalAlpha = 1;
		}
		if (wobble > 0) {
			ctx.globalAlpha = wobble;
			ctx.strokeStyle = 'rgba(200,210,235,0.45)';
			ctx.lineWidth = 1;
			ctx.setLineDash([2, 4]);
			ctx.beginPath();
			ctx.moveTo(cx, cy - radius * 1.6);
			ctx.lineTo(cx, cy + radius * 1.6);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.globalAlpha = 1;
			label('← 지구 쪽', cx - R * 0.55, cy + R * 0.42, 'center', wobble, 'rgba(200,210,235,0.9)');
			tag(`흔들림을 ${WOBBLE_SCALE_PEG}배 키워 그림`, cx, cy + R * 0.7, 'center', wobble);
		}
	}
	function chartVelocity(o: { day: number; bubble: number }): void {
		const p = layout().plot;
		axisWords('속도', '시간 →');
		bandTag('실제 관측값으로 그림');
		const mapX = mapLinear(0, PEG_DAYS, p.left, p.right);
		const mid = (p.top + p.bottom) / 2;
		const amp = (p.bottom - p.top) * 0.36;
		const mapY = (v: number): number => mid - v * amp;
		ctx.strokeStyle = 'rgba(154,166,191,0.3)';
		ctx.lineWidth = 1;
		ctx.setLineDash([3, 4]);
		ctx.beginPath();
		ctx.moveTo(p.left, mid);
		ctx.lineTo(p.right, mid);
		ctx.stroke();
		ctx.setLineDash([]);
		ctx.font = fontPx(11.5);
		ctx.fillStyle = 'rgba(154,166,191,0.8)';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'middle';
		ctx.fillText('멀어짐', p.left + 4, p.top + 4);
		ctx.fillText('다가옴', p.left + 4, p.bottom - 4);
		strokeFunction(pegVelocity, 0, Math.min(o.day, PEG_DAYS), mapX, mapY, { width: 1.8 });
		cursorDot(mapX(Math.min(o.day, PEG_DAYS)), mapY(pegVelocity(o.day)));
		// 말풍선: 두 번째 '다가옴' 바닥을 가리킨다
		const trough = PEG.periodDays * 1.75;
		bubble('4일마다 다가왔다 멀어진다', mapX(trough), mapY(pegVelocity(trough)), {
			side: 'above',
			alpha: o.bubble,
			gap: 14
		});
	}
	// 같은 축척: 우리 태양계 목성 궤도 vs 51 페가시 b 궤도
	function drawOrbitCompare(o: Extract<Overlay, { kind: 'orbit-compare' }>): void {
		if (o.alpha <= 0) return;
		const l = layout();
		const cx = l.centerX;
		const cy = (l.zone.top + l.zone.bottom) / 2 - 10;
		const jupiterPx = Math.min(Math.min(W, H) * 0.42, (l.zone.bottom - l.zone.top) * 0.38);
		const pegPx = (jupiterPx * PEG.orbitAu) / JUPITER_AU;
		const base = ctx.globalAlpha;
		ctx.globalAlpha = o.alpha;
		ctx.strokeStyle = 'rgba(214,196,150,0.7)';
		ctx.lineWidth = 1.2;
		ctx.setLineDash([4, 5]);
		ctx.beginPath();
		ctx.arc(cx, cy, jupiterPx, -Math.PI / 2, -Math.PI / 2 + TAU * o.jupiter);
		ctx.stroke();
		ctx.setLineDash([]);
		const jAngle = -Math.PI / 2 + TAU * o.jupiter;
		ctx.fillStyle = '#d9b98c';
		ctx.beginPath();
		ctx.arc(cx + Math.cos(jAngle) * jupiterPx, cy + Math.sin(jAngle) * jupiterPx, 4, 0, TAU);
		ctx.fill();
		label(
			'목성 궤도',
			cx,
			cy - jupiterPx - 14,
			'center',
			o.jupiter > 0.05 ? 1 : 0,
			'rgba(230,210,170,0.95)'
		);
		drawLightPoint(cx, cy, 2.2, [255, 226, 160], 1, 0.8);
		if (o.peg > 0) {
			ctx.globalAlpha = o.alpha * o.peg;
			ctx.strokeStyle = 'rgba(255,207,122,0.95)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.arc(cx, cy, Math.max(pegPx, 1.2), 0, TAU);
			ctx.stroke();
			const angle = TAU * o.pegTurns;
			ctx.fillStyle = ACCENT;
			ctx.beginPath();
			ctx.arc(cx + Math.cos(angle) * pegPx, cy + Math.sin(angle) * pegPx, 1.4, 0, TAU);
			ctx.fill();
			ctx.strokeStyle = 'rgba(255,207,122,0.7)';
			ctx.beginPath();
			ctx.moveTo(cx + 6, cy + 6);
			ctx.lineTo(cx + 46, cy + 46);
			ctx.stroke();
			ctx.globalAlpha = o.alpha;
			label('51 페가시 b 궤도', cx + 50, cy + 52, 'left', o.peg, ACCENT);
		}
		tag('같은 축척', l.centerX, l.zone.bottom - 4, 'center', 1);
		ctx.globalAlpha = base;
	}

	// ---------- 7장: 안드로메다 회전 원반 ----------
	function galaxyPoint(cx: number, cy: number, size: number, radius: number, theta: number): Point {
		const lx = Math.cos(theta) * radius * size;
		const ly = Math.sin(theta) * radius * size * GALAXY_TILT;
		const c = Math.cos(GALAXY_ANGLE);
		const s = Math.sin(GALAXY_ANGLE);
		return [cx + lx * c - ly * s, cy + lx * s + ly * c];
	}
	function drawGalaxy(o: GalaxyOptions, center: Point, size: number): void {
		if (o.alpha <= 0) return;
		const [cx, cy] = center;
		const halo = o.halo === undefined ? 0 : o.halo;
		const markers = o.markers === undefined ? 0 : o.markers;
		const markerTime = o.markerTime === undefined ? 0 : o.markerTime;
		const base = ctx.globalAlpha;
		if (halo > 0) {
			// 보이지 않는 덩어리: 은하를 감싸는 아주 옅은 윤곽
			ctx.globalAlpha = halo;
			const haloR = size * 1.55;
			const grad = ctx.createRadialGradient(cx, cy, size * 0.3, cx, cy, haloR);
			grad.addColorStop(0, 'rgba(150,165,225,0.04)');
			grad.addColorStop(0.85, 'rgba(150,165,225,0.06)');
			grad.addColorStop(1, 'rgba(150,165,225,0)');
			ctx.fillStyle = grad;
			ctx.beginPath();
			ctx.ellipse(cx, cy, haloR, haloR * 0.86, GALAXY_ANGLE, 0, TAU);
			ctx.fill();
			ctx.strokeStyle = 'rgba(190,200,240,0.22)';
			ctx.lineWidth = 1;
			ctx.setLineDash([3, 6]);
			ctx.beginPath();
			ctx.ellipse(cx, cy, haloR * 0.93, haloR * 0.8, GALAXY_ANGLE, 0, TAU);
			ctx.stroke();
			ctx.setLineDash([]);
		}
		ctx.globalAlpha = base * o.alpha;
		// 원반의 옅은 빛(입자 아래 깔림)
		ctx.save();
		ctx.translate(cx, cy);
		ctx.rotate(GALAXY_ANGLE);
		ctx.scale(1, GALAXY_TILT);
		const disk = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
		disk.addColorStop(0, 'rgba(255,236,210,0.32)');
		disk.addColorStop(0.35, 'rgba(210,205,240,0.14)');
		disk.addColorStop(1, 'rgba(170,185,240,0)');
		ctx.fillStyle = disk;
		ctx.beginPath();
		ctx.arc(0, 0, size, 0, TAU);
		ctx.fill();
		ctx.restore();
		const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.32);
		core.addColorStop(0, 'rgba(255,240,210,0.8)');
		core.addColorStop(0.4, 'rgba(240,220,200,0.25)');
		core.addColorStop(1, 'rgba(200,200,240,0)');
		ctx.save();
		ctx.translate(cx, cy);
		ctx.rotate(GALAXY_ANGLE);
		ctx.scale(1, 0.55);
		ctx.fillStyle = core;
		ctx.beginPath();
		ctx.arc(0, 0, ((size * 0.32) / 0.55) * 0.55, 0, TAU);
		ctx.fill();
		ctx.restore();
		for (const item of GALAXY) {
			const theta = item.theta + (actualSpeed(item.radius) / item.radius) * o.time;
			const [x, y] = galaxyPoint(cx, cy, size, item.radius, theta);
			ctx.globalAlpha = base * o.alpha * item.alpha;
			ctx.fillStyle = item.warm > 0.3 ? '#ffe9c8' : item.radius > 0.6 ? '#b9c8ff' : '#e6e8ff';
			ctx.fillRect(x - item.size / 2, y - item.size / 2, item.size, item.size);
		}
		ctx.globalAlpha = base;
		if (markers > 0) {
			// 바깥 반지름의 두 점: 예상대로라면(느리게) vs 실제(빠르게). 같은 자리에서 출발
			const radius = 0.9;
			const start = 1.2;
			const expectedTheta = start + (expectedSpeed(radius) / radius) * markerTime;
			const actualTheta = start + (actualSpeed(radius) / radius) * markerTime;
			ctx.globalAlpha = markers;
			ctx.strokeStyle = 'rgba(255,160,140,0.6)';
			ctx.lineWidth = 1;
			ctx.setLineDash([2, 4]);
			ctx.beginPath();
			for (let i = 0; i <= 40; i++) {
				const [x, y] = galaxyPoint(cx, cy, size, radius, lerp(start, expectedTheta, i / 40));
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.strokeStyle = 'rgba(235,242,255,0.75)';
			ctx.beginPath();
			for (let i = 0; i <= 40; i++) {
				const [x, y] = galaxyPoint(cx, cy, size, radius, lerp(start, actualTheta, i / 40));
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
			ctx.stroke();
			const [ex, ey] = galaxyPoint(cx, cy, size, radius, expectedTheta);
			const [ax, ay] = galaxyPoint(cx, cy, size, radius, actualTheta);
			ctx.fillStyle = 'rgba(255,160,140,0.95)';
			ctx.beginPath();
			ctx.arc(ex, ey, 3.2, 0, TAU);
			ctx.fill();
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.arc(ax, ay, 3.4, 0, TAU);
			ctx.fill();
			label('예상', ex, ey - 14, 'center', markers, 'rgba(255,170,150,0.95)');
			label('실제', ax, ay + 15, 'center', markers);
			ctx.globalAlpha = base;
		}
	}
	function galaxyFrame(o: GalaxyOptions): void {
		const point = targetPoint('andromeda');
		const center = applyT(currentSky, point[0], point[1]);
		const size =
			(Math.min(Math.min(W, H) * 0.46, GALAXY_MAX_SIZE * UI) * currentSky.k) / ZOOM_TARGET;
		drawGalaxy(o, center, size);
	}
	function chartRotation(o: Extract<Chart, { kind: 'rotation' }>): void {
		const p = layout().plot;
		axisWords('도는 빠르기', '중심에서 거리 →');
		bandTag('설명 그림');
		const mapX = mapLinear(0, 1, p.left, p.right);
		const mapY = mapLinear(0, GALAXY_SPEED * 1.1, p.bottom - 6, p.top + 6);
		if (o.expected > 0) {
			ctx.globalAlpha = o.expected;
			strokeFunction(expectedSpeed, 0.005, lerp(0.005, 1, o.expectedDraw), mapX, mapY, {
				color: 'rgba(255,150,130,0.9)',
				dash: [4, 4]
			});
			label(
				'예상',
				mapX(0.85),
				mapY(expectedSpeed(0.85)) + 14,
				'center',
				o.expected,
				'rgba(255,170,150,0.95)'
			);
			ctx.globalAlpha = 1;
		}
		if (o.actual > 0) {
			ctx.globalAlpha = o.actual;
			strokeFunction(actualSpeed, 0.005, lerp(0.005, 1, o.actualDraw), mapX, mapY, {
				width: 1.8
			});
			label('실제', mapX(0.85), mapY(actualSpeed(0.85)) - 14, 'center', o.actual);
			ctx.globalAlpha = 1;
		}
	}

	// ---------- 덧그림 · 띠 · 연도 ----------
	function drawOverlay(item: Overlay): void {
		switch (item.kind) {
			case 'wave':
				drawWavePath(item.o);
				return;
			case 'lens':
				drawLens(item.alpha, item.glass);
				return;
			case 'glare':
				drawGlare(item.amount);
				return;
			case 'b-reveal':
				drawBReveal(item.clark, item.p);
				return;
			case 'compression':
				drawCompression(item.alpha, item.squeeze);
				return;
			case 'matchbox':
				drawMatchbox(item);
				return;
			case 'orbit-compare':
				drawOrbitCompare(item);
				return;
			case 'galaxy':
				galaxyFrame(item);
				return;
		}
	}

	function drawChart(chart: Chart): void {
		switch (chart.kind) {
			case 'deviation':
				chartDeviation(chart);
				return;
			case 'spectrum':
				chartSpectrum(chart);
				return;
			case 'velocity':
				chartVelocity(chart);
				return;
			case 'rotation':
				chartRotation(chart);
				return;
		}
	}

	function drawBand(S: SceneState): void {
		if (S.band <= 0 || S.chart === null) return;
		// 문구 대조로 6장 속도 띠가 숨김 대상이면 띠를 올리지 않는다
		if (S.chart.kind === 'velocity' && hidden.velocityBand) return;
		const l = layout();
		ctx = bandCtx;
		ctx.setTransform(DPR, 0, 0, DPR, 0, -l.bandTop * DPR);
		ctx.clearRect(0, l.bandTop, W, l.bandH);
		bandBase();
		drawChart(S.chart);
		ctx = mainCtx;
		// G6: 글이 곡선을 말하지 않으면 띠가 흐려지며 내려간다
		const offset = (1 - smooth(S.band)) * l.bandH * 0.45;
		ctx.save();
		ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
		ctx.globalAlpha = S.band;
		ctx.drawImage(bandCanvas, 0, l.bandTop + offset, W, l.bandH);
		ctx.restore();
	}

	// 경계 구간 동안 화면 가운데에 장 연도(투명도 0 → 0.9 → 0)
	function drawYearRoll(transition: Transition | null): void {
		if (transition === null) return;
		const { alpha, value } = yearRoll(transition);
		if (alpha <= 0) return;
		const size = layout().wide ? YEAR_FONT_WIDE : YEAR_FONT_MOBILE;
		ctx.save();
		ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
		ctx.globalAlpha = alpha;
		ctx.font = `200 ${size}px ${FONT}`;
		ctx.fillStyle = ACCENT;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		const cell = Math.max(...'0123456789'.split('').map((digit) => ctx.measureText(digit).width));
		const lineHeight = size * 1.1;
		const digits = odometerDigits(value);
		const left = W / 2 - (cell * digits.length) / 2;
		digits.forEach((digit, i) => {
			const x = left + cell * (i + 0.5);
			const lower = Math.floor(digit);
			const roll = digit - lower;
			ctx.save();
			ctx.beginPath();
			ctx.rect(x - cell / 2, H / 2 - lineHeight / 2, cell, lineHeight);
			ctx.clip();
			ctx.fillText(String(lower % 10), x, H / 2 - roll * lineHeight);
			if (roll > 0) ctx.fillText(String((lower + 1) % 10), x, H / 2 + (1 - roll) * lineHeight);
			ctx.restore();
		});
		ctx.restore();
	}

	function render(frame: BeatProgress): void {
		const l = layout();
		if (l.landscape) {
			l.scope = landscapeScope(frame.index, frame.p, l.scopeLimits, {
				wide: l.wide,
				centerX: l.centerX,
				maxRadius: l.scopeMaxR,
				base: l.scopeBase
			});
		}
		const S = beatState(BEAT_IDS[frame.index], frame.p, input);
		const transition = chapterTransition(frame.index, frame.p);
		applyTransition(S, transition);
		ctx = mainCtx;
		currentSky = IDENTITY;
		drawSky(S);
		drawScope(S);
		if (S.overlay.length > 0) {
			ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
			ctx.globalAlpha = 1;
			for (const item of S.overlay) drawOverlay(item);
			ctx.globalAlpha = 1;
		}
		drawBand(S);
		drawYearRoll(transition);
	}

	return { resize, render };
}
