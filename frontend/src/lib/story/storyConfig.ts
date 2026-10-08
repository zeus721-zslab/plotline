// 스토리 구성 공통 해석(순수 함수): 문구 출처와 문구 템플릿.
// 문구 속 {이름} 자리는 화면이 데이터로 계산한 값으로 채운다(fillTemplate).

export type CopySource = { id: string; title: string; url: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
	if (!isRecord(value)) throw new Error(`story config ${field} must be an object`);
	return value;
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== 'string') throw new Error(`story config ${field} must be a string`);
	return value;
}

export function parseCopySource(raw: unknown): CopySource {
	const record = requireRecord(raw, 'copySources[]');
	return {
		id: requireString(record.id, 'copySources[].id'),
		title: requireString(record.title, 'copySources[].title'),
		url: requireString(record.url, 'copySources[].url')
	};
}

const TEMPLATE_SLOT = /\{(\w+)\}/g;

/** 문구의 {이름} 자리를 값으로 바꾼다. 값이 없는 자리는 화면에서 눈에 띄도록 그대로 둔다. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
	return template.replace(TEMPLATE_SLOT, (slot: string, name: string) =>
		name in values ? String(values[name]) : slot
	);
}

export type TemplatePart = { kind: 'text'; text: string } | { kind: 'slot'; name: string };

/** 문구를 글자 조각과 {이름} 자리로 나눈다. 자리마다 다른 표현(숫자 세기 등)을 끼울 때 쓴다. */
export function templateParts(template: string): TemplatePart[] {
	const parts: TemplatePart[] = [];
	let cursor = 0;
	for (const match of template.matchAll(TEMPLATE_SLOT)) {
		if (match.index > cursor)
			parts.push({ kind: 'text', text: template.slice(cursor, match.index) });
		parts.push({ kind: 'slot', name: match[1] });
		cursor = match.index + match[0].length;
	}
	if (cursor < template.length) parts.push({ kind: 'text', text: template.slice(cursor) });
	return parts;
}
