// 사건의 지평선 너머 데이터 해석(순수 함수): 발행 파일 두 개(black_holes · bh_boundaries)를 화면이 쓰는 모양으로 바꾼다.
// 질량 · 경계 배수만 저장되어 있고, km · 시간 비율은 화면(fallMath.ts)에서 계산한다(D-40).
import type { CellValue, PublishedDataset } from '../../story/published.ts';

export const BOUNDARY_IDS = ['isco', 'shadow', 'photon_sphere', 'ergosphere', 'horizon'] as const;
export type BoundaryId = (typeof BOUNDARY_IDS)[number];

export const M87_HOLE = 'm87';
export const CYGNUS_X1_HOLE = 'cyg_x1';

export type BlackHole = {
	id: string;
	nameKo: string;
	// 태양 질량의 몇 배
	massSolar: number;
};

export type Boundary = {
	id: string;
	nameKo: string;
	// 지평선 반지름의 몇 배. 작용권처럼 한 숫자로 정해지지 않는 경계는 null.
	radiusRs: number | null;
	// false 면 실제 경계가 아니라 겉보기 모습(그림자)
	physical: boolean;
};

function isPositiveNumber(value: CellValue | undefined): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function toBlackHole(values: Record<string, CellValue>): BlackHole | null {
	const { bh_id, name_ko, mass_solar } = values;
	if (typeof bh_id !== 'string' || typeof name_ko !== 'string' || !isPositiveNumber(mass_solar)) {
		return null;
	}
	return { id: bh_id, nameKo: name_ko, massSolar: mass_solar };
}

function toBoundary(values: Record<string, CellValue>): Boundary | null {
	const { boundary_id, name_ko, radius_rs, physical } = values;
	if (
		typeof boundary_id !== 'string' ||
		typeof name_ko !== 'string' ||
		typeof physical !== 'boolean'
	) {
		return null;
	}
	// 정의상 선택 칸: 없으면 반지름 없음, 있으면 양수여야 한다.
	if (radius_rs !== undefined && !isPositiveNumber(radius_rs)) return null;
	return {
		id: boundary_id,
		nameKo: name_ko,
		radiusRs: radius_rs === undefined ? null : radius_rs,
		physical
	};
}

function buildMap<T extends { id: string }>(
	dataset: PublishedDataset,
	convert: (values: Record<string, CellValue>) => T | null
): Map<string, T> | null {
	const result = new Map<string, T>();
	for (const row of dataset.rows) {
		const item = convert(row.values);
		if (item === null || result.has(item.id)) return null;
		result.set(item.id, item);
	}
	return result;
}

/** 블랙홀 목록. 값 형식이 하나라도 다르면 null(화면은 불러오기 실패로 보인다). */
export function buildBlackHoles(dataset: PublishedDataset): Map<string, BlackHole> | null {
	return buildMap(dataset, toBlackHole);
}

/** 경계 목록. 값 형식이 하나라도 다르면 null. */
export function buildBoundaries(dataset: PublishedDataset): Map<string, Boundary> | null {
	return buildMap(dataset, toBoundary);
}
