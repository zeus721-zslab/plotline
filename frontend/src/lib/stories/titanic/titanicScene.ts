// 마지막 2시간 40분 장 → 장면 · 시계(순수 함수, D-43). 시각은 시제품 v3 와 같이 1912-04-14 00:00 선박 시각부터 센 분.
// 장면 셋은 시제품 v3 그대로: night(장면 A, 별이 많은 밤 · 배가 지나감) · sinking(장면 B, 구명보트에서 본 마지막) ·
// dawn(장면 C, 새벽). 에필로그는 물속으로 내려가는 암전(dive) 뒤 장면 A 의 23:40 별하늘로 돌아와 멈춘다.
// 진행도(progress)는 장 안 장면 구간(카드 앞 빈 구간)들을 지난 정도(0~1, 구간마다 같은 몫)다.
import { CHAPTERS, type ChapterId } from './chapters.ts';
import { clamp01, lerp } from './skyData.ts';

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

function clock(hour: number, minute: number): number {
	return hour * MINUTES_PER_HOUR + minute;
}

// 장면 A(시제품 v3 SCENES[0]): 21:00 → 23:39
export const NIGHT_START = clock(21, 0);
export const NIGHT_END = clock(23, 39);
export const COLLISION_MINUTE = clock(23, 40);
// 4장: 4월 15일 00:15 → 01:45
export const SIGNALS_START = clock(24, 15);
export const SIGNALS_END = clock(25, 45);
// 장면 B(v3 SCENES[1]): 02:00 → 02:20
export const SINKING_START = clock(26, 0);
// 6장: 03:00 → 05:43. 장면 C 의 해 · 물빛 길 기준 시각은 v3 그대로 04:00 → 05:43.
export const DAWN_START = clock(27, 0);
export const DAWN_END = clock(29, 43);
export const V3_DAWN_START = clock(28, 0);
// 오로라는 6장 앞부분(03:00 → 04:00)에서 사라진다.
export const AURORA_FADE_END = clock(28, 0);
export const AURORA_MAX_ALPHA = 0.8;

// 6장 진행도 → 시각: 구간 셋(카드 셋)에 03:00 → 04:00(오로라) · 04:00 → 05:30(박명 · 금성이 떠오름) · 05:30 → 05:43
const DAWN_KEYS: Array<[number, number]> = [
	[0, DAWN_START],
	[1 / 3, AURORA_FADE_END],
	[2 / 3, clock(29, 30)],
	[1, DAWN_END]
];

// 장면 B(v3 그대로): 깜빡임 0.55~0.80 6칸, 꺼짐 → 켜짐 → 꺼짐 → 켜짐 → 꺼짐 → 암전 유지
export const FLICKER_START = 0.55;
export const FLICKER_END = 0.8;
export const FLICKER_PATTERN = [0, 1, 0, 1, 0, 0] as const;
// 깜빡이는 동안 시계는 02:17 에 멈춘다(마지막 신호).
const FLICKER_SHIP_MINUTE = 17;
const LIGHTS_CUT_AT_0200 = 0.05;
const LIGHTS_CUT_AT_0216 = 0.64;
const LIGHTS_RED_START = 0.15;
const LIGHTS_RED_END = 0.7;
// 4장 · 5장 기울기(°) · 가라앉은 깊이(m). v3 는 장면 B 하나에 [4, 13] · [3, 9].
const SIGNALS_TILT: [number, number] = [4, 6];
const SIGNALS_SINK: [number, number] = [3, 4];
const LAST_SIGNAL_TILT: [number, number] = [6, 13];
const LAST_SIGNAL_SINK: [number, number] = [4, 9];

// 1장은 별을 옅게(0.5배), 2장 첫 구간 10% 안에 원래 밝기로
const NOW_STAR_ALPHA = 0.5;
const STARS_RESTORE_SHARE = 0.1;
// 장면이 바뀌는 장: 첫 장면 구간의 이 몫 동안 검은 막이 걷힌다.
const SCENE_FADE_IN_SHARE = 0.15;
// 에필로그: 물속 암전이 끝난 뒤 첫 장면 구간의 이 몫 동안 별하늘이 다시 밝아진다.
const RETURN_FADE_SHARE = 0.4;

export type NightFrame = {
	kind: 'night';
	// 장면 A 진행도(배 위치 · 고개 들기)
	progress: number;
	minute: number;
	ship: boolean;
	starAlpha: number;
	veil: number;
};
export type SinkingFrame = {
	kind: 'sinking';
	minute: number;
	tilt: number;
	sink: number;
	red: number;
	lightsOn: boolean;
	// 불빛 꺼짐 순서값이 이 값보다 작은 불빛은 꺼져 있다.
	cut: number;
	// 깜빡임 칸(-1 = 전, FLICKER_PATTERN.length = 뒤)
	flickerCell: number;
	veil: number;
};
export type DawnFrame = { kind: 'dawn'; minute: number; veil: number };
// 물속으로 내려가는 암전(0 = 장면 C 끝, 1 = 완전히 어두움)
export type DiveFrame = { kind: 'dive'; depth: number };
export type SceneFrame = NightFrame | SinkingFrame | DawnFrame | DiveFrame;

