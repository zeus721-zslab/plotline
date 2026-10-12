// 보이지 않는 짝 장면 상태(unseenScene) · 글 등장(unseenText) 순수 함수 테스트(node:test, 의존성 없음).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { BEATS, CHAPTERS } from './chapters.ts';
import {
	BEAT_IDS,
	beatAt,
	beatShowsBand,
	beatState,
	chapterOf,
	chapterTransition,
	HALO_FOG,
	haloRadius,
	landscapeScope,
	MATTER_CELLS,
	odometerDigits,
	scrollFor,
	targetSpot,
	yearRoll,
	type BeatSpan,
	type SceneInput,
	type Transition
} from './unseenScene.ts';
import { parseStaticData, STATIC_FILES } from './unseenStatic.ts';
import { splitLines, textFrame } from './unseenText.ts';

const BEAT_COUNT = 32;
const VIEWPORT_HEIGHT = 844;
const SAMPLES = 50;
const EPSILON = 1e-6;

function readStatic(path: string): unknown {
	return JSON.parse(readFileSync(new URL(`../../../../static${path}`, import.meta.url), 'utf8'));
}

const STATIC = parseStaticData(readStatic(STATIC_FILES.sirius), readStatic(STATIC_FILES.peg));
assert.ok(STATIC !== null, 'static JSON shape');
const INPUT: SceneInput = {
	pathStartYear: STATIC.sirius.path.year[0],
	pathEndYear: STATIC.sirius.path.year[STATIC.sirius.path.year.length - 1],
	pegDays: STATIC.peg.velocity.day[STATIC.peg.velocity.day.length - 1]
};

/** 표지(화면 1장) 뒤에 비트가 vh 길이대로 이어 붙은 스크롤 구간 */
function spansFor(viewportHeight: number): BeatSpan[] {
	let top = viewportHeight;
	return BEATS.map(({ beat }) => {
		const span = { top, height: (beat.heightVh / 100) * viewportHeight };
		top += span.height;
		return span;
	});
}

describe('장 구성', () => {
	test('8장 32비트 · 비트 id 순서', () => {
		assert.equal(CHAPTERS.length, 8);
		assert.equal(BEAT_IDS.length, BEAT_COUNT);
		assert.deepEqual(BEAT_IDS.slice(0, 4), ['1-1', '1-2', '1-3', '2-1']);
		assert.equal(BEAT_IDS[BEAT_COUNT - 1], '8-3');
	});

	test('본문 v3.1 대조 숫자 문구 유지', () => {
		const lines = (id: string): string[] => {
			const found = BEATS.find((entry) => entry.beat.id === id);
			assert.ok(found !== undefined, id);
			return found.beat.lines;
		};
		assert.ok(lines('2-1')[1].includes('90년 가까이'));
		assert.ok(lines('6-3')[1].includes('목성 절반만큼 무거운'));
	});
});

describe('비트 ↔ 진행 값', () => {
	const spans = spansFor(VIEWPORT_HEIGHT);

	test('비트 윗변에서 그 비트 p 0, 바로 앞에서는 앞 비트 p 1 근처', () => {
		for (let index = 1; index < BEAT_COUNT; index++) {
			assert.deepEqual(beatAt(spans[index].top, spans), { index, p: 0 });
			const before = beatAt(spans[index].top - 1, spans);
			assert.equal(before.index, index - 1);
			assert.ok(before.p > 0.99, `${BEAT_IDS[index - 1]} p ${before.p}`);
		}
	});

	test('첫 비트 앞은 첫 비트 p 0, 끝 비트 뒤는 끝 비트 p 1', () => {
		assert.deepEqual(beatAt(0, spans), { index: 0, p: 0 });
		const last = spans[BEAT_COUNT - 1];
		assert.deepEqual(beatAt(last.top + last.height * 3, spans), { index: BEAT_COUNT - 1, p: 1 });
	});

	test('scrollFor 로 간 자리는 같은 비트 · 진행 값(되감기 · 리사이즈 복원)', () => {
		for (let index = 0; index < BEAT_COUNT; index++) {
			for (const p of [0, 0.25, 0.45, 0.5, 0.9]) {
				const back = beatAt(scrollFor(index, p, spans), spans);
				assert.equal(back.index, index);
				assert.ok(Math.abs(back.p - p) < EPSILON, `${BEAT_IDS[index]} ${p}`);
			}
		}
	});
});

