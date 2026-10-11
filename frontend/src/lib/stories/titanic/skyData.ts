// 하늘 계산 자료 해석 · 조회(순수 함수). 자료는 시제품 sky/compute.py 산출물을 그대로 둔 정적 JSON(static/stories/titanic/sky/)이다.
// - stars-radec.json: 1912-04-14 23:40 선박 시각의 겉보기 적경 · 적위 · 등급 · B−V(등급 6.0 이하 5,041개, Hipparcos)
// - bodies.json: 해 · 달 · 행성의 고도 · 방위(시각별, JPL DE421 · skyfield 1.55)
// 시각은 1912-04-14 00:00 선박 시각(ATS = GMT − 2시간 58분)부터 센 분으로 다룬다.

export const SKY_FILES = {
	stars: '/stories/titanic/sky/stars-radec.json',
	bodies: '/stories/titanic/sky/bodies.json'
} as const;

export const LATITUDE_DEGREES = 41.73;
export const BODY_NAMES = ['sun', 'moon', 'venus', 'jupiter', 'mars', 'saturn', 'mercury'] as const;
export type BodyName = (typeof BODY_NAMES)[number];

// 별 시간각 계산의 기준 시각(stars-radec.json 의 기준과 같다)
const LST_REFERENCE_ATS = '1912-04-14 23:40';
const DAY_ZERO = { year: 1912, month: 4, day: 14 };
const MINUTES_PER_DAY = 1440;
const SIDEREAL_DEGREES_PER_MINUTE = 360.98564736629 / MINUTES_PER_DAY;
const ATS_PATTERN = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;
const DEGREES = Math.PI / 180;

// 시제품 v3 한계 등급 모형: [해 고도°, 한계 등급]
const LIMIT_TABLE: Array<[number, number]> = [
	[-18, 6.0],
	[-15, 5.0],
	[-12, 3.8],
	[-9, 2.4],
	[-6, 0.8],
	[-4, -0.4],
	[-2, -1.8],
	[0, -3.0],
	[2, -4.0],
	[4, -4.6]
];
const DARK_SKY_LIMIT = 6.5;

export type CatalogStar = {
	ra: number;
	sinDec: number;
	cosDec: number;
	magnitude: number;
	colorIndex: number;
};

export type BodyState = { alt: number; az: number; extra: number };
// [분, (고도, 방위, 덧값) × BODY_NAMES]. 덧값은 달이면 밝은 면 비율, 나머지는 등급.
type BodyRow = number[];

