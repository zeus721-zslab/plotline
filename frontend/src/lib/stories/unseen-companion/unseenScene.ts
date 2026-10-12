// 보이지 않는 짝 장면 상태(순수 함수): 진행 값(비트 · p)만으로 장면이 정해진다(시간 의존 없음, 되감아도 같다).
// 시제품 sirius-flow.src.html 의 BEATS · 장 사이 이동 · 가로 화면 시야 자리를 그대로 옮겼다(수치 · 구간 무변경).
// 시제품은 비트 상태에 그리기 함수(closure)를 담았지만, 여기서는 그릴 것을 자료(overlay · close · chart)로 담고 렌더러가 그린다.
import { BEATS as BEAT_LIST } from './chapters.ts';

// ---------- 수학(시제품 그대로) ----------
export const TAU = Math.PI * 2;
export const clamp = (value: number, low: number, high: number): number =>
	Math.min(high, Math.max(low, value));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const smooth = (k: number): number => {
	const c = clamp(k, 0, 1);
	return c * c * (3 - 2 * c);
};
export const phase = (p: number, from: number, to: number): number =>
	smooth((p - from) / (to - from));
export const linear = (p: number, from: number, to: number): number =>
	clamp((p - from) / (to - from), 0, 1);
export const logLerp = (a: number, b: number, k: number): number =>
	Math.exp(lerp(Math.log(a), Math.log(b), k));

export const BESSEL_YEAR = 1844;

/** 화면 순서의 비트 id(1-1 … 8-3, 32비트) */
export const BEAT_IDS: string[] = BEAT_LIST.map((entry) => entry.beat.id);

export function chapterOf(id: string): number {
	return Number(id.split('-')[0]);
}

/** 장면 상태가 쓰는 자료 값(정적 JSON 에서): 물결 길 첫 해 · 끝 해, 51 페가시 속도 자료 마지막 날 */
export type SceneInput = { pathStartYear: number; pathEndYear: number; pegDays: number };

export type TargetKey = 'sirius' | 'uranus' | 'peg' | 'andromeda';
export type ScopeKey = TargetKey | 'sky' | 'siriusB';

// 하늘(별밭) 위 대상 자리 비율(연출 배치, 사실과 다름)
export const TARGET_SPOTS: Record<TargetKey, { fx: number; fy: number }> = {
	sirius: { fx: 0.5, fy: 0.5 },
	uranus: { fx: 0.24, fy: 0.7 },
	peg: { fx: 0.74, fy: 0.36 },
	andromeda: { fx: 0.3, fy: 0.3 }
};
// 가로 PC(글 왼쪽 열)에서 화면 비율 자리면 이름표가 글 열 안에 놓이는 대상(STEP 112 안드로메다 · STEP 113 천왕성)
const WIDE_AREA_TARGETS: TargetKey[] = ['uranus', 'andromeda'];

/**
 * 별밭 위 대상 자리. 가로 PC(wideArea 가 그림 영역)에서는 WIDE_AREA_TARGETS 를 그림 영역 안 같은 비율 자리로 옮겨
 * 이름표가 글 열 오른쪽에 오게 한다(세로 화면 · 다른 대상은 시제품 자리 그대로)
 */
export function targetSpot(
	key: TargetKey,
	width: number,
	height: number,
	wideArea: { left: number; right: number } | null
): [number, number] {
	const spot = TARGET_SPOTS[key];
	if (wideArea !== null && WIDE_AREA_TARGETS.includes(key)) {
		return [wideArea.left + spot.fx * (wideArea.right - wideArea.left), spot.fy * height];
	}
	return [spot.fx * width, spot.fy * height];
}

// ---------- 그릴 것(자료) ----------
export type WaveOptions = {
	alpha: number;
	mix: number;
	lift: number;
	year: number;
	// 물결 선을 그 해까지(없으면 year)
	waveYear?: number;
	cursor: number;
	dots: number;
	wave: number;
	straight: number;
	straightLabel?: number;
	ghost: number;
	bPath: number;
	head: number;
	yearLabel: number;
	tag: number;
	// 2-1: 머리 점이 하늘의 시리우스 자리에서 길 위로 옮겨 온다(headBlend 0 → 1)
	headFromSirius?: boolean;
	headBlend?: number;
	// 2-2: 띠 위 자리를 제 글 상자 아래 자리(0)에서 2-3 자리(1)로
	ownTextBlend?: number;
};

export type ClarkOptions = {
	aGlow: number;
	bShow: number;
	bBoost: number;
	bMark: number;
	trace: number;
	labels: number;
	anchor: number;
};

export type UranusOptions = { expected: number; travel: number; actualLabel: number; spot: number };
export type GalleOptions = {
	diagram: number;
	sky: number;
	map: number;
	mapDraw: number;
	light: number;
	pulse: number;
	zoom: number;
};
export type GalaxyOptions = {
	alpha: number;
	time: number;
	halo?: number;
	// 7-4 · 7-5: 윤곽이 은하 크기에서 화면 짧은 변 쪽으로 커진 정도(0 → 1, haloRadius)
	haloGrow?: number;
	// 7-5: 윤곽 아래 옅은 빛 안개 밝기(0 → HALO_FOG) · 점 구름 밀도 · 밝기 올림(0 → 1)
	fog?: number;
	cloudBoost?: number;
	// 7-5 이름: 빛을 지운 글자 "암흑 물질"의 지움 정도(0 → 1) · 넓힌 자간(1 → 0 이면 제자리)
	nameErase?: number;
	nameSpread?: number;
	markers?: number;
	markerTime?: number;
};
export type MatchboxOptions = {
	alpha: number;
	open: number;
	drop: number;
	close: number;
	light: number;
};

