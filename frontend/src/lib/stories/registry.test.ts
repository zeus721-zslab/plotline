// 관리자 발행 화면의 문구 대조(registry.checkHidden) 테스트(node:test, D-37).
// 판 번호는 하드코딩하지 않고 static/data/stories/{story}.json 의 datasets[].path 를 따라간다(storyChecks.test.ts 와 같은 방식).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { isPublishedDataset, isPublishedStory, type PublishedDataset } from '../story/published.ts';
import { findStoryEntry, STORY_ENTRIES, StoryCheckError, type StoryEntry } from './registry.ts';

function readJson(path: string): unknown {
	return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

function staticDatasets(entry: StoryEntry): Record<string, PublishedDataset> {
	const story = readJson(`../../../static/data/stories/${entry.story}.json`);
	assert.ok(isPublishedStory(story), entry.story);
	const datasets: Record<string, PublishedDataset> = {};
	for (const name of entry.datasetNames) {
		const reference = story.datasets[name];
		assert.ok(reference !== undefined, `${entry.story}: ${name} not referenced`);
		const dataset = readJson(`../../../static${reference.path}`);
		assert.ok(isPublishedDataset(dataset), `${entry.story}/${name}`);
		datasets[name] = dataset;
	}
	return datasets;
}

function requireEntry(story: string): StoryEntry {
	const entry = findStoryEntry(story);
	assert.ok(entry !== null, story);
	return entry;
}

function changeRow(
	dataset: PublishedDataset,
	key: string,
	field: string,
	value: number
): PublishedDataset {
	const copy = JSON.parse(JSON.stringify(dataset)) as PublishedDataset;
	const row = copy.rows.find((candidate) => candidate.key === key);
	assert.ok(row !== undefined, key);
	row.values[field] = value;
	return copy;
}

describe('registry.checkHidden — static/data 기준', () => {
	const now = new Date();

	test('네 이야기 모두 숨겨질 문구 0건', () => {
		assert.equal(STORY_ENTRIES.length, 4);
		for (const entry of STORY_ENTRIES) {
			assert.deepEqual([...entry.checkHidden(staticDatasets(entry), now)], [], entry.story);
		}
	});

	test('1편: 15번 원소 발견 연도를 바꾸면 숨겨질 문구가 생김', () => {
		const entry = requireEntry('element-discovery');
		const datasets = staticDatasets(entry);
		datasets.element_discoveries = changeRow(
			datasets.element_discoveries,
			'15',
			'discovery_year',
			1670
		);
		assert.ok(entry.checkHidden(datasets, now).size >= 1, '데이터를 바꿨는데 0건(false-green)');
	});

	test('2편: 태양 거리를 바꾸면 숨겨질 문구가 생김', () => {
		const entry = requireEntry('light-age');
		const datasets = staticDatasets(entry);
		datasets.sky_objects = changeRow(datasets.sky_objects, 'sun', 'distance_value', 1);
		assert.ok(entry.checkHidden(datasets, now).size >= 1, '데이터를 바꿨는데 0건(false-green)');
	});

	test('3편: 그림자를 실제 경계로 바꾸면 숨겨질 문구가 생김', () => {
		const entry = requireEntry('black-hole');
		const datasets = staticDatasets(entry);
		const copy = JSON.parse(JSON.stringify(datasets.bh_boundaries)) as PublishedDataset;
		const row = copy.rows.find((candidate) => candidate.key === 'shadow');
		assert.ok(row !== undefined);
		row.values.physical = true;
		datasets.bh_boundaries = copy;
		assert.ok(entry.checkHidden(datasets, now).size >= 1, '데이터를 바꿨는데 0건(false-green)');
	});

	test('4편: 포트로열 속도를 바꾸면 숨겨질 문구가 생김', () => {
		const entry = requireEntry('sunken-cities');
		const datasets = staticDatasets(entry);
		const copy = JSON.parse(JSON.stringify(datasets.sunken_measures)) as PublishedDataset;
		const row = copy.rows.find((candidate) => candidate.key === 'port_royal|speed');
		assert.ok(row !== undefined);
		row.values.verdict = 'no';
		datasets.sunken_measures = copy;
		assert.ok(entry.checkHidden(datasets, now).size >= 1, '데이터를 바꿨는데 0건(false-green)');
	});

	test('공개 형식이 아닌 내용은 대조하지 못함(StoryCheckError)', () => {
		const entry = requireEntry('light-age');
		const datasets: Record<string, unknown> = { ...staticDatasets(entry), earth_moments: {} };
		assert.throws(() => entry.checkHidden(datasets, now), StoryCheckError);
	});
});
