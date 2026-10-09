// 사건의 지평선 너머 문구-데이터 대조(순수 함수). 2편 storyChecks 와 같은 방식: 불일치가 있는 대상은 화면에서 숨긴다.
// 대상(target): 장 id(장 문구 전체) · gaugeTarget(장 id)(계기판 한 줄) · branchTarget(장 id)(9장 분기 버튼 · 문구)
// · branchGaugeTarget(장 id)(9장 분기를 누른 동안의 계기판 한 줄)
// · asideTarget(장 id, 카드 id)(곁들임 카드 1장).
import type { StoryImage } from '../../story/storyMedia.ts';
import { templateParts } from '../../story/storyConfig.ts';
import type { AsideClaim, ChapterAside } from './asides.ts';
import { BRANCH_TEXT, type Chapter, type ChapterClaim } from './chapters.ts';
import { gaugeReading, horizonRadiusKm } from './fallMath.ts';
import { CYGNUS_X1_HOLE, M87_HOLE, type BlackHole, type Boundary } from './holeData.ts';

export type StoryMismatch = { target: string; message: string };

// 지평선에서 조석력(머리-발끝 당김 차이)이 지구 중력 1G 아래가 되는 질량(태양의 몇 배, 사람 키 약 2m 기준 어림).
// 이보다 가벼운 블랙홀은 지평선에 닿기 전에 몸이 늘어난다(문구 출처 jila singularity.html).
export const GENTLE_HORIZON_MIN_MASS = 30_000;
const SHADOW = 'shadow';
const ERGOSPHERE = 'ergosphere';
const HORIZON = 'horizon';

export type FallData = {
	holes: Map<string, BlackHole>;
	boundaries: Map<string, Boundary>;
};

export function gaugeTarget(chapterId: string): string {
	return `${chapterId}/gauge`;
}

export function branchTarget(chapterId: string): string {
	return `${chapterId}/branch`;
}

export function branchGaugeTarget(chapterId: string): string {
	return `${chapterId}/branch-gauge`;
}

export function asideTarget(chapterId: string, asideId: string): string {
	return `${chapterId}/aside/${asideId}`;
}

/** 이 장 앞에서 반지름이 있는 마지막 경계 장의 반지름(없으면 null) */
function previousRadius(chapters: Chapter[], index: number, data: FallData): number | null {
	for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
		const id = chapters[cursor].boundary;
		const boundary = id === null ? undefined : data.boundaries.get(id);
		if (boundary !== undefined && boundary.radiusRs !== null) return boundary.radiusRs;
	}
	return null;
}

function massCheck(
	claim: string,
	holeId: string,
	data: FallData,
	passes: (mass: number) => boolean
): string | null {
	const hole = data.holes.get(holeId);
	if (hole === undefined) return `claim ${claim}: ${holeId} not in data`;
	return passes(hole.massSolar) ? null : `claim ${claim}: mass ${hole.massSolar}`;
}

function checkClaim(
	claim: ChapterClaim,
	chapters: Chapter[],
	index: number,
	data: FallData
): string | null {
	const chapter = chapters[index];
	const boundary = chapter.boundary === null ? undefined : data.boundaries.get(chapter.boundary);
	switch (claim) {
		case 'inward-order': {
			const previous = previousRadius(chapters, index, data);
			if (boundary === undefined || boundary.radiusRs === null) return `claim ${claim}: no radius`;
			return previous === null || boundary.radiusRs < previous
				? null
				: `claim ${claim}: ${boundary.radiusRs} >= ${previous}`;
		}
		case 'shadow-not-physical': {
			const shadow = data.boundaries.get(SHADOW);
			return shadow !== undefined && !shadow.physical ? null : `claim ${claim}: physical shadow`;
		}
		case 'ergosphere-no-radius': {
			const ergosphere = data.boundaries.get(ERGOSPHERE);
			return ergosphere !== undefined && ergosphere.radiusRs === null && ergosphere.physical
				? null
				: `claim ${claim}: ergosphere has radius or is missing`;
		}
		case 'horizon-unit': {
			const horizon = data.boundaries.get(HORIZON);
			return horizon !== undefined && horizon.radiusRs === 1
				? null
				: `claim ${claim}: horizon radius not 1`;
		}
		case 'm87-gentle-horizon':
			return massCheck(claim, M87_HOLE, data, (mass) => mass > GENTLE_HORIZON_MIN_MASS);
	}
}