export type Close =
	| { kind: 'uranus'; o: UranusOptions }
	| { kind: 'galle'; o: GalleOptions }
	| { kind: 'clark'; o: ClarkOptions }
	| { kind: 'sirius-b'; hot: number }
	| { kind: 'peg'; day: number; wobble: number };

export type Chart =
	| { kind: 'deviation'; year: number; cursor: number; bubble: number }
	| {
			kind: 'spectrum';
			strip: number;
			expected: number;
			expectedDraw: number;
			actual: number;
			actualDraw: number;
	  }
	| { kind: 'velocity'; day: number; bubble: number }
	| {
			kind: 'rotation';
			expected: number;
			expectedDraw: number;
			actual: number;
			actualDraw: number;
	  }
	// 7-4 비교 막대: 보이는 물질 칸 · 보이지 않는 물질 칸(MATTER_CELLS), draw 는 칸이 그려진 정도(0 → 1)
	| { kind: 'matter'; alpha: number; draw: number; visible: number; invisible: number };

export type Overlay =
	| { kind: 'wave'; o: WaveOptions }
	| { kind: 'lens'; alpha: number; glass: number }
	| { kind: 'glare'; amount: number }
	| { kind: 'b-reveal'; clark: ClarkOptions; p: number }
	| { kind: 'compression'; alpha: number; squeeze: number }
	| ({ kind: 'matchbox' } & MatchboxOptions)
	| { kind: 'orbit-compare'; alpha: number; jupiter: number; peg: number; pegTurns: number }
	| ({ kind: 'galaxy' } & GalaxyOptions);

export type SceneState = {
	dive: number;
	aim: number;
	hillMark: number;
	bSpot: number;
	sweep: number;
	sweepAlpha: number;
	focusKey: TargetKey | null;
	focus: number;
	scope: number;
	scopeFixed: boolean;
	scopeKey: ScopeKey;
	fieldAlpha: number;
	close: Close | null;
	band: number;
	chart: Chart | null;
	lit: number;
	rings: Partial<Record<TargetKey, number>>;
	siriusAlpha: number;
	smudge: number;
	dim: number;
	overlay: Overlay[];
};

function baseState(chapter: number): SceneState {
	return {
		dive: chapter >= 2 && chapter <= 7 ? 1 : 0,
		aim: chapter === 8 ? 1 : 0,
		hillMark: 0,
		bSpot: 0,
		sweep: 0,
		sweepAlpha: 0,
		focusKey: null,
		focus: 0,
		scope: 0,
		scopeFixed: false,
		scopeKey: 'sky',
		fieldAlpha: 1,
		close: null,
		band: 0,
		chart: null,
		lit: 0,
		rings: {},
		siriusAlpha: 1,
		smudge: 1,
		dim: 0,
		overlay: []
	};
}

// 대상 확대 · 시야 열림 / 시야 닫힘 · 하늘로 빠짐
function enterTarget(S: SceneState, key: TargetKey, p: number, from: number, to: number): void {
	const span = to - from;
	S.focusKey = key;
	S.rings[key] = 1 - phase(p, from + span * 0.4, from + span * 0.7);
	S.focus = phase(p, from, from + span * 0.65);
	S.scope = phase(p, from + span * 0.6, to);
	S.scopeKey = key;
}
function leaveTarget(S: SceneState, key: TargetKey, p: number, from: number, to: number): void {
	const span = to - from;
	S.focusKey = key;
	S.scope = 1 - phase(p, from, from + span * 0.35);
	S.focus = 1 - phase(p, from + span * 0.25, to);
	S.scopeKey = key;
}

// 2장 물결 길의 기본값
const WAVE_FULL: WaveOptions = {
	alpha: 1,
	mix: 0,
	lift: 0,
	year: BESSEL_YEAR,
	cursor: 0,
	dots: 1,
	wave: 1,
	straight: 1,
	ghost: 0,
	bPath: 0,
	head: 1,
	yearLabel: 0,
	tag: 1
};
const wave = (overrides: Partial<WaveOptions>): Overlay => ({
	kind: 'wave',
	o: { ...WAVE_FULL, ...overrides }
});
// 4장 궤도 끝 상태
const CLARK_DONE: ClarkOptions = {
	aGlow: 0,
	bShow: 1,
	bBoost: 0,
	bMark: 0,
	trace: 1,
	labels: 1,
	anchor: 1
};
// 7장 시간(비트를 이어 돌도록 비트마다 시작 시각을 둔다)
const GALAXY_TIME: Record<string, [number, number]> = {
	'7-1': [0, 1.2],
	'7-2': [1.2, 2.2],
	'7-3': [3.4, 1.0],
	'7-4': [4.4, 1.0],
	'7-5': [5.4, 1.0],
	'7-6': [6.4, 0.8]
};
const galaxyTime = (id: string, p: number): number => GALAXY_TIME[id][0] + GALAXY_TIME[id][1] * p;
const MARKER_START = GALAXY_TIME['7-2'][0];

