// 사라진 세 자리 장면 상태(순수 함수, DOM · 캔버스 없음): 트랙 위치(구간 번호 · 진행값 p) → 그림 · 글 · 표식 상태.
// 시제품 chaos-full.src.html 의 진행 구간(KNOTS · KNOTS_FLOW), 표지 · 끝 화면 표식, 연도 굴림, 자막 · 배지 · 캡션, 3-3 하늘을 옮겼다.
// 모든 값은 진행값만의 함수라 되감아도 같은 상태가 된다(시간 효과는 그리기 쪽의 seconds 로만 더한다).
import {
	BODY_TIME,
	DUST_STEPS,
	ENSEMBLE_STEPS,
	FULL_VALUE,
	MAIN_STEPS,
	PAIR_STEPS,
	TRUNCATED_VALUE,
	WEATHER_DAYS,
	WEATHER_DAYS_BEFORE
} from './chaosCompute.ts';
import type { YearEvent } from './chaosData.ts';
import {
	beatAt,
	beatAtVh,
	beatById,
	COVER,
	SKY33_BEAT,
	SKY33_RATE_PER_VH,
	SKY33_SCHEDULE,
	TRACK_ENTRIES,
	type Beat,
	type TrackEntry
} from './chapters.ts';
import { COVER_TARGET, YEAR_MARKS, yearMarkTarget } from './storyChecks.ts';
import { badgeOf, CAPTIONS, CHAPTER_TEXTS, COVER_TEXT } from './storyText.ts';

// ---------- 수학 ----------

export type Knots = readonly (readonly [number, number])[];

