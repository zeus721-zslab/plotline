// 바다 밑의 도시들 문구-데이터 대조(순수 함수). 2 · 3편 storyChecks 와 같은 방식: 불일치가 있는 대상은 화면에서 숨긴다.
// 대상(target): 장 id(장 문단 전체) · gaugeTarget(장 id)(계기판 한 줄) · asideTarget(장 id, 카드 id)(곁들임 카드 1장)
// · answerTarget(장 id)(질문 목록의 답 한 줄). 답은 그 장 claims 가 통과하고 답의 자리가 다 채워질 때만 보인다.
import type { StoryImage } from '../../story/storyMedia.ts';
import { templateParts } from '../../story/storyConfig.ts';
import { STOREGGA_YEARS_AGO, type AsideClaim, type ChapterAside } from './asides.ts';
import { slotsOf, type Chapter, type ChapterClaim, type ChapterSlots } from './chapters.ts';
import { measureOf, type MeasureId, type PlaceId, type SunkenData } from './sunkenData.ts';
import { yearPointOf } from './sunkenMath.ts';

export type StoryMismatch = { target: string; message: string };

const DOGGERLAND: PlaceId = 'doggerland';
const HERACLEION: PlaceId = 'heracleion';
// 7장 "{end_year}년 6월 7일"(지진 날짜는 문구 출처의 사실이라 연도도 이 해여야 맞다)
const PORT_ROYAL_QUAKE_YEAR = 1692;

export function gaugeTarget(chapterId: string): string {
	return `${chapterId}/gauge`;
}

export function asideTarget(chapterId: string, asideId: string): string {
	return `${chapterId}/aside/${asideId}`;
}

export function answerTarget(chapterId: string): string {
	return `${chapterId}/answer`;
}

function missingSlots(template: string, slots: Record<string, string>): string[] {
	return templateParts(template).flatMap((part) =>
		part.kind === 'slot' && !(part.name in slots) ? [`slot ${part.name}: no value`] : []
	);
}

function hasYear(data: SunkenData, place: PlaceId, measure: MeasureId): boolean {
	return yearPointOf(measureOf(data, place, measure)) !== null;
}

function hasDepth(data: SunkenData, place: PlaceId): boolean {
	const depth = measureOf(data, place, 'depth');
	return depth !== null && depth.amountMin !== null;
}

function speedVerdictIs(data: SunkenData, place: PlaceId, verdict: 'match' | 'no'): boolean {
	const speed = measureOf(data, place, 'speed');
	return speed !== null && speed.verdict === verdict;
}

/** 문구가 기대는 사실이 데이터와 맞는가. 맞으면 true. */
function claimHolds(claim: ChapterClaim, data: SunkenData): boolean {
	switch (claim) {
		case 'lyonesse-discovered':
			return hasYear(data, 'lyonesse', 'discovered');
		case 'doggerland-discovered':
			return hasYear(data, 'doggerland', 'discovered');
		case 'pavlopetri-discovered':
			return hasYear(data, 'pavlopetri', 'discovered');
		case 'heracleion-discovered':
			return hasYear(data, 'heracleion', 'discovered');
		case 'doggerland-depth':
			return hasDepth(data, 'doggerland');
		case 'pavlopetri-depth':
			return hasDepth(data, 'pavlopetri');
		case 'baiae-depth':
			return hasDepth(data, 'baiae');
		case 'heracleion-depth':
			return hasDepth(data, 'heracleion');
		case 'doggerland-end':
			return hasYear(data, 'doggerland', 'submerge_end');
		case 'baiae-gradual':
			return speedVerdictIs(data, 'baiae', 'no') && hasYear(data, 'baiae', 'submerge_start');
		case 'pavlopetri-unknown-time':
			return (
				measureOf(data, 'pavlopetri', 'submerge_start') === null &&
				measureOf(data, 'pavlopetri', 'submerge_end') === null
			);
		case 'port-royal-1692': {
			const end = measureOf(data, 'port_royal', 'submerge_end');
			return (
				end !== null &&
				end.yearFrom === PORT_ROYAL_QUAKE_YEAR &&
				speedVerdictIs(data, 'port_royal', 'match')
			);
		}
	}
}

