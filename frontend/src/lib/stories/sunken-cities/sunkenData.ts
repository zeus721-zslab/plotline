// 바다 밑의 도시들 데이터 해석(순수 함수): 발행 파일 세 개(atlantis_criteria · sunken_places · sunken_measures)를 화면이 쓰는 모양으로 바꾼다.
// 근거 수치는 장소 × 항목 한 줄씩(긴 형식)이고, 근거가 없는 항목은 줄이 없다(D-41). 값 형식이 하나라도 다르면 null(화면은 불러오기 실패).
import type { CellValue, PublishedDataset } from '../../story/published.ts';

export const CRITERION_IDS = ['speed', 'location', 'time', 'size'] as const;
export type CriterionId = (typeof CRITERION_IDS)[number];

export const PLACE_IDS = [
	'lyonesse',
	'doggerland',
	'pavlopetri',
	'baiae',
	'heracleion',
	'port_royal'
] as const;
export type PlaceId = (typeof PLACE_IDS)[number];

export const MEASURE_IDS = [
	'submerge_start',
	'submerge_end',
	'speed',
	'area',
	'depth',
	'discovered'
] as const;
export type MeasureId = (typeof MEASURE_IDS)[number];

const WORKS = ['timaeus', 'critias'] as const;
export type Work = (typeof WORKS)[number];

export const VERDICTS = ['match', 'no', 'unknown'] as const;
export type Verdict = (typeof VERDICTS)[number];

const CERTAINTIES = ['confirmed', 'disputed'] as const;
export type Certainty = (typeof CERTAINTIES)[number];

export type Criterion = {
	id: CriterionId;
	work: Work;
	// 원문 위치(스테파누스 쪽수, 예: 25d)
	passage: string;
	// 조엣 번역 원문 구절. 출처 절에만 쓴다(D-41).
	quoteEn: string;
	amountA: number | null;
	amountB: number | null;
};

export type Place = {
	id: PlaceId;
	nameKo: string;
	regionKo: string;
	// 지중해 밖(헤라클레스의 기둥 바깥 바다)인가
	outsideMed: boolean;
};

export type Measure = {
	place: PlaceId;
	measure: MeasureId;
	yearFrom: number | null;
	yearTo: number | null;
	// 면적 km² · 수심 m
	amountMin: number | null;
	amountMax: number | null;
	// 속도 항목만
	verdict: Verdict | null;
	certainty: Certainty;
	noteKo: string;
};

export type SunkenData = {
	criteria: Map<CriterionId, Criterion>;
	places: Map<PlaceId, Place>;
	// 열쇠: measureKey(장소, 항목)
	measures: Map<string, Measure>;
};

function isOneOf<T extends string>(
	options: readonly T[],
	value: CellValue | undefined
): value is T {
	return options.some((option) => option === value);
}

function isVerdict(value: CellValue | undefined): value is Verdict {
	return isOneOf(VERDICTS, value);
}

function isAmount(value: CellValue | undefined): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isYear(value: CellValue | undefined): value is number {
	return typeof value === 'number' && Number.isInteger(value);
}

/** 선택 칸: 없으면 null, 있으면 형식이 맞아야 한다(맞지 않으면 undefined 를 돌려 형식 오류를 알린다). */
function optional<T extends CellValue>(
	value: CellValue | undefined,
	valid: (candidate: CellValue | undefined) => candidate is T
): T | null | undefined {
	if (value === undefined) return null;
	return valid(value) ? value : undefined;
}

export function measureKey(place: PlaceId, measure: MeasureId): string {
	return `${place}|${measure}`;
}

function toCriterion(values: Record<string, CellValue>): Criterion | null {
	const { criterion, work, passage, quote_en } = values;
	const amountA = optional(values.amount_a, isAmount);
	const amountB = optional(values.amount_b, isAmount);
	if (
		!isOneOf(CRITERION_IDS, criterion) ||
		!isOneOf(WORKS, work) ||
		typeof passage !== 'string' ||
		typeof quote_en !== 'string' ||
		amountA === undefined ||
		amountB === undefined
	) {
		return null;
	}
	return { id: criterion, work, passage, quoteEn: quote_en, amountA, amountB };
}

function toPlace(values: Record<string, CellValue>): Place | null {
	const { place, name_ko, region_ko, outside_med } = values;
	if (
		!isOneOf(PLACE_IDS, place) ||
		typeof name_ko !== 'string' ||
		typeof region_ko !== 'string' ||
		typeof outside_med !== 'boolean'
	) {
		return null;
	}
	return { id: place, nameKo: name_ko, regionKo: region_ko, outsideMed: outside_med };
}

function toMeasure(values: Record<string, CellValue>): Measure | null {
	const { place, measure, certainty, note_ko } = values;
	const yearFrom = optional(values.year_from, isYear);
	const yearTo = optional(values.year_to, isYear);
	const amountMin = optional(values.amount_min, isAmount);
	const amountMax = optional(values.amount_max, isAmount);
	const verdict = optional(values.verdict, isVerdict);
	if (
		!isOneOf(PLACE_IDS, place) ||
		!isOneOf(MEASURE_IDS, measure) ||
		!isOneOf(CERTAINTIES, certainty) ||
		typeof note_ko !== 'string' ||
		yearFrom === undefined ||
		yearTo === undefined ||
		amountMin === undefined ||
		amountMax === undefined ||
		verdict === undefined
	) {
		return null;
	}
	return {
		place,
		measure,
		yearFrom,
		yearTo,
		amountMin,
		amountMax,
		verdict,
		certainty,
		noteKo: note_ko
	};
}

function buildMap<K, T>(
	dataset: PublishedDataset,
	convert: (values: Record<string, CellValue>) => T | null,
	keyOf: (item: T) => K
): Map<K, T> | null {
	const result = new Map<K, T>();
	for (const row of dataset.rows) {
		const item = convert(row.values);
		if (item === null) return null;
		const key = keyOf(item);
		if (result.has(key)) return null;
		result.set(key, item);
	}
	return result;
}

/** 묶음 세 개를 화면 데이터로. 값 형식이 하나라도 다르면 null. */
export function buildSunkenData(
	criteriaDataset: PublishedDataset,
	placesDataset: PublishedDataset,
	measuresDataset: PublishedDataset
): SunkenData | null {
	const criteria = buildMap(criteriaDataset, toCriterion, (item) => item.id);
	const places = buildMap(placesDataset, toPlace, (item) => item.id);
	const measures = buildMap(measuresDataset, toMeasure, (item) =>
		measureKey(item.place, item.measure)
	);
	if (criteria === null || places === null || measures === null) return null;
	return { criteria, places, measures };
}

export function measureOf(data: SunkenData, place: PlaceId, measure: MeasureId): Measure | null {
	const found = data.measures.get(measureKey(place, measure));
	return found === undefined ? null : found;
}
