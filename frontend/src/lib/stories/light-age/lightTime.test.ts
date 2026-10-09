// 빛의 나이 표시 · 계산 · 대조 단위 테스트(node:test, 의존성 없음).
// 실행: docker compose exec frontend node --test src/lib/stories/light-age/lightTime.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { isPublishedDataset, type PublishedDataset } from '../../story/published.ts';
import { parseStoryImages } from '../../story/storyMedia.ts';
import { CHAPTER_ASIDES } from './asides.ts';
import { CHAPTERS, chapterSlots } from './chapters.ts';
import {
	birthRelation,
	departureText,
	distanceText,
	koreanNumber,
	matchMoment,
	storyToday,
	travelTime,
	voyagerVerb
} from './lightTime.ts';
import {
	buildEarthMoments,
	buildSkyObjects,
	type DistanceUnit,
	type EarthMoment,
	type SkyObject
} from './skyData.ts';
import { asideTarget, findLightAgeMismatches, momentTarget } from './storyChecks.ts';

const CURRENT_YEAR = 2026;

function sky(id: string, distanceValue: number, distanceUnit: DistanceUnit, showExact = false) {
	const object: SkyObject = {
		id,
		nameKo: id,
		kind: '항성',
		distanceValue,
		distanceUnit,
		showExact,
		distanceNote: ''
	};
	return object;
}

function moment(fields: Partial<EarthMoment> & Pick<EarthMoment, 'time'>): EarthMoment {
	return { id: 'm', objectId: 'x', momentKind: '빛이 떠날 때', event: '', ...fields };
}

function readDataset(path: string): PublishedDataset {
	const raw: unknown = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
	assert.ok(isPublishedDataset(raw), path);
	return raw;
}

describe('빛 이동 시간', () => {
	const cases: Array<[string, number, DistanceUnit, string, string]> = [
		['moon', 384_400, 'km', '약 1.3초', '초'],
		['sun', 149_598_000, 'km', '약 8분', '분'],
		['jupiter', 778_500_000, 'km', '약 43분', '분'],
		['neptune', 4_515_000_000, 'km', '약 4시간', '시간'],
		// 86,399.99995초: 반올림하면 24시간이라 다음 단위(1일)로 올린다.
		['voyager1', 25_902_068_356, 'km', '약 1일', '일'],
		['half-year', 0.5, '광년', '약 183일', '일'],
		['proxima', 4.2, '광년', '약 4년', '년'],
		['pleiades', 445, '광년', '약 445년', '년'],
		['orion', 1265, '광년', '약 1,300년', '년'],
		['crab', 6500, '광년', '약 6,500년', '년'],
		['sgr', 27_000, '광년', '약 2만 7천 년', '만 년'],
		['lmc', 161_700, '광년', '약 16만 년', '만 년'],
		['andromeda', 2_500_000, '광년', '약 250만 년', '만 년'],
		['m87', 55_000_000, '광년', '약 5,500만 년', '만 년'],
		['far', 123_000_000, '광년', '약 1억 2천만 년', '억 년']
	];
	for (const [id, value, unit, text, timeUnit] of cases) {
		test(`${id} → ${text}`, () => {
			const time = travelTime(sky(id, value, unit));
			assert.equal(time.text, text);
			assert.equal(time.unit, timeUnit);
		});
	}

	test('약 없는 글', () => {
		assert.equal(travelTime(sky('sun', 149_598_000, 'km')).plain, '8분');
	});
});

describe('거리 표기', () => {
	test('km 앞 두 자리 한글 단위', () => {
		assert.equal(distanceText(sky('moon', 384_400, 'km')), '약 38만 km');
		assert.equal(distanceText(sky('jupiter', 778_500_000, 'km')), '약 7억 8천만 km');
		assert.equal(distanceText(sky('sun', 149_598_000, 'km')), '약 1억 5천만 km');
		assert.equal(distanceText(sky('neptune', 4_515_000_000, 'km')), '약 45억 km');
	});

	test('정확 표기는 쉼표 원래 값', () => {
		assert.equal(distanceText(sky('voyager1', 25_902_068_356, 'km', true)), '25,902,068,356 km');
	});

	test('광년: 10 미만 소수 한 자리 · 이상은 년 규칙 단위', () => {
		assert.equal(distanceText(sky('proxima', 4.2, '광년')), '약 4.2광년');
		assert.equal(distanceText(sky('vega', 25, '광년')), '약 25광년');
		assert.equal(distanceText(sky('sgr', 27_000, '광년')), '약 2만 7천 광년');
		assert.equal(distanceText(sky('m87', 55_000_000, '광년')), '약 5,500만 광년');
	});

	test('한글 수 단위', () => {
		assert.equal(koreanNumber(27_000), '2만 7천');
		assert.equal(koreanNumber(2_000), '2,000');
		assert.equal(koreanNumber(1_200_000_000_000), '1조 2천억');
	});
});

describe('빛이 떠난 때', () => {
	test('1년 미만은 시간 전', () => {
		assert.equal(departureText(sky('moon', 384_400, 'km'), CURRENT_YEAR), '약 1.3초 전');
	});

	test('1만 년 이하는 연도(현재 연도 − 광년 반올림)', () => {
		assert.equal(departureText(sky('proxima', 4.2, '광년'), CURRENT_YEAR), '2022년');
		assert.equal(departureText(sky('pleiades', 445, '광년'), CURRENT_YEAR), '1581년');
		assert.equal(departureText(sky('crab', 6500, '광년'), CURRENT_YEAR), '기원전 4475년');
		assert.equal(departureText(sky('edge', 10_000, '광년'), CURRENT_YEAR), '기원전 7975년');
	});

	test('1만 년 넘으면 약 N년 전 무렵', () => {
		assert.equal(departureText(sky('sgr', 27_000, '광년'), CURRENT_YEAR), '약 2만 7천 년 전 무렵');
	});
});