// 7-4 우주 전체 비율(Planck 2018: 암흑 물질 약 27% · 보통 물질 약 5%)을 칸 수로: 보이는 물질 1 · 보이지 않는 물질 5
export const MATTER_CELLS = { visible: 1, invisible: 5 } as const;
// 보이지 않는 무게 윤곽: 은하 원반 반지름의 HALO_SCALE 배(7-3)에서 화면 짧은 변의 HALO_MAX_RATIO 배까지(7-4)
const HALO_SCALE = 1.55;
const HALO_MAX_RATIO = 0.9;
// 7-5 이름이 드러나는 동안 은하 밝기를 낮추는 정도
const GALAXY_NAME_DIM = 0.3;
// 7-5 빛 안개 목표 밝기(윤곽 가운데 불투명도): 지운 글자 둘레가 글자 안보다 충분히 밝게(STEP 118 대비 기준)
export const HALO_FOG = 0.3;

/** 윤곽 반지름(px): grow 0 이면 7-3 윤곽(원반 × 1.55), 1 이면 화면 짧은 변 × 0.9(원반 윤곽이 이미 더 크면 그대로) */
export function haloRadius(size: number, minSide: number, grow: number): number {
	const base = size * HALO_SCALE;
	return lerp(base, Math.max(base, minSide * HALO_MAX_RATIO), clamp(grow, 0, 1));
}

type BeatState = (p: number, input: SceneInput) => SceneState;

