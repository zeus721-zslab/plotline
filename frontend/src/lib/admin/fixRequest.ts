// 오류 줄을 Claude 에게 다시 만들어 달라고 보낼 수정 요청문(클립보드용 글, 순수 함수).

import type { DatasetRow } from './imports.ts';

const OPENING =
	'아래 줄이 검사에서 걸렸습니다. 고친 줄만 같은 묶음 형식으로 다시 만들어 주세요. 확인할 수 없는 값은 비우고 출처를 다시 확인하세요.';
const NO_ROW_KEY = '(구분 칸 값 없음)';
const FORMAT_NOTE = '형식 예시 ("fields" 를 넣지 않으면 지금 구조를 그대로 씁니다):';

/** 원래 줄: 저장된 값(검사에서 읽지 못한 값은 null) + 출처 3칸. */
function originalRow(row: DatasetRow): Record<string, unknown> {
	return {
		...row.data,
		source_kind: row.source_kind,
		source_url: row.source_url,
		as_of_date: row.as_of_date
	};
}

function errorLine(row: DatasetRow, index: number): string[] {
	const errors = row.errors === null ? [] : row.errors;
	return [
		`${index + 1}. ${row.row_key === null ? NO_ROW_KEY : row.row_key}`,
		...errors.map((error) => `- ${error.field === null ? '' : `${error.field}: `}${error.message}`),
		`원래 줄: ${JSON.stringify(originalRow(row))}`
	];
}

export function fixRequestText(slug: string, title: string, rows: DatasetRow[]): string {
	const example = `{"dataset":{"slug":${JSON.stringify(slug)},"title":${JSON.stringify(title)}},"rows":[...]}`;
	const blocks = rows.map((row, index) => errorLine(row, index).join('\n'));
	return [OPENING, ...blocks, `${FORMAT_NOTE}\n${example}`].join('\n\n');
}