describe('사건 대조', () => {
	const pleiades = sky('pleiades', 445, '광년');

	test('연도 사건: 차이가 5% 안이면 맞음', () => {
		const result = matchMoment(pleiades, moment({ time: { kind: '연도', year: 1592 } }), 2026);
		assert.equal(result.kind, 'compared');
		if (result.kind !== 'compared') return;
		assert.equal(result.difference, 11);
		assert.ok(Math.abs(result.tolerance - 22.25) < 1e-9);
		assert.equal(result.matches, true);
	});

	test('연도 사건: 5% 를 넘으면 틀림', () => {
		const result = matchMoment(pleiades, moment({ time: { kind: '연도', year: 1610 } }), 2026);
		assert.equal(result.kind === 'compared' && result.matches, false);
	});

	test('허용 범위 최소 2년', () => {
		const proxima = sky('proxima', 4.2, '광년');
		const near = matchMoment(proxima, moment({ time: { kind: '연도', year: 2020 } }), 2026);
		const far = matchMoment(proxima, moment({ time: { kind: '연도', year: 2019 } }), 2026);
		assert.equal(near.kind === 'compared' && near.matches, true);
		assert.equal(far.kind === 'compared' && far.matches, false);
	});

	test('년 전 사건은 years_ago 와 광년 비교', () => {
		const lmc = sky('lmc', 161_700, '광년');
		const result = matchMoment(lmc, moment({ time: { kind: '년 전', yearsAgo: 160_000 } }), 2026);
		assert.equal(result.kind === 'compared' && result.matches, true);
	});

	test('빛이 닿을 때 사건은 대조 제외', () => {
		const crab = sky('crab', 6500, '광년');
		const result = matchMoment(
			crab,
			moment({ momentKind: '빛이 닿을 때', time: { kind: '연도', year: 1054 } }),
			2026
		);
		assert.deepEqual(result, { kind: 'excluded' });
	});
});

describe('날짜 · 출생 연도', () => {
	test('보이저 기준 날짜 전후', () => {
		assert.equal(voyagerVerb('2026-11-17'), '닿습니다');
		assert.equal(voyagerVerb('2026-11-18'), '닿았습니다');
	});

	test('오늘은 한국 시각 기준', () => {
		assert.equal(storyToday(new Date('2026-11-17T15:30:00Z')), '2026-11-18');
		assert.equal(storyToday(new Date('2026-11-17T14:59:00Z')), '2026-11-17');
	});

	test('출생 연도 잇기', () => {
		assert.equal(birthRelation(2022, 1990), '당신이 32살 때');
		assert.equal(birthRelation(2001, 2010), '태어나기 9년 전');
		assert.equal(birthRelation(2017, 2017), '당신이 태어난 해');
	});
});

describe('문구-데이터 대조(개발용 데이터)', () => {
	const objects = buildSkyObjects(
		readDataset('../../../../static/data/datasets/sky_objects/v2.json')
	);
	const moments = buildEarthMoments(
		readDataset('../../../../static/data/datasets/earth_moments/v2.json')
	);
	assert.ok(objects !== null && moments !== null);
	const images = parseStoryImages(
		JSON.parse(readFileSync(new URL('./light-age.images.json', import.meta.url), 'utf8'))
	);
	const now = new Date('2026-10-09T00:00:00Z');
	const slots = chapterSlots(objects, now);

	test('불일치 0', () => {
		assert.deepEqual(
			findLightAgeMismatches(CHAPTERS, CHAPTER_ASIDES, objects, moments, slots, images, 2026),
			[]
		);
	});

	test('사건 연도가 어긋나면 그 줄만 숨김 대상', () => {
		const shifted = new Map(moments);
		shifted.set(
			'pleiades_imjin',
			moment({ id: 'pleiades_imjin', objectId: 'pleiades', time: { kind: '연도', year: 1700 } })
		);
		const targets = findLightAgeMismatches(
			CHAPTERS,
			CHAPTER_ASIDES,
			objects,
			shifted,
			slots,
			images,
			2026
		).map((mismatch) => mismatch.target);
		assert.deepEqual(targets, [momentTarget('pleiades', 'pleiades_imjin')]);
	});

	test('사실 문구가 데이터와 어긋나면 장 숨김 대상', () => {
		const moved = new Map(objects);
		moved.set('sirius', { ...sky('sirius', 3, '광년') });
		const targets = findLightAgeMismatches(
			CHAPTERS,
			CHAPTER_ASIDES,
			moved,
			moments,
			slots,
			images,
			2026
		).map((mismatch) => mismatch.target);
		assert.deepEqual(targets, ['near-stars']);
	});

	test('카드 숫자가 데이터와 어긋나면 그 카드만 숨김 대상', () => {
		const farSun = new Map(objects);
		farSun.set('sun', { ...sky('sun', 300_000_000, 'km') });
		const shifted = new Map(moments);
		shifted.set(
			'crab_guest_star',
			moment({
				id: 'crab_guest_star',
				objectId: 'crab_nebula',
				momentKind: '빛이 닿을 때',
				time: { kind: '연도', year: 1006 }
			})
		);
		const targets = findLightAgeMismatches(
			CHAPTERS,
			CHAPTER_ASIDES,
			farSun,
			shifted,
			slots,
			images,
			2026
		).map((mismatch) => mismatch.target);
		assert.deepEqual(targets, [
			asideTarget('sun', 'sun-interior'),
			asideTarget('crab', 'guest-star-daylight')
		]);
	});
});
