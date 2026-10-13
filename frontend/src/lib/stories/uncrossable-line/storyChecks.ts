// 넘을 수 없는 선 문구-데이터 대조(순수 함수). 6편 storyChecks 와 같은 방식: 불일치가 있는 대상은 화면에서 숨긴다.
// 대상(target): 비트 id(그 비트 글 전체) · SCREEN_MARKS 의 target(연도 표지 · 캔버스 점수 숫자).
// date · years-after · value · scaled-value 는 6편과 같고, 6편 종류로 표현할 수 없는 대조 셋을 이 편에만 둔다:
// rounded-value(반올림, 83.7판 → 84판) · ratio(두 수량의 나눗셈) · month-in(월 범위, "여름" · "겨울").
import type { Chapter } from './chapters.ts';
import type { EventId, EventRecord, LineData } from './lineData.ts';

/** 문구가 기대는 사실 하나 */
export type Claim =
	| { kind: 'date'; event: EventId; year: number }
	// 두 사건 사이 햇수(연도 차)
	| { kind: 'years-after'; from: EventId; to: EventId; min: number; max: number }
	// 수량 칸 값이 범위 안
	| { kind: 'value'; event: EventId; min: number; max: number }
	// 수량 칸을 divisor 로 나눈 값이 범위 안(×10 으로 정수 저장한 값)
	| { kind: 'scaled-value'; event: EventId; divisor: number; min: number; max: number }
	// 수량 칸을 divisor 로 나눠 반올림한 값이 expected
	| { kind: 'rounded-value'; event: EventId; divisor: number; expected: number }
	// 두 수량의 나눗셈(numerator ÷ denominator)이 범위 안
	| { kind: 'ratio'; numerator: EventId; denominator: EventId; min: number; max: number }
	// 연도가 year 이고 월이 months 중 하나
	| { kind: 'month-in'; event: EventId; year: number; months: number[] };

export type StoryMismatch = { target: string; message: string };

function within(value: number | null, min: number, max: number): boolean {
	return value !== null && value >= min && value <= max;
}

/** 문구가 기대는 사실이 데이터와 맞는가. 맞으면 null, 아니면 이유. */
export function claimProblem(claim: Claim, data: LineData): string | null {
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
			return found !== null && found.year === claim.year ? null : `${claim.event}: year differs`;
		}
		case 'years-after': {
			const from = eventOf(claim.from);
			const to = eventOf(claim.to);
			const amount = from === null || to === null ? null : to.year - from.year;
			return within(amount, claim.min, claim.max)
				? null
				: `${claim.from} → ${claim.to}: ${amount} (years-after)`;
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
		case 'rounded-value': {
			const amount = valueOf(claim.event);
			const rounded = amount === null ? null : Math.round(amount / claim.divisor);
			return rounded === claim.expected
				? null
				: `${claim.event} ÷ ${claim.divisor} rounded: ${rounded}`;
		}
		case 'ratio': {
			const numerator = valueOf(claim.numerator);
			const denominator = valueOf(claim.denominator);
			const ratio =
				numerator === null || denominator === null || denominator === 0
					? null
					: numerator / denominator;
			return within(ratio, claim.min, claim.max)
				? null
				: `${claim.numerator} ÷ ${claim.denominator}: ${ratio}`;
		}
		case 'month-in': {
			const found = eventOf(claim.event);
			const matches =
				found !== null &&
				found.year === claim.year &&
				found.month !== null &&
				claim.months.includes(found.month);
			return matches ? null : `${claim.event}: month not in ${claim.months.join(',')}`;
		}
	}
}

/** 비트 글이 기대는 사실 대조. 대상은 비트 id */
export function findLineMismatches(chapters: Chapter[], data: LineData): StoryMismatch[] {
	const mismatches: StoryMismatch[] = [];
	for (const chapter of chapters) {
		for (const beat of chapter.beats) {
			for (const claim of beat.claims) {
				const message = claimProblem(claim, data);
				if (message !== null) mismatches.push({ target: beat.id, message });
			}
		}
	}
	return mismatches;
}

/** 장 밖 화면 표기(연도 표지 · 점수 숫자)가 기대는 사실 대조 */
export function findScreenMarkMismatches(
	marks: { target: string; claims: Claim[] }[],
	data: LineData
): StoryMismatch[] {
	return marks.flatMap((mark) =>
		mark.claims.flatMap((claim) => {
			const message = claimProblem(claim, data);
			return message === null ? [] : [{ target: mark.target, message }];
		})
	);
}
