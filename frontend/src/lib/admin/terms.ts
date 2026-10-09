// 관리자 화면에 보이는 글자의 기준(용어표, D-28). 화면 문구가 쓰는 공통 낱말 · 형식 이름 · 탭 이름 · 공통 오류 문장을
// 여기 한 곳에 둔다. 구조의 이름 · 값은 Claude 에게 받는 JSON 과 같게 JSON 용어(key · value)를 그대로 쓴다.
// 내부 변수 · API 경로 · JSON key 이름은 이 표와 상관없이 원래 이름을 쓴다.

import type { FieldType } from './fieldRows.ts';
import type { RowView, SourceKind, SourceType } from './imports.ts';
import type { PublishError, PublishStatus } from './publish.ts';
import type { DatasetContentProblem, PublicFileStatus, StoryPublishError } from './stories.ts';

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
	exclude: '판에서 제외',
	restore: '복원',
	version: '판',
	publish: '판 확정',
	publishedVersion: '최신 판',
	storyPublish: '발행',
	storyPublishedVersion: '공개 판',
	story: '이야기',
	preview: '미리보기',
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
	version: '승인한 줄을 묶어 고정한 판. 이야기는 확정된 판을 골라 씁니다',
	publish:
		'승인한 줄로 새 판을 만들고 판 파일을 씁니다. 한 번 쓴 파일은 바뀌지 않습니다. 방문자 화면은 이야기를 발행해야 바뀝니다',
	exclude: '줄은 남겨 두고 판에서만 뺍니다. 복원하면 다시 들어갑니다',
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
	excluded: '판에서 제외'
};

/** 판의 공개 파일 상태. */
export const PUBLISH_STATUS_LABELS: Record<PublishStatus, string> = {
	pending: '끝나지 않음',
	done: '확정됨',
	failed: '실패',
	abandoned: '폐기됨'
};

/** 이야기 판의 상태(이야기 자체의 발행 · 공개, D-37). */
export const STORY_PUBLISH_STATUS_LABELS: Record<PublishStatus, string> = {
	pending: '끝나지 않음',
	done: '공개됨',
	failed: '실패',
	abandoned: '폐기됨'
};

/** 판의 실패 이유(서버 오류 코드 대신 보이는 문장). */
export const PUBLISH_ERROR_MESSAGES: Record<PublishError, string> = {
	file_write_failed: '저장 공간 · 권한 문제로 파일을 못 썼습니다. 다시 시도하세요',
	file_conflict: '같은 이름의 다른 파일이 이미 있습니다. 폐기하고 다시 확정하세요',
	content_invalid: '판 파일 형식과 맞지 않는 값이 있습니다. 폐기한 뒤 고쳐서 다시 확정하세요',
	content_changed: '처음 만든 내용과 달라졌습니다. 폐기하고 다시 확정하세요'
};

/** 이야기 판의 실패 이유(서버 오류 코드 대신 보이는 문장, D-37). */
export const STORY_PUBLISH_ERROR_MESSAGES: Record<StoryPublishError, string> = {
	publish_dir_missing: '공개 폴더가 없습니다. 서버의 저장 공간 연결을 확인하세요',
	unsafe_path: '공개 폴더 안 이야기 경로가 바뀌어 있습니다(링크 등). 서버에서 확인하세요',
	story_file_write_failed: '이야기 파일을 못 썼습니다. 저장 공간 · 권한을 확인하고 다시 시도하세요',
	index_write_failed: '이야기 파일은 바뀌었지만 목록을 못 썼습니다. 다시 시도하세요'
};

/** 공개 이야기 파일이 최신 공개 판과 맞지 않을 때의 경고(조회 시점, D-37). ok 는 경고하지 않는다. */
export const PUBLIC_FILE_WARNINGS: Record<Exclude<PublicFileStatus, 'ok'>, string> = {
	missing: '공개 이야기 파일이 없습니다',
	mismatch: '공개 이야기 파일이 지금 공개 판과 다릅니다',
	unreadable: '공개 이야기 파일을 읽을 수 없습니다(링크 · 일반 파일 아님 · 크기 초과 등)'
};

/** 판 내용 API 가 내용을 주지 못한 이유(문구 대조 · 미리보기, D-37). */
export const DATASET_CONTENT_PROBLEM_MESSAGES: Record<DatasetContentProblem, string> = {
	content_invalid: '이 판의 내용을 만들 수 없습니다 — 데이터 이상',
	version_not_done: '확정된 판이 아닙니다',
	dataset_not_found: '프론트와 서버의 묶음 이름이 맞지 않습니다',
	version_not_found: '없는 판입니다'
};

/** 발행 · 되돌리기 · 다시 시도 · 다시 쓰기 요청의 결과를 알 수 없을 때(500 · 네트워크 오류). */
export const STORY_RESULT_UNKNOWN_MESSAGE =
	'결과를 확인하지 못했습니다. 공개 파일이 바뀌었을 수 있으니 새로 고쳐 상태를 확인하세요';

/** 판 · 이야기 참조의 파일 경고(조회 시점의 파일 존재 · 판 상태, D-30). */
export const PUBLISH_FILE_WARNINGS = {
	abandonedFilePresent: '폐기했지만 이 판의 파일은 남아 있습니다(삭제는 서버 작업)',
	doneFileMissing: '파일이 없습니다. 다시 시도로 복구합니다',
	storyOnUnpublished: (versionNo: number) =>
		`${TERMS.story}가 확정되지 않은 판(v${versionNo})을 가리킵니다`
};

/** 여러 화면이 같이 쓰는 오류 문장. */
export const COMMON_ERROR_MESSAGES = {
	forbidden: '허용되지 않은 접속 주소에서 보낸 요청입니다.',
	network_error: '서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요.'
} as const;
