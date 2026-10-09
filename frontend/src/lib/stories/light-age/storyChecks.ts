// 빛의 나이 문구-데이터 대조(순수 함수). 1편 storyChecks 와 같은 방식: 불일치가 있는 대상은 화면에서 숨긴다.
// 대상(target): 장 id(장 문구 전체) · momentTarget(장 id, 사건 id)(그때 지구 한 줄) · asideTarget(장 id, 카드 id)(곁들임 카드 1장).
import type { StoryImage } from '../../story/storyMedia.ts';
import { templateParts } from '../../story/storyConfig.ts';
import type { AsideClaim, ChapterAside } from './asides.ts';
import type { Chapter, ChapterClaim } from './chapters.ts';
import { matchMoment, travelSeconds, travelTime } from './lightTime.ts';
import type { EarthMoment, SkyObject } from './skyData.ts';

export type StoryMismatch = { target: string; message: string };

const SECONDS_PER_DAY = 86_400;
const HALF_DAY_SECONDS = SECONDS_PER_DAY / 2;
// "꼭 하루": 하루와의 차이가 0.1% 안
const ONE_DAY_RELATIVE_TOLERANCE = 0.001;
const STAR_KIND = '항성';
const BLACK_HOLE_KIND = '블랙홀';
const SUN_OBJECT = 'sun';
const SUN_TRAVEL_PLAIN = '8분';
const GUEST_STAR_MOMENT = 'crab_guest_star';
const GUEST_STAR_YEAR = 1054;

export function momentTarget(chapterId: string, momentId: string): string {
	return `${chapterId}/${momentId}`;
}

export function asideTarget(chapterId: string, asideId: string): string {
	return `${chapterId}/aside/${asideId}`;
}

function nearestLightYearStar(objects: Map<string, SkyObject>): SkyObject | null {
	let nearest: SkyObject | null = null;
	for (const object of objects.values()) {
		if (object.kind !== STAR_KIND || object.distanceUnit !== '광년') continue;
		if (nearest === null || object.distanceValue < nearest.distanceValue) nearest = object;
	}
	return nearest;
}

function checkClaim(
	claim: ChapterClaim,
	chapter: Chapter,
	objects: Map<string, SkyObject>
): string | null {
	const subject = objects.get(chapter.gaugeObject);
	if (subject === undefined) return `claim ${claim}: ${chapter.gaugeObject} not in data`;
	switch (claim) {
		case 'neptune-under-half-day': {
			const seconds = travelSeconds(subject);
			return seconds < HALF_DAY_SECONDS ? null : `claim ${claim}: ${seconds}s`;
		}
		case 'voyager-one-light-day': {
			const relative = Math.abs(travelSeconds(subject) - SECONDS_PER_DAY) / SECONDS_PER_DAY;
			if (!subject.showExact) return `claim ${claim}: show_exact false`;
			return relative <= ONE_DAY_RELATIVE_TOLERANCE ? null : `claim ${claim}: off by ${relative}`;
		}
		case 'proxima-nearest-star': {
			const nearest = nearestLightYearStar(objects);
			return nearest !== null && nearest.id === subject.id
				? null
				: `claim ${claim}: nearest is ${nearest === null ? 'none' : nearest.id}`;
		}
		case 'black-hole':
			return subject.kind === BLACK_HOLE_KIND ? null : `claim ${claim}: kind ${subject.kind}`;
	}
}

function checkChapter(
	chapter: Chapter,
	objects: Map<string, SkyObject>,
	slots: Record<string, string>,
	imageIds: Set<string>
): string[] {
	const problems: string[] = [];
	for (const objectId of [...chapter.objects, chapter.gaugeObject]) {
		if (!objects.has(objectId)) problems.push(`object ${objectId}: not in data`);
	}
	for (const part of templateParts(chapter.body)) {
		if (part.kind === 'slot' && !(part.name in slots)) {
			problems.push(`slot ${part.name}: no value`);
		}
	}
	for (const claim of chapter.claims) {
		const problem = checkClaim(claim, chapter, objects);
		if (problem !== null) problems.push(problem);
	}
	if (chapter.photo !== null && !imageIds.has(chapter.photo)) {
		problems.push(`photo ${chapter.photo}: not in images`);
	}
	return problems;
}

function checkMoment(
	chapter: Chapter,
	momentId: string,
	objects: Map<string, SkyObject>,
	moments: Map<string, EarthMoment>,
	currentYear: number
): string | null {
	const moment = moments.get(momentId);
	if (moment === undefined) return `moment ${momentId}: not in data`;
	if (!chapter.objects.includes(moment.objectId)) {
		return `moment ${momentId}: object ${moment.objectId} not in chapter`;
	}
	const object = objects.get(moment.objectId);
	if (object === undefined) return `moment ${momentId}: object ${moment.objectId} not in data`;
	const match = matchMoment(object, moment, currentYear);
	if (match.kind === 'compared' && !match.matches) {
		return `moment ${momentId}: difference ${match.difference} > tolerance ${match.tolerance}`;
	}
	return null;
}

function checkAsideClaim(
	claim: AsideClaim,
	objects: Map<string, SkyObject>,
	moments: Map<string, EarthMoment>
): string | null {
	switch (claim) {
		case 'sun-eight-minutes': {
			const sun = objects.get(SUN_OBJECT);
			if (sun === undefined) return `claim ${claim}: ${SUN_OBJECT} not in data`;
			const plain = travelTime(sun).plain;
			return plain === SUN_TRAVEL_PLAIN ? null : `claim ${claim}: ${plain}`;
		}
		case 'crab-guest-star-1054': {
			const moment = moments.get(GUEST_STAR_MOMENT);
			if (moment === undefined) return `claim ${claim}: ${GUEST_STAR_MOMENT} not in data`;
			if (moment.time.kind !== '연도') return `claim ${claim}: time kind ${moment.time.kind}`;
			return moment.time.year === GUEST_STAR_YEAR
				? null
				: `claim ${claim}: year ${moment.time.year}`;
		}
	}
}

function checkAside(
	aside: ChapterAside,
	chapterIds: Set<string>,
	objects: Map<string, SkyObject>,
	moments: Map<string, EarthMoment>
): string | null {
	if (!chapterIds.has(aside.chapterId))
		return `aside ${aside.id}: chapter ${aside.chapterId} unknown`;
	return aside.claim === null ? null : checkAsideClaim(aside.claim, objects, moments);
}

export function findLightAgeMismatches(
	chapters: Chapter[],
	asides: ChapterAside[],
	objects: Map<string, SkyObject>,
	moments: Map<string, EarthMoment>,
	slots: Record<string, string>,
	images: StoryImage[],
	currentYear: number
): StoryMismatch[] {
	const imageIds = new Set(images.map((image) => image.id));
	const mismatches: StoryMismatch[] = [];
	for (const chapter of chapters) {
		for (const message of checkChapter(chapter, objects, slots, imageIds)) {
			mismatches.push({ target: chapter.id, message });
		}
		for (const momentId of chapter.moments) {
			const message = checkMoment(chapter, momentId, objects, moments, currentYear);
			if (message !== null) {
				mismatches.push({ target: momentTarget(chapter.id, momentId), message });
			}
		}
	}
	const chapterIds = new Set(chapters.map((chapter) => chapter.id));
	for (const aside of asides) {
		const message = checkAside(aside, chapterIds, objects, moments);
		if (message !== null) {
			mismatches.push({ target: asideTarget(aside.chapterId, aside.id), message });
		}
	}
	return mismatches;
}
