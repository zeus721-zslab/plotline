// 그가 실패작이라 부른 밤 장면 계산(순수 함수): 장 · 진행도 → 장면 자세(Pose) → 카메라.
// 렌더러(starryRenderer.ts)는 여기서 정한 자세를 부드럽게 따라가며 그리기만 한다. 화면 · WebGL 없이 단위 테스트한다.
// 좌표: 그림 uv(왼쪽 위 0,0 · 오른쪽 아래 1,1) / 세계 좌표는 그림 높이 1, 가운데 0, 위가 +y.
//
// 카메라 이동 규칙(STEP 90~91 · D-42 보완):
// - R1 장 하나 = 전환 이동 하나: 장 진입 후 장면 구간(scene-gap)에서 앞 장 마지막 자세 → 이 장 자세로 곧장 간다. 중간 지점(keyframe) 없음, ease-in-out 1회(smoothstep 한 번).
// - R2 장면 이동은 별도 하나만: 마을 패닝처럼 장면 자체의 움직임은 전환 이동이 끝나는 자리에서 멈춤 없이 이어지는 일정 속도(선형) 이동 하나(4장 마무리 축소만 ease-out 1회). 흔들림 · 별빛 · 흐름 같은 효과 값은 이동이 아니므로 자유.
// - R3 속도: zslab 확정 구간 길이 유지(scene-gap 휴대폰 170svh · PC 140svh · 3장 390/320svh · followPose rate 1.6). 상한을 강제하지 않고 장마다 최대값을 측정해 보고한다.
// - R4 큰 이동은 곡선 하나: 바라보는 점이 그림 폭의 30% 넘게 옮겨 가면, 이동 중간에 보이는 높이를 최대 +25% 물러났다 다가가는 하나의 곡선(진행도 t에 대해 높이 배율 1 + 0.25·sin(πt))으로 간다. 4 · 6장 전환에서는 쓰지 않는다(steady).
//   R4 는 3장에서만 쓰인다(다른 장은 이동이 30% 이하이거나 steady) — zslab 확정(STEP 92).
// - 가두기: keyframe 끝점마다 바라보는 점 · 높이를 먼저 가두고(shotOf), 끝점 사이는 보간만 한다(높이는 로그). 보간 결과를 다시 가두지 않는다 — 높이가 바뀔 때 가둘 범위가 바뀌어 바라보는 점이 밀렸다 돌아오는 일을 없앤다.
//   그 대가로 줌 교차 구간(가까이 ↔ 그림 전체)에서 그림 가장자리 밖이 잠깐 비치는 것은 허용한다(zslab 결정 1A).
// - 초점 보정: 그림 전체에 가까울수록(fit) 초점이 화면 정중앙으로 옮겨 간다(focus = mix(기본 초점, (0.5, 0.5), fit)). fit 1 이면 그림 중앙이 화면 중앙.
//   6장 끝(fit 0.75)의 중앙 정렬은 확인 대상이 아니다(zslab 결정 3C).
//   표지 자세만 예외(centering 0): 그림 전체가 기본 초점 자리에 놓인다(STEP 94).
// - 표지 → 1장: 표지 이동 구간(표지 + cover-gap)과 1장 장면 구간을 하나의 진행도로 이어, 표지 자세 → 1장 도착 자세 전환 1회로 간다(STEP 95).
//   이 구간만 "큰 이동과 확대를 동시에 하지 않는다"의 예외다 — 정중앙으로 옮겨 가며 동시에 확대한다(zslab 결정).
// - R5 입체(lift)는 1 · 2장에서만 크게(≤ 1), 3장부터는 ≤ 0.3.
// - R6 마을 불빛: 패닝 방향 왼쪽 → 오른쪽(불빛 정렬도 왼→오). 3장 장면 이동 구간 휴대폰 220svh · PC 180svh, 불빛 켜짐(lights 0→1)은 패닝 진행과 선형으로 묶는다.
import { CHAPTERS, type ChapterId } from './chapters.ts';
import { timeMarkTarget } from './storyChecks.ts';

export type SceneId = 'cover' | ChapterId;

