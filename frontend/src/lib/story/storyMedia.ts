// 스토리 이미지 해석(순수 함수): 이미지 목록(퍼블릭 도메인 · CC0 · CC BY 4.0, D-32).

// 휴대폰용(480)·크게 보기용(960) 두 크기. 숫자는 긴 변 픽셀.
export type ImageFiles = { small: string; large: string };

export type StoryImage = {
	id: string;
	title: string;
	creator: string;
	date: string;
	// 소장처. 모르면 null.
	holder: string | null;
	license: string;
	// 출처 페이지(커먼즈 파일 페이지 · NASA 이미지 페이지 등)
	sourceUrl: string;
	// 출처 링크 이름("위키미디어 커먼즈" · "NASA")
	sourceName: string;
	files: ImageFiles;
	// 960 파일의 가로·세로(화면이 자리를 미리 잡아 레이아웃이 흔들리지 않게 한다)
	width: number;
	height: number;
	alt: string;
	// 인물 초상: 잘라 보일 때 얼굴이 남도록 위쪽 기준으로 자른다.
	portrait: boolean;
};

const SMALL_FILE_KEY = '480';
const LARGE_FILE_KEY = '960';
export const SMALL_IMAGE_WIDTH_PX = 480;
export const LARGE_IMAGE_WIDTH_PX = 960;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
	if (typeof value !== 'string') throw new Error(`story image ${field} must be a string`);
	return value;
}

function requirePositiveInteger(value: unknown, field: string): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		throw new Error(`story image ${field} must be a positive integer`);
	}
	return value;
}

function parseImage(raw: unknown): StoryImage {
	if (!isRecord(raw)) throw new Error('story image must be an object');
	if (!isRecord(raw.files)) throw new Error('story image files must be an object');
	return {
		id: requireString(raw.id, 'id'),
		title: requireString(raw.title, 'title'),
		creator: requireString(raw.creator, 'creator'),
		date: requireString(raw.date, 'date'),
		holder: raw.holder === undefined ? null : requireString(raw.holder, 'holder'),
		license: requireString(raw.license, 'license'),
		sourceUrl: requireString(raw.sourceUrl, 'sourceUrl'),
		sourceName: requireString(raw.sourceName, 'sourceName'),
		files: {
			small: requireString(raw.files[SMALL_FILE_KEY], `files.${SMALL_FILE_KEY}`),
			large: requireString(raw.files[LARGE_FILE_KEY], `files.${LARGE_FILE_KEY}`)
		},
		width: requirePositiveInteger(raw.width, 'width'),
		height: requirePositiveInteger(raw.height, 'height'),
		alt: requireString(raw.alt, 'alt'),
		portrait: raw.portrait === true
	};
}

/** 이미지 목록 JSON 을 해석한다. 형식이 다르면 빌드·첫 실행에서 바로 드러나도록 예외. */
export function parseStoryImages(raw: unknown): StoryImage[] {
	if (!Array.isArray(raw)) throw new Error('story images must be a list');
	return raw.map(parseImage);
}

// 저작자 표시가 이용 조건인 라이선스(D-32). 이 라이선스의 크레디트는 말줄임 없이 전부 보인다.
const ATTRIBUTION_REQUIRED_LICENSE = 'CC BY 4.0';

/** 크레디트를 잘라 보이면 안 되는 이미지인가(CC BY 4.0) */
export function requiresFullCredit(image: StoryImage): boolean {
	return image.license === ATTRIBUTION_REQUIRED_LICENSE;
}

/** 그림 아래 한 줄 크레디트: "작가, 연도, 라이선스" */
export function creditLine(image: StoryImage): string {
	return `${image.creator}, ${image.date}, ${image.license}`;
}
