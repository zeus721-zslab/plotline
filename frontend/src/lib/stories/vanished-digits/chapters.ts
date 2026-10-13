// 사라진 세 자리 구성 · 길이(순수 함수): 표지 · 7장 32비트 · 끝 화면의 스크롤 길이(vh)와 비트 안 문장 구간.
// 시제품 공식 그대로(D-47 D2, 시제품 chaos-full.src.html :385-445): 비트 = 문장 수 × 60 + 80 (+ 3-3 추가 길이)vh,
// 문장 구간 = 최소 60vh + 여분 80vh 를 글자 수 비율로 나눈 몫. 트랙은 표지가 첫 구간, 끝 화면이 마지막 구간이다(D-47 D11).
// 길이는 CSS vh 그대로 둔다(D-47 D3, story/beatTrack.ts).
import { splitSentences } from '../../story/sentences.ts';
import type { CopySource } from '../../story/storyConfig.ts';
import { CHAPTER_TEXTS, COVER_TEXT } from './storyText.ts';

/** 문장 하나가 차지하는 최소 스크롤 길이(vh) */
export const SENTENCE_MIN_VH = 60;
// 비트마다 문장 몫에 나눠 주는 여분(vh)
const BEAT_EXTRA_VH = 80;
// 표지: 앞 120vh 는 글 없이 그림만(숫자 → 세 자리 사라짐 → 제목 → 빛점), 뒤는 표지 문장마다 60vh + 여분 20vh(글자 수 비율)
const COVER_PICTURE_VH = 120;
const COVER_EXTRA_VH = 20;
/** 장 제목 구간 · 끝 화면(문장 없음, 제목만) · 끝 화면 뒤 여백(끝 화면이 p 1 에 닿도록, 트랙 구간 아님) 길이(vh) */
export const CHAPTER_VH = 90;
export const FINALE_VH = 150;
export const END_VH = 100;

// ---------- 3-3 하늘 시간표(시제품 STEP 139, :387-402) ----------
// 맑음 값이 스크롤 1vh 당 SKY33_RATE_PER_VH 를 넘지 않게 10일 구간마다 스크롤 길이를 정했다. 구간 사이 멈춤 SKY33_PAUSE_VH.
// startVh · endVh 는 3-3 시작 기준 스크롤 위치(vh). 하늘 대표값(맑음)은 chaosCompute.ts skyAnchors.
export const SKY33_BEAT = '3-3';
export const SKY33_RATE_PER_VH = 0.008;
export const SKY33_PAUSE_VH = 15;
export type SkySpan = { fromDay: number; toDay: number; startVh: number; endVh: number };
export const SKY33_SCHEDULE: readonly SkySpan[] = [
	// 위 0.447→0.312 · 아래 0.447→0.312 (문장 6)
	{ fromDay: 0, toDay: 10, startVh: 413.2, endVh: 430.2 },
	// 위 0.312→0.820 · 아래 0.312→0.819 (문장 6)
	{ fromDay: 10, toDay: 20, startVh: 445.2, endVh: 508.7 },
	// 위 0.820→0.226 · 아래 0.819→0.222 (문장 7)
	{ fromDay: 20, toDay: 30, startVh: 523.7, endVh: 598.4 },
	// 위 0.226→0.508 · 아래 0.222→0.551 (문장 7)
	{ fromDay: 30, toDay: 40, startVh: 613.4, endVh: 654.6 },
	// 위 0.508→0.508 · 아래 0.551→0.884 (문장 7)
	{ fromDay: 40, toDay: 50, startVh: 669.6, endVh: 711.3 },
	// 위 0.508→0.870 · 아래 0.884→0.184 (문장 7)
	{ fromDay: 50, toDay: 60, startVh: 726.3, endVh: 813.9 }
];
/** 3-3 문장 6(0→20일) · 문장 7(20→60일)이 끝나는 자리(3-3 시작 기준 vh). 두 문장 사이는 멈춤을 반씩 나누고, 문장 7 끝에도 같은 여유 */
export const SKY33_SENTENCE_ENDS: ReadonlyMap<number, number> = new Map([
	[6, SKY33_SCHEDULE[1].endVh + SKY33_PAUSE_VH / 2],
	[7, SKY33_SCHEDULE[5].endVh + SKY33_PAUSE_VH / 2]
]);