export function smooth(value: number): number {
	const x = clamp01(value);
	return x * x * (3 - 2 * x);
}

function chapterIndexOf(id: ChapterId): number {
	return CHAPTERS.findIndex((chapter) => chapter.id === id);
}

function firstGapProgress(chapterIndex: number, progress: number): number {
	return clamp01(progress * CHAPTERS[chapterIndex].cards.length);
}

function fadeIn(chapterIndex: number, progress: number): number {
	return 1 - smooth(firstGapProgress(chapterIndex, progress) / SCENE_FADE_IN_SHARE);
}

function night(
	progress: number,
	minute: number,
	ship: boolean,
	starAlpha: number,
	veil: number
): NightFrame {
	return { kind: 'night', progress, minute, ship, starAlpha, veil };
}

/** 5장(v3 sceneBTimeline): 02:00 → 02:17 · 깜빡임 동안 02:17 · 뒤 02:18 → 02:20 */
function lastSignalFrame(progress: number, veil: number): SinkingFrame {
	const red = smooth((progress - LIGHTS_RED_START) / (LIGHTS_RED_END - LIGHTS_RED_START));
	const tilt = lerp(LAST_SIGNAL_TILT[0], LAST_SIGNAL_TILT[1], progress);
	const sink = lerp(LAST_SIGNAL_SINK[0], LAST_SIGNAL_SINK[1], progress);
	const base = { kind: 'sinking' as const, tilt, sink, red, veil };
	if (progress < FLICKER_START) {
		const shipMinute = (FLICKER_SHIP_MINUTE * progress) / FLICKER_START;
		const cut = lerp(LIGHTS_CUT_AT_0200, LIGHTS_CUT_AT_0216, clamp01(shipMinute / 16.5));
		return { ...base, minute: SINKING_START + shipMinute, lightsOn: true, cut, flickerCell: -1 };
	}
	if (progress < FLICKER_END) {
		const cellShare = (FLICKER_END - FLICKER_START) / FLICKER_PATTERN.length;
		const flickerCell = Math.min(
			FLICKER_PATTERN.length - 1,
			Math.floor((progress - FLICKER_START) / cellShare)
		);
		return {
			...base,
			minute: SINKING_START + FLICKER_SHIP_MINUTE,
			lightsOn: FLICKER_PATTERN[flickerCell] === 1,
			cut: LIGHTS_CUT_AT_0216,
			flickerCell
		};
	}
	const shipMinute = 18 + (2 * (progress - FLICKER_END)) / (1 - FLICKER_END);
	return {
		...base,
		minute: SINKING_START + shipMinute,
		lightsOn: false,
		cut: LIGHTS_CUT_AT_0216,
		flickerCell: FLICKER_PATTERN.length
	};
}

/** 4장: 불빛 거의 다 켜짐(꺼짐 순서값 0 → v3 02:00 값) · 기울기 4°→6° · sink 3→4 */
function signalsFrame(progress: number, veil: number): SinkingFrame {
	return {
		kind: 'sinking',
		minute: lerp(SIGNALS_START, SIGNALS_END, progress),
		tilt: lerp(SIGNALS_TILT[0], SIGNALS_TILT[1], progress),
		sink: lerp(SIGNALS_SINK[0], SIGNALS_SINK[1], progress),
		red: 0,
		lightsOn: true,
		cut: lerp(0, LIGHTS_CUT_AT_0200, progress),
		flickerCell: -1,
		veil
	};
}

export function dawnMinute(progress: number): number {
	for (let index = 1; index < DAWN_KEYS.length; index += 1) {
		const [toProgress, toMinute] = DAWN_KEYS[index];
		if (progress <= toProgress) {
			const [fromProgress, fromMinute] = DAWN_KEYS[index - 1];
			return lerp(
				fromMinute,
				toMinute,
				clamp01((progress - fromProgress) / (toProgress - fromProgress))
			);
		}
	}
	return DAWN_END;
}

const NOW_INDEX = chapterIndexOf('now');
const STARS_INDEX = chapterIndexOf('stars');
const COLLISION_INDEX = chapterIndexOf('collision');
const SIGNALS_INDEX = chapterIndexOf('signals');
const LAST_SIGNAL_INDEX = chapterIndexOf('last-signal');
const DAWN_INDEX = chapterIndexOf('dawn');
const EPILOGUE_INDEX = chapterIndexOf('epilogue');

/** 표지(장 -1): 장면 A 21:00 하늘 · 바다, 배 없음 */
export const COVER_FRAME: NightFrame = night(0, NIGHT_START, false, 1, 0);

/**
 * 장(index, 표지는 -1) · 진행도 → 그릴 장면.
 * dive: 에필로그 앞 물속 암전 구간을 지난 정도(0~1). leaving: 다음 장이 다른 장면일 때 이 장을 떠나는 정도(0~1, 검은 막).
 */