/** 장면 자세. 카메라(u · v · scale · fit · sway)와 효과 세기(0~1)를 함께 둔다. */
export type Pose = {
	// 바라볼 그림 위치(uv)
	u: number;
	v: number;
	// 가까이 볼 때 화면 높이: 그림이 화면을 가득 채우는 높이의 이 비율(1 이하면 그림 밖이 보이지 않는다)
	scale: number;
	// 0 = scale 대로 가까이, 1 = 그림 전체(액자 포함)가 화면 구도 안에 들어옴
	fit: number;
	// 카메라 옆 이동(-1 ~ 1, SWAY_WORLD 배)
	sway: number;
	// 깊이 입체 정도
	lift: number;
	// 액자
	frame: number;
	// 하늘 흐름
	flow: number;
	// 별빛
	stars: number;
	// 마을 불빛 진행(0 = 다 꺼짐 · 1 = 다 켜짐)과 불빛 연출 자체의 세기
	lights: number;
	lightsActive: number;
	// 방향장 빛 줄기
	streaks: number;
	// 쇠창살 그림자(상상)
	bars: number;
	// 사이프러스 흔들림
	cypressSway: number;
	// 보이는 높이 배율(R4 큰 이동 중에만 1 보다 큼)
	recede: number;
	// 초점 보정을 쓰는 정도(0 = fit 과 무관하게 기본 초점 그대로 · 1 = 초점 보정). 표지 자세만 0(STEP 94).
	centering: number;
};

// transition = 앞 자세에서 이 자세로 옮겨 가는 전환 이동(smoothstep 1회, R1) · move = 장면 이동(선형, R2)
// settle = 장면 이동이 끝에서 부드럽게 멈춤(ease-out 1회, 4장 마무리 축소)
type Motion = 'transition' | 'move' | 'settle';
// starsFrom: 전환 진행도가 이 값을 지난 뒤에야 별빛이 올라온다(4장) · steady: 큰 이동이어도 물러나지 않음(R4 미사용)
type Keyframe = { at: number; motion: Motion; pose: Pose; starsFrom?: number; steady?: true };

export const IMAGE_WIDTH_PX = 1200;
export const IMAGE_HEIGHT_PX = 950;
export const PAINTING_ASPECT = IMAGE_WIDTH_PX / IMAGE_HEIGHT_PX;
// 액자 띠 폭(세계 단위)
export const FRAME_MARGIN = 0.045;
// 시제품 "작게" 이동 폭
export const SWAY_WORLD = 0.04;
// 옆 이동에 따라 붙는 위아래 이동(시제품 riseOffset 0.35 × 0.5)
const RISE_PER_SWAY = 0.175;
export const FIELD_OF_VIEW_RAD = (38 * Math.PI) / 180;
// 그림 전체 구도의 여유
const FIT_MARGIN = 1.06;
// 가까이 볼 때 창을 그림 가장자리에서 이만큼(세계 단위) 안쪽에 가둔다(옆 이동 · 입체로 가장자리가 비치지 않게)
const VIEW_INSET = 0.03;
// 휴대폰은 카드가 아래에서 올라오므로 초점을 화면 위쪽에, PC(1024px 이상)는 카드 열(왼쪽 4할)을 피해 오른쪽에 둔다.
export const DESKTOP_MIN_WIDTH_PX = 1024;
const MOBILE_FOCUS = { x: 0.5, y: 0.36 };
const DESKTOP_FOCUS = { x: 0.7, y: 0.5 };
// 화면 정중앙(초점 보정이 그림 전체 구도에서 옮겨 가는 자리)
const CENTER = 0.5;

export type Focus = { x: number; y: number };

// 장면 구간 높이(svh). StarryNightPage.svelte 의 .scene-gap 과 같은 값(R3 · R6).
export const SCENE_GAP_SVH = { mobile: 170, desktop: 140 };
export const VILLAGE_MOVE_SVH = { mobile: 220, desktop: 180 };
// R4: 바라보는 점이 그림 폭의 이 비율을 넘게 옮겨 가면 물러났다 다가가는 곡선으로 간다.
const BIG_MOVE_WIDTH_SHARE = 0.3;
const RECEDE_MAX = 0.25;

const BASE_POSE: Pose = {
	u: 0.5,
	v: 0.5,
	scale: 1,
	fit: 1,
	sway: 0,
	lift: 0,
	frame: 1,
	flow: 0,
	stars: 0,
	lights: 0,
	lightsActive: 0,
	streaks: 0,
	bars: 0,
	cypressSway: 0,
	recede: 1,
	centering: 1
};

function pose(overrides: Partial<Pose>): Pose {
	return { ...BASE_POSE, ...overrides };
}

