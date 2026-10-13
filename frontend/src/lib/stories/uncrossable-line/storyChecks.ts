// 넘을 수 없는 선 문구-데이터 대조(순수 함수). 공용 eventClaims.ts 를 쓴다: 불일치가 있는 대상은 화면에서 숨긴다.
// 대상(target): 비트 id(그 비트 글 전체) · SCREEN_MARKS 의 target(연도 표지 · 캔버스 점수 숫자).
// years-after · value · scaled-value 는 공용 종류이고, 이 편의 date 는 연도만 본다. 공용 종류로 표현할 수 없는 대조 셋을 이 편에만 둔다:
// rounded-value(반올림, 83.7판 → 84판) · ratio(두 수량의 나눗셈) · month-in(월 범위, "여름" · "겨울").
import {
	claimProblem as eventClaimProblem,
	eventOf,
	findTargetMismatches,
	valueOf,
	within,
	type Claim as EventClaim,
	type StoryMismatch
} from '../../story/eventClaims.ts';
import { CHAPTERS, SCREEN_MARKS } from './chapters.ts';
import type { EventId, LineData } from './lineData.ts';

/** 문구가 기대는 사실 하나: 공용 종류 + 이 편 종류 */
export type Claim =
	| EventClaim<EventId>
	| { kind: 'date'; event: EventId; year: number }
	// 수량 칸을 divisor 로 나눠 반올림한 값이 expected
	| { kind: 'rounded-value'; event: EventId; divisor: number; expected: number }
	// 두 수량의 나눗셈(numerator ÷ denominator)이 범위 안
	| { kind: 'ratio'; numerator: EventId; denominator: EventId; min: number; max: number }
	// 연도가 year 이고 월이 months 중 하나
	| { kind: 'month-in'; event: EventId; year: number; months: number[] };

/** 문구가 기대는 사실이 데이터와 맞는가. 맞으면 null, 아니면 이유. */
export function claimProblem(claim: Claim, data: LineData): string | null {
	const { events } = data;
	switch (claim.kind) {
		case 'date': {
			const found = eventOf(events, claim.event);
			return found !== null && found.year === claim.year ? null : `${claim.event}: year differs`;
		}
		case 'rounded-value': {
			const amount = valueOf(events, claim.event);
			const rounded = amount === null ? null : Math.round(amount / claim.divisor);
			return rounded === claim.expected
				? null
				: `${claim.event} ÷ ${claim.divisor} rounded: ${rounded}`;
		}
		case 'ratio': {
			const numerator = valueOf(events, claim.numerator);
			const denominator = valueOf(events, claim.denominator);
			const ratio =
				numerator === null || denominator === null || denominator === 0
					? null
					: numerator / denominator;
			return within(ratio, claim.min, claim.max)
				? null
				: `${claim.numerator} ÷ ${claim.denominator}: ${ratio}`;
		}
		case 'month-in': {
			const found = eventOf(events, claim.event);
			const matches =
				found !== null &&
				found.year === claim.year &&
				found.month !== null &&
				claim.months.includes(found.month);
			return matches ? null : `${claim.event}: month not in ${claim.months.join(',')}`;
		}
		default:
			return eventClaimProblem(claim, events);
	}
}

/**
 * 이 편 문구 대조 전체: 비트 글(대상은 비트 id) → 장 밖 화면 표기(연도 표지 · 점수 숫자).
 * 페이지 숨김과 관리자 대조(registry)가 같은 계산을 쓴다.
 */
export function storyMismatches(data: LineData): StoryMismatch[] {
	const beats = CHAPTERS.flatMap((chapter) =>
		chapter.beats.map((beat) => ({ target: beat.id, claims: beat.claims }))
	);
	return findTargetMismatches([...beats, ...SCREEN_MARKS], (claim) => claimProblem(claim, data));
}