const BEAT_STATES: Record<string, BeatState> = {
	'1-1': () => baseState(1),
	'1-2': (p) => {
		const S = baseState(1);
		S.hillMark = phase(p, 0.1, 0.4);
		S.aim = phase(p, 0.25, 0.75);
		S.dive = lerp(0, 0.06, phase(p, 0.35, 1));
		return S;
	},
	'1-3': (p) => {
		const S = baseState(1);
		S.aim = 1;
		S.hillMark = 1 - phase(p, 0, 0.2);
		S.dive = lerp(0.06, 1, phase(p, 0.15, 1));
		return S;
	},
	'2-1': (p, input) => {
		const S = baseState(2);
		S.focusKey = 'sirius';
		S.focus = phase(p, 0, 0.14);
		S.dim = 0.25 * phase(p, 0, 0.14);
		S.siriusAlpha = 1 - phase(p, 0.1, 0.16);
		const year = lerp(input.pathStartYear, BESSEL_YEAR, linear(p, 0.16, 0.92));
		S.overlay = [
			wave({
				alpha: phase(p, 0.1, 0.16),
				year,
				dots: 1,
				wave: 0,
				straight: 0,
				tag: 0,
				yearLabel: phase(p, 0.16, 0.22),
				headFromSirius: true,
				headBlend: phase(p, 0.1, 0.2)
			})
		];
		return S;
	},
	'2-2': (p, input) => {
		const S = baseState(2);
		S.focusKey = 'sirius';
		S.focus = 1;
		S.dim = 0.25;
		S.siriusAlpha = 0;
		// 띠가 올라오며 물결 길이 띠 위로 옮겨 가고(lift), 물결 선과 띠 곡선을 같은 해(traceYear)까지 함께 그린다
		const lift = phase(p, 0.05, 0.22);
		const traceYear = lerp(input.pathStartYear, BESSEL_YEAR, linear(p, 0.25, 0.55));
		const cursor = phase(p, 0.22, 0.27) * (1 - phase(p, 0.58, 0.66));
		S.band = lift;
		S.chart = { kind: 'deviation', year: traceYear, cursor, bubble: phase(p, 0.6, 0.7) };
		// 2-2 는 제 글 상자 아래까지 크게 쓰고, 글이 사라지는 끝(0.9~1)에 2-3 자리(pathGeoUp)로 줄어 이어진다(STEP 110 S6)
		S.overlay = [
			wave({
				lift,
				ownTextBlend: phase(p, 0.9, 1),
				dots: 1 - 0.4 * phase(p, 0.3, 0.6),
				straight: phase(p, 0.05, 0.25),
				wave: phase(p, 0.22, 0.27),
				waveYear: traceYear,
				cursor,
				tag: phase(p, 0.5, 0.6)
			})
		];
		return S;
	},
	'2-3': (p) => {
		const S = baseState(2);
		S.focusKey = 'sirius';
		S.focus = 1;
		S.dim = 0.25;
		S.siriusAlpha = 0;
		S.band = 1;
		S.chart = { kind: 'deviation', year: BESSEL_YEAR, cursor: 0, bubble: 1 - phase(p, 0, 0.15) };
		S.overlay = [wave({ lift: 1, dots: 0.6, wave: 1, ghost: phase(p, 0.15, 0.4) })];
		return S;
	},
	'2-4': (p) => {
		const S = baseState(2);
		S.focusKey = 'sirius';
		S.siriusAlpha = phase(p, 0.4, 0.6);
		S.focus = 1 - phase(p, 0.45, 0.85);
		S.dim = 0.25 * (1 - phase(p, 0.45, 0.85));
		S.rings.uranus = phase(p, 0.8, 1);
		const fade = 1 - phase(p, 0.15, 0.55);
		S.band = fade;
		S.chart = { kind: 'deviation', year: BESSEL_YEAR, cursor: 0, bubble: 0 };
		S.overlay = [
			wave({
				alpha: fade,
				lift: 1,
				dots: 0.6,
				ghost: 1 - phase(p, 0, 0.2),
				tag: 1 - phase(p, 0, 0.2)
			})
		];
		return S;
	},
	'3-1': (p) => {
		const S = baseState(3);
		enterTarget(S, 'uranus', p, 0, 0.3);
		S.fieldAlpha = 0.5;
		S.close = {
			kind: 'uranus',
			o: {
				expected: phase(p, 0.3, 0.42),
				travel: linear(p, 0.36, 0.85),
				actualLabel: phase(p, 0.5, 0.6),
				spot: phase(p, 0.85, 0.95)
			}
		};
		return S;
	},
	'3-2': (p) => {
		const S = baseState(3);
		S.focusKey = 'uranus';
		S.focus = 1;
		S.scope = 1;
		S.scopeKey = 'uranus';
		S.fieldAlpha = 0.5 * (1 - phase(p, 0.1, 0.3));
		S.close = {
			kind: 'galle',
			o: {
				diagram: 1 - phase(p, 0.05, 0.3),
				sky: phase(p, 0.15, 0.35),
				map: phase(p, 0.4, 0.55),
				mapDraw: linear(p, 0.4, 0.8),
				light: 0,
				pulse: 0,
				zoom: 0
			}
		};
		return S;
	},
	'3-3': (p) => {
		const S = baseState(3);
		S.focusKey = 'uranus';
		S.focus = 1;
		S.scope = 1;
		S.scopeKey = 'uranus';
		S.fieldAlpha = 0;
		S.close = {
			kind: 'galle',
			o: {
				diagram: 0,
				sky: 1,
				map: 1 - phase(p, 0.45, 0.7),
				mapDraw: 1,
				light: phase(p, 0, 0.12),
				pulse: linear(p, 0, 0.35),
				zoom: phase(p, 0.38, 0.9)
			}
		};
		return S;
	},
	'3-4': (p) => {
		const S = baseState(3);
		leaveTarget(S, 'uranus', p, 0, 0.55);
		S.fieldAlpha = 0;
		S.close = {
			kind: 'galle',
			o: { diagram: 0, sky: 1, map: 0, mapDraw: 1, light: 0, pulse: 0, zoom: 1 }
		};
		S.rings.sirius = phase(p, 0.65, 0.9);
		return S;
	},
	'4-1': (p) => {
		const S = baseState(4);
		S.rings.sirius = 1 - phase(p, 0, 0.2);
		S.overlay = [{ kind: 'lens', alpha: phase(p, 0.1, 0.45), glass: phase(p, 0.1, 0.45) }];
		return S;
	},
	'4-2': (p) => {
		const S = baseState(4);
		S.focusKey = 'sirius';
		S.focus = phase(p, 0.1, 0.65);
		S.scopeFixed = true;
		S.scope = phase(p, 0.7, 0.95);
		S.scopeKey = 'sirius';
		S.siriusAlpha = 1 - phase(p, 0.75, 0.95);
		S.close = {
			kind: 'clark',
			o: { aGlow: 0.6, bShow: 0, bBoost: 0, bMark: 0, trace: 0, labels: 0, anchor: 0 }
		};
		S.overlay = [
			{ kind: 'lens', alpha: 1 - 0.6 * phase(p, 0.7, 1), glass: 1 - phase(p, 0.7, 0.95) }
		];
		return S;
	},
	'4-3': (p) => {
		const S = baseState(4);
		S.focusKey = 'sirius';
		S.focus = 1;
		S.scope = 1;
		S.scopeFixed = true;
		S.scopeKey = 'sirius';
		S.siriusAlpha = 0;
		// 빛이 덮음(0~0.12) → 잠시 하얗게(~0.2) → 스크롤 따라 걷히며 B 가 드러남(~0.55) → 50년 궤도(0.6~0.95)
		const glare = phase(p, 0, 0.12) * (1 - phase(p, 0.2, 0.56));
		const aGlow = 1 - phase(p, 0.2, 0.6);
		const clark: ClarkOptions = {
			aGlow,
			bShow: phase(p, 0.36, 0.5),
			bBoost: phase(p, 0.35, 0.42) * (1 - phase(p, 0.6, 0.7)),
			bMark: phase(p, 0.48, 0.54) * (1 - phase(p, 0.62, 0.7)),
			trace: linear(p, 0.62, 0.95),
			labels: phase(p, 0.55, 0.62),
			anchor: phase(p, 0.22, 0.34)
		};
		S.close = { kind: 'clark', o: clark };
		// 하얀 빛이 덮은 동안(0.22~0.34) 질량 중심을 시야 가운데로 옮겨 B 가 시야 테 안쪽에 오게 하고(A 가운데 그대로면 B 가 테에 걸려 잘린다),
		// 빛이 걷히는 동안 B 를 빛 위에 따로 표시한다(p 0.35 부터)
		S.overlay = [
			{ kind: 'lens', alpha: 0.4 * (1 - phase(p, 0, 0.1)), glass: 0 },
			{ kind: 'glare', amount: glare },
			{ kind: 'b-reveal', clark, p }
		];
		return S;
	},
	'4-4': (p, input) => {
		const S = baseState(4);
		S.focusKey = 'sirius';
		S.focus = 1;
		S.scopeFixed = true;
		S.scopeKey = 'sirius';
		S.siriusAlpha = 0;
		S.scope = 1 - phase(p, 0.05, 0.3);
		S.dim = 0.25 * phase(p, 0.05, 0.3);
		S.close = { kind: 'clark', o: CLARK_DONE };
		const year = lerp(input.pathStartYear, input.pathEndYear, linear(p, 0.3, 0.9));
		S.overlay = [
			wave({
				alpha: phase(p, 0.2, 0.32),
				mix: 1,
				year,
				dots: 0,
				straight: 1,
				straightLabel: 0,
				wave: 1,
				bPath: 1,
				ghost: 0,
				yearLabel: 1,
				tag: 1
			})
		];
		return S;
	},
	'5-1': (p, input) => {
		const S = baseState(5);
		S.focusKey = 'sirius';
		S.focus = 1;
		S.siriusAlpha = 0;
		S.scopeKey = 'siriusB';
		S.dim = 0.25 * (1 - phase(p, 0.05, 0.2));
		S.scope = phase(p, 0.08, 0.28);
		S.band = phase(p, 0.26, 0.34);
		S.close = { kind: 'sirius-b', hot: phase(p, 0.66, 0.86) };
		S.chart = {
			kind: 'spectrum',
			strip: linear(p, 0.3, 0.42),
			expected: phase(p, 0.42, 0.48),
			expectedDraw: linear(p, 0.42, 0.6),
			actual: phase(p, 0.66, 0.72),
			actualDraw: linear(p, 0.66, 0.86)
		};
		S.overlay = [
			wave({
				alpha: 1 - phase(p, 0, 0.12),
				mix: 1,
				year: input.pathEndYear,
				dots: 0,
				straightLabel: 0,
				bPath: 1,
				yearLabel: 0
			})
		];
		return S;
	},
	'5-2': (p) => {
		const S = baseState(5);
		S.focusKey = 'sirius';
		S.focus = 1;
		S.siriusAlpha = 0;
		S.scopeKey = 'siriusB';
		S.scope = 1 - phase(p, 0, 0.15);
		S.band = 1 - phase(p, 0, 0.12);
		S.dim = 0.45 * phase(p, 0, 0.15);
		S.close = { kind: 'sirius-b', hot: 1 };
		S.chart = {
			kind: 'spectrum',
			strip: 1,
			expected: 1,
			expectedDraw: 1,
			actual: 1,
			actualDraw: 1
		};
		S.overlay = [
			{ kind: 'compression', alpha: phase(p, 0.1, 0.22), squeeze: linear(p, 0.3, 0.85) }
		];
		return S;
	},
	'5-3': (p) => {
		const S = baseState(5);
		S.focusKey = 'sirius';
		S.focus = 1;
		S.siriusAlpha = 0;
		S.dim = 0.45;
		S.overlay = [
			{ kind: 'compression', alpha: 1 - phase(p, 0, 0.2), squeeze: 1 },
			{
				kind: 'matchbox',
				alpha: phase(p, 0.15, 0.3),
				open: phase(p, 0.22, 0.38),
				drop: linear(p, 0.38, 0.7),
				close: phase(p, 0.7, 0.82),
				light: phase(p, 0.8, 0.92)
			}
		];
		return S;
	},
	'5-4': (p) => {
		const S = baseState(5);
		S.focusKey = 'sirius';
		S.siriusAlpha = 1;
		S.focus = 1 - phase(p, 0.2, 0.7);
		S.dim = 0.45 * (1 - phase(p, 0.15, 0.6));
		S.rings.peg = phase(p, 0.7, 0.95);
		S.overlay = [
			{ kind: 'matchbox', alpha: 1 - phase(p, 0, 0.25), open: 1, drop: 1, close: 1, light: 1 }
		];
		return S;
	},
	'6-1': (p) => {
		const S = baseState(6);
		enterTarget(S, 'peg', p, 0, 0.5);
		S.close = { kind: 'peg', day: 0, wobble: 0 };
		return S;
	},
	'6-2': (p, input) => {
		const S = baseState(6);
		S.focusKey = 'peg';
		S.focus = 1;
		S.scope = 1;
		S.scopeKey = 'peg';
		S.band = phase(p, 0, 0.12);
		const day = input.pegDays * linear(p, 0.1, 0.9);
		S.close = { kind: 'peg', day, wobble: phase(p, 0.05, 0.15) };
		S.chart = { kind: 'velocity', day, bubble: phase(p, 0.72, 0.8) };
		return S;
	},
	'6-3': (p, input) => {
		const S = baseState(6);
		S.focusKey = 'peg';
		S.focus = 1;
		S.scopeKey = 'peg';
		S.scope = 1 - phase(p, 0, 0.15);
		S.band = 1 - phase(p, 0, 0.12);
		S.dim = 0.45 * phase(p, 0, 0.15);
		S.close = { kind: 'peg', day: input.pegDays, wobble: 1 };
		S.chart = { kind: 'velocity', day: input.pegDays, bubble: 1 };
		S.overlay = [
			{
				kind: 'orbit-compare',
				alpha: phase(p, 0.1, 0.22),
				jupiter: phase(p, 0.2, 0.45),
				peg: phase(p, 0.45, 0.55),
				pegTurns: linear(p, 0.45, 1) * 6
			}
		];
		return S;
	},
	'6-4': (p) => {
		const S = baseState(6);
		S.focusKey = 'peg';
		S.focus = 1 - phase(p, 0.1, 0.45);
		S.dim = 0.45 * (1 - phase(p, 0.05, 0.4));
		S.lit = linear(p, 0.4, 0.85);
		S.rings.andromeda = phase(p, 0.85, 1);
		S.overlay = [
			{ kind: 'orbit-compare', alpha: 1 - phase(p, 0, 0.15), jupiter: 1, peg: 1, pegTurns: 6 }
		];
		return S;
	},
	'7-1': (p) => {
		const S = baseState(7);
		S.focusKey = 'andromeda';
		S.focus = phase(p, 0, 0.4);
		S.lit = 1 - phase(p, 0, 0.3);
		S.rings.andromeda = 1 - phase(p, 0, 0.2);
		S.dim = 0.3 * phase(p, 0.2, 0.4);
		S.smudge = 1 - phase(p, 0.3, 0.5);
		S.overlay = [{ kind: 'galaxy', alpha: phase(p, 0.25, 0.5), time: galaxyTime('7-1', p) }];
		return S;
	},
	'7-2': (p) => {
		const S = baseState(7);
		S.focusKey = 'andromeda';
		S.focus = 1;
		S.dim = 0.3;
		S.smudge = 0;
		S.band = phase(p, 0, 0.1);
		const time = galaxyTime('7-2', p);
		S.chart = {
			kind: 'rotation',
			expected: phase(p, 0.1, 0.16),
			expectedDraw: linear(p, 0.1, 0.4),
			actual: phase(p, 0.48, 0.54),
			actualDraw: linear(p, 0.48, 0.75)
		};
		S.overlay = [
			{
				kind: 'galaxy',
				alpha: 1,
				time,
				markers: phase(p, 0.12, 0.2),
				markerTime: time - MARKER_START
			}
		];
		return S;
	},
	'7-3': (p) => {
		const S = baseState(7);
		S.focusKey = 'andromeda';
		S.focus = 1;
		S.dim = 0.3;
		S.smudge = 0;
		S.band = 1 - phase(p, 0, 0.12);
		const time = galaxyTime('7-3', p);
		S.chart = { kind: 'rotation', expected: 1, expectedDraw: 1, actual: 1, actualDraw: 1 };
		S.overlay = [
			{
				kind: 'galaxy',
				alpha: 1,
				time,
				halo: phase(p, 0.15, 0.55),
				markers: 1 - phase(p, 0, 0.15),
				markerTime: time - MARKER_START
			}
		];
		return S;
	},
	// 규모가 드러남: 윤곽이 화면 짧은 변 쪽으로 커지고(0.1~0.7), 아래 띠에 1:5 비교 막대(0.2~0.6). 회전 그래프는 7-3 끝에 이미 내려가 있다
	'7-4': (p) => {
		const S = baseState(7);
		S.focusKey = 'andromeda';
		S.focus = 1;
		S.dim = 0.3;
		S.smudge = 0;
		S.band = phase(p, 0.15, 0.25);
		S.chart = {
			kind: 'matter',
			alpha: phase(p, 0.2, 0.3),
			draw: linear(p, 0.2, 0.6),
			...MATTER_CELLS
		};
		S.overlay = [
			{
				kind: 'galaxy',
				alpha: 1,
				time: galaxyTime('7-4', p),
				halo: 1,
				haloGrow: phase(p, 0.1, 0.7)
			}
		];
		return S;
	},
	// 이름이 드러남: 커진 윤곽 그대로 은하를 조금 어둡게, 띠는 내린다. 빛 안개 · 점 구름이 짙어지고(0.1~0.3) 그 빛을 "암흑 물질" 글자 모양으로
	// 지운다(0.3~0.6, 넓은 자간에서 조여짐). 끝(0.85~1)에 지움 · 안개 · 윤곽을 7-6 첫 상태(7-3 윤곽 · 은하 밝기)로 되돌려 이어 붙인다
	'7-5': (p) => {
		const S = baseState(7);
		S.focusKey = 'andromeda';
		S.focus = 1;
		S.dim = 0.3;
		S.smudge = 0;
		S.band = 1 - phase(p, 0, 0.12);
		S.chart = { kind: 'matter', alpha: 1, draw: 1, ...MATTER_CELLS };
		const restore = phase(p, 0.85, 1);
		S.overlay = [
			{
				kind: 'galaxy',
				alpha: 1 - GALAXY_NAME_DIM * phase(p, 0, 0.2) * (1 - restore),
				time: galaxyTime('7-5', p),
				halo: 1,
				haloGrow: 1 - restore,
				fog: HALO_FOG * phase(p, 0.1, 0.3) * (1 - restore),
				cloudBoost: phase(p, 0.1, 0.3) * (1 - restore),
				nameErase: phase(p, 0.3, 0.6) * (1 - restore),
				nameSpread: 1 - phase(p, 0.3, 0.6)
			}
		];
		return S;
	},
	'7-6': (p) => {
		const S = baseState(7);
		S.focusKey = 'andromeda';
		S.focus = 1 - phase(p, 0.6, 1);
		S.dim = 0.3 * (1 - phase(p, 0.6, 1));
		S.smudge = phase(p, 0.7, 0.95);
		const time = galaxyTime('7-6', p);
		const echo = phase(p, 0.08, 0.25) * (1 - phase(p, 0.45, 0.62));
		S.overlay = [
			{
				kind: 'galaxy',
				alpha: 1 - phase(p, 0.6, 0.9),
				time,
				halo: 1 - phase(p, 0.55, 0.8)
			},
			wave({ alpha: echo * 0.85, dots: 0, straight: 0.6, straightLabel: 0, tag: 0, head: 1 })
		];
		return S;
	},
	'8-1': (p) => {
		const S = baseState(8);
		S.dive = 1 - phase(p, 0, 0.75);
		return S;
	},
	'8-2': (p) => {
		const S = baseState(8);
		S.bSpot = phase(p, 0.08, 0.3);
		S.sweep = linear(p, 0.35, 0.9);
		S.sweepAlpha = phase(p, 0.35, 0.45) * (1 - phase(p, 0.8, 0.95));
		return S;
	},
	'8-3': () => {
		const S = baseState(8);
		S.bSpot = 1;
		return S;
	}
};