export type SentenceLayout = {
	sentences: string[];
	separators: string[];
	// 문장마다 끝나는 진행값(0~1, 마지막은 1)
	cuts: number[];
	// 이 구간 스크롤 길이(vh)
	totalVh: number;
};

export type Beat = SentenceLayout & {
	// 장-비트(예: 3-3)
	id: string;
	chapter: number;
	text: string;
	// 3-3 하늘 시간표 때문에 늘린 길이(vh). 나머지 비트는 0
	addedVh: number;
};

export type Chapter = { number: number; title: string; beats: Beat[] };

function cutsOf(spans: number[], startVh: number, totalVh: number): number[] {
	const cuts: number[] = [];
	let accumulated = startVh;
	for (const span of spans) {
		accumulated += span;
		cuts.push(accumulated / totalVh);
	}
	cuts[cuts.length - 1] = 1;
	return cuts;
}

function characterCount(sentence: string): number {
	return Array.from(sentence).length;
}

/** 문장 몫(vh): 최소 60 + 여분을 글자 수 비율로 */
function sentenceSpans(sentences: string[], extraVh: number): number[] {
	const lengths = sentences.map(characterCount);
	const totalLength = lengths.reduce((sum, length) => sum + length, 0);
	return lengths.map((length) => SENTENCE_MIN_VH + (extraVh * length) / totalLength);
}

/** 3-3 문장 6 · 7 은 하늘 시간표가 들어가도록 모자란 만큼만 늘린다. 늘린 합(vh)을 돌려주고 spans 를 고친다 */
function stretchForSky(spans: number[]): number {
	let added = 0;
	let start = 0;
	spans.forEach((span, index) => {
		const end = SKY33_SENTENCE_ENDS.get(index);
		if (end !== undefined) {
			const more = Math.max(0, end - (start + span));
			spans[index] += more;
			added += more;
		}
		start += spans[index];
	});
	return added;
}

function layoutBeat(id: string, chapter: number, text: string): Beat {
	const { sentences, separators } = splitSentences(text);
	const spans = sentenceSpans(sentences, BEAT_EXTRA_VH);
	const addedVh = id === SKY33_BEAT ? stretchForSky(spans) : 0;
	const totalVh = sentences.length * SENTENCE_MIN_VH + BEAT_EXTRA_VH + addedVh;
	return {
		id,
		chapter,
		text,
		sentences,
		separators,
		cuts: cutsOf(spans, 0, totalVh),
		totalVh,
		addedVh
	};
}

export const CHAPTERS: Chapter[] = CHAPTER_TEXTS.map((chapter) => ({
	number: chapter.number,
	title: chapter.title,
	beats: chapter.beats.map((beat) => layoutBeat(beat.id, chapter.number, beat.text))
}));

/** 화면 순서대로 모든 비트 */
export const BEATS: Beat[] = CHAPTERS.flatMap((chapter) => chapter.beats);

/** 표지: 그림 구간(textStart 앞) 뒤에 표지 문장. cuts 는 표지 전체 기준 진행값 */
export type CoverLayout = SentenceLayout & { textStart: number };

function layoutCover(): CoverLayout {
	const { sentences, separators } = splitSentences(COVER_TEXT);
	const textVh = sentences.length * SENTENCE_MIN_VH + COVER_EXTRA_VH;
	const totalVh = COVER_PICTURE_VH + textVh;
	return {
		sentences,
		separators,
		cuts: cutsOf(sentenceSpans(sentences, COVER_EXTRA_VH), COVER_PICTURE_VH, totalVh),
		totalVh,
		textStart: COVER_PICTURE_VH / totalVh
	};
}

export const COVER: CoverLayout = layoutCover();

// ---------- 트랙 ----------

/** 트랙 구간(story/beatTrack.ts 에 vh 를 넘긴다): 표지 · (장 제목 · 그 장 비트들) × 7 · 끝 화면 */
export type TrackEntry =
	| { kind: 'cover'; vh: number }
	| { kind: 'chapter'; vh: number; chapter: number }
	| { kind: 'beat'; vh: number; beatId: string }
	| { kind: 'finale'; vh: number };

export const TRACK_ENTRIES: TrackEntry[] = [
	{ kind: 'cover', vh: COVER.totalVh },
	...CHAPTERS.flatMap((chapter): TrackEntry[] => [
		{ kind: 'chapter', vh: CHAPTER_VH, chapter: chapter.number },
		...chapter.beats.map((beat): TrackEntry => ({
			kind: 'beat',
			vh: beat.totalVh,
			beatId: beat.id
		}))
	]),
	{ kind: 'finale', vh: FINALE_VH }
];