describe('장 사이 연도 숫자', () => {
	// 앞 장 마지막 비트 p 0.85 → 1, 다음 장 첫 비트 p 0 → 0.2 를 이어 본다
	function rollValues(lastIndex: number): number[] {
		const values: number[] = [];
		for (let i = 0; i <= SAMPLES; i++) {
			const transition = chapterTransition(lastIndex, 0.85 + (0.15 * i) / SAMPLES);
			assert.ok(transition !== null);
			values.push(yearRoll(transition).value);
		}
		for (let i = 0; i <= SAMPLES; i++) {
			const transition = chapterTransition(lastIndex + 1, (0.2 * i) / SAMPLES);
			assert.ok(transition !== null);
			values.push(yearRoll(transition).value);
		}
		return values;
	}

	const boundaries = BEAT_IDS.flatMap((id, index) =>
		index + 1 < BEAT_COUNT &&
		chapterOf(BEAT_IDS[index + 1]) === chapterOf(id) + 1 &&
		chapterOf(id) >= 2 &&
		chapterOf(id) <= 6
			? [index]
			: []
	);

	test('경계는 2→3 · 3→4 · 4→5 · 5→6 · 6→7장 다섯 곳(1→2 · 7→8 없음)', () => {
		assert.deepEqual(
			boundaries.map((index) => BEAT_IDS[index]),
			['2-4', '3-4', '4-4', '5-4', '6-4']
		);
		assert.equal(chapterTransition(BEAT_IDS.indexOf('1-3'), 0.95), null);
		assert.equal(chapterTransition(BEAT_IDS.indexOf('7-6'), 0.95), null);
	});

	for (const lastIndex of boundaries) {
		test(`${BEAT_IDS[lastIndex]} → ${BEAT_IDS[lastIndex + 1]}: 연도 값이 한 방향으로만 바뀌고 양 끝은 두 장 연도`, () => {
			const values = rollValues(lastIndex);
			const first = values[0];
			const last = values[values.length - 1];
			const direction = Math.sign(last - first);
			assert.notEqual(direction, 0);
			for (let i = 1; i < values.length; i++) {
				assert.ok((values[i] - values[i - 1]) * direction >= -EPSILON, `${i}: ${values[i]}`);
			}
			const end: Transition | null = chapterTransition(lastIndex + 1, 0.2);
			assert.ok(end !== null);
			assert.equal(yearRoll(end).alpha, 0);
		});
	}

	test('6-4 → 7-1: 굴리지 않고 1995 → 1970 차례로(동시 표시 0 · 중간값 0 · 되감아도 같은 값)', () => {
		const lastIndex = BEAT_IDS.indexOf('6-4');
		const samples: { value: number; alpha: number }[] = [];
		for (let i = 0; i <= SAMPLES; i++) {
			const transition = chapterTransition(lastIndex, 0.85 + (0.15 * i) / SAMPLES);
			assert.ok(transition !== null);
			samples.push(yearRoll(transition));
		}
		for (let i = 0; i <= SAMPLES; i++) {
			const transition = chapterTransition(lastIndex + 1, (0.2 * i) / SAMPLES);
			assert.ok(transition !== null);
			samples.push(yearRoll(transition));
		}
		// 표시되는 숫자는 두 장 연도뿐
		assert.ok(samples.every((sample) => sample.value === 1995 || sample.value === 1970));
		// 1995 가 보이는 구간이 모두 끝난 뒤에야 1970 이 보인다(둘 다 투명도 > 0 인 순간 없음)
		const shown = (year: number): number[] =>
			samples.flatMap((sample, i) => (sample.value === year && sample.alpha > 0 ? [i] : []));
		const shown1995 = shown(1995);
		const shown1970 = shown(1970);
		assert.ok(shown1995.length > 0 && shown1970.length > 0);
		assert.ok(Math.min(...shown1970) > Math.max(...shown1995));
		// 앞 절반 끝(6-4 p1)과 다음 장 끝(7-1 p0.2)에서 투명도 0, 최대 0.9
		assert.equal(samples[SAMPLES].alpha, 0);
		assert.equal(samples[samples.length - 1].alpha, 0);
		assert.ok(Math.abs(Math.max(...samples.map((s) => s.alpha)) - 0.9) < EPSILON);
		// 되감기: 같은 진행 값이면 같은 결과
		const again = chapterTransition(lastIndex, 0.9);
		assert.ok(again !== null);
		assert.deepEqual(yearRoll(again), yearRoll(again));
	});

	test('주행 거리계 자리: 1862 → 1915 사이 값의 자리 숫자를 합치면 원래 값(아래 자리 0~10)', () => {
		for (let i = 0; i <= SAMPLES; i++) {
			const value = 1862 + (53 * i) / SAMPLES;
			const digits = odometerDigits(value);
			assert.equal(digits.length, 4);
			assert.ok(digits.every((digit) => digit >= 0 && digit < 10));
			assert.equal(Math.floor(digits[0]), Math.floor(value / 1000) % 10);
		}
	});
});

