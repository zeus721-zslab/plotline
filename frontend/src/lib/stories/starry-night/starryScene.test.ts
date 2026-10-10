// 장면 계산(starryScene.ts) 단위 테스트(node:test): 장 진행도 · 자세 경로 이음 · 카메라 이동 규칙 · 시간 표지 결정.
// 줌 교차 구간의 그림 가장자리 비침(결정 1A)과 6장 끝 중앙 정렬(결정 3C)은 확인 대상이 아니다(STEP 92).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { CHAPTERS, type ChapterId } from './chapters.ts';
import {
	afterglowScene,
	cameraOf,
	CHAPTER_KEYFRAMES,
	chapterProgress,
	COVER_POSE,
	focusFor,
	focusOf,
	followPose,
	PAINTING_ASPECT,
	poseAt,
	posesSettled,
	sceneAt,
	shotAlong,
	timeMarkFor,
	type Camera,
	type Focus,
	type SceneTarget
} from './starryScene.ts';
import { timeMarkTarget } from './storyChecks.ts';

type Keyframe = (typeof CHAPTER_KEYFRAMES)[ChapterId][number];
type Screen = { name: string; aspect: number; focus: Focus };
type Segment = {
	chapterIndex: number;
	chapterId: ChapterId;
	motion: Keyframe['motion'];
	fromAt: number;
	toAt: number;
};

const PHONE_WIDTH = 390;
const DESKTOP_WIDTH = 1280;
const SCREENS: Screen[] = [
	{ name: '휴대폰', aspect: PHONE_WIDTH / 844, focus: focusFor(PHONE_WIDTH) },
	{ name: 'PC', aspect: DESKTOP_WIDTH / 800, focus: focusFor(DESKTOP_WIDTH) }
];
const TOLERANCE = 1e-9;
const SAMPLES = 200;
const LATE_LIFT_MAX = 0.3;
const CENTER = 0.5;
const CENTER_TOLERANCE = 0.005;

function indexOf(id: ChapterId): number {
	return CHAPTERS.findIndex((chapter) => chapter.id === id);
}

/** keyframe 을 박자(전환으로 시작하는 묶음)로 나눈다. */
function beatsOf(keyframes: Keyframe[]): Keyframe[][] {
	const beats: Keyframe[][] = [];
	for (const keyframe of keyframes) {
		if (keyframe.motion === 'transition' || beats.length === 0) beats.push([keyframe]);
		else beats[beats.length - 1].push(keyframe);
	}
	return beats;
}

/** 모든 장의 keyframe 구간(앞 keyframe 진행도 → 이 keyframe 진행도) */
function segments(): Segment[] {
	return CHAPTERS.flatMap((chapter, chapterIndex) => {
		let fromAt = 0;
		return CHAPTER_KEYFRAMES[chapter.id].map((keyframe) => {
			const segment = {
				chapterIndex,
				chapterId: chapter.id,
				motion: keyframe.motion,
				fromAt,
				toAt: keyframe.at
			};
			fromAt = keyframe.at;
			return segment;
		});
	});
}

/** 렌더러와 같은 계산(끝점 가둠 → 보간 → 카메라)으로 구간 안 카메라 바라보는 점을 표본으로 뽑는다. */
function segmentTargets(segment: Segment, screen: Screen): [number, number][] {
	const targets: [number, number][] = [];
	for (let step = 0; step <= SAMPLES; step += 1) {
		const progress = segment.fromAt + ((segment.toAt - segment.fromAt) * step) / SAMPLES;
		const scene = sceneAt(segment.chapterIndex, progress);
		const camera = cameraOf(shotAlong(scene.path, screen.aspect, screen.focus), scene.pose);
		targets.push([camera.target[0], camera.target[1]]);
	}
	return targets;
}

function isMonotonic(values: number[]): boolean {
	const steps = values.slice(1).map((value, index) => value - values[index]);
	return steps.every((step) => step >= -TOLERANCE) || steps.every((step) => step <= TOLERANCE);
}

/** 오르다가 내리는 봉우리 하나(평평한 구간 허용) */
function isSinglePeak(values: number[]): boolean {
	const peak = values.indexOf(Math.max(...values));
	const rising = values.slice(0, peak + 1);
	const falling = values.slice(peak);
	return (
		rising.every((value, index) => index === 0 || value >= rising[index - 1] - TOLERANCE) &&
		falling.every((value, index) => index === 0 || value <= falling[index - 1] + TOLERANCE)
	);
}

