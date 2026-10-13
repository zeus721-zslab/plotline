// 넘을 수 없는 선 스크롤 → 장면 상태(순수 함수, 시제품 flow.src.html 문장 구간 · 스크롤 구간 :143-225).
// 이야기 구간(track)은 장 사이 암전 구간(gap: 장 제목 카드)과 비트 구간(beat)이 번갈아 놓이고, 높이는 vh 를 화면 높이 px 로 바꿔 둔다.
// 비트 안 진행값 p 를 문장마다 "글자 수 + 16" 가중치로 나눠(cuts, 문장마다 최소 SENTENCE_MIN_VH) 지금 문장을 고르고, 그림은 "문장 k 의 시작~끝" 진행값으로 문장과 맞물린다.
import { BEATS, CHAPTERS, SENTENCE_MIN_VH } from './chapters.ts';
import { splitSentences } from './sentences.ts';

// 장 사이 암전 구간 · 첫 장 앞(장 제목만 보이는 구간) · 마지막 장 뒤 길이(vh)
const GAP_VH = 90;
const LEAD_VH = 70;
const END_VH = 100;
// 짧은 문장도 읽을 스크롤 거리를 갖도록 글자 수에 더하는 값
const SENTENCE_WEIGHT_PAD = 16;
const PERCENT = 100;

/** 장 번호 0 = 없음(첫 장 앞 · 마지막 장 뒤) */
export type Entry =
	| { kind: 'gap'; vh: number; prev: number; next: number }
	| { kind: 'beat'; vh: number; beatIndex: number; chapter: number; index: number };

function buildEntries(): Entry[] {
	const entries: Entry[] = [];
	const lastChapter = CHAPTERS[CHAPTERS.length - 1].number;
	for (const chapter of CHAPTERS) {
		const first = chapter.number === CHAPTERS[0].number;
		entries.push({
			kind: 'gap',
			vh: first ? LEAD_VH : GAP_VH,
			prev: first ? 0 : chapter.number - 1,
			next: chapter.number
		});
		chapter.beats.forEach((beat, index) => {
			const beatIndex = BEATS.findIndex((entry) => entry.beat.id === beat.id);
			entries.push({ kind: 'beat', vh: beat.heightVh, beatIndex, chapter: chapter.number, index });
		});
	}
	entries.push({ kind: 'gap', vh: END_VH, prev: lastChapter, next: 0 });
	return entries;
}

export const ENTRIES: Entry[] = buildEntries();

/** 장마다 비트 수 */
export const BEAT_COUNT_OF_CHAPTER = new Map<number, number>(
	CHAPTERS.map((chapter) => [chapter.number, chapter.beats.length])
);

/** 구간 배치(px): 구간마다 윗변 · 높이, 장 첫 비트의 윗변 */
export type TrackLayout = {
	tops: number[];
	heights: number[];
	chapterTops: Map<number, number>;
	total: number;
};

export function layoutTrack(viewportHeight: number): TrackLayout {
	const tops: number[] = [];
	const heights: number[] = [];
	const chapterTops = new Map<number, number>();
	let top = 0;
	for (const entry of ENTRIES) {
		const height = Math.round((entry.vh * viewportHeight) / PERCENT);
		tops.push(top);
		heights.push(height);
		if (entry.kind === 'beat' && entry.index === 0) chapterTops.set(entry.chapter, top);
		top += height;
	}
	return { tops, heights, chapterTops, total: top };
}

/**
 * 지금 장면. beat: s = 장 안 비트 번호 + p, local = 장 첫 비트 윗변부터 스크롤한 거리(px, 먼지 시차).
 * gap: prevLocal = 앞 장이 꺼지는 동안 그리는 앞 장의 local(gap 윗변 − 앞 장 첫 비트 윗변).
 */
export type TrackState =
	| {
			kind: 'beat';
			entryIndex: number;
			beatIndex: number;
			chapter: number;
			index: number;
			p: number;
			s: number;
			local: number;
	  }
	| { kind: 'gap'; entryIndex: number; p: number; prev: number; next: number; prevLocal: number };

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** scrollY: 이야기 구간 윗변 기준 스크롤 위치(px). 구간 앞은 첫 구간 p 0, 뒤는 마지막 구간 p 1 */
export function resolveTrack(scrollY: number, layout: TrackLayout): TrackState {
	let found = ENTRIES.length - 1;
	for (let index = 0; index < ENTRIES.length; index++) {
		if (scrollY < layout.tops[index] + layout.heights[index]) {
			found = index;
			break;
		}
	}
	const entry = ENTRIES[found];
	const top = layout.tops[found];
	const p = clamp01((scrollY - top) / layout.heights[found]);
	if (entry.kind === 'beat') {
		const chapterTop = layout.chapterTops.get(entry.chapter);
		return {
			kind: 'beat',
			entryIndex: found,
			beatIndex: entry.beatIndex,
			chapter: entry.chapter,
			index: entry.index,
			p,
			s: entry.index + p,
			local: chapterTop === undefined ? 0 : scrollY - chapterTop
		};
	}
	const prevTop = entry.prev === 0 ? undefined : layout.chapterTops.get(entry.prev);
	return {
		kind: 'gap',
		entryIndex: found,
		p,
		prev: entry.prev,
		next: entry.next,
		prevLocal: prevTop === undefined ? 0 : top - prevTop
	};
}