export function frameAt(chapterIndex: number, progress: number, dive = 1, leaving = 0): SceneFrame {
	const p = clamp01(progress);
	const out = clamp01(leaving);
	switch (chapterIndex) {
		case NOW_INDEX:
			return night(0, NIGHT_START, false, lerp(1, NOW_STAR_ALPHA, smooth(p)), out);
		case STARS_INDEX: {
			const restore = smooth(firstGapProgress(STARS_INDEX, p) / STARS_RESTORE_SHARE);
			const starAlpha = lerp(NOW_STAR_ALPHA, 1, restore);
			return night(p, lerp(NIGHT_START, NIGHT_END, p), true, starAlpha, out);
		}
		case COLLISION_INDEX:
			return night(1, COLLISION_MINUTE, false, 1, out);
		case SIGNALS_INDEX:
			return signalsFrame(p, Math.max(fadeIn(SIGNALS_INDEX, p), out));
		case LAST_SIGNAL_INDEX:
			return lastSignalFrame(p, out);
		case DAWN_INDEX:
			return { kind: 'dawn', minute: dawnMinute(p), veil: Math.max(fadeIn(DAWN_INDEX, p), out) };
		case EPILOGUE_INDEX: {
			if (dive < 1) return { kind: 'dive', depth: clamp01(dive) };
			const veil = 1 - smooth(firstGapProgress(EPILOGUE_INDEX, p) / RETURN_FADE_SHARE);
			return night(1, COLLISION_MINUTE, false, 1, veil);
		}
		default:
			return COVER_FRAME;
	}
}

/** 동작 줄이기: 장마다 정지 구도 1장(장면 진행도). 2장 · 5장은 v3 정지 구도(0.45 · 1), 6장은 v3 0.85(05:28.5) 무렵. */
export const STILL_PROGRESS: Record<ChapterId, number> = {
	now: 1,
	stars: 0.45,
	collision: 1,
	signals: 0.5,
	'last-signal': 1,
	dawn: 0.66,
	epilogue: 1
};

export function stillFrameAt(chapterIndex: number): SceneFrame {
	if (chapterIndex < 0 || chapterIndex >= CHAPTERS.length) return COVER_FRAME;
	const frame = frameAt(chapterIndex, STILL_PROGRESS[CHAPTERS[chapterIndex].id]);
	// 정지 구도에는 검은 막을 두지 않는다.
	return frame.kind === 'dive' ? frame : { ...frame, veil: 0 };
}

/** 장면이 바뀌는 장 경계(다음 장이 다른 장면이면 떠나는 동안 검은 막을 내린다). 에필로그는 물속 암전이 따로 있다. */
export function changesSceneAfter(chapterIndex: number): boolean {
	return chapterIndex === COLLISION_INDEX || chapterIndex === LAST_SIGNAL_INDEX;
}

export function formatClock(minute: number): string {
	const total = Math.floor(minute) % MINUTES_PER_DAY;
	const hour = Math.floor(total / MINUTES_PER_HOUR);
	return `${String(hour).padStart(2, '0')}:${String(total % MINUTES_PER_HOUR).padStart(2, '0')}`;
}

/** 시계: 1장 · 에필로그 · 표지는 숨김(1912년 밖의 시간), 나머지는 장면 시각 */
export function clockFor(chapterIndex: number, frame: SceneFrame): string | null {
	if (chapterIndex <= NOW_INDEX || chapterIndex === EPILOGUE_INDEX) return null;
	if (frame.kind === 'dive') return null;
	return formatClock(frame.minute);
}

/** 오로라 세기(v3 최대 0.8): 03:00 → 04:00 사이에 사라진다. */
export function auroraAlpha(minute: number): number {
	return AURORA_MAX_ALPHA * (1 - smooth((minute - DAWN_START) / (AURORA_FADE_END - DAWN_START)));
}

// v3 물빛 길: 장면 C 진행도 0.5 → 0.85(04:00 → 05:43 기준)
const GLITTER_START = 0.5;
const GLITTER_FULL = 0.85;
// v3 해 쪽 빛이 다 차는 진행도
export const DAWN_FULL_PROGRESS = 0.85;

/** v3 장면 C 진행도(04:00 → 05:43) */
export function v3DawnProgress(minute: number): number {
	return clamp01((minute - V3_DAWN_START) / (DAWN_END - V3_DAWN_START));
}

export function glitterAlpha(minute: number): number {
	return smooth((v3DawnProgress(minute) - GLITTER_START) / (GLITTER_FULL - GLITTER_START));
}

/** 상상 표시(오로라): v3 와 같게 최대 세기의 5% 를 넘을 때 */
export function showsAurora(frame: SceneFrame): boolean {
	return frame.kind === 'dawn' && auroraAlpha(frame.minute) > 0.05 * AURORA_MAX_ALPHA;
}

/** 장면 구간(카드 앞 빈 구간)들을 지난 정도: 구간마다 (판정선 − 윗변) / 높이를 0~1 로 묶어 평균한다(5편과 같음). */
export function chapterProgress(line: number, gaps: { top: number; height: number }[]): number {
	if (gaps.length === 0) return 1;
	const passed = gaps.reduce(
		(sum, gap) => sum + (gap.height > 0 ? clamp01((line - gap.top) / gap.height) : 1),
		0
	);
	return passed / gaps.length;
}
