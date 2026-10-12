// 그림용 정적 JSON 해석(순수 함수). 자료는 시제품 prepare-data.mjs 산출물을 그대로 둔 파일(static/stories/unseen-companion/data/)이고,
// 시제품 build.mjs 가 화면에 인라인하던 값만 골라 읽는다(시리우스: B 질량 비 · 1750~1850 길 · 상대 궤도 / 51 페가시: 주기 · 흔들림 · 궤도 · 속도).
// - sirius.json: Bond et al. 2017 궤도 요소 · Hipparcos 고유운동으로 계산한 각초 좌표(시제품 prepare-data.mjs)
// - 51peg.json: NASA Exoplanet Archive 기본값(원 궤도 근사)

export const STATIC_FILES = {
	sirius: '/stories/unseen-companion/data/sirius.json',
	peg: '/stories/unseen-companion/data/51peg.json'
} as const;

export type SiriusPath = {
	year: number[];
	baryEast: number[];
	baryNorth: number[];
	reflexEast: number[];
	reflexNorth: number[];
	relEast: number[];
	relNorth: number[];
};

export type SiriusOrbit = { year: number[]; east: number[]; north: number[] };

export type StaticData = {
	sirius: { massFractionB: number; path: SiriusPath; orbit: SiriusOrbit };
	peg: {
		periodDays: number;
		wobbleOverRadius: number;
		orbitAu: number;
		velocity: { day: number[]; metersPerSecond: number[] };
	};
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function numberAt(record: Record<string, unknown>, key: string): number | null {
	const value = record[key];
	return isFiniteNumber(value) ? value : null;
}

function recordAt(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
	const value = record[key];
	return isRecord(value) ? value : null;
}

/** 같은 길이의 숫자 배열 묶음. 하나라도 형식이 다르거나 길이가 다르거나 2개 미만이면 null. */
function columns<K extends string>(
	record: Record<string, unknown> | null,
	keys: readonly K[]
): Record<K, number[]> | null {
	if (record === null) return null;
	const result: Partial<Record<K, number[]>> = {};
	let length = -1;
	for (const key of keys) {
		const value = record[key];
		if (!Array.isArray(value) || value.length < 2 || !value.every(isFiniteNumber)) return null;
		if (length !== -1 && value.length !== length) return null;
		length = value.length;
		result[key] = value;
	}
	// 위 반복에서 모든 key 를 채웠으므로 Partial 을 벗긴다.
	return result as Record<K, number[]>;
}

const PATH_KEYS = [
	'year',
	'baryEast',
	'baryNorth',
	'reflexEast',
	'reflexNorth',
	'relEast',
	'relNorth'
] as const;
const ORBIT_KEYS = ['year', 'east', 'north'] as const;
const VELOCITY_KEYS = ['day', 'metersPerSecond'] as const;

/** 두 파일을 읽어 화면 자료로. 형식이 하나라도 다르면 null. */
export function parseStaticData(siriusRaw: unknown, pegRaw: unknown): StaticData | null {
	if (!isRecord(siriusRaw) || !isRecord(pegRaw)) return null;
	const derived = recordAt(siriusRaw, 'derived');
	const massFractionB = derived === null ? null : numberAt(derived, 'massFractionB');
	const path = columns(recordAt(siriusRaw, 'path'), PATH_KEYS);
	const orbit = columns(recordAt(siriusRaw, 'relativeOrbit'), ORBIT_KEYS);
	const planet = recordAt(pegRaw, 'planet');
	const pegDerived = recordAt(pegRaw, 'derived');
	const velocity = columns(recordAt(pegRaw, 'velocity'), VELOCITY_KEYS);
	if (massFractionB === null || path === null || orbit === null) return null;
	if (planet === null || pegDerived === null || velocity === null) return null;
	const periodDays = numberAt(planet, 'periodDays');
	const orbitAu = numberAt(planet, 'orbitSemiMajorAxisAu');
	const wobbleOverRadius = numberAt(pegDerived, 'starWobbleOverStarRadius');
	if (periodDays === null || orbitAu === null || wobbleOverRadius === null) return null;
	return {
		sirius: { massFractionB, path, orbit },
		peg: { periodDays, wobbleOverRadius, orbitAu, velocity }
	};
}