describe('7장 암흑 물질(7-4 규모 · 7-5 이름)', () => {
	const galaxyOf = (id: string, p: number) => {
		const found = beatState(id, p, INPUT).overlay.find((item) => item.kind === 'galaxy');
		assert.ok(found !== undefined && found.kind === 'galaxy', `${id} ${p}`);
		return found;
	};
	const growOf = (id: string, p: number): number => {
		const grow = galaxyOf(id, p).haloGrow;
		return grow === undefined ? 0 : grow;
	};

	test('7-4: 윤곽 반지름이 p 따라 단조로 커지고 0.1~0.7 에서 은하 윤곽 → 짧은 변 0.9 배', () => {
		for (const [size, minSide] of [
			[179.4, 390],
			[237.5, 900]
		]) {
			let previous = -Infinity;
			for (let i = 0; i <= SAMPLES; i++) {
				const radius = haloRadius(size, minSide, growOf('7-4', i / SAMPLES));
				assert.ok(radius >= previous - EPSILON, `${size} p${i / SAMPLES}`);
				previous = radius;
			}
			assert.equal(haloRadius(size, minSide, growOf('7-4', 0.1)), size * 1.55);
			assert.ok(Math.abs(haloRadius(size, minSide, growOf('7-4', 0.7)) - minSide * 0.9) < EPSILON);
			assert.ok(
				haloRadius(size, minSide, growOf('7-4', 0.5)) >
					haloRadius(size, minSide, growOf('7-4', 0.2))
			);
		}
		// 7-3 은 기존 윤곽 그대로(커지지 않음), 7-4 시작은 7-3 끝과 같은 윤곽
		assert.equal(growOf('7-3', 1), 0);
		assert.equal(growOf('7-4', 0), 0);
	});

	test('7-4 · 7-5: 비교 막대 1:5', () => {
		for (const [id, p] of [
			['7-4', 0.5],
			['7-5', 0.05]
		] as const) {
			const chart = beatState(id, p, INPUT).chart;
			assert.ok(chart !== null && chart.kind === 'matter', id);
			assert.equal(chart.visible, 1);
			assert.equal(chart.invisible, 5);
			assert.equal(chart.invisible / chart.visible, MATTER_CELLS.invisible / MATTER_CELLS.visible);
		}
	});

	test('7-5: 커진 윤곽 유지 · 띠 내림 · 끝에서 7-6 첫 상태로 이어짐', () => {
		assert.equal(growOf('7-4', 1), 1);
		assert.equal(growOf('7-5', 0.5), 1);
		assert.ok(galaxyOf('7-5', 0.5).alpha < 1);
		assert.equal(beatState('7-5', 0.5, INPUT).band, 0);
		assert.equal(growOf('7-5', 1), growOf('7-6', 0));
		assert.equal(galaxyOf('7-5', 1).alpha, galaxyOf('7-6', 0).alpha);
		assert.equal(galaxyOf('7-5', 1).halo, galaxyOf('7-6', 0).halo);
	});

	const near = (actual: number | undefined, expected: number, label: string): void => {
		const value = actual === undefined ? 0 : actual;
		assert.ok(Math.abs(value - expected) < EPSILON, `${label}: ${value} vs ${expected}`);
	};

	test('7-5 이름 지움: p0.3 = 0 · p0.6 = 1(넓은 자간에서 제자리로) · p1 = 0', () => {
		near(galaxyOf('7-5', 0.3).nameErase, 0, 'p0.3');
		near(galaxyOf('7-5', 0.6).nameErase, 1, 'p0.6');
		near(galaxyOf('7-5', 0.75).nameErase, 1, 'p0.75');
		near(galaxyOf('7-5', 1).nameErase, 0, 'p1');
		near(galaxyOf('7-5', 0.3).nameSpread, 1, 'spread p0.3');
		near(galaxyOf('7-5', 0.6).nameSpread, 0, 'spread p0.6');
	});

	test('7-5 빛 안개: p0 = 0 · p0.3 = 목표 · p1 = 0, 점 구름 올림도 같은 구간', () => {
		near(galaxyOf('7-5', 0).fog, 0, 'p0');
		near(galaxyOf('7-5', 0.3).fog, HALO_FOG, 'p0.3');
		near(galaxyOf('7-5', 1).fog, 0, 'p1');
		near(galaxyOf('7-5', 0).cloudBoost, 0, 'boost p0');
		near(galaxyOf('7-5', 0.3).cloudBoost, 1, 'boost p0.3');
		near(galaxyOf('7-5', 1).cloudBoost, 0, 'boost p1');
	});

	test('7-5 끝 상태(지움 · 안개 · 점 구름 · 윤곽 · 은하)가 7-6 시작과 이어짐', () => {
		const end = galaxyOf('7-5', 1);
		const start = galaxyOf('7-6', 0);
		for (const key of ['fog', 'cloudBoost', 'nameErase', 'haloGrow', 'markers'] as const)
			near(end[key], start[key] === undefined ? 0 : start[key], key);
		near(end.alpha, start.alpha, 'alpha');
		near(end.halo, start.halo === undefined ? 0 : start.halo, 'halo');
		near(end.time, start.time, 'time');
	});

	test('7-5 강조 말: 끝 줄 끝 "암흑 물질."(글 상자는 화면 읽기용 · 동작 줄이기 평문, 이름은 캔버스 지움 글자)', () => {
		const found = BEATS.find((entry) => entry.beat.id === '7-5');
		assert.ok(found !== undefined && found.beat.emphasis !== undefined);
		assert.ok(found.beat.lines[found.beat.lines.length - 1].endsWith(found.beat.emphasis));
		assert.equal(found.beat.emphasis, '암흑 물질.');
	});
});