/** 비트 · 진행 값 → 장면 상태 */
export function beatState(id: string, p: number, input: SceneInput): SceneState {
	return BEAT_STATES[id](p, input);
}

// ---------- 스크롤 → 비트 · 진행 값(시제품 readState) ----------
export type BeatSpan = { top: number; height: number };
export type BeatProgress = { index: number; p: number };

/** 스크롤 위치에서 지금 비트(윗변이 지난 마지막 비트)와 그 안 진행 값. 첫 비트 앞이면 첫 비트 0 */
export function beatAt(scrollY: number, spans: BeatSpan[]): BeatProgress {
	let index = 0;
	spans.forEach((span, i) => {
		if (span.top <= scrollY + 0.5) index = i;
	});
	const span = spans[index];
	return { index, p: clamp((scrollY - span.top) / span.height, 0, 1) };
}

/** 그 비트 그 진행 값이 되는 스크롤 위치(beatAt 의 역) */
export function scrollFor(index: number, p: number, spans: BeatSpan[]): number {
	return spans[index].top + p * spans[index].height;
}

// ---------- 장 사이 이동(STEP 111 P4): 2→3 · 3→4 · 4→5 · 5→6 · 6→7장 경계 ----------
// 앞 장 마지막 비트 p 0.85~1: 원형 시야를 닫고 대상 확대 → 별밭 전체로 축소(focus → 0).
// 다음 장 첫 비트 p 0~0.2: 별밭 전체에서 다음 대상 쪽으로 옮기며 다시 확대(transformFocus 가 확대와 함께 대상을 초점 자리로 옮긴다).
// 대상이 같으면(4→5 시리우스) 옮김 없이 축소 → 확대만. 비트 상태의 focus · scope 에 곱해 경계 끝에서 비트 값과 이어진다
export const CHAPTER_YEAR: Record<number, number> = {
	2: 1844,
	3: 1846,
	4: 1862,
	5: 1915,
	6: 1995,
	7: 1970
};
const TRANSITION_LEAVE = 0.85;
const TRANSITION_ENTER = 0.2;
const YEAR_ALPHA = 0.9;
const YEAR_DIGITS = 4;
const YEAR_HALF = 0.5; // 경계 구간(t 0~1)의 앞 장 · 다음 장 절반 나눔

