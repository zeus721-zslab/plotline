// 사라진 세 자리 데이터 해석(순수 함수): 발행 파일 lorenz_chaos 를 사건 → 기록(날짜 · 수량) 지도로 바꾸고(공용 eventData.ts),
// 화면에 그리는 숫자(표지 숫자 · 날짜 칸 · 줄기 수 · 연도 · 자 길이)를 그 지도에서 읽는다. 그림은 이 값을 쓰고 상수로 박지 않는다.
// 수량 칸은 정수다. 0.506127 · 0.506 은 ×10⁶ 정수(506127 · 506000)로 저장한다.
import { buildEventMap, type EventRecord } from '../../story/eventData.ts';
import type { PublishedDataset } from '../../story/published.ts';

export const EVENT_IDS = [
	// 연표
	'lorenz_rerun',
	'lorenz_paper',
	'gull_lecture',
	'prize_announced',
	'poincare_retract',
	'poincare_revised',
	'lorenz_two_weeks',
	'butterfly_talk',
	'limit_study',
	// 수치
	'true_value',
	'printed_value',
	'diff_ratio',
	'vacuum_tubes',
	'equations_full',
	'equations_simple',
	'minutes_per_day',
	'coffee_minutes',
	'rerun_days',
	'outside_citations',
	'total_citations',
	'ensemble_members',
	'ensemble_perturbed',
	'gain_days_per_decade',
	'limit_days',
	'reliable_days'
] as const;
export type EventId = (typeof EVENT_IDS)[number];

export type ChaosData = { events: Map<EventId, EventRecord> };

/** 0.506127 · 0.506 을 정수로 저장한 배율 */
export const DIGIT_VALUE_SCALE = 1_000_000;
// 3-2 "1미터짜리 막대": 1m = 1000mm. 짧아진 길이(mm) = 1000 ÷ (원래 값 ÷ 차이)
const MILLIMETERS_PER_METER = 1000;
// 자 눈금 글자(0.25 mm)의 소수 자리
const BAR_DECIMALS = 2;

/** 사건 줄을 읽는다. 형식이 다른 줄이 있거나 같은 사건이 두 번 나오면 null. */
export function buildChaosData(dataset: PublishedDataset): ChaosData | null {
	const events = buildEventMap(dataset, EVENT_IDS);
	return events === null ? null : { events };
}

/** 화면 연도 표지에 쓰는 사건(시제품 yearOfBeat 의 1961 · 1963 · 1885 · 1889 · 1972) */
export const YEAR_EVENTS = [
	'lorenz_rerun',
	'lorenz_paper',
	'prize_announced',
	'poincare_retract',
	'butterfly_talk'
] as const satisfies readonly EventId[];
export type YearEvent = (typeof YEAR_EVENTS)[number];

/**
 * 화면에 그리는 숫자. 데이터 줄이 없으면 null(그 표기는 문구 대조에서도 어긋나 숨겨진다, storyChecks SCREEN_MARKS).
 * - fullValueText · printedValueText: 표지 · 끝 화면 표식, 3-1 큰 숫자, 3-3 언덕 이름표('0.506127' · '0.506')
 * - reliableDays · limitDays: 날짜 칸(1~reliableDays 는 테두리, limitDays 까지 이어 그림)
 * - ensembleMembers: 7-1 · 7-2 줄기 수
 * - years: 연도 표지
 * - barShortMm: 3-2 자 눈금 '0.25 mm'
 */
export type ScreenFigures = {
	fullValueText: string | null;
	printedValueText: string | null;
	reliableDays: number | null;
	limitDays: number | null;
	ensembleMembers: number | null;
	years: Record<YearEvent, number | null>;
	barShortMm: number | null;
};

function valueOf(data: ChaosData, id: EventId): number | null {
	const found = data.events.get(id);
	return found === undefined ? null : found.value;
}

function yearOf(data: ChaosData, id: EventId): number | null {
	const found = data.events.get(id);
	return found === undefined ? null : found.year;
}

function digitText(value: number | null): string | null {
	return value === null ? null : String(value / DIGIT_VALUE_SCALE);
}

function barShortMm(diffRatio: number | null): number | null {
	if (diffRatio === null || diffRatio === 0) return null;
	const rounding = 10 ** BAR_DECIMALS;
	return Math.round((MILLIMETERS_PER_METER / diffRatio) * rounding) / rounding;
}

export function screenFigures(data: ChaosData): ScreenFigures {
	return {
		fullValueText: digitText(valueOf(data, 'true_value')),
		printedValueText: digitText(valueOf(data, 'printed_value')),
		reliableDays: valueOf(data, 'reliable_days'),
		limitDays: valueOf(data, 'limit_days'),
		ensembleMembers: valueOf(data, 'ensemble_members'),
		years: {
			lorenz_rerun: yearOf(data, 'lorenz_rerun'),
			lorenz_paper: yearOf(data, 'lorenz_paper'),
			prize_announced: yearOf(data, 'prize_announced'),
			poincare_retract: yearOf(data, 'poincare_retract'),
			butterfly_talk: yearOf(data, 'butterfly_talk')
		},
		barShortMm: barShortMm(valueOf(data, 'diff_ratio'))
	};
}
