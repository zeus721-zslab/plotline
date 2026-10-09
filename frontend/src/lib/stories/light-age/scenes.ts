// 배경 장면 값(장마다 빛줄기 · 별 입자 · 색조 · 휨 · 그림자). 배경은 현재 값에서 목표 값으로 천천히 옮겨 간다.

export const SCENE_IDS = [
	'cover',
	'moon',
	'sun',
	'planets',
	'voyager',
	'near-stars',
	'pleiades',
	'orion',
	'crab',
	'sgr-a',
	'lmc',
	'andromeda',
	'm87',
	'end'
] as const;
export type SceneId = (typeof SCENE_IDS)[number];

// 장에 들어설 때 한 번 일어나는 움직임: 밝아졌다 멀어짐(태양) · 빛줄기 잠깐 휨(궁수자리 A*)
export type ScenePulse = 'none' | 'glow' | 'bend';

export type SceneParams = {
	// 빛줄기 굵기(CSS px)
	streakWidth: number;
	// 빛줄기 흐름 속도(화면 높이 / 초)
	streakSpeed: number;
	streakAlpha: number;
	// 별 입자 비율(0~1, 기기별 최대 개수에 곱한다)
	starDensity: number;
	// 번지는 색조(성운 · 은하 먼지) RGB 와 세기(0이면 없음)
	tint: [number, number, number];
	tintAlpha: number;
	// 빛줄기가 그림자 쪽으로 휘는 정도(0~1)
	bend: number;
	// 블랙홀 그림자 반지름(화면 짧은 변 대비, 0이면 없음). 0.19 면 그림자와 둘레로 휜 띠의 지름이 짧은 변의 약 80%.
	shadow: number;
	pulse: ScenePulse;
	// 빛줄기 옆 작은 점(보이저 1호)
	probe: boolean;
};

const BASE: SceneParams = {
	streakWidth: 1.6,
	streakSpeed: 0.35,
	streakAlpha: 0.55,
	starDensity: 0.6,
	tint: [120, 150, 255],
	tintAlpha: 0,
	bend: 0,
	shadow: 0,
	pulse: 'none',
	probe: false
};

const NEBULA_TINT: [number, number, number] = [214, 92, 168];
const DUST_TINT: [number, number, number] = [196, 150, 96];

export const SCENES: Record<SceneId, SceneParams> = {
	cover: BASE,
	moon: { ...BASE, streakWidth: 3.2, streakSpeed: 0.9, streakAlpha: 0.75 },
	sun: { ...BASE, streakWidth: 2.4, streakSpeed: 0.6, pulse: 'glow' },
	planets: { ...BASE, starDensity: 0.25 },
	voyager: { ...BASE, starDensity: 0.3, probe: true },
	'near-stars': { ...BASE, starDensity: 0.7 },
	pleiades: { ...BASE, starDensity: 1 },
	orion: { ...BASE, starDensity: 0.8, tint: NEBULA_TINT, tintAlpha: 0.22 },
	crab: { ...BASE, starDensity: 0.8, tint: [96, 170, 214], tintAlpha: 0.22 },
	'sgr-a': { ...BASE, starDensity: 0.9, pulse: 'bend' },
	lmc: { ...BASE, starDensity: 0.8, tint: DUST_TINT, tintAlpha: 0.18 },
	andromeda: { ...BASE, streakWidth: 0.8, streakAlpha: 0.45, starDensity: 0.7 },
	m87: { ...BASE, streakWidth: 0.8, streakAlpha: 0.45, starDensity: 0.5, bend: 1, shadow: 0.19 },
	end: { ...BASE, streakWidth: 0.8, streakAlpha: 0.4, starDensity: 0.4, bend: 1, shadow: 0.19 }
};