export type SkyData = {
	stars: CatalogStar[];
	bodyRows: BodyRow[];
	lstReference: number;
	lstReferenceMinute: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

/** "1912-04-15 02:18" → 1912-04-14 00:00 부터 분. 형식이 다르면 null. */
export function minutesFromAts(text: string): number | null {
	const match = ATS_PATTERN.exec(text);
	if (match === null) return null;
	const [, year, month, day, hour, minute] = match.map(Number);
	if (year !== DAY_ZERO.year || month !== DAY_ZERO.month) return null;
	return (day - DAY_ZERO.day) * MINUTES_PER_DAY + hour * 60 + minute;
}

function parseStars(raw: unknown): CatalogStar[] | null {
	if (!isRecord(raw) || !Array.isArray(raw.stars)) return null;
	const stars: CatalogStar[] = [];
	for (const entry of raw.stars) {
		if (!Array.isArray(entry) || entry.length !== 4 || !entry.every(isFiniteNumber)) return null;
		const [ra, dec, magnitude, colorIndex] = entry;
		const declination = dec * DEGREES;
		stars.push({
			ra,
			sinDec: Math.sin(declination),
			cosDec: Math.cos(declination),
			magnitude,
			colorIndex
		});
	}
	return stars;
}

function bodyRowOf(state: Record<string, unknown>): BodyRow | null {
	if (typeof state.ats !== 'string') return null;
	const minute = minutesFromAts(state.ats);
	if (minute === null) return null;
	const row: BodyRow = [minute];
	for (const name of BODY_NAMES) {
		const body = state[name];
		if (!isRecord(body) || !isFiniteNumber(body.alt) || !isFiniteNumber(body.az)) return null;
		// 시제품 build.py 와 같게: 달은 밝은 면 비율, 나머지는 등급(없으면 0)
		const extra = name === 'moon' ? body.fraction_illuminated : body.magnitude;
		row.push(body.alt, body.az, isFiniteNumber(extra) ? extra : 0);
	}
	return row;
}

/** 시제품 build.py 와 같은 변환: dense 를 시각순으로, 같은 분은 처음 것만. 기준 항성시는 times 의 23:40. */
function parseBodies(raw: unknown): Omit<SkyData, 'stars'> | null {
	if (!isRecord(raw) || !Array.isArray(raw.dense) || !Array.isArray(raw.times)) return null;
	const rows: BodyRow[] = [];
	for (const state of raw.dense) {
		if (!isRecord(state)) return null;
		const row = bodyRowOf(state);
		if (row === null) return null;
		rows.push(row);
	}
	rows.sort((a, b) => a[0] - b[0]);
	const unique = rows.filter((row, index) => index === 0 || row[0] !== rows[index - 1][0]);
	const reference = raw.times.find(
		(state): state is Record<string, unknown> => isRecord(state) && state.ats === LST_REFERENCE_ATS
	);
	const referenceMinute = minutesFromAts(LST_REFERENCE_ATS);
	if (reference === undefined || !isFiniteNumber(reference.lst_deg) || referenceMinute === null) {
		return null;
	}
	if (unique.length < 2) return null;
	return { bodyRows: unique, lstReference: reference.lst_deg, lstReferenceMinute: referenceMinute };
}

export function parseSkyData(starsRaw: unknown, bodiesRaw: unknown): SkyData | null {
	const stars = parseStars(starsRaw);
	const bodies = parseBodies(bodiesRaw);
	if (stars === null || bodies === null) return null;
	return { stars, ...bodies };
}

export function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

export function lerp(from: number, to: number, amount: number): number {
	return from + (to - from) * amount;
}

/** 해 고도에 따른 맨눈 한계 등급(시제품 v3 표) */
export function limitingMagnitude(sunAltitude: number): number {
	if (sunAltitude <= LIMIT_TABLE[0][0]) return DARK_SKY_LIMIT;
	for (let index = 1; index < LIMIT_TABLE.length; index += 1) {
		const [altitude, magnitude] = LIMIT_TABLE[index];
		if (sunAltitude <= altitude) {
			const [previousAltitude, previousMagnitude] = LIMIT_TABLE[index - 1];
			return lerp(
				previousMagnitude,
				magnitude,
				(sunAltitude - previousAltitude) / (altitude - previousAltitude)
			);
		}
	}
	return LIMIT_TABLE[LIMIT_TABLE.length - 1][1];
}

/** 그 분의 해 · 달 · 행성 하나(앞뒤 자료 시각 사이를 선형 보간, 방위는 짧은 쪽으로 — 시제품 v3 bodiesAt) */
export function bodyAt(sky: SkyData, minute: number, name: BodyName): BodyState {
	const rows = sky.bodyRows;
	let upper = rows.findIndex((row) => row[0] >= minute);
	if (upper <= 0) upper = upper === 0 ? 1 : rows.length - 1;
	const lower = rows[upper - 1];
	const higher = rows[upper];
	const amount = clamp01((minute - lower[0]) / (higher[0] - lower[0]));
	const base = 1 + BODY_NAMES.indexOf(name) * 3;
	let azimuthStep = higher[base + 1] - lower[base + 1];
	if (azimuthStep > 180) azimuthStep -= 360;
	if (azimuthStep < -180) azimuthStep += 360;
	return {
		alt: lerp(lower[base], higher[base], amount),
		az: lower[base + 1] + azimuthStep * amount,
		extra: lerp(lower[base + 2], higher[base + 2], amount)
	};
}

/** 지방 항성시(도) */
export function localSiderealDegrees(sky: SkyData, minute: number): number {
	return sky.lstReference + (minute - sky.lstReferenceMinute) * SIDEREAL_DEGREES_PER_MINUTE;
}

export type Vector3 = [number, number, number];

/** 동 · 북 · 위 단위 벡터 */
export function vectorFromAltAz(altitude: number, azimuth: number): Vector3 {
	const a = altitude * DEGREES;
	const z = azimuth * DEGREES;
	return [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)];
}

const SIN_LATITUDE = Math.sin(LATITUDE_DEGREES * DEGREES);
const COS_LATITUDE = Math.cos(LATITUDE_DEGREES * DEGREES);

/** 별 하나의 동 · 북 · 위 벡터(지방 항성시 lst) */
export function starVector(star: CatalogStar, lst: number): Vector3 {
	const hourAngle = (lst - star.ra) * DEGREES;
	const cosH = Math.cos(hourAngle);
	return [
		-star.cosDec * Math.sin(hourAngle),
		star.sinDec * COS_LATITUDE - star.cosDec * cosH * SIN_LATITUDE,
		star.sinDec * SIN_LATITUDE + star.cosDec * cosH * COS_LATITUDE
	];
}
