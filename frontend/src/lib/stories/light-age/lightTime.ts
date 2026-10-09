// 빛의 나이 표시 · 계산(순수 함수): 빛 이동 시간 · 거리 표기 · 빛이 떠난 때 · 사건 대조.
// 빛 이동 시간은 저장하지 않고 거리 ÷ 빛의 속도로 그때그때 계산한다.
import type { EarthMoment, SkyObject } from './skyData.ts';

export const LIGHT_SPEED_KM_PER_SECOND = 299_792.458;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3_600;
const SECONDS_PER_DAY = 86_400;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
// 광년의 정의(율리우스년)와 같은 1년 길이
const DAYS_PER_YEAR = 365.25;
const SECONDS_PER_YEAR = SECONDS_PER_DAY * DAYS_PER_YEAR;

const MAN = 10_000;
const EOK = 100_000_000;
const JO = 1_000_000_000_000;
const CHEON = 1_000;
const HUNDRED = 100;
// 1만 년 넘게 거슬러 오르면 연도 대신 "약 N년 전 무렵"
export const DEPARTURE_YEAR_LIMIT = 10_000;
// 광년 거리가 이보다 작으면 소수 첫째 자리까지 보인다(4.2광년).
const DECIMAL_LIGHT_YEAR_LIMIT = 10;
// 대조 허용 범위: 빛 이동 시간의 5%, 그리고 최소 2년
const MATCH_TOLERANCE_RATIO = 0.05;
const MATCH_TOLERANCE_MIN_YEARS = 2;

// 보이저 1호가 빛으로 꼭 하루 거리에 닿는 날(NASA 예측, 한국 시각 기준)
export const VOYAGER_ONE_LIGHT_DAY_DATE = '2026-11-18';
// 날짜·연도는 한국 시각 기준으로 판정한다(보는 사람 기기 시간대와 무관).
export const STORY_TIME_ZONE = 'Asia/Seoul';

// 계기판에서 강조를 바꾸는 단위 단계
export const TIME_UNITS = ['초', '분', '시간', '일', '년', '만 년', '억 년'] as const;
export type TimeUnit = (typeof TIME_UNITS)[number];

export type TravelTime = {
	// "약 1.3초", "약 2만 7천 년"
	text: string;
	// "약" 을 뺀 글("8분")
	plain: string;
	unit: TimeUnit;
};

function groupText(value: number, isTopGroup: boolean): string {
	// 윗 단위가 있으면 "8천만"처럼 천 단위 한 자리로 읽는다(7억 8천만). 맨 앞 묶음은 쉼표 숫자(5,500만).
	if (!isTopGroup && value % CHEON === 0) return `${value / CHEON}천`;
	return value.toLocaleString('en-US');
}

/** 정수를 만 · 억 · 조 단위 한글 표기로 바꾼다(780000000 → "7억 8천만", 27000 → "2만 7천"). */
export function koreanNumber(value: number): string {
	const groups: Array<[number, string]> = [
		[Math.floor(value / JO), '조'],
		[Math.floor((value % JO) / EOK), '억'],
		[Math.floor((value % EOK) / MAN), '만'],
		[value % MAN, '']
	];
	const parts: string[] = [];
	for (const [groupValue, unit] of groups) {
		if (groupValue === 0) continue;
		parts.push(`${groupText(groupValue, parts.length === 0)}${unit}`);
	}
	return parts.length === 0 ? '0' : parts.join(' ');
}

// 한글 단위로 끝나면 뒤 단위어와 띄어 쓴다("2만 7천 년" · "445년").
function joinUnit(numberText: string, unitWord: string): string {
	return /[0-9]$/.test(numberText) ? `${numberText}${unitWord}` : `${numberText} ${unitWord}`;
}

function roundTo(value: number, step: number): number {
	return Math.round(value / step) * step;
}

/** 년 수 반올림: 1천 미만 1년 · 1만 미만 100년 · 10만 미만 1천 년 · 1억 미만 1만 년 · 그 이상 1천만 년 단위. */
export function roundYears(years: number): number {
	if (years < CHEON) return Math.round(years);
	if (years < MAN) return roundTo(years, HUNDRED);
	if (years < MAN * 10) return roundTo(years, CHEON);
	if (years < EOK) return roundTo(years, MAN);
	return roundTo(years, MAN * CHEON);
}

function yearUnit(roundedYears: number): TimeUnit {
	if (roundedYears < MAN) return '년';
	if (roundedYears < EOK) return '만 년';
	return '억 년';
}

/** 년 수 표기("445년", "2만 7천 년", "5,500만 년"). "약" 은 붙이지 않는다. */
export function yearsText(years: number): string {
	return joinUnit(koreanNumber(roundYears(years)), '년');
}

function travelFromYears(years: number): TravelTime {
	const plain = yearsText(years);
	return { text: `약 ${plain}`, plain, unit: yearUnit(roundYears(years)) };
}

function travel(plain: string, unit: TimeUnit): TravelTime {
	return { text: `약 ${plain}`, plain, unit };
}

