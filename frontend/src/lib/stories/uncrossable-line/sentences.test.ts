// 넘을 수 없는 선 문장 분할 테스트(node:test, 의존성 없음). 본문 SoT(chapters.ts) 38비트를 자막 문장으로 나눈 결과를 확인한다.
// 실행: docker compose exec frontend node --test "src/**/*.test.ts"
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BEATS, CHAPTERS } from './chapters.ts';
import { splitSentences } from './sentences.ts';

const EXPECTED_CHAPTERS = 9;
const EXPECTED_BEATS = 38;
const EXPECTED_SENTENCES = 246;

function beatText(id: string): string {
	const found = BEATS.find((entry) => entry.beat.id === id);
	assert.ok(found !== undefined, id);
	return found.beat.text;
}

describe('splitSentences — 규칙', () => {
	test('문장 끝(. ? !) 뒤 공백에서 나누고, 구분 공백을 보존한다', () => {
		const result = splitSentences('하나. 둘?  셋!');
		assert.deepEqual(result.sentences, ['하나.', '둘?', '셋!']);
		assert.deepEqual(result.separators, [' ', '  ', '']);
	});

	test('종결부호 뒤에 글자가 바로 이어지면 나누지 않는다', () => {
		assert.deepEqual(splitSentences('S=2.697 이다. 끝.').sentences, ['S=2.697 이다.', '끝.']);
	});

	test('따옴표 안에서는 나누지 않는다', () => {
		assert.deepEqual(splitSentences("각자 '예. 아니오'로 답한다. 끝.").sentences, [
			"각자 '예. 아니오'로 답한다.",
			'끝.'
		]);
	});

	test('따옴표 안 종결부호 + 닫는 따옴표 + 공백은 문장 끝(STEP 125 예외)', () => {
		assert.deepEqual(splitSentences('말했다. "있습니까?" 그래서.').sentences, [
			'말했다.',
			'"있습니까?"',
			'그래서.'
		]);
	});

	test('따옴표 안 종결부호 뒤 닫는 따옴표에 글자가 이어지면 나누지 않는다', () => {
		assert.deepEqual(splitSentences('"있습니까?"라고 물었다.').sentences, [
			'"있습니까?"라고 물었다.'
		]);
	});
});

describe('본문 v3.5 — 38비트 문장', () => {
	test('9장 38비트', () => {
		assert.equal(CHAPTERS.length, EXPECTED_CHAPTERS);
		assert.equal(BEATS.length, EXPECTED_BEATS);
	});

	test('38비트 모두 "문장 + 구분 공백"을 이으면 원문과 같다', () => {
		for (const { beat } of BEATS) {
			const { sentences, separators } = splitSentences(beat.text);
			const rejoined = sentences.map((sentence, index) => sentence + separators[index]).join('');
			assert.equal(rejoined, beat.text, beat.id);
		}
	});

	test('6-5: "정규직은 있습니까?" 가 독립 문장', () => {
		const { sentences } = splitSentences(beatText('6-5'));
		assert.equal(sentences.length, 6);
		assert.equal(sentences[3], '"정규직은 있습니까?"');
		assert.ok(sentences[4].startsWith('이런 실험은'));
	});

	test('비트별 문장 수: 1-2 5 · 3-3 8 · 5-4 9, 합계 246', () => {
		const count = (id: string): number => splitSentences(beatText(id)).sentences.length;
		assert.equal(count('1-2'), 5);
		assert.equal(count('3-3'), 8);
		assert.equal(count('5-4'), 9);
		const total = BEATS.reduce(
			(sum, { beat }) => sum + splitSentences(beat.text).sentences.length,
			0
		);
		assert.equal(total, EXPECTED_SENTENCES);
	});

	test('3-3 새 4번 · 5-4 나뉜 3 · 4번 문장', () => {
		assert.equal(
			splitSentences(beatText('3-3')).sentences[3],
			'높이가 흐릿하면, 시계가 가리키는 순간도 흐릿해진다.'
		);
		const bell = splitSentences(beatText('5-4')).sentences;
		assert.ok(bell[2].startsWith('빨강·파랑을 이기려면'));
		assert.ok(bell[3].startsWith('파랑·빨강을 이기려면'));
	});
});
