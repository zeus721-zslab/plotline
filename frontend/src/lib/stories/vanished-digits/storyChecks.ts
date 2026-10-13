// 사라진 세 자리 문구-데이터 대조(순수 함수). 공용 eventClaims.ts 를 쓴다: 불일치가 있는 대상은 화면에서 숨긴다(비트 글 · 화면 숫자).
// 대상(target): 'cover'(표지 문장) · 비트 id(그 비트 글 전체) · SCREEN_MARKS 의 target(연도 표지 · 그림 숫자 · 캡션).
// years-after · value · scaled-value 와 달력 종류(date · month-in)는 공용이고, 공용으로 표현할 수 없는 대조 다섯을 이 편에만 둔다:
// ratio(두 수량의 나눗셈) · difference(두 수량의 차) · reciprocal(수 ÷ 수량) · near-value(수가 수량의 ±비율 안) · year-between(연도 범위).
import {
	calendarClaimProblem,
	claimProblem as eventClaimProblem,
	eventOf,
	findTargetMismatches,
	valueOf,
	within,
	type CalendarClaim,
	type Claim as EventClaim,
	type StoryMismatch
} from '../../story/eventClaims.ts';
import type { ChaosData, EventId, YearEvent } from './chaosData.ts';

/** 문구가 기대는 사실 하나: 공용 종류 + 이 편 종류 */
export type Claim =
	| EventClaim<EventId>
	| CalendarClaim<EventId>
	// 두 수량의 나눗셈(numerator ÷ denominator)이 범위 안
	| { kind: 'ratio'; numerator: EventId; denominator: EventId; min: number; max: number }
	// 두 수량의 차(minuend − subtrahend)가 범위 안
	| { kind: 'difference'; minuend: EventId; subtrahend: EventId; min: number; max: number }
	// 수 numerator 를 수량으로 나눈 값이 범위 안
	| { kind: 'reciprocal'; numerator: number; event: EventId; min: number; max: number }
	// 수 amount 가 수량의 ±tolerance(비율) 안
	| { kind: 'near-value'; event: EventId; amount: number; tolerance: number }
	// 연도가 범위 안
	| { kind: 'year-between'; event: EventId; min: number; max: number };

const UNBOUNDED = Number.POSITIVE_INFINITY;
// 0.506127 · 0.506 은 ×10⁶ 정수로 저장한다(chaosData DIGIT_VALUE_SCALE)
const TRUE_VALUE = 506127;
const PRINTED_VALUE = 506000;
// "1미터 막대로 치면 0.5밀리미터 샤프심 굵기의 절반(0.25mm)": 1000mm ÷ (원래 값 ÷ 차이)
const MILLIMETERS_PER_METER = 1000;
// 3-4 "두 배를 열두 번 하면 4096배, 대략 4천 배"
const DOUBLED_TWELVE_TIMES = 4096;
const DOUBLING_TOLERANCE = 0.15;

function value(event: EventId, min: number, max: number = min): Claim {
	return { kind: 'value', event, min, max };
}

function date(event: EventId, year: number): Claim {
	return { kind: 'date', event, year };
}

function monthIn(event: EventId, year: number, months: number[]): Claim {
	return { kind: 'month-in', event, year, months };
}

function yearsAfter(from: EventId, to: EventId, min: number, max: number = min): Claim {
	return { kind: 'years-after', from, to, min, max };
}

// 자주 쓰는 사실
const RERUN_1961 = date('lorenz_rerun', 1961);
const TRUE_AND_PRINTED = [value('true_value', TRUE_VALUE), value('printed_value', PRINTED_VALUE)];
const RELIABLE_TEN_DAYS = value('reliable_days', 10);
const LIMIT_TWO_WEEKS = value('limit_days', 14);
const FIFTY_ONE_RUNS = value('ensemble_members', 51);
const THREE_EQUATIONS = value('equations_simple', 3);
const TWELVE_EQUATIONS = value('equations_full', 12);
// "4천분의 1"
const ABOUT_ONE_IN_FOUR_THOUSAND = value('diff_ratio', 3500, 4500);
// 1미터 막대가 짧아진 길이(mm)가 샤프심(0.5mm) 굵기의 절반쯤
const HALF_LEAD: Claim = {
	kind: 'reciprocal',
	numerator: MILLIMETERS_PER_METER,
	event: 'diff_ratio',
	min: 0.2,
	max: 0.3
};

/** 표지 문장 대상 이름 */
export const COVER_TARGET = 'cover';