function missingSlots(template: string, slots: Record<string, string>): string[] {
	return templateParts(template).flatMap((part) =>
		part.kind === 'slot' && !(part.name in slots) ? [`slot ${part.name}: no value`] : []
	);
}

function checkChapter(
	chapters: Chapter[],
	index: number,
	data: FallData,
	slots: Record<string, string>,
	imageIds: Set<string>
): string[] {
	const chapter = chapters[index];
	const problems = missingSlots(chapter.body, slots);
	if (chapter.boundary !== null && !data.boundaries.has(chapter.boundary)) {
		problems.push(`boundary ${chapter.boundary}: not in data`);
	}
	for (const claim of chapter.claims) {
		const problem = checkClaim(claim, chapters, index, data);
		if (problem !== null) problems.push(problem);
	}
	if (chapter.photo !== null && !imageIds.has(chapter.photo)) {
		problems.push(`photo ${chapter.photo}: not in images`);
	}
	return problems;
}

/** 계기판 숫자: M87 질량과 경계 반지름이 있어야 하고, 지평선 바깥(머물 수 있는 곳)이어야 한다. */
function checkGauge(chapter: Chapter, data: FallData): string | null {
	if (chapter.gauge.kind === 'text') return null;
	const m87 = data.holes.get(M87_HOLE);
	const boundary = data.boundaries.get(chapter.gauge.boundary);
	if (m87 === undefined) return `gauge: ${M87_HOLE} not in data`;
	if (boundary === undefined || boundary.radiusRs === null) {
		return `gauge: ${chapter.gauge.boundary} has no radius`;
	}
	return gaugeReading(m87.massSolar, boundary.radiusRs) === null
		? `gauge: ${chapter.gauge.boundary} inside horizon`
		: null;
}

/** 9장 분기: 백조자리 X-1 은 지평선 전에 늘어날 만큼 가볍고, 질량 자리가 채워져야 한다. */
function checkBranch(data: FallData, slots: Record<string, string>): string | null {
	const missing = missingSlots(BRANCH_TEXT, slots);
	if (missing.length > 0) return missing.join(', ');
	return massCheck(
		'small-hole-stretches-early',
		CYGNUS_X1_HOLE,
		data,
		(mass) => mass < GENTLE_HORIZON_MIN_MASS
	);
}

/** 9장 분기 계기판: 백조자리 X-1 질량이 있어야 지평선 반지름(km, 반올림 정수)을 1 km 이상으로 셀 수 있다. */
function checkBranchGauge(data: FallData): string | null {
	return massCheck(
		'branch-gauge-horizon-km',
		CYGNUS_X1_HOLE,
		data,
		(mass) => Math.round(horizonRadiusKm(mass)) >= 1
	);
}

function checkAsideClaim(claim: AsideClaim, data: FallData): string | null {
	switch (claim) {
		case 'cygnus-x1-in-data':
			return data.holes.has(CYGNUS_X1_HOLE)
				? null
				: `claim ${claim}: ${CYGNUS_X1_HOLE} not in data`;
	}
}

export function findBlackHoleMismatches(
	chapters: Chapter[],
	asides: ChapterAside[],
	data: FallData,
	slots: Record<string, string>,
	images: StoryImage[],
	branchChapter: string
): StoryMismatch[] {
	const imageIds = new Set(images.map((image) => image.id));
	const mismatches: StoryMismatch[] = [];
	chapters.forEach((chapter, index) => {
		for (const message of checkChapter(chapters, index, data, slots, imageIds)) {
			mismatches.push({ target: chapter.id, message });
		}
		const gauge = checkGauge(chapter, data);
		if (gauge !== null) mismatches.push({ target: gaugeTarget(chapter.id), message: gauge });
	});
	const branch = checkBranch(data, slots);
	if (branch !== null) mismatches.push({ target: branchTarget(branchChapter), message: branch });
	const branchGauge = checkBranchGauge(data);
	if (branchGauge !== null) {
		mismatches.push({ target: branchGaugeTarget(branchChapter), message: branchGauge });
	}
	const chapterIds = new Set<string>(chapters.map((chapter) => chapter.id));
	for (const aside of asides) {
		const message = !chapterIds.has(aside.chapterId)
			? `aside ${aside.id}: chapter ${aside.chapterId} unknown`
			: aside.claim === null
				? null
				: checkAsideClaim(aside.claim, data);
		if (message !== null) {
			mismatches.push({ target: asideTarget(aside.chapterId, aside.id), message });
		}
	}
	return mismatches;
}