export type Transition = { side: 'leave' | 'enter'; from: number; to: number; k: number };

/** 진행 값(비트 · p)만으로 경계 구간 여부와 구간 안 위치 k(0~1)를 정한다 */
export function chapterTransition(index: number, p: number): Transition | null {
	const id = BEAT_IDS[index];
	const chapter = chapterOf(id);
	const next = index + 1 < BEAT_IDS.length ? BEAT_IDS[index + 1] : null;
	const previous = index > 0 ? BEAT_IDS[index - 1] : null;
	const hasYears = (from: number, to: number): boolean =>
		CHAPTER_YEAR[from] !== undefined && CHAPTER_YEAR[to] !== undefined;
	if (
		p >= TRANSITION_LEAVE &&
		next !== null &&
		chapterOf(next) === chapter + 1 &&
		hasYears(chapter, chapter + 1)
	) {
		return { side: 'leave', from: chapter, to: chapter + 1, k: linear(p, TRANSITION_LEAVE, 1) };
	}
	if (
		p <= TRANSITION_ENTER &&
		previous !== null &&
		chapterOf(previous) === chapter - 1 &&
		hasYears(chapter - 1, chapter)
	) {
		return { side: 'enter', from: chapter - 1, to: chapter, k: linear(p, 0, TRANSITION_ENTER) };
	}
	return null;
}

