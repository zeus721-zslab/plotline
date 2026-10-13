// 넘을 수 없는 선 문장 분할(순수 함수): 비트 본문 문단을 자막 한 문장씩으로 나눈다(시제품 build.mjs splitSentences 규칙).
// 문장 끝(. ? !) 뒤가 공백이거나 문단 끝이면 나눈다. 따옴표 안에서는 나누지 않는다.
// 예외(STEP 125): 따옴표 안이 종결부호로 끝나고 닫는 따옴표 뒤가 공백(또는 문단 끝)이면 닫는 따옴표까지 한 문장으로 끝낸다
// (6-5 "정규직은 있습니까?" 가 독립 문장이 된다). 구분 공백은 separators 에 보존해 sentences[i] + separators[i] 를 이으면 원문이 된다.

const SENTENCE_END = new Set(['.', '?', '!']);
// 여는 따옴표 → 닫는 따옴표. 같은 기호로 여닫는 곧은 따옴표는 토글로 다룬다
const QUOTE_PAIRS = new Map<string, string>([
	['"', '"'],
	["'", "'"],
	['“', '”'],
	['‘', '’']
]);
const WHITESPACE = /\s/;

export type SentenceSplit = { sentences: string[]; separators: string[] };

export function splitSentences(text: string): SentenceSplit {
	const characters = Array.from(text);
	const sentences: string[] = [];
	const separators: string[] = [];
	let current = '';
	let closingQuote: string | null = null;
	let previous = '';
	let index = 0;
	while (index < characters.length) {
		const character = characters[index];
		current += character;
		index += 1;
		let quoteClosedAfterEnd = false;
		if (closingQuote !== null) {
			if (character === closingQuote) {
				closingQuote = null;
				quoteClosedAfterEnd = SENTENCE_END.has(previous);
			}
		} else {
			const closing = QUOTE_PAIRS.get(character);
			if (closing !== undefined) closingQuote = closing;
		}
		previous = character;
		if (closingQuote !== null) continue;
		if (!SENTENCE_END.has(character) && !quoteClosedAfterEnd) continue;
		let whitespace = '';
		while (index < characters.length && WHITESPACE.test(characters[index])) {
			whitespace += characters[index];
			index += 1;
		}
		// 종결부호 뒤에 바로 글자가 이어지면(예: 1.5, "?"라고) 문장 끝이 아니다
		if (whitespace === '' && index < characters.length) continue;
		sentences.push(current);
		separators.push(whitespace);
		current = '';
	}
	if (current !== '') {
		sentences.push(current);
		separators.push('');
	}
	return { sentences, separators };
}
