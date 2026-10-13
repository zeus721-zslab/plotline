// 링크 공유 미리보기 값(socialMetaFor) 테스트(node:test). 제목 · 요약은 로컬 사본 static/data/stories/index.json 을 따른다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { isStoryIndex } from './published.ts';
import { OG_IMAGE_EXTENSION, SITE_URL, socialMetaFor, type SocialMetaKey } from './socialMeta.ts';

const EXPECTED_SITE_URL = 'https://plotline.duckdns.org';
// 공개 라우트가 있는 8편(routes/stories/<key>). 하나라도 index.json 에 없으면 그 편의 프리렌더가 실패한다.
const ROUTE_STORY_KEYS = [
	'element-discovery',
	'light-age',
	'black-hole',
	'sunken-cities',
	'starry-night',
	'unseen-companion',
	'uncrossable-line',
	'vanished-digits'
] as const satisfies readonly SocialMetaKey[];

function readIndexStoryKeys(): string[] {
	const index: unknown = JSON.parse(
		readFileSync(new URL('../../../static/data/stories/index.json', import.meta.url), 'utf8')
	);
	assert.ok(isStoryIndex(index));
	return index.stories.map((entry) => entry.story);
}

const indexStoryKeys = readIndexStoryKeys();
const allKeys: SocialMetaKey[] = ['home', ...ROUTE_STORY_KEYS];

describe('socialMetaFor', () => {
	test('SITE_URL 은 운영 주소이고 끝 슬래시가 없다', () => {
		assert.equal(SITE_URL, EXPECTED_SITE_URL);
	});

	test('라우트 8편 키가 모두 index.json 에 있다', () => {
		assert.equal(ROUTE_STORY_KEYS.length, 8);
		for (const key of ROUTE_STORY_KEYS) assert.ok(indexStoryKeys.includes(key), key);
	});

	test('index.json 의 모든 이야기와 홈은 제목 · 요약이 비어 있지 않다', () => {
		assert.ok(indexStoryKeys.length > 0);
		for (const key of ['home', ...indexStoryKeys]) {
			const meta = socialMetaFor(key as SocialMetaKey);
			assert.ok(meta.title.trim().length > 0, `${key} title`);
			assert.ok(meta.description.trim().length > 0, `${key} description`);
		}
	});

	test('홈은 고정 제목 · 소개 문구와 루트 주소를 쓴다', () => {
		assert.deepEqual(socialMetaFor('home'), {
			title: 'Plotline',
			description: '숫자 몇 개로 읽는 긴 이야기',
			url: `${EXPECTED_SITE_URL}/`,
			image: `${EXPECTED_SITE_URL}/og/home.${OG_IMAGE_EXTENSION}`
		});
	});

	test('이야기는 index.json 의 제목 · 요약과 끝 슬래시 없는 주소를 쓴다', () => {
		const meta = socialMetaFor('vanished-digits');
		assert.equal(meta.title, '사라진 세 자리');
		assert.equal(meta.url, `${EXPECTED_SITE_URL}/stories/vanished-digits`);
		assert.equal(meta.image, `${EXPECTED_SITE_URL}/og/vanished-digits.${OG_IMAGE_EXTENSION}`);
	});

	test('url · image 는 운영 주소로 시작하는 절대 주소다', () => {
		for (const key of allKeys) {
			const meta = socialMetaFor(key);
			assert.ok(meta.url.startsWith(`${EXPECTED_SITE_URL}/`), `${key} url`);
			assert.ok(meta.image.startsWith(`${EXPECTED_SITE_URL}/`), `${key} image`);
		}
	});

	test('index.json 에 없는 키는 예외를 던진다', () => {
		assert.throws(() => socialMetaFor('no-such-story' as SocialMetaKey), /no-such-story/);
	});

	test('static/og/<key> 이미지 9장이 있다', () => {
		assert.equal(allKeys.length, 9);
		for (const key of allKeys) {
			const path = new URL(`../../../static/og/${key}.${OG_IMAGE_EXTENSION}`, import.meta.url);
			assert.ok(existsSync(path), `${key}.${OG_IMAGE_EXTENSION}`);
		}
	});
});
