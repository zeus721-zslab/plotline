// 넘을 수 없는 선 자막 · 화면 표기(순수 함수, 시제품 flow.src.html 자막 엔진 + 크롬 :4718-4903).
// 자막은 한 문장씩 같은 칸에 겹쳐 놓고, 새 문장은 장마다 다른 연출로 SUB_ENTER_MS 안에 읽을 수 있게 된다. 바뀌기 전 문장은 SUB_EXIT_MS 안에 사라진다.
// 오른쪽 위 연도는 비트마다 정해지고(YEAR_MARKS), 바뀌면 YEAR_ROLL_MS 동안 숫자가 굴러간다. 장 사이 암전 구간에는 장 제목 카드가 뜬다.
import { BEATS, CHAPTERS, YEAR_MARKS, yearMarkTarget } from './chapters.ts';
import type { TrackState } from './lineScene.ts';

export const SUB_ENTER_MS = 200;
export const SUB_EXIT_MS = 100;
export const YEAR_ROLL_MS = 700;
// 자막 기본 그림자(테마 --sub-shadow 와 같은 값). 연출 중 빛 번짐은 이 뒤에 덧붙인다
export const SUB_SHADOW =
	'0 1px 2px rgba(0, 0, 0, 0.95), 0 0 3px rgba(0, 0, 0, 0.9), 0 0 18px rgba(0, 0, 0, 0.78)';
// 등장 연출 감속 지수(4제곱: 앞 60% 안에 읽을 수 있는 상태가 된다) · 불투명도가 1 이 되는 진행 배율
const ENTER_EASE_POWER = 4;
const ENTER_OPACITY_RATE = 2.5;
// 분필 연출: 왼쪽부터 드러나는 속도 배율(앞 60% 안에 다 드러난다)과 감속 지수
const CHALK_REVEAL_RATE = 1.6;
const CHALK_REVEAL_POWER = 3;
// 물결 연출: 노이즈 세로 주파수가 흔들리는 주기(ms 나눔 값)
const RIPPLE_WOBBLE_MS = 60;

export type SubStyle = 'bloom' | 'lamp' | 'dawn' | 'settle' | 'chalk' | 'door' | 'roll' | 'ripple';

// 장별 자막 등장 연출(성격만 다르고 길이는 모두 SUB_ENTER_MS 안)
const SUB_STYLE: Record<number, SubStyle> = {
	1: 'bloom',
	2: 'lamp',
	3: 'dawn',
	4: 'settle',
	5: 'chalk',
	6: 'door',
	7: 'roll',
	8: 'ripple',
	9: 'bloom'
};

export function subStyleOf(chapter: number): SubStyle | null {
	return chapter in SUB_STYLE ? SUB_STYLE[chapter] : null;
}

/** 자막 한 프레임의 인라인 스타일. 빈 문자열은 스타일시트 값(기본 그림자 등)을 쓴다는 뜻 */
export type SubFrame = {
	opacity: number;
	filter: string;
	transform: string;
	textShadow: string;
	clipPath: string;
	// 물결 연출일 때 SVG 필터 값(변위 배율 · 노이즈 주파수)
	ripple: { scale: string; frequency: string } | null;
	done: boolean;
};

/** 연출이 끝났거나 동작 줄이기: 꾸밈 없이 다 보인다 */
export const SETTLED_FRAME: SubFrame = {
	opacity: 1,
	filter: 'none',
	transform: 'none',
	textShadow: '',
	clipPath: 'none',
	ripple: null,
	done: true
};

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** 새 문장 등장 연출(elapsedMs: 문장이 바뀐 뒤 시간, now: 물결 흔들림 기준 시각 ms) */
export function subtitleFrame(style: SubStyle | null, elapsedMs: number, now: number): SubFrame {
	const e = clamp01(elapsedMs / SUB_ENTER_MS);
	const rest = Math.pow(1 - e, ENTER_EASE_POWER);
	const frame: SubFrame = {
		...SETTLED_FRAME,
		opacity: clamp01(e * ENTER_OPACITY_RATE),
		done: e >= 1
	};
	if (frame.done) return frame;
	switch (style) {
		case 'bloom':
			// 빛 번짐 속에서 선명해짐
			frame.filter = `blur(${(rest * 6).toFixed(2)}px)`;
			frame.textShadow = `${SUB_SHADOW}, 0 0 ${(8 + rest * 24).toFixed(1)}px rgba(255,226,190,${(0.6 * rest).toFixed(3)})`;
			break;
		case 'roll':
			// 아래에서 굴러 올라옴
			frame.transform = `perspective(520px) translateY(${(rest * 16).toFixed(2)}px) rotateX(${(rest * 60).toFixed(2)}deg)`;
			break;
		case 'ripple':
			// 물결 왜곡 후 잔잔해짐. 변위 최대값은 scale 의 절반
			frame.ripple = {
				scale: (rest * 16).toFixed(2),
				frequency: `0.012 ${(0.08 + 0.03 * Math.sin(now / RIPPLE_WOBBLE_MS)).toFixed(4)}`
			};
			frame.filter = 'url(#line-ripple)';
			break;
		case 'lamp':
			// 램프가 켜지듯 호박색 번짐에서 선명해짐
			frame.filter = `blur(${(rest * 4).toFixed(2)}px)`;
			frame.textShadow = `${SUB_SHADOW}, 0 0 ${(10 + rest * 20).toFixed(1)}px rgba(255,180,90,${(0.75 * rest).toFixed(3)})`;
			break;
		case 'dawn':
			// 빛이 차오르듯 살짝 커지며 맺힘
			frame.transform = `scale(${(1 - rest * 0.035).toFixed(4)})`;
			frame.textShadow = `${SUB_SHADOW}, 0 0 ${(6 + rest * 16).toFixed(1)}px rgba(255,236,210,${(0.5 * rest).toFixed(3)})`;
			break;
		case 'settle':
			// 먼지가 내려앉듯 위에서 가라앉음
			frame.transform = `translateY(${(-rest * 10).toFixed(2)}px)`;
			frame.filter = `blur(${(rest * 3).toFixed(2)}px)`;
			break;
		case 'chalk': {
			// 분필로 쓰듯 왼쪽부터 드러남
			const reveal = Math.pow(1 - clamp01(e * CHALK_REVEAL_RATE), CHALK_REVEAL_POWER);
			frame.clipPath = `inset(-20% ${(reveal * 100).toFixed(2)}% -20% 0)`;
			frame.textShadow = `${SUB_SHADOW}, 0 0 ${(6 + rest * 12).toFixed(1)}px rgba(210,255,230,${(0.55 * rest).toFixed(3)})`;
			break;
		}
		case 'door':
			// 문틈으로 밀려 들어오듯 옆에서
			frame.transform = `translateX(${(-rest * 12).toFixed(2)}px)`;
			frame.filter = `blur(${(rest * 2.5).toFixed(2)}px)`;
			break;
		case null:
			break;
	}
	return frame;
}

