// 사건의 지평선 너머 계산 · 표시(순수 함수): 지평선 반지름 km · 머문다면 시간 비율 · 계기판 글.
// 계기판 시간은 정지 관측자 기준이고 블랙홀 회전을 뺀(슈바르츠실트) 어림이다(D-40). km 표기는 2편 거리 표기와 같은 한글 큰 수 어림.
import { koreanNumber, roundTwoDigits } from '../light-age/lightTime.ts';

// 태양 질량 1배 블랙홀의 지평선 반지름(km)
export const HORIZON_KM_PER_SOLAR_MASS = 2.953;
const MINUTES_PER_HOUR = 60;
const EOK = 100_000_000;

/** 지평선 반지름(km) = 2.953 × 태양 질량 배수 */
export function horizonRadiusKm(massSolar: number): number {
	return HORIZON_KM_PER_SOLAR_MASS * massSolar;
}

/** 중심까지 거리(km) = 지평선 반지름 × 경계 배수 */
export function centerDistanceKm(massSolar: number, radiusRs: number): number {
	return horizonRadiusKm(massSolar) * radiusRs;
}

/** 그 자리에 머문다면 흐르는 시간 비율 √(1 − 1/r). 지평선 안(r < 1)은 머물 수 없어 null. */
export function stayTimeRatio(radiusRs: number): number | null {
	if (radiusRs < 1) return null;
	return Math.sqrt(1 - 1 / radiusRs);
}

/** 바깥 1시간 동안 그 자리에서 흐르는 분(반올림). 지평선 안은 null. */
export function outsideHourMinutes(radiusRs: number): number | null {
	const ratio = stayTimeRatio(radiusRs);
	return ratio === null ? null : Math.round(ratio * MINUTES_PER_HOUR);
}

/** km 표기: 앞 두 자리 반올림 한글 단위(57,580,000,000 → "약 580억 km") */
export function kmText(km: number): string {
	return `약 ${koreanNumber(roundTwoDigits(km))} km`;
}

/** 질량 억 단위 표기(6,500,000,000 → "65억") */
export function massEokText(massSolar: number): string {
	return koreanNumber(Math.round(massSolar / EOK) * EOK);
}

/** 9장 분기(작은 블랙홀) 계기판 글: "{이름} · 지평선 반지름 약 {km} km"(km 는 반올림 정수) */
export function branchGaugeText(hole: { nameKo: string; massSolar: number }): string {
	return `${hole.nameKo} · 지평선 반지름 약 ${Math.round(horizonRadiusKm(hole.massSolar))} km`;
}

/** 계기판 한 줄을 이루는 두 부분. 지평선 안이면 null(그 장은 글로 표시한다). */
export type GaugeReading = { distance: string; time: string };

export function gaugeReading(massSolar: number, radiusRs: number): GaugeReading | null {
	const minutes = outsideHourMinutes(radiusRs);
	if (minutes === null) return null;
	return {
		distance: `중심까지 ${kmText(centerDistanceKm(massSolar, radiusRs))}`,
		time: `여기 머문다면 바깥 1시간 = ${minutes}분`
	};
}