/** 그림 중앙(세계 0,0)이 놓이는 화면 자리(왼쪽 위 0,0 · 오른쪽 아래 1,1) */
function paintingCenterOnScreen(scene: SceneTarget, screen: Screen): { x: number; y: number } {
	const shot = shotAlong(scene.path, screen.aspect, screen.focus);
	const camera = cameraOf(shot, scene.pose);
	return {
		x: shot.focusX - camera.target[0] / (camera.height * screen.aspect),
		y: shot.focusY + camera.target[1] / camera.height
	};
}

/** 보이는 창(세계 좌표 z=0 평면, 옆 이동 없음 기준)의 왼 · 오른 · 위 · 아래 */
function windowOf(camera: Camera, aspect: number, focus: Focus) {
	const width = camera.height * aspect;
	return {
		left: camera.target[0] - focus.x * width,
		right: camera.target[0] + (1 - focus.x) * width,
		top: camera.target[1] + focus.y * camera.height,
		bottom: camera.target[1] - (1 - focus.y) * camera.height
	};
}

describe('starryScene — 장 진행도', () => {
	test('장면 구간 하나: 판정선이 윗변이면 0, 아랫변이면 1, 그 밖은 0~1 로 묶음', () => {
		const gap = { top: 100, height: 400 };
		assert.equal(chapterProgress(100, [gap]), 0);
		assert.equal(chapterProgress(300, [gap]), 0.5);
		assert.equal(chapterProgress(900, [gap]), 1);
		assert.equal(chapterProgress(0, [gap]), 0);
	});

	test('장면 구간 둘(5장 두 박자): 첫 구간을 다 지나면 0.5', () => {
		const gaps = [
			{ top: -300, height: 300 },
			{ top: 200, height: 400 }
		];
		assert.equal(chapterProgress(100, gaps), 0.5);
		assert.equal(chapterProgress(400, gaps), 0.75);
	});
});

describe('starryScene — 자세 경로', () => {
	test('표지는 표지 자세(액자 속 평면 그림)에서 시작하고, 표지와 1장은 같은 진행도 위에 놓임', () => {
		assert.deepEqual(poseAt(-1, 0), COVER_POSE);
		for (const progress of [0, 0.3, 1]) {
			assert.ok(posesSettled(poseAt(-1, progress), poseAt(0, progress), TOLERANCE));
		}
		assert.equal(COVER_POSE.frame, 1);
		assert.equal(COVER_POSE.lift, 0);
	});

	test('끝 여운: 지난 만큼 별빛만 줄어 끝에서 0, 카메라 경로는 그대로', () => {
		const end = sceneAt(CHAPTERS.length - 1, 1);
		assert.equal(afterglowScene(end, 0), end);
		assert.equal(afterglowScene(end, 0.5).pose.stars, end.pose.stars / 2);
		const faded = afterglowScene(end, 1);
		assert.equal(faded.pose.stars, 0);
		assert.equal(faded.path, end.path);
		assert.ok(posesSettled({ ...faded.pose, stars: end.pose.stars }, end.pose, TOLERANCE));
	});

	test('장이 바뀌는 자리에서 자세가 끊기지 않음(앞 장 끝 = 다음 장 시작)', () => {
		for (let index = 1; index < CHAPTERS.length; index += 1) {
			assert.ok(
				posesSettled(poseAt(index - 1, 1), poseAt(index, 0), 1e-6),
				`${CHAPTERS[index].id} 시작이 앞 장 끝과 다름`
			);
		}
	});

	test('5장: 박자 1(앞 절반)은 흐름만, 박자 2 끝은 빛 줄기까지 · 끝 장은 액자 속 평면 그림', () => {
		const wind = CHAPTERS.findIndex((chapter) => chapter.id === 'wind');
		const beatOne = poseAt(wind, 0.4);
		assert.equal(beatOne.flow, 1);
		assert.equal(beatOne.streaks, 0);
		assert.equal(poseAt(wind, 1).streaks, 1);
		const end = poseAt(CHAPTERS.length - 1, 1);
		assert.equal(end.frame, 1);
		assert.equal(end.lift, 0);
		assert.equal(end.flow, 0);
	});

	test('따라가기: 목표에 다가가고, 충분히 지나면 멈춰도 될 만큼 같아짐', () => {
		const target = poseAt(1, 1);
		const halfway = followPose(COVER_POSE, target, 0.2, 2.6);
		assert.ok(Math.abs(halfway.u - target.u) < Math.abs(COVER_POSE.u - target.u));
		assert.ok(posesSettled(followPose(COVER_POSE, target, 10, 2.6), target, 0.0005));
	});
});

