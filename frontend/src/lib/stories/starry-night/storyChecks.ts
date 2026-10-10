// 그가 실패작이라 부른 밤 문구-데이터 대조(순수 함수). 1~4편 storyChecks 와 같은 방식: 불일치가 있는 대상은 화면에서 숨긴다.
// 대상(target): 장 id(그 장 카드 문단 전체) · timeMarkTarget(장 id)(시간 표지 한 줄) · LABEL_DETAILS_TARGET(작품 라벨 2줄째).
import type { Chapter, Claim } from './chapters.ts';
import type { EventDate, EventId, StarryData } from './starryData.ts';

export type StoryMismatch = { target: string; message: string };

const MONTHS_PER_YEAR = 12;
const MILLISECONDS_PER_DAY = 86_400_000;
// 평균 한 달 길이(일, 365.25 / 12)
const DAYS_PER_MONTH = 30.4375;

export const LABEL_DETAILS_TARGET = 'artwork-label/details';

export function timeMarkTarget(chapterId: string): string {
	return `${chapterId}/time-mark`;
}

/** 두 날짜 사이 개월 수: 둘 다 일이 있으면 날짜 차(평균 한 달), 아니면 연월 차. 월이 없으면 null. */
export function monthsBetween(from: EventDate, to: EventDate): number | null {
	if (from.month === null || to.month === null) return null;
	if (from.day === null || to.day === null) {
		return (to.year - from.year) * MONTHS_PER_YEAR + (to.month - from.month);
	}
	const days =
		(Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) /
		MILLISECONDS_PER_DAY;
	return days / DAYS_PER_MONTH;
}

/** 태어난 날부터 그 날짜까지 만 나이. 생일 달과 같은 달인데 일이 없으면 정할 수 없어 null. */
export function ageAt(birth: EventDate, at: EventDate): number | null {
	if (birth.month === null || at.month === null) return null;
	const years = at.year - birth.year;
	if (at.month !== birth.month) return at.month > birth.month ? years : years - 1;
	if (birth.day === null || at.day === null) return null;
	return at.day >= birth.day ? years : years - 1;
}

function within(value: number | null, min: number, max: number): boolean {
	return value !== null && value >= min && value <= max;
}

function dateMatches(found: EventDate, claim: Extract<Claim, { kind: 'date' }>): boolean {
	return (
		found.year === claim.year &&
		(claim.month === null || found.month === claim.month) &&
		(claim.day === null || found.day === claim.day)
	);
}

/** 문구가 기대는 사실이 데이터와 맞는가. 맞으면 null, 아니면 이유. */
export function claimProblem(claim: Claim, data: StarryData): string | null {
	const eventOf = (id: EventId): EventDate | null => {
		const found = data.events.get(id);
		return found === undefined ? null : found;
	};
	switch (claim.kind) {
		case 'present':
			return eventOf(claim.event) === null ? `${claim.event}: not in data` : null;
		case 'date': {
			const found = eventOf(claim.event);
			return found !== null && dateMatches(found, claim) ? null : `${claim.event}: date differs`;
		}
		case 'age': {
			const birth = eventOf('born');
			const found = eventOf(claim.event);
			const age = birth === null || found === null ? null : ageAt(birth, found);
			return age === claim.years ? null : `age at ${claim.event}: ${age} != ${claim.years}`;
		}
		case 'months-after': {
			const from = eventOf(claim.from);
			const to = eventOf(claim.to);
			const months = from === null || to === null ? null : monthsBetween(from, to);
			return within(months, claim.min, claim.max)
				? null
				: `${claim.from} → ${claim.to}: ${months} months`;
		}
		case 'years-after': {
			const from = eventOf(claim.from);
			const to = eventOf(claim.to);
			const years = from === null || to === null ? null : to.year - from.year;
			return within(years, claim.min, claim.max)
				? null
				: `${claim.from} → ${claim.to}: ${years} years`;
		}
	}
}

export function findStarryMismatches(chapters: Chapter[], data: StarryData): StoryMismatch[] {
	const mismatches: StoryMismatch[] = [];
	for (const chapter of chapters) {
		for (const claim of chapter.claims) {
			const message = claimProblem(claim, data);
			if (message !== null) mismatches.push({ target: chapter.id, message });
		}
		for (const claim of chapter.timeMarkClaims) {
			const message = claimProblem(claim, data);
			if (message !== null) mismatches.push({ target: timeMarkTarget(chapter.id), message });
		}
	}
	return mismatches;
}

/** 작품 라벨 2줄째(그린 때)가 기대는 사실 대조 */
export function findLabelMismatches(claims: Claim[], data: StarryData): StoryMismatch[] {
	return claims.flatMap((claim) => {
		const message = claimProblem(claim, data);
		return message === null ? [] : [{ target: LABEL_DETAILS_TARGET, message }];
	});
}