/** 비트(또는 표지)마다 그 글이 기대는 사실. 숫자가 없는 비트는 적지 않는다 */
export const TEXT_CLAIMS: { target: string; claims: Claim[] }[] = [
	// "1961년 겨울"
	{ target: COVER_TARGET, claims: [RERUN_1961] },
	// "닷새, 이레, 열흘" · "열하루째"
	{ target: '1-1', claims: [RELIABLE_TEN_DAYS] },
	{ target: '1-3', claims: [RERUN_1961] },
	// "진공관 백여 개" · "열두 개의 식" · "1분에 하루치"
	{
		target: '2-2',
		claims: [value('vacuum_tubes', 100, 199), TWELVE_EQUATIONS, value('minutes_per_day', 1)]
	},
	// "한 시간쯤" · "한 시간이면 예순 날, 두 달 치"
	{
		target: '2-4',
		claims: [
			{
				kind: 'ratio',
				numerator: 'coffee_minutes',
				denominator: 'minutes_per_day',
				min: 60,
				max: 60
			},
			value('rerun_days', 60)
		]
	},
	{ target: '3-1', claims: TRUE_AND_PRINTED },
	// "0.506127과 0.506의 차이는 0.000127, 원래 값의 4천분의 1쯤" · "0.5밀리미터 샤프심 굵기의 절반"
	{
		target: '3-2',
		claims: [
			...TRUE_AND_PRINTED,
			{
				kind: 'difference',
				minuend: 'true_value',
				subtrahend: 'printed_value',
				min: TRUE_VALUE - PRINTED_VALUE,
				max: TRUE_VALUE - PRINTED_VALUE
			},
			ABOUT_ONE_IN_FOUR_THOUSAND,
			HALF_LEAD
		]
	},
	{ target: '3-3', claims: TRUE_AND_PRINTED },
	// "4096배, 대략 4천 배" · "4천분의 1이던 어긋남"
	{
		target: '3-4',
		claims: [
			ABOUT_ONE_IN_FOUR_THOUSAND,
			{
				kind: 'near-value',
				event: 'diff_ratio',
				amount: DOUBLED_TWELVE_TIMES,
				tolerance: DOUBLING_TOLERANCE
			}
		]
	},
	// "열두 개였던 식에서 … 단 세 개로"
	{ target: '4-1', claims: [TWELVE_EQUATIONS, THREE_EQUATIONS] },
	// "세 개의 식은"
	{ target: '4-2', claims: [THREE_EQUATIONS] },
	// "1963년" · "10년 동안 … 세 번뿐"
	{ target: '4-5', claims: [date('lorenz_paper', 1963), value('outside_citations', 3)] },
	// "그보다 70여 년 앞서"
	{ target: '5-1', claims: [yearsAfter('prize_announced', 'lorenz_rerun', 70, 79)] },
	{ target: '5-2', claims: [date('prize_announced', 1885)] },
	{ target: '5-3', claims: [monthIn('poincare_retract', 1889, [12])] },
	// "이듬해 다시 실렸고" · "70여 년 뒤"
	{
		target: '5-4',
		claims: [
			yearsAfter('poincare_retract', 'poincare_revised', 1),
			yearsAfter('poincare_retract', 'lorenz_rerun', 70, 79)
		]
	},
	// "만 번 넘게 인용" · "1963년 무렵 … 갈매기"
	{
		target: '6-1',
		claims: [value('total_citations', 10000, UNBOUNDED), date('gull_lecture', 1963)]
	},
	{ target: '6-2', claims: [monthIn('butterfly_talk', 1972, [12])] },
	// "쉰한 번" · "나머지 쉰 번"
	{ target: '7-1', claims: [FIFTY_ONE_RUNS, value('ensemble_perturbed', 50)] },
	// "쉰한 줄기"
	{ target: '7-2', claims: [FIFTY_ONE_RUNS] },
	// "10년마다 하루씩" · "1960년대 말 … 2주쯤" · "2019년" · "평균 2주 남짓" · "반세기도 더 전"
	{
		target: '7-3',
		claims: [
			value('gain_days_per_decade', 1),
			{ kind: 'year-between', event: 'lorenz_two_weeks', min: 1965, max: 1969 },
			date('limit_study', 2019),
			LIMIT_TWO_WEEKS,
			yearsAfter('lorenz_rerun', 'limit_study', 50, UNBOUNDED)
		]
	},
	// "열흘에서 멈추는" · "열하루째부터 열나흘째까지"
	{ target: '7-4', claims: [RELIABLE_TEN_DAYS, LIMIT_TWO_WEEKS] },
	{ target: '7-5', claims: [RERUN_1961] }
];

// ---------- 장 밖 화면 표기 ----------

/** 연도 표지 대상 이름(이 비트부터 오른쪽 위 연도가 바뀐다) */
export function yearMarkTarget(beatId: string): string {
	return `year/${beatId}`;
}
/** 그림 숫자 대상 이름 */
export const FULL_VALUE_TARGET = 'figure/full-value';
export const PRINTED_VALUE_TARGET = 'figure/printed-value';
export const CALENDAR_TARGET = 'figure/calendar';
export const ENSEMBLE_TARGET = 'figure/ensemble';
export const BAR_TARGET = 'figure/bar';
/** 캡션 대상 이름(캡션 문구 속 숫자) */
export const WEATHER_CAPTION_TARGET = 'caption/weather';
export const ENSEMBLE_CAPTION_TARGET = 'caption/ensemble';

