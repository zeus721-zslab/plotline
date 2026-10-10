// 바다 밑의 도시들 계산(순수 함수): 장소 대표 연도, "잠긴 지 ○년", 수심 글.
// 반올림 규칙은 출처 절 note(SunkenCitiesPage SOURCE_NOTE)에 적는다.
import { measureOf, type Measure, type PlaceId, type SunkenData } from './sunkenData.ts';

const THOUSAND = 1000;
const TEN_THOUSAND = 10_000;
const HUNDRED = 100;
const TEN = 10;

export type YearPoint = {
	year: number;
	// 연도 범위(부터 ~ 까지)의 가운데인가
	range: boolean;
};

/** 줄의 연도: 범위면 가운데, 하나면 그 해. 연도가 없으면 null. */
export function yearPointOf(measure: Measure | null): YearPoint | null {
	if (measure === null || measure.yearFrom === null) return null;
	if (measure.yearTo === null) return { year: measure.yearFrom, range: false };
	return { year: (measure.yearFrom + measure.yearTo) / 2, range: true };
}

/** 장소 대표 연도: 다 잠긴 때(submerge_end)가 있으면 그 줄, 없으면 잠기기 시작한 때(submerge_start). 둘 다 없으면 null. */
export function representativeYear(data: SunkenData, place: PlaceId): YearPoint | null {
	const end = yearPointOf(measureOf(data, place, 'submerge_end'));
	return end !== null ? end : yearPointOf(measureOf(data, place, 'submerge_start'));
}

function roundTo(value: number, step: number): number {
	return Math.round(value / step) * step;
}

function grouped(value: number): string {
	return value.toLocaleString('en-US');
}

/** 1만 이상은 "1만 1,600", 그 아래는 "7,000" */
export function countText(value: number): string {
	if (value < TEN_THOUSAND) return grouped(value);
	const man = Math.floor(value / TEN_THOUSAND);
	const rest = value % TEN_THOUSAND;
	return rest === 0 ? `${man}만` : `${man}만 ${grouped(rest)}`;
}

/**
 * 지금 해까지 지난 햇수 글: 1,000년 이상은 100 단위 반올림("약 7,000년"), 1,000년 미만이면 단일 연도는 그대로("334년"),
 * 범위(가운데)는 10 단위 반올림("약 340년").
 */
export function yearsAgoText(storyYear: number, point: YearPoint): string {
	const years = storyYear - point.year;
	if (years >= THOUSAND) return `약 ${countText(roundTo(years, HUNDRED))}년`;
	if (!point.range) return `${Math.round(years)}년`;
	return `약 ${countText(roundTo(years, TEN))}년`;
}

/** 수심 글(앞의 "약" 없이): "10m" · "3~4m" */
export function depthText(measure: Measure): string | null {
	if (measure.amountMin === null) return null;
	if (measure.amountMax === null || measure.amountMax === measure.amountMin) {
		return `${measure.amountMin}m`;
	}
	return `${measure.amountMin}~${measure.amountMax}m`;
}
