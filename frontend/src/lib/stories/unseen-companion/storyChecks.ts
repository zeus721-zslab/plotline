// 보이지 않는 짝 문구-데이터 대조(순수 함수). 5편 storyChecks 와 같은 방식: 불일치가 있는 대상은 화면에서 숨긴다.
// 대상(target): 장 id(그 장 비트 글 전체) · timeMarkTarget(장 id)(시간 표지) · SCREEN_MARKS 의 target(장 밖 화면 표기).
// value · scaled-value · days-after 는 폐기된 6편(titanic, origin/feat/story-titanic) storyChecks 구현을 옮겼다(배율은 나누기로).
import type { Chapter, Claim } from './chapters.ts';
import type { EventId, EventRecord, UnseenData } from './unseenData.ts';

export type StoryMismatch = { target: string; message: string };

const MILLISECONDS_PER_DAY = 86_400_000;

export function timeMarkTarget(chapterId: string): string {
	return `${chapterId}/time-mark`;
}

function dayOf(record: EventRecord): number | null {
	if (record.month === null || record.day === null) return null;
	return Date.UTC(record.year, record.month - 1, record.day);
}

/** 두 기록 사이 날 수(날짜 차). 월 · 일이 없으면 null. */
export function daysBetween(from: EventRecord, to: EventRecord): number | null {
	const start = dayOf(from);
	const end = dayOf(to);
	return start === null || end === null ? null : (end - start) / MILLISECONDS_PER_DAY;
}

function within(value: number | null, min: number, max: number): boolean {
	return value !== null && value >= min && value <= max;
}

/** 문구가 기대는 사실이 데이터와 맞는가. 맞으면 null, 아니면 이유. */
export function claimProblem(claim: Claim, data: UnseenData): string | null {
	const eventOf = (id: EventId): EventRecord | null => {
		const found = data.events.get(id);
		return found === undefined ? null : found;
	};
	const valueOf = (id: EventId): number | null => {
		const found = eventOf(id);
		return found === null ? null : found.value;
	};
	switch (claim.kind) {
		case 'present':
			return eventOf(claim.event) === null ? `${claim.event}: not in data` : null;
		case 'date': {
			const found = eventOf(claim.event);
			const matches =
				found !== null &&
				found.year === claim.year &&
				(claim.month === null || found.month === claim.month) &&
				(claim.day === null || found.day === claim.day);
			return matches ? null : `${claim.event}: date differs`;
		}
		case 'years-after':
		case 'days-after': {
			const from = eventOf(claim.from);
			const to = eventOf(claim.to);
			let amount: number | null = null;
			if (from !== null && to !== null) {
				amount = claim.kind === 'days-after' ? daysBetween(from, to) : to.year - from.year;
			}
			return within(amount, claim.min, claim.max)
				? null
				: `${claim.from} → ${claim.to}: ${amount} (${claim.kind})`;
		}
		case 'value': {
			const amount = valueOf(claim.event);
			return within(amount, claim.min, claim.max) ? null : `${claim.event}: value ${amount}`;
		}
		case 'scaled-value': {
			const amount = valueOf(claim.event);
			const scaled = amount === null ? null : amount / claim.divisor;
			return within(scaled, claim.min, claim.max)
				? null
				: `${claim.event} ÷ ${claim.divisor}: ${scaled}`;
		}
	}
}

export function findUnseenMismatches(chapters: Chapter[], data: UnseenData): StoryMismatch[] {
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

/** 장 밖 화면 표기(6장 속도 띠 · 4장 궤도)가 기대는 사실 대조 */
export function findScreenMarkMismatches(
	marks: { target: string; claims: Claim[] }[],
	data: UnseenData
): StoryMismatch[] {
	return marks.flatMap((mark) =>
		mark.claims.flatMap((claim) => {
			const message = claimProblem(claim, data);
			return message === null ? [] : [{ target: mark.target, message }];
		})
	);
}