// 그림 속 위치(1200 × 950 픽셀 → uv)
const CYPRESS_UV = { u: 0.2, v: 0.42 };
const MORNING_STAR_UV = { u: 424 / IMAGE_WIDTH_PX, v: 504 / IMAGE_HEIGHT_PX };
// 3장 마을 패닝(R6): 마을 왼쪽에서 오른쪽으로
const VILLAGE_START_U = 0.4;
const VILLAGE_END_U = 0.86;
const VILLAGE_V = 0.86;
// 3장 장면 구간 = 전환 구간(170svh) + 패닝 구간(220svh). 전환이 끝나는 진행도(PC 140 / 320 = 0.4375 와 0.002 차이).
const VILLAGE_TURN_AT = SCENE_GAP_SVH.mobile / (SCENE_GAP_SVH.mobile + VILLAGE_MOVE_SVH.mobile);
// 4장 별빛은 전환 후반부터 올라온다
const MORNING_STAR_STARS_FROM = 0.6;
// 장면 이동이 있는 장에서 전환이 끝나는 진행도
const ASYLUM_TURN_AT = 0.75;
const MORNING_STAR_TURN_AT = 0.6;
// 5장은 장면 구간이 둘(박자 1 = 진행도 0~0.5 · 박자 2 = 0.5~1)
const WIND_BEAT_ONE_TURN_AT = 0.3;
const WIND_BEAT_ONE_END = 0.5;

// 표지: 그림 전체가 기본 초점 자리(휴대폰 위쪽 · PC 오른쪽, 표지 글을 피한 자리)에 놓인다(초점 보정 예외).
// 1장 전환은 이 자세에서 곧장 출발한다(별도 정중앙 자세 없음).
export const COVER_POSE: Pose = pose({ centering: 0 });

const CLOSE_LIFTED: Partial<Pose> = { fit: 0, frame: 0, lift: 1 };
// R5: 3장부터 입체 상한
const LATE_LIFT = 0.3;
const CLOSE_LATE: Partial<Pose> = { fit: 0, frame: 0, lift: LATE_LIFT };
const WIND_EFFECTS: Partial<Pose> = { flow: 1, stars: 0.6, cypressSway: 0.35 };

/**
 * 장마다 자세 경로(R1 · R2). at 은 장 진행도(장면 구간 기준 0~1).
 * 전환(transition)은 앞 자세(앞 장 마지막 자세 또는 앞 박자 끝)에서 곧장 옮겨 오고, 장면 이동(move)은 전환이 끝난 자리에서 선형으로 이어진다.
 */
export const CHAPTER_KEYFRAMES: Record<ChapterId, Keyframe[]> = {
	// 액자 속 평면 그림 → 입체로 떠오르며 다가감
	museum: [
		{ at: 1, motion: 'transition', pose: pose({ ...CLOSE_LIFTED, u: 0.45, v: 0.42, scale: 0.9 }) }
	],
	// 사이프러스로 옮겨 간 뒤 카메라가 옆으로 조금 지나감 · 앞층이 불꽃처럼 흔들림
	asylum: [
		{
			at: ASYLUM_TURN_AT,
			motion: 'transition',
			pose: pose({ ...CLOSE_LIFTED, ...CYPRESS_UV, scale: 0.85, sway: -1, cypressSway: 1 })
		},
		{
			at: 1,
			motion: 'move',
			pose: pose({ ...CLOSE_LIFTED, ...CYPRESS_UV, scale: 0.85, sway: 1, cypressSway: 1 })
		}
	],
	// 사이프러스에서 마을 왼쪽으로 내려간 뒤(R4 곡선) 오른쪽으로 지나가며 창문 불빛이 차례로 켜짐
	village: [
		{
			at: VILLAGE_TURN_AT,
			motion: 'transition',
			pose: pose({
				...CLOSE_LATE,
				u: VILLAGE_START_U,
				v: VILLAGE_V,
				scale: 0.55,
				lightsActive: 1
			})
		},
		{
			at: 1,
			motion: 'move',
			pose: pose({
				...CLOSE_LATE,
				u: VILLAGE_END_U,
				v: VILLAGE_V,
				scale: 0.55,
				lightsActive: 1,
				lights: 1
			})
		}
	],
	// 마을 오른쪽에서 샛별로(물러남 없이, 별빛은 전환 후반부터) → 그림 정중앙으로 옮겨 가며 천천히 축소해 그림 전체로
	'morning-star': [
		{
			at: MORNING_STAR_TURN_AT,
			motion: 'transition',
			pose: pose({ ...CLOSE_LATE, ...MORNING_STAR_UV, scale: 0.45, stars: 1 }),
			starsFrom: MORNING_STAR_STARS_FROM,
			steady: true
		},
		{
			at: 1,
			motion: 'settle',
			pose: pose({ ...CLOSE_LATE, u: 0.5, v: 0.5, fit: 1, stars: 1 })
		}
	],
	// 클라이맥스. 박자 1(앞 절반): 하늘 전체가 흐름 · 박자 2(뒤 절반): 방향장을 따라 빛 줄기
	wind: [
		{
			at: WIND_BEAT_ONE_TURN_AT,
			motion: 'transition',
			pose: pose({ ...CLOSE_LATE, ...WIND_EFFECTS, u: 0.35, v: 0.35, scale: 0.95 })
		},
		{
			at: WIND_BEAT_ONE_END,
			motion: 'move',
			pose: pose({ ...CLOSE_LATE, ...WIND_EFFECTS, u: 0.62, v: 0.35, scale: 0.95 })
		},
		{
			at: 1,
			motion: 'transition',
			pose: pose({
				...CLOSE_LATE,
				...WIND_EFFECTS,
				u: 0.58,
				v: 0.4,
				scale: 1,
				stars: 0.5,
				streaks: 1
			})
		}
	],
	// 카메라가 그림 정중앙으로 옮겨 가며 뒤로 빠지고(물러남 없이) 쇠창살 그림자가 드리움(상상)
	bars: [
		{
			at: 1,
			motion: 'transition',
			pose: pose({ ...CLOSE_LATE, u: 0.5, v: 0.5, fit: 0.75, lift: 0.2, stars: 0.3, bars: 1 }),
			steady: true
		}
	],
	// 다시 액자 속 평면 그림. 별빛은 편지 문장에서 한 번 크게 빛났다가 꺼진다(렌더러의 flare).
	end: [{ at: 1, motion: 'transition', pose: pose({ stars: 0.6 }) }]
};

