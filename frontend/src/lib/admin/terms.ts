// 관리자 화면에 보이는 글자의 기준(용어표, D-28). 화면 문구가 쓰는 공통 낱말 · 형식 이름 · 탭 이름 · 공통 오류 문장을
// 여기 한 곳에 둔다. 구조의 이름 · 값은 Claude 에게 받는 JSON 과 같게 JSON 용어(key · value)를 그대로 쓴다.
// 내부 변수 · API 경로 · JSON key 이름은 이 표와 상관없이 원래 이름을 쓴다.

import type { FieldType } from './fieldRows.ts';
import type { RowView, SourceKind, SourceType } from './imports.ts';

/** 공통 낱말. */
export const TERMS = {
	dataset: '데이터 묶음',
	structure: '구조',
	key: 'key',
	label: '화면 이름',
	valueType: 'value 형식',
	required: '필수',
	rowKey: '구분 칸',
	constraints: '허용 범위',
	row: '줄',
	approve: '승인',
	reject: '제외',
	rejectReason: '제외 이유',
	superseded: '대체됨',
	exclude: '공개 제외',
	restore: '복원',
	version: '기록본',
	sourceUrl: '출처 링크',
	asOfDate: '확인한 날',
	slug: '주소 이름'
} as const;

/** 표 머리 · 도움말에 쓰는 설명. */
export const TERM_HELP = {
	dataset: '이야기 한 편이 쓰는 표 하나',
	structure: '한 줄(JSON 객체 하나)에 들어갈 key 와 value 규칙',
	key: 'JSON 에 저장되는 이름. 영문 소문자 · 숫자 · _',
	label: '관리 화면 표에만 보이는 이름',
	valueType: '다른 형식의 값이 오면 오류로 표시합니다',
	required: '비어 있으면 승인할 수 없습니다',
	rowKey: '같은 줄인지 판단하는 칸. 같은 값으로 다시 들어오면 새 줄이 옛 줄을 대체합니다',
	constraints: '최솟값 · 최댓값, 글자 수, 고를 수 있는 값',
	row: '표의 한 줄(JSON 객체 하나)',
	version: '승인한 줄을 묶어 고정한 판. 이야기는 기록본을 씁니다',
	exclude: '줄은 남겨 두고 기록본에서만 뺍니다. 복원하면 다시 들어갑니다',
	asOfDate: '출처에서 값을 확인한 날짜',
	slug: '주소와 파일 이름에 쓰는 영문 이름'
} as const;

/** 구조가 JSON 형식임을 알리는 표시. */
export const JSON_NOTE = '※ JSON 형식';

/** value 형식 선택지(서버 FieldType 8종, text · int · number · year · date · category · url · bool 순서). */
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
	text: '글자',
	int: '정수',
	number: '숫자',
	year: '연도',
	date: '날짜',
	category: '선택지',
	url: '링크',
	bool: '예/아니오'
};

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
	external: '외부 자료',
	self: '직접 작성'
};

/** 붙여넣기 칸 "자세히"의 들어온 경로. */
export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
	claude: 'Claude 결과',
	upload: '직접 준비한 자료'
};

/** 줄 목록 탭 이름. */
export const ROW_VIEW_LABELS: Record<RowView, string> = {
	pending: '대기',
	approved: '승인',
	rejected: '제외',
	superseded: '대체됨',
	excluded: '공개 제외'
};

/** 여러 화면이 같이 쓰는 오류 문장. */
export const COMMON_ERROR_MESSAGES = {
	forbidden: '허용되지 않은 접속 주소에서 보낸 요청입니다.',
	network_error: '서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요.'
} as const;
