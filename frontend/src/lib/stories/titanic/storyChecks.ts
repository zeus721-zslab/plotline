// 마지막 2시간 40분 문구-데이터 대조(순수 함수). 5편 storyChecks 와 같은 방식: 불일치가 있는 대상은 화면에서 숨긴다.
// 대상(target): 장 id(그 장 카드 문단 전체) · timeMarkTarget(장 id)(시간 표지 한 줄).
import type { Chapter, Claim } from './chapters.ts';
import type { EventId, EventRecord, TitanicData } from './titanicData.ts';

export type StoryMismatch = { target: string; message: string };

const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_DAY = 86_400_000;

export function timeMarkTarget(chapterId: string): string {
	return `${chapterId}/time-mark`;
}

/** 날짜 · 시각이 모두 있으면 그 순간(UTC 로 셈, 선박 시각끼리의 차만 쓴다). 하나라도 없으면 null. */
function instantOf(record: EventRecord): number | null {
	if (
		record.month === null ||
		record.day === null ||
		record.hour === null ||
		record.minute === null
	) {
		return null;
	}
	return Date.UTC(record.year, record.month - 1, record.day, record.hour, record.minute);
}

function dayOf(record: EventRecord): number | null {
	if (record.month === null || record.day === null) return null;
	return Date.UTC(record.year, record.month - 1, record.day);
}

/** 두 기록 사이 분. 날짜 · 시각이 하나라도 없으면 null. */
export function minutesBetween(from: EventRecord, to: EventRecord): number | null {
	const start = instantOf(from);
	const end = instantOf(to);
	return start === null || end === null ? null : (end - start) / MILLISECONDS_PER_MINUTE;
}

/** 두 기록 사이 날 수(날짜 차). 월 · 일이 없으면 null. */
export function daysBetween(from: EventRecord, to: EventRecord): number | null {
	const start = dayOf(from);
	const end = dayOf(to);
	return start === null || end === null ? null : (end - start) / MILLISECONDS_PER_DAY;
}

/** 태어난 날부터 그 날짜까지 만 나이. 월 · 일이 없으면 null. */
export function ageAt(birth: EventRecord, at: EventRecord): number | null {
	if (birth.month === null || birth.day === null || at.month === null || at.day === null) {
		return null;
	}
	const years = at.year - birth.year;
	const beforeBirthday = at.month < birth.month || (at.month === birth.month && at.day < birth.day);
	return beforeBirthday ? years - 1 : years;
}

function within(value: number | null, min: number, max: number): boolean {
	return value !== null && value >= min && value <= max;
}

/** 문구가 기대는 사실이 데이터와 맞는가. 맞으면 null, 아니면 이유. storyYear 는 이야기 기준 올해. */
export function claimProblem(claim: Claim, data: TitanicData, storyYear: number): string | null {
	const eventOf = (id: EventId): EventRecord | null => {
		const found = data.events.get(id);
		return found === undefined ? null : found;
	};
	const valueOf = (id: EventId): number | null => {
		const found = eventOf(id);
		return found === null ? null : found.value;
	};
	switch (claim.kind) {
		case 'date': {
			const found = eventOf(claim.event);
			const matches =
				found !== null &&
				found.year === claim.year &&
				(claim.month === null || found.month === claim.month) &&
				(claim.day === null || found.day === claim.day);
			return matches ? null : `${claim.event}: date differs`;
		}
		case 'time': {
			const found = eventOf(claim.event);
			const matches =
				found !== null &&
				found.hour === claim.hour &&
				(claim.minute === null || found.minute === claim.minute);
			return matches ? null : `${claim.event}: time differs`;
		}
		case 'age': {
			const birth = eventOf(claim.born);
			const found = eventOf(claim.event);
			const age = birth === null || found === null ? null : ageAt(birth, found);
			return age === claim.years ? null : `age of ${claim.born} at ${claim.event}: ${age}`;
		}
		case 'minutes-after':
		case 'days-after':
		case 'years-after': {
			const from = eventOf(claim.from);
			const to = eventOf(claim.to);
			let amount: number | null = null;
			if (from !== null && to !== null) {
				if (claim.kind === 'minutes-after') amount = minutesBetween(from, to);
				else if (claim.kind === 'days-after') amount = daysBetween(from, to);
				else amount = to.year - from.year;
			}
			return within(amount, claim.min, claim.max)
				? null
				: `${claim.from} → ${claim.to}: ${amount} (${claim.kind})`;
		}
		case 'years-since': {
			const found = eventOf(claim.event);
			const years = found === null ? null : storyYear - found.year;
			return within(years, claim.min, Number.POSITIVE_INFINITY)
				? null
				: `${claim.event} → ${storyYear}: ${years} years`;
		}
		case 'value': {
			const amount = valueOf(claim.event);
			return within(amount, claim.min, claim.max) ? null : `${claim.event}: value ${amount}`;
		}
		case 'scaled-value': {
			const amount = valueOf(claim.event);
			const scaled = amount === null ? null : amount * claim.factor;
			return within(scaled, claim.min, claim.max)
				? null
				: `${claim.event} × ${claim.factor}: ${scaled}`;
		}
		case 'value-gap': {
			const from = valueOf(claim.from);
			const minus = valueOf(claim.minus);
			const gap = from === null || minus === null ? null : from - minus;
			return within(gap, claim.min, claim.max) ? null : `${claim.from} − ${claim.minus}: ${gap}`;
		}
	}
}

export function findTitanicMismatches(
	chapters: Chapter[],
	data: TitanicData,
	storyYear: number
): StoryMismatch[] {
	const mismatches: StoryMismatch[] = [];
	for (const chapter of chapters) {
		for (const claim of chapter.claims) {
			const message = claimProblem(claim, data, storyYear);
			if (message !== null) mismatches.push({ target: chapter.id, message });
		}
		for (const claim of chapter.timeMarkClaims) {
			const message = claimProblem(claim, data, storyYear);
			if (message !== null) mismatches.push({ target: timeMarkTarget(chapter.id), message });
		}
	}
	return mismatches;
}