export function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = clamp01((value - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

export function smootherstep(t: number): number {
	return t * t * t * (t * (t * 6 - 15) + 10);
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/** 진행값 from → to 동안 0 → 1 (부드럽게) */
export function rampP(p: number, from: number, to: number): number {
	return smootherstep(clamp01((p - from) / (to - from)));
}

/** 꺾은선(진행값 → 값). 처음 · 끝 밖은 끝값 */
export function piecewise(knots: Knots, p: number): number {
	if (p <= knots[0][0]) return knots[0][1];
	for (let index = 1; index < knots.length; index++) {
		const [p1, v1] = knots[index];
		if (p <= p1) {
			const [p0, v0] = knots[index - 1];
			return p1 === p0 ? v1 : v0 + ((v1 - v0) * (p - p0)) / (p1 - p0);
		}
	}
	return knots[knots.length - 1][1];
}

/** 증가하는 꺾은선의 역함수(값 → 처음 그 값에 닿는 p) */
export function inversePiecewise(knots: Knots, value: number): number {
	for (let index = 1; index < knots.length; index++) {
		const [p0, v0] = knots[index - 1];
		const [p1, v1] = knots[index];
		if (value <= v1 && v1 > v0) return p0 + ((p1 - p0) * (value - v0)) / (v1 - v0);
	}
	return knots[knots.length - 1][0];
}

// ---------- 트랙 위치 ----------

/** 트랙 구간 번호(TRACK_ENTRIES) · 그 구간 안 진행값 */
export type TrackPosition = { index: number; p: number };

/** 동작 줄이기 · 저사양 정지 그림이 쓰는 비트 진행값(시제품 REDUCED_P) */
export const REDUCED_P = 0.95;
// 그림만 늦게 따라오는 스크롤 완화(시제품 SMOOTH_MS · SNAP_SCREENS): 화면 1.5장 넘게 떨어지거나 0.3px 안이면 바로 붙인다
const SMOOTH_MS = 110;
const SNAP_SCREENS = 1.5;
const SNAP_PX = 0.3;

export function entryOf(position: TrackPosition): TrackEntry {
	return TRACK_ENTRIES[position.index];
}

/** 장 제목 · 끝 화면 구간의 바로 앞 구간(그 마지막 그림이 꺼져 간다) */
export function previousEntry(index: number): TrackEntry {
	return TRACK_ENTRIES[Math.max(0, index - 1)];
}

/** 정지 모드 그림 위치: 장 제목 구간은 글 위치 그대로(빈 그림), 나머지는 구간마다 REDUCED_P 한 장 */
export function stillPosition(text: TrackPosition): TrackPosition {
	return entryOf(text).kind === 'chapter' ? text : { index: text.index, p: REDUCED_P };
}

/** 그림용 완화 스크롤 한 걸음 */
export function smoothScroll(
	current: number,
	target: number,
	elapsedMs: number,
	viewportHeight: number
): number {
	const difference = target - current;
	if (Math.abs(difference) > viewportHeight * SNAP_SCREENS || Math.abs(difference) < SNAP_PX)
		return target;
	return current + difference * (1 - Math.exp(-elapsedMs / SMOOTH_MS));
}

// ---------- 시그니처 진행 구간(시제품 KNOTS :542-556) ----------

export const KNOTS = {
	// 4-2: 넷째 문장(움직이며 길을 남긴다)에서 출발
	main42: [
		[beatAt('4-2', 2, 0.7), 0],
		[beatAt('4-2', 3, 0), 40],
		[1, 260]
	],
	// 4-3: 첫 문장 한쪽 고리 · 둘째 회전이 세지다 힘을 잃음 · 셋째 맞은편으로 넘어감 · 넷째~여섯째 쌓임
	main43: [
		[0, 260],
		[beatAt('4-3', 1, 0), 600],
		[beatAt('4-3', 2, 0), 990],
		[beatAt('4-3', 3, 0), 1200],
		[beatAt('4-3', 4, 0), 3300],
		[beatAt('4-3', 5, 0), 7000],
		[beatAt('4-3', 5, 0.55), MAIN_STEPS]
	],
	// 4-3 빛 먼지: 넷째 문장 끝에 흩어져 나타나고 → 다섯째 동안 빨려 들어가고 → 여섯째 동안 끌개 위를 돈다
	dust43: [
		[beatAt('4-3', 3, 0.85), 0],
		[beatAt('4-3', 4, 0.08), 10],
		[beatAt('4-3', 4, 0.9), 230],
		[beatAt('4-3', 5, 0.7), 760],
		[1, 900]
	],
	dust44: [
		[0, 900],
		[beatAt('4-4', 0, 0.5), DUST_STEPS]
	],
	// 4-4: 둘째 문장 후반에 갈라짐을 느리게 보여 주고, 셋째 · 넷째 문장 동안 서로 다른 고리
	pair44: [
		[beatAt('4-4', 0, 0.5), 0],
		[beatAt('4-4', 1, 0), 40],
		[beatAt('4-4', 1, 0.45), 1600],
		[beatAt('4-4', 1, 0.95), 1725],
		[beatAt('4-4', 2, 0), 1800],
		[beatAt('4-4', 3, 0), 2150],
		[beatAt('4-4', 3, 0.85), PAIR_STEPS]
	],
	// 7-1: 넷째 문장(출발한다)부터 한 가닥으로 출발
	ens71: [
		[beatAt('7-1', 3, 0.3), 0],
		[beatAt('7-1', 5, 0), 120],
		[1, 300]
	],
	// 7-2: 붙어 감 → 하나둘 갈라짐 → 꽃처럼 흩어짐
	ens72: [
		[0, 300],
		[beatAt('7-2', 1, 0), 900],
		[beatAt('7-2', 2, 0), 1300],
		[beatAt('7-2', 3, 0), 3400],
		[beatAt('7-2', 3, 0.8), ENSEMBLE_STEPS]
	]
} satisfies Record<string, Knots>;

/** 시그니처 A(4-2 · 4-3 · 4-4)를 한 장면으로 이어 본 진행값(비트 길이 비율) */
export function sceneAProgress(beatId: string, p: number): number {
	return joinedProgress(['4-2', '4-3', '4-4'], beatId, p);
}

/** 시그니처 C(7-1 · 7-2)를 한 장면으로 이어 본 진행값 */
export function sceneCProgress(beatId: string, p: number): number {
	return joinedProgress(['7-1', '7-2'], beatId, p);
}

function joinedProgress(order: string[], beatId: string, p: number): number {
	const sizes = order.map((id) => beatById(id).totalVh);
	const total = sizes.reduce((sum, size) => sum + size, 0);
	const position = order.indexOf(beatId);
	let before = 0;
	for (let index = 0; index < position; index++) before += sizes[index];
	return (before + p * sizes[position]) / total;
}

// ---------- 시그니처 밖 비트 진행 구간(시제품 KNOTS_FLOW :1236-1245) ----------

export const KNOTS_FLOW = {
	print22: [
		[beatAt('2-2', 2, 0.3), 0],
		[beatAt('2-2', 4, 0), 8],
		[beatAt('2-2', 4, 0.92), WEATHER_DAYS_BEFORE + WEATHER_DAYS + 1]
	],
	white24: [
		[beatAt('2-4', 3, 0), 3],
		[beatAt('2-4', 4, 0), 9],
		[beatAt('2-4', 5, 0), 22],
		[beatAt('2-4', 6, 0.9), 30]
	],
	white25: [
		[0, 30],
		[beatAt('2-5', 1, 1), 30],
		[beatAt('2-5', 2, 0.1), 31],
		[beatAt('2-5', 2, 0.95), 46],
		[beatAt('2-5', 3, 0.9), WEATHER_DAYS]
	],
	// 하늘 시간표 그대로(날 수는 구간 안에서 스크롤에 선형)
	day33: SKY33_SCHEDULE.flatMap((span): [number, number][] => [
		[beatAtVh(SKY33_BEAT, span.startVh), span.fromDay],
		[beatAtVh(SKY33_BEAT, span.endVh), span.toDay]
	]),
	lone35: [
		[beatAt('3-5', 5, 0.05), 0],
		[beatAt('3-5', 5, 0.9), WEATHER_DAYS]
	],
	body52: [
		[beatAt('5-2', 2, 0.1), 0],
		[beatAt('5-2', 3, 0), 4],
		[beatAt('5-2', 4, 0), 22],
		[beatAt('5-2', 4, 0.9), 30]
	],
	body54: [
		[beatAt('5-4', 1, 0.05), 0],
		[beatAt('5-4', 3, 0.9), BODY_TIME]
	],
	pair63: [
		[beatAt('6-3', 3, 0), 0],
		[beatAt('6-3', 3, 0.9), 900],
		[beatAt('6-3', 4, 0), 1300],
		[beatAt('6-3', 4, 0.9), 1800],
		[beatAt('6-3', 5, 0.8), PAIR_STEPS]
	]
} satisfies Record<string, Knots>;

// ---------- 3-3 두 언덕 하늘(시제품 :2097-2112) ----------

// 대표값은 0 · 10 · … · 60일(10일 간격)
const SKY_ANCHOR_SPACING_DAYS = 10;
/** 비트 끝에서 이만큼(vh) 앞서부터 그림 전체가 사라진다 */
export const SKY33_FADE_VH = 40;

/**
 * 언덕별 맑음 꺾은선(하늘 시간표): 구간 시작 vh 에서 대표값을 떠나 1vh 당 SKY33_RATE_PER_VH 로 다음 대표값까지, 그 뒤 다음 구간까지 멈춤.
 * anchors: 0 · 10 · … · 60일 대표 맑음(chaosCompute skyAnchors)
 */
export function sky33Knots(anchors: readonly number[]): Knots {
	return SKY33_SCHEDULE.flatMap((span): [number, number][] => {
		const from = anchors[span.fromDay / SKY_ANCHOR_SPACING_DAYS];
		const to = anchors[span.toDay / SKY_ANCHOR_SPACING_DAYS];
		return [
			[beatAtVh(SKY33_BEAT, span.startVh), from],
			[beatAtVh(SKY33_BEAT, span.startVh + Math.abs(to - from) / SKY33_RATE_PER_VH), to]
		];
	});
}

export type SkyKnots = { top: Knots; bottom: Knots };

/** 시간이 흐른다는 표시: 0~60일 동안 낮 → 밤 → 낮을 코사인으로 한 번 */
function dayNightOf(day: number): number {
	return 0.5 - 0.5 * Math.cos(clamp01(day / WEATHER_DAYS) * Math.PI * 2);
}

export type Valley33State = {
	day: number;
	top: number;
	bottom: number;
	night: number;
	fade: number;
};

export function valleyState33(p: number, sky: SkyKnots): Valley33State {
	const day = piecewise(KNOTS_FLOW.day33, p);
	const totalVh = beatById(SKY33_BEAT).totalVh;
	const fadeStart = beatAtVh(SKY33_BEAT, totalVh - SKY33_FADE_VH);
	const fade = 1 - smoothstep(fadeStart, 1, p);
	return {
		day,
		top: piecewise(sky.top, p),
		bottom: piecewise(sky.bottom, p),
		night: dayNightOf(day),
		fade
	};
}

// ---------- 표지 · 끝 화면 표식(DOM 숫자 · 제목, 시제품 :1247-1306) ----------

/** 표지 숫자에서 흐려지는 끝자리 수(0.506127 → 0.506: 7 · 2 · 1) */
export const DROPPED_DIGITS = String(FULL_VALUE).length - String(TRUNCATED_VALUE).length;
const COVER_DROP_START = 0.06;
const COVER_DROP_STAGGER = 0.06;
const COVER_DROP_SPAN = 0.09;

/** drops[k]: 끝에서 k 번째 자리가 흐려진 정도 · title 제목 · shrink 숫자가 빛점으로 줆 · spread 두 실 벌어짐(모두 0~1) */
export type CoverState = { drops: number[]; title: number; shrink: number; spread: number };

export function coverState(p: number): CoverState {
	return {
		drops: Array.from({ length: DROPPED_DIGITS }, (_, k) =>
			rampP(
				p,
				COVER_DROP_START + COVER_DROP_STAGGER * k,
				COVER_DROP_START + COVER_DROP_STAGGER * k + COVER_DROP_SPAN
			)
		),
		title: rampP(p, 0.26, 0.36),
		shrink: rampP(p, 0.34, COVER.textStart - 0.02),
		spread: rampP(p, COVER.textStart - 0.04, 0.98)
	};
}

/** 동작 줄이기 정지 그림: 0.506 + 제목 + 갈라진 두 실(숫자는 줄이지 않고, 실은 사라진 세 자리 자리에서 나온다) */
export const COVER_STILL: CoverState = {
	drops: Array.from({ length: DROPPED_DIGITS }, () => 1),
	title: 1,
	shrink: 0,
	spread: 1
};

/** valley 7-5 그림이 꺼져 감 · appear 꼬리 나타남 · gather 꼬리가 한 점으로 · title 제목 */
export type FinaleState = { valley: number; appear: number; gather: number; title: number };

export function finaleState(p: number): FinaleState {
	return {
		valley: 1 - rampP(p, 0, 0.25),
		appear: rampP(p, 0.05, 0.25),
		gather: rampP(p, 0.2, 0.7),
		title: rampP(p, 0.62, 0.82)
	};
}

export type MarkState = CoverState & { alpha: number };

/** 그림 위치 · 정지 모드 → 표식 상태(null 이면 숨김) */
export function markAt(position: TrackPosition, still: boolean): MarkState | null {
	const entry = entryOf(position);
	if (entry.kind === 'cover')
		return { ...(still ? COVER_STILL : coverState(position.p)), alpha: 1 };
	if (entry.kind === 'chapter' && previousEntry(position.index).kind === 'cover' && !still)
		return { ...coverState(1), alpha: 1 - smoothstep(0, 0.6, position.p) };
	if (entry.kind === 'finale')
		return {
			drops: Array.from({ length: DROPPED_DIGITS }, () => 1),
			title: finaleState(position.p).title,
			shrink: 1,
			spread: 0,
			alpha: 1
		};
	return null;
}

// ---------- 3-1 큰 숫자(시제품 :1815-1821) ----------

export type BigNumberState = { appear: number; drops: number[] };

export function bigNumberState(p: number): BigNumberState {
	const span = beatAt('3-1', 2, 1) - beatAt('3-1', 2, 0);
	return {
		appear: rampP(p, 0, beatAt('3-1', 0, 0.35)),
		drops: Array.from({ length: DROPPED_DIGITS }, (_, k) =>
			clamp01((p - beatAt('3-1', 2, 0.12 + 0.24 * k)) / (span * 0.22))
		)
	};
}

/** 3-1 구간이면 큰 숫자 상태, 아니면 null */
export function bigNumberAt(position: TrackPosition): BigNumberState | null {
	const entry = entryOf(position);
	return entry.kind === 'beat' && entry.beatId === '3-1' ? bigNumberState(position.p) : null;
}

// ---------- 연도(시제품 yearOfBeat :2743-2774) ----------

/** 연도 숫자에 쓰는 데이터 연도(chaosData screenFigures.years) */
export type YearValues = Record<YearEvent, number | null>;
/** value 숫자 · suffix '년대' · word '오늘'(1 이면 숫자 대신) · alpha 전체(value 밖은 0~1) */
export type YearState = { value: number; suffix: number; word: number; alpha: number };

// 6-1 '1970년대'는 데이터 줄이 없는 장식 연도다(문구 대조 대상 아님, storyChecks YEAR_MARKS 주석)
const SEVENTIES = 1970;

function numberYear(value: number, suffix = 0): YearState {
	return { value, suffix, word: 0, alpha: 1 };
}

/** 비트 id 의 진행값 p 에서 연도 상태. 쓰는 데이터 연도가 없으면 null(숨김) */
export function yearOfBeat(id: string, p: number, years: YearValues): YearState | null {
	const roll = (sentence: number, q0: number, q1: number): number =>
		rampP(p, beatAt(id, sentence, q0), beatAt(id, sentence, q1));
	const rerun = years.lorenz_rerun;
	const paper = years.lorenz_paper;
	const prize = years.prize_announced;
	const retract = years.poincare_retract;
	const butterfly = years.butterfly_talk;
	switch (id) {
		case '1-3':
			return rerun === null
				? null
				: { value: rerun, suffix: 0, word: 1 - roll(4, 0, 0.35), alpha: 1 };
		case '4-5':
			return rerun === null || paper === null
				? null
				: numberYear(lerp(rerun, paper, roll(0, 0.05, 0.5)));
		case '5-1':
			return paper === null || prize === null
				? null
				: numberYear(lerp(paper, prize, roll(1, 0.05, 0.85)));
		case '5-2':
			return prize === null ? null : numberYear(prize);
		case '5-3':
			return prize === null || retract === null
				? null
				: numberYear(lerp(prize, retract, roll(5, 0.05, 0.3)));
		case '5-4':
			return retract === null || rerun === null
				? null
				: numberYear(lerp(retract, rerun, roll(5, 0.05, 0.6)));
		case '6-1':
			return rerun === null
				? null
				: numberYear(lerp(rerun, SEVENTIES, roll(0, 0.05, 0.4)), roll(0, 0.4, 0.65));
		case '6-2':
			return butterfly === null
				? null
				: numberYear(lerp(SEVENTIES, butterfly, roll(0, 0.25, 0.55)), 1 - roll(0, 0.05, 0.25));
		case '6-3':
		case '6-4':
			return butterfly === null ? null : numberYear(butterfly);
		case '7-1':
			return butterfly === null
				? null
				: { value: butterfly, suffix: 0, word: roll(0, 0.05, 0.4), alpha: 1 };
		// 7-4 끝 '오늘' → 1961(7-1 과 같은 굴림) · 맺음 문장에서 다시 '오늘'
		case '7-5':
			return rerun === null
				? null
				: { value: rerun, suffix: 0, word: 1 - roll(0, 0.05, 0.4) + roll(4, 0.05, 0.4), alpha: 1 };
		default:
			break;
	}
	const chapter = beatById(id).chapter;
	// 1장 · 7장(7-2~7-4)은 '오늘'. 숫자 칸은 앞뒤 굴림과 이어지도록 그 장의 연도를 둔다
	const value = chapter === 1 ? rerun : chapter === 7 ? butterfly : rerun;
	if (value === null) return null;
	return chapter === 1 || chapter === 7
		? { value, suffix: 0, word: 1, alpha: 1 }
		: numberYear(value);
}

/** 연도 표지 대조 대상: 이 비트에 보이는 연도를 정한 YEAR_MARKS 비트(그보다 앞이면 첫 표지) */
export function yearTargetOf(beatId: string): string {
	const order = TRACK_ENTRIES.flatMap((entry) => (entry.kind === 'beat' ? [entry.beatId] : []));
	const position = order.indexOf(beatId);
	let governing = YEAR_MARKS[0].beat;
	for (const mark of YEAR_MARKS) if (order.indexOf(mark.beat) <= position) governing = mark.beat;
	return yearMarkTarget(governing);
}

/** 그림 위치의 연도(null 이면 숨김). 표지에서는 숨기고, 장 제목 · 끝 화면은 앞 비트 끝 연도 */
export function yearAt(
	position: TrackPosition,
	years: YearValues,
	hidden: ReadonlySet<string>
): YearState | null {
	const entry = entryOf(position);
	if (entry.kind === 'cover') return null;
	const shown = (beatId: string, p: number, alpha?: number): YearState | null => {
		if (hidden.has(yearTargetOf(beatId))) return null;
		const state = yearOfBeat(beatId, p, years);
		if (state === null) return null;
		return alpha === undefined ? state : { ...state, alpha };
	};
	if (entry.kind === 'beat') return shown(entry.beatId, position.p);
	const previous = previousEntry(position.index);
	if (entry.kind === 'finale') {
		if (previous.kind !== 'beat') return null;
		return shown(previous.beatId, 1, 1 - rampP(position.p, 0, 0.3));
	}
	if (previous.kind === 'cover') return shown('1-1', 0, rampP(position.p, 0.1, 0.6));
	return previous.kind === 'beat' ? shown(previous.beatId, 1) : null;
}

// ---------- 자막 · 배지 · 캡션 ----------

/** 문장 번호: p 가 처음 넘지 않는 문장 끝 */
export function sentenceIndexOf(cuts: readonly number[], p: number): number {
	for (let index = 0; index < cuts.length; index++) if (p < cuts[index]) return index;
	return cuts.length - 1;
}

/** 표지 문장 번호(그림 구간이면 −1) */
export function coverSentenceIndex(p: number): number {
	return p < COVER.textStart ? -1 : sentenceIndexOf(COVER.cuts, p);
}

/** 글 띠 내용: key 가 바뀔 때만 새로 들어오는 연출을 한다 */
export type Subtitle = { key: string; kicker: string; heading: string; text: string };

const EMPTY_SUBTITLE: Subtitle = { key: 'none', kicker: '', heading: '', text: '' };

/** 표지: 그림 구간 뒤 표지 문장 / 장 제목: "N장" + 제목 / 비트: (배지) + 지금 문장. 대조가 어긋난 글은 비운다 */
export function subtitleAt(position: TrackPosition, hidden: ReadonlySet<string>): Subtitle {
	const entry = entryOf(position);
	if (entry.kind === 'cover') {
		const index = coverSentenceIndex(position.p);
		if (index < 0 || hidden.has(COVER_TARGET)) return { ...EMPTY_SUBTITLE, key: 'cover' };
		return { key: `cover#${index}`, kicker: '', heading: '', text: COVER.sentences[index] };
	}
	if (entry.kind === 'finale') return { ...EMPTY_SUBTITLE, key: 'finale' };
	if (entry.kind === 'chapter') {
		const chapter = CHAPTER_TEXTS[entry.chapter - 1];
		return {
			key: `chapter-${entry.chapter}`,
			kicker: `${chapter.number}장`,
			heading: chapter.title,
			text: ''
		};
	}
	const beat: Beat = beatById(entry.beatId);
	const index = sentenceIndexOf(beat.cuts, position.p);
	const key = `${beat.id}#${index}`;
	if (hidden.has(beat.id)) return { ...EMPTY_SUBTITLE, key };
	const badge = badgeOf(beat.id, index, beat.sentences.length);
	return { key, kicker: badge === null ? '' : badge, heading: '', text: beat.sentences[index] };
}

/** 캡션별 대조 대상(캡션 문구 속 숫자) */
export type CaptionTargets = ReadonlyMap<string, string>;

/** 그림 아래 캡션(없거나 대조가 어긋나면 빈 글) */
export function captionAt(
	position: TrackPosition,
	hidden: ReadonlySet<string>,
	targets: CaptionTargets
): string {
	const entry = entryOf(position);
	if (entry.kind !== 'beat') return '';
	const caption = CAPTIONS.get(entry.beatId);
	if (caption === undefined) return '';
	const target = targets.get(caption);
	return target !== undefined && hidden.has(target) ? '' : caption;
}

/** 읽기 보조기기용 구간 글(표지 제목 + 표지 문장 · 장 번호와 제목 · 비트 글) */
export function screenReaderText(entry: TrackEntry, title: string): string {
	if (entry.kind === 'cover') return `${title}\n${COVER_TEXT}`;
	if (entry.kind === 'finale') return title;
	if (entry.kind === 'chapter') {
		const chapter = CHAPTER_TEXTS[entry.chapter - 1];
		return `${chapter.number}장 ${chapter.title}`;
	}
	return beatById(entry.beatId).text;
}