/** 바뀌기 전 문장의 불투명도: 바뀔 때의 불투명도에서 SUB_EXIT_MS 안에 0 으로 */
export function exitOpacity(startOpacity: number, elapsedMs: number): number {
	const e = clamp01(elapsedMs / SUB_EXIT_MS);
	return e >= 1 ? 0 : Math.min(startOpacity, 1 - e);
}

// ---------- 정직성 표기(오른쪽 아래) ----------

const NOTE_EXPLAIN = '설명 그림';
const NOTE_MEASURED = '실제 측정값 S=2.697(각본 한계 2)을 게임 점수로 환산';
const NOTE_OF_BEAT: Record<string, string> = {
	'1-2': NOTE_EXPLAIN,
	'1-3': NOTE_EXPLAIN,
	'5-3': NOTE_EXPLAIN,
	'5-4': NOTE_EXPLAIN,
	'5-5': NOTE_EXPLAIN,
	'5-6': NOTE_EXPLAIN,
	'7-2': NOTE_MEASURED,
	'7-3': NOTE_MEASURED,
	'8-3': NOTE_EXPLAIN
};

export function noteOf(state: TrackState): string {
	if (state.kind !== 'beat') return '';
	const id = BEATS[state.beatIndex].beat.id;
	return id in NOTE_OF_BEAT ? NOTE_OF_BEAT[id] : '';
}

// ---------- 연도 ----------

/** 연도 표기 하나와 그 대조 대상 */
export type YearMark = { year: number; target: string };

function buildBeatYears(): YearMark[] {
	const byBeat = new Map(YEAR_MARKS.map((mark) => [mark.beat, mark]));
	const firstMark = YEAR_MARKS[0];
	let running: YearMark = { year: firstMark.year, target: yearMarkTarget(firstMark.beat) };
	return BEATS.map(({ beat }) => {
		const mark = byBeat.get(beat.id);
		if (mark !== undefined) running = { year: mark.year, target: yearMarkTarget(mark.beat) };
		return running;
	});
}

/** BEATS 순서대로 비트의 연도 */
export const BEAT_YEARS: YearMark[] = buildBeatYears();

/** 장마다 첫 비트의 연도(장 제목 카드) */
export function chapterYear(chapter: number): YearMark {
	const index = BEATS.findIndex(({ chapterIndex }) => CHAPTERS[chapterIndex].number === chapter);
	return BEAT_YEARS[index];
}

/** 지금 장면의 연도: 비트는 그 비트, 암전 구간은 다음 장 첫 비트(마지막 장 뒤는 마지막 비트) */
export function yearOf(state: TrackState): YearMark {
	if (state.kind === 'beat') return BEAT_YEARS[state.beatIndex];
	if (state.next !== 0) return chapterYear(state.next);
	return BEAT_YEARS[BEAT_YEARS.length - 1];
}

function easeInOut(t: number): number {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 연도가 바뀌면 숫자가 차례로 굴러간다(예: 1982 → 1905) */
export function rollingYear(from: number, to: number, elapsedMs: number): number {
	const e = from === to ? 1 : clamp01(elapsedMs / YEAR_ROLL_MS);
	return Math.round(from + (to - from) * easeInOut(e));
}

// ---------- 장 제목 카드 ----------

function smooth(edge0: number, edge1: number, value: number): number {
	const t = clamp01((value - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

/** 장 제목 카드: 장 사이 암전 구간 가운데에서만 보인다(첫 장 앞은 처음부터) */
export function chapterCardAlpha(state: TrackState): number {
	if (state.kind !== 'gap' || state.next === 0) return 0;
	const enter = state.prev === 0 ? 1 : smooth(0.2, 0.34, state.p);
	return enter * (1 - smooth(0.62, 0.78, state.p));
}

/** 장 바로가기에서 켤 장: 비트는 그 장, 암전 구간은 다음 장(없으면 앞 장) */
export function navChapterOf(state: TrackState): number {
	if (state.kind === 'beat') return state.chapter;
	return state.next !== 0 ? state.next : state.prev;
}