/**
 * 연도 표지(시제품 yearOfBeat): 비트에서 굴러 닿는 연도와 그 사건. 연도 숫자는 데이터에서 읽고(chaosData screenFigures),
 * 여기 year 는 문구가 기대는 값이다(어긋나면 표지를 숨긴다). 6-1 '1970년대'는 데이터 줄이 없어 대조하지 않는다.
 */
export const YEAR_MARKS: { beat: string; year: number; event: YearEvent }[] = [
	{ beat: '1-3', year: 1961, event: 'lorenz_rerun' },
	{ beat: '4-5', year: 1963, event: 'lorenz_paper' },
	{ beat: '5-1', year: 1885, event: 'prize_announced' },
	{ beat: '5-3', year: 1889, event: 'poincare_retract' },
	{ beat: '5-4', year: 1961, event: 'lorenz_rerun' },
	{ beat: '6-2', year: 1972, event: 'butterfly_talk' },
	{ beat: '7-5', year: 1961, event: 'lorenz_rerun' }
];

export const SCREEN_MARKS: { target: string; claims: Claim[] }[] = [
	...YEAR_MARKS.map((mark) => ({
		target: yearMarkTarget(mark.beat),
		claims: [date(mark.event, mark.year)]
	})),
	// 표지 · 끝 화면 표식 · 3-1 큰 숫자 · 3-3 언덕 이름표
	{ target: FULL_VALUE_TARGET, claims: [value('true_value', TRUE_VALUE)] },
	{ target: PRINTED_VALUE_TARGET, claims: [value('printed_value', PRINTED_VALUE)] },
	// 날짜 칸 1~14(열흘까지 테두리)
	{ target: CALENDAR_TARGET, claims: [RELIABLE_TEN_DAYS, LIMIT_TWO_WEEKS] },
	// 7-1 · 7-2 51줄기(1 + 50)
	{ target: ENSEMBLE_TARGET, claims: [FIFTY_ONE_RUNS, value('ensemble_perturbed', 50)] },
	// 3-2 자 '0.25 mm'
	{ target: BAR_TARGET, claims: [HALF_LEAD] },
	// '1963년의 세 식으로 다시 계산한 두 날씨'
	{ target: WEATHER_CAPTION_TARGET, claims: [date('lorenz_paper', 1963), THREE_EQUATIONS] },
	// '실제 예보가 아니라 세 식을 51번 계산'
	{ target: ENSEMBLE_CAPTION_TARGET, claims: [THREE_EQUATIONS, FIFTY_ONE_RUNS] }
];

function divide(numerator: number | null, denominator: number | null): number | null {
	return numerator === null || denominator === null || denominator === 0
		? null
		: numerator / denominator;
}

/** 문구가 기대는 사실이 데이터와 맞는가. 맞으면 null, 아니면 이유. */
export function claimProblem(claim: Claim, data: ChaosData): string | null {
	const { events } = data;
	switch (claim.kind) {
		case 'date':
		case 'month-in':
			return calendarClaimProblem(claim, events);
		case 'ratio': {
			const ratio = divide(valueOf(events, claim.numerator), valueOf(events, claim.denominator));
			return within(ratio, claim.min, claim.max)
				? null
				: `${claim.numerator} ÷ ${claim.denominator}: ${ratio}`;
		}
		case 'difference': {
			const minuend = valueOf(events, claim.minuend);
			const subtrahend = valueOf(events, claim.subtrahend);
			const difference = minuend === null || subtrahend === null ? null : minuend - subtrahend;
			return within(difference, claim.min, claim.max)
				? null
				: `${claim.minuend} − ${claim.subtrahend}: ${difference}`;
		}
		case 'reciprocal': {
			const quotient = divide(claim.numerator, valueOf(events, claim.event));
			return within(quotient, claim.min, claim.max)
				? null
				: `${claim.numerator} ÷ ${claim.event}: ${quotient}`;
		}
		case 'near-value': {
			const amount = valueOf(events, claim.event);
			const near =
				amount !== null &&
				within(claim.amount, amount * (1 - claim.tolerance), amount * (1 + claim.tolerance));
			return near
				? null
				: `${claim.amount} not within ±${claim.tolerance} of ${claim.event}: ${amount}`;
		}
		case 'year-between': {
			const found = eventOf(events, claim.event);
			return within(found === null ? null : found.year, claim.min, claim.max)
				? null
				: `${claim.event}: year not in ${claim.min}~${claim.max}`;
		}
		default:
			return eventClaimProblem(claim, events);
	}
}

/**
 * 이 편 문구 대조 전체: 표지 · 비트 글 → 장 밖 화면 표기(연도 표지 · 그림 숫자 · 캡션).
 * 페이지 숨김과 관리자 대조(registry)가 같은 계산을 쓴다.
 */
export function storyMismatches(data: ChaosData): StoryMismatch[] {
	return findTargetMismatches([...TEXT_CLAIMS, ...SCREEN_MARKS], (claim) =>
		claimProblem(claim, data)
	);
}