describe('가로 화면(PC) 시야: 글 열 · 띠와 겹치지 않음', () => {
	// 렌더러 resize 와 같은 식(CSS 글 열: 왼쪽 max(32, 5vw) · 폭 clamp(320, 30vw, 440))
	for (const [width, height] of [
		[1440, 900],
		[1024, 768],
		[1920, 1080]
	] as const) {
		test(`${width}×${height}`, () => {
			const columnLeft = Math.max(32, width * 0.05);
			const columnRight = columnLeft + Math.min(440, Math.max(320, width * 0.3));
			const area = { left: columnRight + 32, right: width - 32 };
			const ui = Math.min(1.25, Math.max(1, 1 + ((Math.min(width, height) - 390) * 0.006) / 16));
			const bandH = Math.min(280 * ui, Math.max(210, height * 0.31));
			const bandTop = height - bandH;
			const limits = BEAT_IDS.map((id) => ({
				top: 32,
				bottom: beatShowsBand(id, INPUT) ? bandTop - 16 : height - 32
			}));
			const maxRadius = Math.min(Math.min(width, height) * 0.42, 300, (area.right - area.left) / 2);
			const centerX = (area.left + area.right) / 2;
			const base = { x: centerX, y: height / 2, r: 100 };
			for (let index = 0; index < BEAT_COUNT; index++) {
				const band = beatShowsBand(BEAT_IDS[index], INPUT);
				for (let i = 0; i <= SAMPLES; i++) {
					const scope = landscapeScope(index, i / SAMPLES, limits, {
						wide: true,
						centerX,
						maxRadius,
						base
					});
					const where = `${BEAT_IDS[index]} p${i / SAMPLES}`;
					assert.ok(scope.x - scope.r >= columnRight + 32 - EPSILON, `글 열: ${where}`);
					assert.ok(scope.x + scope.r <= width - 32 + EPSILON, `화면 오른쪽: ${where}`);
					assert.ok(scope.y - scope.r >= 32 - EPSILON, `화면 위: ${where}`);
					if (band) assert.ok(scope.y + scope.r <= bandTop - 16 + EPSILON, `띠: ${where}`);
				}
			}
		});
	}
});