/** 빛 이동 시간(초 단위 값). 반올림 뒤 다음 단위에 닿으면 다음 단위로 올린다(60분 → 1시간). */
export function travelFromSeconds(seconds: number): TravelTime {
	const tenths = Math.round(seconds * 10) / 10;
	if (tenths < SECONDS_PER_MINUTE) return travel(`${tenths.toFixed(1)}초`, '초');
	const minutes = Math.round(seconds / SECONDS_PER_MINUTE);
	if (minutes < MINUTES_PER_HOUR) return travel(`${minutes}분`, '분');
	const hours = Math.round(seconds / SECONDS_PER_HOUR);
	if (hours < HOURS_PER_DAY) return travel(`${hours}시간`, '시간');
	if (seconds < SECONDS_PER_YEAR) {
		return travel(`${Math.round(seconds / SECONDS_PER_DAY)}일`, '일');
	}
	return travelFromYears(seconds / SECONDS_PER_YEAR);
}

/** 빛이 지구까지 오는 데 걸리는 시간(년). 광년이면 그 값이 곧 년이다. */
export function travelYears(object: SkyObject): number {
	if (object.distanceUnit === '광년') return object.distanceValue;
	return object.distanceValue / LIGHT_SPEED_KM_PER_SECOND / SECONDS_PER_YEAR;
}

export function travelSeconds(object: SkyObject): number {
	if (object.distanceUnit === '광년') return object.distanceValue * SECONDS_PER_YEAR;
	return object.distanceValue / LIGHT_SPEED_KM_PER_SECOND;
}

export function travelTime(object: SkyObject): TravelTime {
	return travelFromSeconds(travelSeconds(object));
}

/** 앞 두 자리 반올림(384400 → 380000). */
function roundTwoDigits(value: number): number {
	if (value < HUNDRED) return Math.round(value);
	const step = 10 ** (Math.floor(Math.log10(value)) - 1);
	return roundTo(value, step);
}

/** 거리 표기: 정확 표기면 쉼표 원래 값, 아니면 km 는 앞 두 자리 한글 단위 · 광년은 10 미만 소수 한 자리, 이상은 년 규칙. */
export function distanceText(object: SkyObject): string {
	if (object.showExact) {
		return `${object.distanceValue.toLocaleString('en-US')} ${object.distanceUnit}`;
	}
	if (object.distanceUnit === 'km') {
		return `약 ${koreanNumber(roundTwoDigits(object.distanceValue))} km`;
	}
	if (object.distanceValue < DECIMAL_LIGHT_YEAR_LIMIT) {
		return `약 ${object.distanceValue.toFixed(1)}광년`;
	}
	return `약 ${joinUnit(koreanNumber(roundYears(object.distanceValue)), '광년')}`;
}

/** 빛이 떠난 해 = 현재 연도 − 광년(반올림). 1년이 안 되는 거리는 올해다. */
export function departureYear(object: SkyObject, currentYear: number): number {
	return currentYear - Math.round(travelYears(object));
}

/** 연도 글자(0 이하는 기원전으로: 천문 연도 0 = 기원전 1년). */
export function yearLabel(year: number): string {
	return year > 0 ? `${year}년` : `기원전 ${1 - year}년`;
}

/** 계기판 보조 연도: 1년 이상 1만 년 이하일 때만 "1581년" 같은 연도 글자, 그 밖은 없음(null). */
export function gaugeYearLabel(object: SkyObject, currentYear: number): string | null {
	const years = travelYears(object);
	if (years < 1 || years > DEPARTURE_YEAR_LIMIT) return null;
	return yearLabel(departureYear(object, currentYear));
}

export type MomentMatch =
	| { kind: 'excluded' }
	| { kind: 'compared'; difference: number; tolerance: number; matches: boolean };

/**
 * 사건 대조: |빛이 떠난 해 − 사건 연도| ≤ max(빛 이동 시간 × 5%, 2년)이면 맞음.
 * 년 전 표기 사건은 years_ago 와 광년을 같은 식으로 비교한다. 빛이 닿을 때 사건은 대조하지 않는다.
 */
export function matchMoment(
	object: SkyObject,
	moment: EarthMoment,
	currentYear: number
): MomentMatch {
	if (moment.momentKind === '빛이 닿을 때') return { kind: 'excluded' };
	const years = travelYears(object);
	const tolerance = Math.max(years * MATCH_TOLERANCE_RATIO, MATCH_TOLERANCE_MIN_YEARS);
	const difference =
		moment.time.kind === '연도'
			? Math.abs(departureYear(object, currentYear) - moment.time.year)
			: Math.abs(moment.time.yearsAgo - years);
	return { kind: 'compared', difference, tolerance, matches: difference <= tolerance };
}

/** 사건 때 표기("1592년" · "약 6,500년 전"). */
export function momentTimeText(moment: EarthMoment): string {
	if (moment.time.kind === '연도') return yearLabel(moment.time.year);
	return `약 ${yearsText(moment.time.yearsAgo)} 전`;
}

/** 보이저 1호 문장 동사: 기준 날짜 전이면 "닿습니다", 그날부터 "닿았습니다". today 는 YYYY-MM-DD. */
export function voyagerVerb(today: string): string {
	return today < VOYAGER_ONE_LIGHT_DAY_DATE ? '닿습니다' : '닿았습니다';
}

/** 한국 시각 기준 오늘(YYYY-MM-DD). */
export function storyToday(now: Date): string {
	// en-CA 는 YYYY-MM-DD 순서로 쓴다.
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: STORY_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
}

export function storyYear(now: Date): number {
	return Number(storyToday(now).slice(0, 4));
}
