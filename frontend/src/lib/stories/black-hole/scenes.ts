// 배경 장면 값(장마다 카메라 · 여행자 자리 · 우리에게 오는 깜빡임 · 포인트 연출). 배경은 현재 값에서 목표 값으로 옮겨 간다.
import type { BoundaryId } from './holeData.ts';

export const SCENE_IDS = [
	'cover',
	'far',
	'disk',
	'isco',
	'shadow',
	'photon-sphere',
	'ergosphere',
	'horizon',
	'inside',
	'spaghetti',
	// 9장 분기(다른 블랙홀이었다면?)를 눌렀을 때: 작은 블랙홀이라 지평선 바깥에서 늘어난다
	'spaghetti-small',
	'singularity',
	'end'
] as const;
export type SceneId = (typeof SCENE_IDS)[number];

// 지도 위 자리: 경계 반지름(데이터)의 배수, 또는 지평선 배수 고정값
export type Place =
	{ kind: 'boundary'; boundary: BoundaryId; scale: number } | { kind: 'radius'; radius: number };

export type FlashParams = {
	// 우리가 받는 깜빡임 간격(초). 여행자 쪽은 늘 1초.
	interval: number;
	rgb: [number, number, number];
	alpha: number;
};

// 장마다 한 번 일어나는 포인트 연출
export type SceneEffect =
	| 'none'
	| 'jet'
	| 'disk'
	| 'spiral'
	| 'shadow-reveal'
	| 'photon-loop'
	| 'swirl'
	| 'signal'
	| 'inside'
	| 'stretch'
	| 'singularity'
	| 'white-hole';

export type SceneParams = {
	// 화면 짧은 변 절반에 들어오는 반지름(지평선 배수). 작을수록 확대.
	view: Place;
	// 여행자 자리(null 이면 그리지 않음)
	traveler: Place | null;
	// 밝게 보일 경계 띠
	focus: BoundaryId | null;
	// 위쪽 우리에게 가는 깜빡임(null 이면 없음: 지평선 뒤)
	flash: FlashParams | null;
	effect: SceneEffect;
	// 별 입자 · 강착 원반 가스 밝기(0~1)
	stars: number;
	disk: number;
	// 배경 검붉은 정도(0~1, 지평선 안)
	redness: number;
};

const WHITE: [number, number, number] = [255, 248, 230];
const AMBER: [number, number, number] = [255, 196, 120];
const RED: [number, number, number] = [235, 90, 60];

function boundary(id: BoundaryId, scale: number): Place {
	return { kind: 'boundary', boundary: id, scale };
}

function radius(value: number): Place {
	return { kind: 'radius', radius: value };
}

// 깜빡임 간격은 장이 진행될수록 벌어진다(머문다면 시간 비율의 역수를 따라 늘리는 어림, 지평선 무렵 사라짐).
export const SCENES: Record<SceneId, SceneParams> = {
	cover: {
		view: radius(0.9),
		traveler: null,
		focus: null,
		flash: null,
		effect: 'none',
		stars: 0.2,
		disk: 0,
		redness: 0
	},
	far: {
		view: radius(20),
		traveler: radius(15),
		focus: null,
		flash: { interval: 1, rgb: WHITE, alpha: 0.95 },
		effect: 'jet',
		stars: 0.8,
		disk: 0.5,
		redness: 0
	},
	disk: {
		view: radius(12),
		traveler: radius(8),
		focus: null,
		flash: { interval: 1.05, rgb: WHITE, alpha: 0.9 },
		effect: 'disk',
		stars: 0.8,
		disk: 1,
		redness: 0
	},
	isco: {
		view: boundary('isco', 1.5),
		traveler: boundary('isco', 1),
		focus: 'isco',
		flash: { interval: 1.25, rgb: WHITE, alpha: 0.85 },
		effect: 'spiral',
		stars: 0.7,
		disk: 0.6,
		redness: 0
	},
	shadow: {
		view: boundary('shadow', 1.35),
		traveler: boundary('shadow', 0.97),
		focus: 'shadow',
		flash: { interval: 1.4, rgb: AMBER, alpha: 0.75 },
		effect: 'shadow-reveal',
		stars: 0.7,
		disk: 0.35,
		redness: 0
	},
	'photon-sphere': {
		view: boundary('photon_sphere', 1.45),
		traveler: boundary('photon_sphere', 1),
		focus: 'photon_sphere',
		flash: { interval: 1.8, rgb: AMBER, alpha: 0.6 },
		effect: 'photon-loop',
		stars: 0.9,
		disk: 0,
		redness: 0
	},
	ergosphere: {
		view: boundary('ergosphere', 1.5),
		traveler: boundary('ergosphere', 0.95),
		focus: 'ergosphere',
		flash: { interval: 2.6, rgb: RED, alpha: 0.45 },
		effect: 'swirl',
		stars: 0.5,
		disk: 0,
		redness: 0
	},
	// 7장: 지도는 다른 장과 같은 한 장면, 우리에게 도착한 깜빡임은 계기판 아래 신호 띠에 따로 그린다(signalBand.ts).
	horizon: {
		view: boundary('horizon', 2.6),
		traveler: boundary('horizon', 1),
		focus: 'horizon',
		flash: null,
		effect: 'signal',
		stars: 0.4,
		disk: 0,
		redness: 0
	},
	inside: {
		// 지평선 안: 지평선 면이 화면을 다 덮을 만큼 다가간다.
		view: boundary('horizon', 0.4),
		traveler: radius(0.28),
		focus: null,
		flash: null,
		effect: 'inside',
		stars: 0.2,
		disk: 0,
		redness: 1
	},
	spaghetti: {
		view: boundary('horizon', 0.35),
		traveler: radius(0.25),
		focus: null,
		flash: null,
		effect: 'stretch',
		stars: 0.2,
		disk: 0,
		redness: 1
	},
	'spaghetti-small': {
		view: boundary('horizon', 7),
		traveler: radius(3.5),
		focus: 'horizon',
		flash: null,
		effect: 'stretch',
		stars: 0.6,
		disk: 0,
		redness: 0
	},
	singularity: {
		view: radius(0.25),
		traveler: null,
		focus: null,
		flash: null,
		effect: 'singularity',
		stars: 0,
		disk: 0,
		redness: 1
	},
	end: {
		view: radius(0.25),
		traveler: null,
		focus: null,
		flash: null,
		effect: 'white-hole',
		stars: 0,
		disk: 0,
		redness: 0
	}
};