describe('starryScene — 카메라 이동 규칙(R1 · R2 · R5 · R6)', () => {
	test('장면 구간(박자)마다 전환 keyframe 1개 + 장면 이동 최대 1개', () => {
		for (const chapter of CHAPTERS) {
			const beats = beatsOf(CHAPTER_KEYFRAMES[chapter.id]);
			assert.ok(beats.length <= chapter.cards.length, `${chapter.id} 박자 ${beats.length}`);
			for (const beat of beats) {
				assert.equal(beat[0].motion, 'transition', `${chapter.id} 박자 첫 keyframe`);
				assert.ok(beat.length <= 2, `${chapter.id} 박자 keyframe ${beat.length}개`);
				assert.ok(beat.slice(1).every((keyframe) => keyframe.motion !== 'transition'));
			}
		}
	});

	test('3장 장면 이동: u 가 왼쪽 → 오른쪽으로 증가', () => {
		const village = indexOf('village');
		const keyframes = CHAPTER_KEYFRAMES.village;
		const move = keyframes.findIndex((keyframe) => keyframe.motion === 'move');
		assert.ok(move > 0);
		const startAt = keyframes[move - 1].at;
		let previous = poseAt(village, startAt).u;
		for (let step = 1; step <= SAMPLES; step += 1) {
			const u = poseAt(village, startAt + ((keyframes[move].at - startAt) * step) / SAMPLES).u;
			assert.ok(u >= previous - TOLERANCE, `3장 이동 ${step}/${SAMPLES} u ${u} < ${previous}`);
			previous = u;
		}
		assert.ok(previous > poseAt(village, startAt).u);
	});

	test('3장 이후 keyframe 의 입체(lift) ≤ 0.3', () => {
		for (const chapter of CHAPTERS.slice(indexOf('village'))) {
			for (const keyframe of CHAPTER_KEYFRAMES[chapter.id]) {
				assert.ok(keyframe.pose.lift <= LATE_LIFT_MAX, `${chapter.id} lift ${keyframe.pose.lift}`);
			}
		}
	});
});