const POSE_KEYS = Object.keys(BASE_POSE) as (keyof Pose)[];

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = clamp01((value - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

function lerp(from: number, to: number, ratio: number): number {
	return from + (to - from) * ratio;
}

/** 두 자세 사이. scale 은 같은 비율로 커지게(로그) 섞는다. */
export function mixPose(from: Pose, to: Pose, ratio: number): Pose {
	const mixed = { ...from };
	for (const key of POSE_KEYS) {
		mixed[key] =
			key === 'scale'
				? Math.exp(lerp(Math.log(from.scale), Math.log(to.scale), ratio))
				: lerp(from[key], to[key], ratio);
	}
	return mixed;
}

function lastPose(chapterIndex: number): Pose {
	if (chapterIndex < 0) return COVER_POSE;
	const keyframes = CHAPTER_KEYFRAMES[CHAPTERS[chapterIndex].id];
	return keyframes[keyframes.length - 1].pose;
}

/** 두 자세의 바라보는 점 거리(그림 폭 단위) */
function lookDistance(from: Pose, to: Pose): number {
	return Math.hypot(to.u - from.u, (to.v - from.v) / PAINTING_ASPECT);
}

/** 이동 방식에 따른 진행 비율: 전환 smoothstep · 장면 이동 선형 · 마무리 ease-out */
function easedRatio(motion: Motion, ratio: number): number {
	if (motion === 'transition') return smoothstep(0, 1, ratio);
	if (motion === 'settle') return 1 - (1 - ratio) * (1 - ratio);
	return ratio;
}

/** 카메라 경로: 두 끝 자세와 그 사이 진행 비율(이미 이동 방식대로 바뀐 값) */
export type ShotPath = { from: Pose; to: Pose; ratio: number };
/** 장면 목표: 효과까지 섞은 자세 + 카메라 경로(끝점은 화면 비율을 아는 쪽에서 가둔다) */
export type SceneTarget = { pose: Pose; path: ShotPath };

function stillScene(still: Pose): SceneTarget {
	return { pose: still, path: { from: still, to: still, ratio: 1 } };
}

/** 한 keyframe 구간 안의 장면(R1 · R2 · R4) */
function segmentScene(from: Pose, keyframe: Keyframe, ratio: number): SceneTarget {
	const eased = easedRatio(keyframe.motion, ratio);
	const mixed = mixPose(from, keyframe.pose, eased);
	if (keyframe.starsFrom !== undefined) {
		mixed.stars = lerp(from.stars, keyframe.pose.stars, smoothstep(keyframe.starsFrom, 1, ratio));
	}
	const receding =
		keyframe.motion === 'transition' &&
		keyframe.steady !== true &&
		lookDistance(from, keyframe.pose) > BIG_MOVE_WIDTH_SHARE;
	if (receding) mixed.recede = 1 + RECEDE_MAX * Math.sin(Math.PI * eased);
	return { pose: mixed, path: { from, to: keyframe.pose, ratio: eased } };
}

/**
 * 장(index, 표지는 -1)과 그 장 진행도(0~1)의 장면 목표.
 * 표지와 1장은 하나의 진행도(표지 → 1장 이동을 지난 정도)를 받아 같은 전환 위에 놓인다(STEP 95).
 */
export function sceneAt(chapterIndex: number, progress: number): SceneTarget {
	const clamped = clamp01(progress);
	if (chapterIndex < 0) return sceneAt(0, clamped);
	const keyframes = CHAPTER_KEYFRAMES[CHAPTERS[chapterIndex].id];
	let fromAt = 0;
	let fromPose = lastPose(chapterIndex - 1);
	for (const keyframe of keyframes) {
		if (clamped <= keyframe.at) {
			return segmentScene(fromPose, keyframe, (clamped - fromAt) / (keyframe.at - fromAt));
		}
		fromAt = keyframe.at;
		fromPose = keyframe.pose;
	}
	return stillScene(fromPose);
}

/** 끝 장 뒤 여운 구간: 지난 정도(0~1)만큼 별빛을 0 으로 줄인다(카메라 · 다른 효과는 그대로). */
export function afterglowScene(scene: SceneTarget, afterglow: number): SceneTarget {
	if (afterglow <= 0) return scene;
	return { ...scene, pose: { ...scene.pose, stars: scene.pose.stars * (1 - clamp01(afterglow)) } };
}

/** 장(index, 표지는 -1)과 그 장 진행도(0~1)의 목표 자세 */
export function poseAt(chapterIndex: number, progress: number): Pose {
	return sceneAt(chapterIndex, progress).pose;
}

/** 장면 구간(카드 앞 빈 구간)들을 지난 정도: 구간마다 (판정선 − 윗변) / 높이를 0~1 로 묶어 평균한다. */
export function chapterProgress(line: number, gaps: { top: number; height: number }[]): number {
	if (gaps.length === 0) return 1;
	const passed = gaps.reduce(
		(sum, gap) => sum + (gap.height > 0 ? clamp01((line - gap.top) / gap.height) : 1),
		0
	);
	return passed / gaps.length;
}

/** 시간 표지: 표지에서는 없음, 대조에 걸린 장도 없음. */
export function timeMarkFor(chapterIndex: number, hiddenTargets: Set<string>): string | null {
	if (chapterIndex < 0 || chapterIndex >= CHAPTERS.length) return null;
	const chapter = CHAPTERS[chapterIndex];
	return hiddenTargets.has(timeMarkTarget(chapter.id)) ? null : chapter.timeMark;
}

export function focusFor(viewportWidthCss: number): Focus {
	return viewportWidthCss >= DESKTOP_MIN_WIDTH_PX ? DESKTOP_FOCUS : MOBILE_FOCUS;
}

export type Camera = {
	eye: [number, number, number];
	target: [number, number, number];
	// 초점 자리(화면 비율)를 화면 가운데에서 옮기는 양(NDC)
	shift: [number, number];
	// 보이는 높이(세계 단위)
	height: number;
};

function clampBetween(value: number, edgeA: number, edgeB: number): number {
	return Math.min(Math.max(value, Math.min(edgeA, edgeB)), Math.max(edgeA, edgeB));
}

/** 카메라 자리(세계 좌표): 바라보는 점 · 보이는 높이(로그, 물러남 전) · 초점 자리(화면 비율) */
export type Shot = { x: number; y: number; logHeight: number; focusX: number; focusY: number };

/** 초점 보정: 그림 전체에 가까울수록(fit) 기본 초점에서 화면 정중앙으로 */
export function focusOf(pose: Pose, baseFocus: Focus): Focus {
	const fit = clamp01(pose.fit) * clamp01(pose.centering);
	return { x: lerp(baseFocus.x, CENTER, fit), y: lerp(baseFocus.y, CENTER, fit) };
}

/**
 * 끝점 자세 → 가둔 카메라 자리. 초점은 바라보는 점이 놓일 화면 자리다.
 * 보이는 창이 그림보다 작으면 창이 그림 밖으로 나가지 않게, 크면 그림이 창 밖으로 나가지 않게 바라볼 점을 가둔다(두 경우가 이어진다).
 */
export function shotOf(pose: Pose, viewAspect: number, baseFocus: Focus): Shot {
	const focus = focusOf(pose, baseFocus);
	const halfWidth = PAINTING_ASPECT / 2 + FRAME_MARGIN;
	const halfHeight = 0.5 + FRAME_MARGIN;
	const fillHeight = Math.min(1 - 2 * VIEW_INSET, (PAINTING_ASPECT - 2 * VIEW_INSET) / viewAspect);
	const fitHeight =
		Math.max(
			halfWidth / (Math.min(focus.x, 1 - focus.x) * viewAspect),
			halfHeight / Math.min(focus.y, 1 - focus.y)
		) * FIT_MARGIN;
	const logHeight = lerp(Math.log(fillHeight * pose.scale), Math.log(fitHeight), clamp01(pose.fit));
	const height = Math.exp(logHeight);
	const width = height * viewAspect;
	const halfX = PAINTING_ASPECT / 2 - VIEW_INSET;
	const halfY = 0.5 - VIEW_INSET;
	const x = clampBetween(
		(pose.u - 0.5) * PAINTING_ASPECT,
		-halfX + focus.x * width,
		halfX - (1 - focus.x) * width
	);
	const y = clampBetween(0.5 - pose.v, halfY - focus.y * height, -halfY + (1 - focus.y) * height);
	return { x, y, logHeight, focusX: focus.x, focusY: focus.y };
}

/** 두 카메라 자리 사이(선형 · 높이는 로그로). 다시 가두지 않는다. */
export function mixShot(from: Shot, to: Shot, ratio: number): Shot {
	return {
		x: lerp(from.x, to.x, ratio),
		y: lerp(from.y, to.y, ratio),
		logHeight: lerp(from.logHeight, to.logHeight, ratio),
		focusX: lerp(from.focusX, to.focusX, ratio),
		focusY: lerp(from.focusY, to.focusY, ratio)
	};
}

/** 카메라 경로 위 자리: 끝점을 먼저 가두고 그 사이를 보간한다. */
export function shotAlong(path: ShotPath, viewAspect: number, baseFocus: Focus): Shot {
	return mixShot(
		shotOf(path.from, viewAspect, baseFocus),
		shotOf(path.to, viewAspect, baseFocus),
		path.ratio
	);
}

/** 카메라 자리 + 자세의 옆 이동 · 물러남 → 카메라 */
export function cameraOf(shot: Shot, current: Pose): Camera {
	const height = Math.exp(shot.logHeight) * current.recede;
	const distance = height / 2 / Math.tan(FIELD_OF_VIEW_RAD / 2);
	return {
		eye: [
			shot.x + SWAY_WORLD * current.sway,
			shot.y - SWAY_WORLD * RISE_PER_SWAY * current.sway,
			distance
		],
		target: [shot.x, shot.y, 0],
		shift: [2 * shot.focusX - 1, 1 - 2 * shot.focusY],
		height
	};
}

/** 현재 자세를 목표로 지수 감쇠로 따라간다(rate: 초당 비율). */
export function followPose(current: Pose, target: Pose, seconds: number, rate: number): Pose {
	return mixPose(current, target, 1 - Math.exp(-rate * seconds));
}

/** 현재 카메라 자리를 목표로 같은 빠르기로 따라간다(가두지 않음). */
export function followShot(current: Shot, target: Shot, seconds: number, rate: number): Shot {
	return mixShot(current, target, 1 - Math.exp(-rate * seconds));
}

/** 두 카메라 자리가 사실상 같은가 */
export function shotsSettled(first: Shot, second: Shot, tolerance: number): boolean {
	return (
		Math.abs(first.x - second.x) <= tolerance &&
		Math.abs(first.y - second.y) <= tolerance &&
		Math.abs(first.logHeight - second.logHeight) <= tolerance &&
		Math.abs(first.focusX - second.focusX) <= tolerance &&
		Math.abs(first.focusY - second.focusY) <= tolerance
	);
}

/** 두 자세가 사실상 같은가(그리기를 멈춰도 되는가) */
export function posesSettled(first: Pose, second: Pose, tolerance: number): boolean {
	return POSE_KEYS.every((key) => Math.abs(first[key] - second[key]) <= tolerance);
}