/** 구간 entryIndex 의 진행값 p 에 해당하는 이야기 구간 기준 스크롤 위치(px). 화면 크기가 바뀐 뒤 같은 장면으로 되돌릴 때 쓴다 */
export function trackScrollFor(entryIndex: number, p: number, layout: TrackLayout): number {
	return layout.tops[entryIndex] + p * layout.heights[entryIndex];
}

// ---------- 문장 구간 ----------

export type BeatSentences = { sentences: string[]; separators: string[]; cuts: number[] };

/**
 * 문장마다 비트 안 몫(합 1). 가중치대로 나누되 minimumShare 보다 작은 문장은 minimumShare 로 올리고,
 * 남은 몫을 나머지 문장에 가중치대로 다시 나눈다(더 올릴 문장이 없을 때까지). minimumShare × 문장 수 ≤ 1 이어야 한다
 */
function sentenceShares(weights: number[], minimumShare: number): number[] {
	const raised = new Set<number>();
	for (;;) {
		const freeWeight = weights.reduce(
			(sum, weight, index) => (raised.has(index) ? sum : sum + weight),
			0
		);
		const freeShare = 1 - raised.size * minimumShare;
		let changed = false;
		weights.forEach((weight, index) => {
			if (raised.has(index) || (weight / freeWeight) * freeShare >= minimumShare) return;
			raised.add(index);
			changed = true;
		});
		if (!changed)
			return weights.map((weight, index) =>
				raised.has(index) ? minimumShare : (weight / freeWeight) * freeShare
			);
	}
}

/** 문장마다 구간 끝(누적 비율). 가중치 = 글자 수 + 16, 어떤 문장도 SENTENCE_MIN_VH 보다 짧지 않다(beatVh: 비트 높이) */
export function sentenceCuts(sentences: string[], beatVh: number): number[] {
	const weights = sentences.map((sentence) => Array.from(sentence).length + SENTENCE_WEIGHT_PAD);
	let accumulated = 0;
	return sentenceShares(weights, SENTENCE_MIN_VH / beatVh).map((share) => {
		accumulated += share;
		return accumulated;
	});
}

/** BEATS 순서대로 비트 문장과 문장 구간 */
export const BEAT_SENTENCES: BeatSentences[] = BEATS.map(({ beat }) => {
	const split = splitSentences(beat.text);
	return { ...split, cuts: sentenceCuts(split.sentences, beat.heightVh) };
});

const BEAT_INDEX_BY_ID = new Map(BEATS.map((entry, index) => [entry.beat.id, index]));

/** 진행값 p 에서 보일 문장 번호(0부터) */
export function sentenceIndex(beatIndex: number, p: number): number {
	const cuts = BEAT_SENTENCES[beatIndex].cuts;
	for (let index = 0; index < cuts.length; index++) if (p < cuts[index]) return index;
	return cuts.length - 1;
}

function sentenceRange(beatId: string, sentence: number): { start: number; end: number } {
	const beatIndex = BEAT_INDEX_BY_ID.get(beatId);
	if (beatIndex === undefined) throw new Error(`unknown beat ${beatId}`);
	const cuts = BEAT_SENTENCES[beatIndex].cuts;
	if (sentence < 1 || sentence > cuts.length)
		throw new Error(`no sentence ${sentence} in ${beatId}`);
	return { start: sentence === 1 ? 0 : cuts[sentence - 2], end: cuts[sentence - 1] };
}

/**
 * 비트 진행값: 문장 sentence(1부터)의 시작~끝을 0~1 로 본 fraction 지점.
 * 그림 임계값을 문장 기준으로 적는다. fraction 이 0~1 밖이면 그 문장 길이로 앞뒤에 늘려 잡는다(시제품 값이 문장 경계를 조금 넘는 경우).
 */
export function sentenceAt(beatId: string, sentence: number, fraction: number): number {
	const { start, end } = sentenceRange(beatId, sentence);
	return start + (end - start) * fraction;
}

/** 문장 sentence(1부터) 안 진행값(0~1). 문장 앞은 0, 뒤는 1 */
export function sentenceP(beatId: string, sentence: number, p: number): number {
	const { start, end } = sentenceRange(beatId, sentence);
	return clamp01((p - start) / (end - start));
}