// ---------- 비트 안 진행값(시제품 at · beatAt · beatAtVh, :503-507 · :1077-1083) ----------

const BEAT_BY_ID: ReadonlyMap<string, Beat> = new Map(BEATS.map((beat) => [beat.id, beat]));

export function beatById(id: string): Beat {
	const found = BEAT_BY_ID.get(id);
	if (found === undefined) throw new Error(`${id} 비트가 없다`);
	return found;
}

/** 비트 id 의 sentence 번째 문장 안 위치 q(0~1) → 비트 진행값 p */
export function beatAt(id: string, sentence: number, q: number): number {
	const beat = beatById(id);
	if (sentence >= beat.sentences.length)
		throw new Error(`${id} 에 ${sentence + 1}번째 문장이 없다`);
	const start = sentence === 0 ? 0 : beat.cuts[sentence - 1];
	return start + (beat.cuts[sentence] - start) * q;
}

/** 비트 시작 기준 vh → 비트 진행값 p */
export function beatAtVh(id: string, vh: number): number {
	return vh / beatById(id).totalVh;
}

const CHECKED_ON = '2026-10-14 확인';

/** 문구 출처(출처 절): 데이터 묶음과 대조하지 않는 문장의 근거(표시만 한다) */
export const CHAPTER_COPY_SOURCES: CopySource[] = [
	{
		id: 'aps-lorenz-boyhood',
		title: `APS News 2003, Lorenz and the Butterfly Effect(2-1 집 앞 온도계 기록 · 군 일기예보관 · MIT) · ${CHECKED_ON}`,
		url: 'https://www.aps.org/apsnews/2003/01/lorenz-butterfly-effect-1961'
	},
	{
		id: 'howstuffworks-machine-fault',
		title: `HowStuffWorks, How Chaos Theory Works(2-6 처음에 컴퓨터 고장을 의심) · ${CHECKED_ON}`,
		url: 'https://science.howstuffworks.com/math-concepts/chaos-theory3.htm'
	},
	{
		id: 'aps-lorenz-printout',
		title: `APS News 2003, Lorenz and the Butterfly Effect(3-1 출력지는 공간을 아끼려고 세 자리만 찍음 · 차이를 사소하다고 여김) · ${CHECKED_ON}`,
		url: 'https://www.aps.org/apsnews/2003/01/lorenz-butterfly-effect-1961'
	},
	{
		id: 'lorenz-1963-variables',
		title: `Lorenz 1963, Deterministic Nonperiodic Flow(4-2 세 변수의 뜻) · ${CHECKED_ON}`,
		url: 'https://doi.org/10.1175/1520-0469(1963)020<0130:DNF>2.0.CO;2'
	},
	{
		id: 'poincare-editor-question',
		title: `arXiv 2106.07269(5-3 편집자 질문이 오류 발견의 계기) · ${CHECKED_ON}`,
		url: 'https://arxiv.org/abs/2106.07269'
	},
	{
		id: 'poincare-science-and-method',
		title: `arXiv 2212.12339(5-4 『과학과 방법』의 예측 불가능 문장) · ${CHECKED_ON}`,
		url: 'https://arxiv.org/abs/2212.12339'
	},
	{
		id: 'hilborn-title-alliteration',
		title: `Hilborn 2004, Sea gulls, butterflies, and grasshoppers(6-2 진행자가 제목을 대신 지음 · 두운) · ${CHECKED_ON}`,
		url: 'https://doi.org/10.1119/1.1636492'
	},
	{
		id: 'hilborn-prevent-tornado',
		title: `Hilborn 2004(6-3 날갯짓이 토네이도를 막을 수도 있다 — Lorenz, The Essence of Chaos(1995) 부록 1 인용) · ${CHECKED_ON}`,
		url: 'https://doi.org/10.1119/1.1636492'
	},
	{
		id: 'lorenz-1963-butterfly-shape',
		title: `Lorenz 1963, Deterministic Nonperiodic Flow(6-4 끌개가 나비 날개를 닮음) · ${CHECKED_ON}`,
		url: 'https://doi.org/10.1175/1520-0469(1963)020<0130:DNF>2.0.CO;2'
	}
];
