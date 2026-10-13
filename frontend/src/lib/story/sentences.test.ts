// 공용 문장 분할(story/sentences.ts) 규칙 테스트(node:test). 편 본문 단위 확인은 각 편 테스트가 한다.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { splitSentences } from './sentences.ts';

function rejoin(text: string): string {
	const { sentences, separators } = splitSentences(text);
	return sentences.map((sentence, index) => sentence + separators[index]).join('');
}

describe('splitSentences — 규칙', () => {
	test('문장 끝(. ? !) 뒤 공백에서 나누고, 구분 공백을 보존한다', () => {
		const result = splitSentences('하나. 둘?  셋!');
		assert.deepEqual(result.sentences, ['하나.', '둘?', '셋!']);
		assert.deepEqual(result.separators, [' ', '  ', '']);
	});

	test('종결부호 뒤에 글자가 바로 이어지면(소수점) 나누지 않는다', () => {
		assert.deepEqual(splitSentences('하나는 0.506127의 세계에. 끝.').sentences, [
			'하나는 0.506127의 세계에.',
			'끝.'
		]);
	});

	test('따옴표 안에서는 나누지 않는다', () => {
		assert.deepEqual(splitSentences("각자 '예. 아니오'로 답한다. 끝.").sentences, [
			"각자 '예. 아니오'로 답한다.",
			'끝.'
		]);
	});

	test('따옴표 안 종결부호 + 닫는 따옴표 + 공백은 문장 끝', () => {
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

	test('종결부호 없이 끝나는 문단은 마지막 조각을 한 문장으로 둔다', () => {
		const result = splitSentences('하나. 둘');
		assert.deepEqual(result.sentences, ['하나.', '둘']);
		assert.deepEqual(result.separators, [' ', '']);
	});

	test('문장 + 구분 공백을 이으면 원문과 같다', () => {
		const text = "하나.  둘? '셋. 넷' 다섯! 여섯";
		assert.equal(rejoin(text), text);
	});
});
