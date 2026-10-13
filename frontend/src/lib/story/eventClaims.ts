// 사건형 데이터(eventData.ts) 문구 대조(순수 함수). 불일치가 있는 대상은 화면에서 숨긴다. 6 · 7 · 8편이 쓴다(D-45 · D-47).
// 여기에는 두 편이 같은 의미로 쓰는 종류만 둔다. 편마다 의미가 다르거나 한 편만 쓰는 종류는 그 편이 Claim 을 넓혀 직접 대조한다.
// 예외(D-47 D4): 달력 종류(CalendarClaim: date · month-in)는 7편 storyChecks.ts 의 같은 이름 종류와 의미가 같아 여기 두고 8편부터 쓴다.
// 7편은 무변경 조건으로 자기 정의를 그대로 둔다(같은 의미 2벌, 정리는 별도 작업).
// 6편은 이름이 같은 date(월 · 일까지 비교)를 따로 두므로, 달력 종류는 Claim 에 넣지 않고 따로 대조한다(쓰는 편이 Claim 에 더한다).
// 기존 종류의 의미를 바꾸면 쓰는 편의 대조가 함께 바뀌므로, 바꿀 일이 생기면 새 종류를 더한다.
import type { EventRecord } from './eventData.ts';

/** 문구가 기대는 사실 하나(공용 종류) */
export type Claim<Id extends string> =
	// 두 사건 사이 햇수(연도 차)
	| { kind: 'years-after'; from: Id; to: Id; min: number; max: number }
	// 수량 칸 값이 범위 안
	| { kind: 'value'; event: Id; min: number; max: number }
	// 수량 칸을 divisor 로 나눈 값이 범위 안(배율을 곱해 정수로 저장한 값)
	| { kind: 'scaled-value'; event: Id; divisor: number; min: number; max: number };

/** 문구가 기대는 날짜 사실 하나(7편과 같은 의미의 달력 종류) */
export type CalendarClaim<Id extends string> =
	// 연도만 본다
	| { kind: 'date'; event: Id; year: number }
	// 연도가 year 이고 월이 months 중 하나
	| { kind: 'month-in'; event: Id; year: number; months: number[] };

export type StoryMismatch = { target: string; message: string };

export function within(value: number | null, min: number, max: number): boolean {
	return value !== null && value >= min && value <= max;
}

export function eventOf<Id extends string>(
	events: Map<Id, EventRecord>,
	id: Id
): EventRecord | null {
	const found = events.get(id);
	return found === undefined ? null : found;
}

export function valueOf<Id extends string>(events: Map<Id, EventRecord>, id: Id): number | null {
	const found = eventOf(events, id);
	return found === null ? null : found.value;
}

/** 문구가 기대는 사실이 데이터와 맞는가. 맞으면 null, 아니면 이유. */
export function claimProblem<Id extends string>(
	claim: Claim<Id>,
	events: Map<Id, EventRecord>
): string | null {
	switch (claim.kind) {
		case 'years-after': {
			const from = eventOf(events, claim.from);
			const to = eventOf(events, claim.to);
			const amount = from === null || to === null ? null : to.year - from.year;
			return within(amount, claim.min, claim.max)
				? null
				: `${claim.from} → ${claim.to}: ${amount} (years-after)`;
		}
		case 'value': {
			const amount = valueOf(events, claim.event);
			return within(amount, claim.min, claim.max) ? null : `${claim.event}: value ${amount}`;
		}
		case 'scaled-value': {
			const amount = valueOf(events, claim.event);
			const scaled = amount === null ? null : amount / claim.divisor;
			return within(scaled, claim.min, claim.max)
				? null
				: `${claim.event} ÷ ${claim.divisor}: ${scaled}`;
		}
	}
}

/** 날짜 사실이 데이터와 맞는가. 맞으면 null, 아니면 이유(7편 storyChecks 와 같은 문구). */
export function calendarClaimProblem<Id extends string>(
	claim: CalendarClaim<Id>,
	events: Map<Id, EventRecord>
): string | null {
	const found = eventOf(events, claim.event);
	switch (claim.kind) {
		case 'date':
			return found !== null && found.year === claim.year ? null : `${claim.event}: year differs`;
		case 'month-in': {
			const matches =
				found !== null &&
				found.year === claim.year &&
				found.month !== null &&
				claim.months.includes(found.month);
			return matches ? null : `${claim.event}: month not in ${claim.months.join(',')}`;
		}
	}
}

/**
 * 대상마다 그 대상이 기대는 사실을 대조한다(대상 순서 → 사실 순서).
 * problem 은 편의 대조 함수(공용 종류 + 그 편 종류)다. 대상 이름과 숨김 표시는 편이 정한다.
 */
export function findTargetMismatches<C>(
	items: readonly { target: string; claims: readonly C[] }[],
	problem: (claim: C) => string | null
): StoryMismatch[] {
	return items.flatMap((item) =>
		item.claims.flatMap((claim) => {
			const message = problem(claim);
			return message === null ? [] : [{ target: item.target, message }];
		})
	);
}