export function applyTransition(S: SceneState, transition: Transition | null): void {
	if (transition === null) return;
	const k = transition.k;
	if (transition.side === 'leave') {
		S.scope *= 1 - phase(k, 0, 0.35);
		S.focus *= 1 - phase(k, 0.25, 1);
	} else {
		S.focus *= phase(k, 0.1, 0.85);
		S.scope *= phase(k, 0.6, 1);
	}
}

/** 자리마다 연속 값(주행 거리계): 아래 자리가 9 → 0 으로 넘어가는 동안만 윗자리가 한 칸 굴러간다. 값이 줄어도 같은 식 */
export function odometerDigits(value: number): number[] {
	const digits: number[] = [];
	for (let place = 0; place < YEAR_DIGITS; place++) {
		const unit = Math.pow(10, place);
		const whole = Math.floor(value / unit);
		const below = value - whole * unit;
		const carry = place === 0 ? below : Math.max(0, below - (unit - 1));
		digits.unshift((whole % 10) + carry);
	}
	return digits;
}

/**
 * 경계 구간 동안 화면 가운데에 장 연도: 앞 장 연도에서 다음 장 연도로 숫자가 굴러가며 바뀐다(투명도 0 → 0.9 → 0).
 * 연도가 거꾸로 가는 경계(6→7장 1995 → 1970)는 굴리지 않는다: 앞 절반에 앞 장 연도가 사라지고, 뒤 절반에 다음 장 연도가 떠올랐다 사라진다
 * (되돌아가는 숫자 굴림이 어색해서, STEP 117). 한 번에 숫자 하나만 돌려주므로 두 연도가 함께 보이는 순간이 없고, 정수라 중간값도 없다
 */
