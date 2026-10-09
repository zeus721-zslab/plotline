// 블랙홀 단면 동심원 지도의 띠 배치(순수 함수). 반지름은 bh_boundaries.radius_rs(지평선 배수)를 쓰고,
// 한 숫자로 정해지지 않는 작용권만 지평선과 광자구 사이에 표시용 띠로 둔다(숫자 표기 없음).
import { BOUNDARY_IDS, type Boundary, type BoundaryId } from './holeData.ts';
import type { Place } from './scenes.ts';

export type MapRing = { id: BoundaryId; nameKo: string; radius: number; physical: boolean };

// 작용권 표시 띠 바깥 가장자리: 지평선에서 광자구까지의 이 비율 지점
const ERGOSPHERE_DISPLAY_SHARE = 0.6;
// 데이터에 경계가 없을 때(그 장 문구는 대조에서 숨겨진다) 그림이 깨지지 않게 쓰는 표시용 반지름
const FALLBACK_RADII: Record<BoundaryId, number> = {
	isco: 3,
	shadow: 2.5,
	photon_sphere: 1.5,
	ergosphere: 1.3,
	horizon: 1
};

export type MapLayout = Map<BoundaryId, MapRing>;

function ergosphereRadius(boundaries: Map<string, Boundary>): number | null {
	const horizon = boundaries.get('horizon');
	const photon = boundaries.get('photon_sphere');
	if (horizon === undefined || photon === undefined) return null;
	if (horizon.radiusRs === null || photon.radiusRs === null) return null;
	return horizon.radiusRs + (photon.radiusRs - horizon.radiusRs) * ERGOSPHERE_DISPLAY_SHARE;
}

/** 데이터에 있는 경계만 띠로 만든다. */
export function buildMapLayout(boundaries: Map<string, Boundary>): MapLayout {
	const layout: MapLayout = new Map();
	for (const id of BOUNDARY_IDS) {
		const boundary = boundaries.get(id);
		if (boundary === undefined) continue;
		const radius = id === 'ergosphere' ? ergosphereRadius(boundaries) : boundary.radiusRs;
		if (radius === null) continue;
		layout.set(id, { id, nameKo: boundary.nameKo, radius, physical: boundary.physical });
	}
	return layout;
}

export function ringRadius(layout: MapLayout, id: BoundaryId): number {
	const ring = layout.get(id);
	return ring === undefined ? FALLBACK_RADII[id] : ring.radius;
}

/** 장면 자리(경계 배수 또는 고정값)를 지평선 배수 반지름으로 */
export function placeRadius(layout: MapLayout, place: Place): number {
	return place.kind === 'radius' ? place.radius : ringRadius(layout, place.boundary) * place.scale;
}