describe('가로 화면(PC) 하늘 대상 자리: 글 열 오른쪽', () => {
	test('1440 · 1024 에서 천왕성 · 안드로메다 자리 x > 글 열 오른쪽 끝', () => {
		for (const [width, height] of [
			[1440, 900],
			[1024, 768]
		] as const) {
			// 렌더러 resize 와 같은 식(CSS 글 열: 왼쪽 max(32, 5vw) · 폭 clamp(320, 30vw, 440), 그림 영역 = 글 열 끝 + 32 ~ 화면 끝 − 32)
			const columnLeft = Math.max(32, width * 0.05);
			const columnRight = columnLeft + Math.min(440, Math.max(320, width * 0.3));
			const area = { left: columnRight + 32, right: width - 32 };
			for (const key of ['uranus', 'andromeda'] as const) {
				const [x] = targetSpot(key, width, height, area);
				assert.ok(x > columnRight, `${width} ${key}: x ${x} · 글 열 끝 ${columnRight}`);
			}
		}
	});
});

describe('글 등장(되감기에 상관없이 진행 값만으로)', () => {
	test('비활성 글은 opacity 0 만 남는다', () => {
		const { parts } = splitLines(['곧아야 할 길이 물결치고 있었다.']);
		const chars = parts.flat().flatMap((part) => (part.kind === 'word' ? part.chars : []));
		const frame = textFrame('ripple', 0.5, {
			active: false,
			first: false,
			last: false,
			reduceMotion: false,
			chars
		});
		assert.deepEqual(frame, { box: 'opacity: 0', chars: [] });
	});

	test('같은 비트 · 진행 값이면 같은 style(7종 모두)', () => {
		const { parts } = splitLines(['눈부신 빛 바로 옆에,', '작은 점 하나.']);
		const chars = parts.flat().flatMap((part) => (part.kind === 'word' ? part.chars : []));
		for (const style of [
			'rise',
			'ripple',
			'pen',
			'whiteFocus',
			'squeeze',
			'shake',
			'arc'
		] as const) {
			const options = { active: true, first: false, last: false, reduceMotion: false, chars };
			assert.deepEqual(textFrame(style, 0.13, options), textFrame(style, 0.13, options), style);
		}
	});

	test('동작 줄이기: 단순 페이드(opacity 만)', () => {
		const frame = textFrame('arc', 0.05, {
			active: true,
			first: false,
			last: false,
			reduceMotion: true,
			chars: []
		});
		assert.deepEqual(frame, { box: 'opacity: 0.5', chars: [] });
	});
});