export function yearRoll(transition: Transition): { alpha: number; value: number } {
	const t = transition.side === 'leave' ? 0.5 * transition.k : 0.5 + 0.5 * transition.k;
	const from = CHAPTER_YEAR[transition.from];
	const to = CHAPTER_YEAR[transition.to];
	if (to < from) {
		// 앞 장 연도는 짧게 들어와(0 → 0.9) 앞 절반 끝에 0, 다음 장 연도는 뒤 절반 첫머리 0 에서 떠오른다
		return t < YEAR_HALF
			? { alpha: YEAR_ALPHA * phase(t, 0, 0.15) * (1 - phase(t, 0.3, YEAR_HALF)), value: from }
			: { alpha: YEAR_ALPHA * phase(t, YEAR_HALF, 0.7) * (1 - phase(t, 0.85, 1)), value: to };
	}
	return {
		alpha: YEAR_ALPHA * phase(t, 0, 0.3) * (1 - phase(t, 0.7, 1)),
		value: lerp(CHAPTER_YEAR[transition.from], CHAPTER_YEAR[transition.to], phase(t, 0.2, 0.8))
	};
}

// ---------- 가로 화면 원형 시야 자리(STEP 110 S1 · STEP 111 P1) ----------
// 시야 · 렌즈가 나오는 장. 그 밖의 장은 기존 고정 자리(2 · 7장 하늘 구도 유지)
const SCOPE_FIT_CHAPTERS = [3, 4, 5, 6];
const WIDE_SCOPE_CHAPTERS = [2, 3, 4, 5, 6, 7];
// 비트 첫 · 끝 진행 구간: 이웃 비트와 시야 자리를 이어 붙인다(경계에서 값이 같다)
const SCOPE_BLEND = 0.1;
const BAND_SAMPLE_COUNT = 20;

export type Scope = { x: number; y: number; r: number };
export type ScopeLimit = { top: number; bottom: number };

/** 그 비트가 아래 띠를 쓰는가(진행 값 21곳 표본) */
export function beatShowsBand(id: string, input: SceneInput): boolean {
	return Array.from(
		{ length: BAND_SAMPLE_COUNT + 1 },
		(_, i) => beatState(id, i / BAND_SAMPLE_COUNT, input).band > 0
	).some(Boolean);
}

/**
 * 가로 화면 시야 자리: 비트 안에서는 그 비트 범위, 첫 · 끝 SCOPE_BLEND 구간은 이웃 비트와 겹치는 쪽(더 좁은 범위)으로 이어 간다.
 * 진행 값(비트 · p)만으로 정해져 되감아도 같다. 경계에서 두 비트의 값이 같아 이어진다
 */
export function landscapeScope(
	index: number,
	p: number,
	limits: ScopeLimit[],
	options: { wide: boolean; centerX: number; maxRadius: number; base: Scope }
): Scope {
	const chapters = options.wide ? WIDE_SCOPE_CHAPTERS : SCOPE_FIT_CHAPTERS;
	const fits = (i: number): boolean =>
		i >= 0 && i < BEAT_IDS.length && chapters.includes(chapterOf(BEAT_IDS[i]));
	if (!fits(index)) return options.base;
	const current = limits[index];
	const previous = fits(index - 1) ? limits[index - 1] : current;
	const next = fits(index + 1) ? limits[index + 1] : current;
	const enter = phase(p, 0, SCOPE_BLEND);
	const leave = phase(p, 1 - SCOPE_BLEND, 1);
	const top = lerp(
		lerp(Math.max(previous.top, current.top), current.top, enter),
		Math.max(current.top, next.top),
		leave
	);
	const bottom = lerp(
		lerp(Math.min(previous.bottom, current.bottom), current.bottom, enter),
		Math.min(current.bottom, next.bottom),
		leave
	);
	return {
		x: options.centerX,
		y: (top + bottom) / 2,
		r: Math.min(options.maxRadius, (bottom - top) / 2)
	};
}