function claimProblems(chapter: Chapter, data: SunkenData): string[] {
	return chapter.claims.flatMap((claim) =>
		claimHolds(claim, data) ? [] : [`claim ${claim}: data does not hold`]
	);
}

/** 장 문단: 자리가 다 채워지고, 장소가 데이터에 있고, 사진이 이미지 목록에 있어야 한다. */
function chapterProblems(
	chapter: Chapter,
	data: SunkenData,
	slots: Record<string, string>,
	imageIds: Set<string>
): string[] {
	const problems = chapter.paragraphs.flatMap((paragraph) => missingSlots(paragraph.text, slots));
	if (chapter.place !== null && !data.places.has(chapter.place)) {
		problems.push(`place ${chapter.place}: not in data`);
	}
	if (chapter.photo !== null && !imageIds.has(chapter.photo)) {
		problems.push(`photo ${chapter.photo}: not in images`);
	}
	return problems;
}

/** 계기판: 장소가 데이터에 있고, 조각의 자리가 다 채워져야 한다. */
function gaugeProblem(
	chapter: Chapter,
	data: SunkenData,
	slots: Record<string, string>
): string | null {
	if (chapter.gauge === null) return null;
	if (chapter.place !== null && !data.places.has(chapter.place)) {
		return `gauge: ${chapter.place} not in data`;
	}
	const missing = chapter.gauge.flatMap((part) => missingSlots(part, slots));
	return missing.length === 0 ? null : `gauge: ${missing.join(', ')}`;
}

/** 답 한 줄: 답의 자리가 다 채워져야 한다(claims 실패는 따로 답 대상에 넣는다). */
function answerProblems(chapter: Chapter, slots: Record<string, string>): string[] {
	return chapter.answer === null ? [] : missingSlots(chapter.answer, slots);
}

function checkAsideClaim(claim: AsideClaim, data: SunkenData, storyYear: number): string | null {
	switch (claim) {
		case 'doggerland-after-storegga': {
			const end = yearPointOf(measureOf(data, DOGGERLAND, 'submerge_end'));
			return end !== null && storyYear - end.year < STOREGGA_YEARS_AGO
				? null
				: `claim ${claim}: doggerland end not after storegga`;
		}
		case 'heracleion-in-data':
			return data.places.has(HERACLEION) ? null : `claim ${claim}: not in data`;
	}
}

export function findSunkenMismatches(
	chapters: Chapter[],
	asides: ChapterAside[],
	data: SunkenData,
	slots: ChapterSlots,
	images: StoryImage[],
	storyYear: number
): StoryMismatch[] {
	const imageIds = new Set(images.map((image) => image.id));
	const mismatches: StoryMismatch[] = [];
	for (const chapter of chapters) {
		const chapterSlotValues = slotsOf(slots, chapter.id);
		const claims = claimProblems(chapter, data);
		for (const message of [
			...chapterProblems(chapter, data, chapterSlotValues, imageIds),
			...claims
		]) {
			mismatches.push({ target: chapter.id, message });
		}
		for (const message of [...answerProblems(chapter, chapterSlotValues), ...claims]) {
			mismatches.push({ target: answerTarget(chapter.id), message });
		}
		const gauge = gaugeProblem(chapter, data, chapterSlotValues);
		if (gauge !== null) mismatches.push({ target: gaugeTarget(chapter.id), message: gauge });
	}
	const chapterIds = new Set<string>(chapters.map((chapter) => chapter.id));
	for (const aside of asides) {
		const message = !chapterIds.has(aside.chapterId)
			? `aside ${aside.id}: chapter ${aside.chapterId} unknown`
			: aside.claim === null
				? null
				: checkAsideClaim(aside.claim, data, storyYear);
		if (message !== null) {
			mismatches.push({ target: asideTarget(aside.chapterId, aside.id), message });
		}
	}
	return mismatches;
}