describe('starryScene — 실제 카메라(휴대폰 390×844 · PC 1280×800)', () => {
	test('모든 전환 · 장면 이동에서 카메라 바라보는 점 x · y 가 되돌아가지 않음(단조)', () => {
		for (const screen of SCREENS) {
			for (const segment of segments()) {
				const targets = segmentTargets(segment, screen);
				for (const axis of [0, 1] as const) {
					const values = targets.map((target) => target[axis]);
					assert.ok(
						isMonotonic(values),
						`${screen.name} ${segment.chapterId} ${segment.motion} ${axis === 0 ? 'x' : 'y'} 되돌아감`
					);
				}
			}
		}
	});

	test('전환 안 카메라 속도는 한 번 오르고 한 번 내림', () => {
		for (const screen of SCREENS) {
			for (const segment of segments().filter((each) => each.motion === 'transition')) {
				const targets = segmentTargets(segment, screen);
				const speeds = targets
					.slice(1)
					.map((target, index) =>
						Math.hypot(target[0] - targets[index][0], target[1] - targets[index][1])
					);
				assert.ok(
					isSinglePeak(speeds),
					`${screen.name} ${segment.chapterId} 전환 속도 봉우리 둘 이상`
				);
			}
		}
	});

	test('4장 끝(그림 전체 구도, fit 1): 그림 중앙이 화면 중앙', () => {
		const scene = sceneAt(indexOf('morning-star'), 1);
		assert.equal(scene.pose.fit, 1);
		for (const screen of SCREENS) {
			const center = paintingCenterOnScreen(scene, screen);
			assert.ok(
				Math.abs(center.x - CENTER) <= CENTER_TOLERANCE &&
					Math.abs(center.y - CENTER) <= CENTER_TOLERANCE,
				`${screen.name} 4장 끝 그림 중앙 화면 (${center.x}, ${center.y})`
			);
		}
	});

	test('표지(처음 열 때): 그림 중앙이 기본 초점 자리(휴대폰 위쪽 y · PC 오른쪽 x)', () => {
		for (const screen of SCREENS) {
			const center = paintingCenterOnScreen(sceneAt(-1, 0), screen);
			assert.ok(
				Math.abs(center.x - screen.focus.x) <= CENTER_TOLERANCE &&
					Math.abs(center.y - screen.focus.y) <= CENTER_TOLERANCE,
				`${screen.name} 표지 그림 중앙 화면 (${center.x}, ${center.y})`
			);
		}
		assert.equal(SCREENS[0].focus.y < CENTER, true);
		assert.equal(SCREENS[1].focus.x > CENTER, true);
	});

	test('표지 → 1장 한 번의 전환: 바라보는 점 되돌아감 없음 · 속도 봉우리 하나 · 끝 = 1장 도착 자세', () => {
		const arrival = CHAPTER_KEYFRAMES.museum[CHAPTER_KEYFRAMES.museum.length - 1];
		assert.equal(CHAPTER_KEYFRAMES.museum.length, 1);
		assert.equal(arrival.motion, 'transition');
		for (const screen of SCREENS) {
			const targets = segmentTargets(
				{ chapterIndex: -1, chapterId: 'museum', motion: 'transition', fromAt: 0, toAt: 1 },
				screen
			);
			for (const [name, values] of [
				['target x', targets.map((target) => target[0])],
				['target y', targets.map((target) => target[1])]
			] as const) {
				assert.ok(isMonotonic(values), `${screen.name} 표지 → 1장 ${name} 되돌아감`);
			}
			const speeds = targets
				.slice(1)
				.map((target, index) =>
					Math.hypot(target[0] - targets[index][0], target[1] - targets[index][1])
				);
			assert.ok(isSinglePeak(speeds), `${screen.name} 표지 → 1장 속도 봉우리 둘 이상`);
		}
		const end = sceneAt(-1, 1);
		assert.equal(end.path.from, COVER_POSE);
		assert.equal(end.path.to, arrival.pose);
		assert.equal(end.path.ratio, 1);
		assert.ok(posesSettled(end.pose, arrival.pose, TOLERANCE));
	});

	test('휴대폰 가까이(2장 사이프러스): 보이는 창이 그림 밖으로 나가지 않음', () => {
		const phone = SCREENS[0];
		const scene = sceneAt(indexOf('asylum'), 1);
		const shot = shotAlong(scene.path, phone.aspect, phone.focus);
		const view = windowOf(cameraOf(shot, scene.pose), phone.aspect, {
			x: shot.focusX,
			y: shot.focusY
		});
		assert.ok(view.left >= -PAINTING_ASPECT / 2 - TOLERANCE);
		assert.ok(view.right <= PAINTING_ASPECT / 2 + TOLERANCE);
		assert.ok(view.top <= 0.5 + TOLERANCE);
		assert.ok(view.bottom >= -0.5 - TOLERANCE);
	});

	test('초점 보정: 가까이(fit 0)는 기본 초점(휴대폰 위쪽 · PC 오른쪽), 그림 전체(fit 1)는 화면 정중앙', () => {
		const close = poseAt(indexOf('asylum'), 1);
		assert.deepEqual(focusOf(close, focusFor(390)), { x: 0.5, y: 0.36 });
		assert.ok(focusOf(close, focusFor(1280)).x > CENTER);
		for (const screen of SCREENS) {
			assert.deepEqual(focusOf(poseAt(indexOf('morning-star'), 1), screen.focus), {
				x: CENTER,
				y: CENTER
			});
			// 표지 자세만 초점 보정의 예외(그림 전체여도 기본 초점)
			assert.deepEqual(focusOf(COVER_POSE, screen.focus), screen.focus);
		}
	});
});

describe('starryScene — 시간 표지', () => {
	test('표지에서는 없음 · 장마다 그 장 표지 · 대조에 걸리면 없음', () => {
		assert.equal(timeMarkFor(-1, new Set()), null);
		assert.equal(timeMarkFor(0, new Set()), '지금 · 뉴욕');
		assert.equal(timeMarkFor(CHAPTERS.length - 1, new Set()), '1889년 11월 → 1890년 7월 → 지금');
		assert.equal(timeMarkFor(5, new Set([timeMarkTarget('bars')])), null);
		// 장 문단만 숨겨져도 시간 표지는 따로 대조한다
		assert.equal(timeMarkFor(5, new Set(['bars'])), '1889년 10월');
	});
});
