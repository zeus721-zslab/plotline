// 이야기 미리보기 주소의 쿼리(D-37). 작업 페이지가 만들고 미리보기 route 가 읽는다.
// 제목 · 요약은 title · summary, 묶음 판은 d.{묶음 주소 이름} 을 키로 판 번호를 싣는다(묶음 이름이 title 이어도 겹치지 않게).

export type PreviewQuery = {
	title: string;
	summary: string;
	datasets: Record<string, number>;
};

const TITLE_KEY = 'title';
const SUMMARY_KEY = 'summary';
const DATASET_KEY_PREFIX = 'd.';
const POSITIVE_INTEGER = /^[1-9]\d*$/;

function datasetKey(name: string): string {
	return `${DATASET_KEY_PREFIX}${name}`;
}

export function previewSearch(query: PreviewQuery): string {
	const params = new URLSearchParams();
	params.set(TITLE_KEY, query.title);
	params.set(SUMMARY_KEY, query.summary);
	for (const [name, versionNo] of Object.entries(query.datasets)) {
		params.set(datasetKey(name), String(versionNo));
	}
	return `?${params.toString()}`;
}

/** 이야기가 쓰는 묶음마다 판 번호가 있고 제목 · 요약이 비어 있지 않을 때만 돌려준다. */
export function parsePreviewQuery(
	params: Pick<URLSearchParams, 'get'>,
	datasetNames: readonly string[]
): PreviewQuery | null {
	const title = (params.get(TITLE_KEY) ?? '').trim();
	const summary = (params.get(SUMMARY_KEY) ?? '').trim();
	if (title === '' || summary === '') return null;
	const datasets: Record<string, number> = {};
	for (const name of datasetNames) {
		const value = params.get(datasetKey(name));
		if (value === null || !POSITIVE_INTEGER.test(value)) return null;
		datasets[name] = Number(value);
	}
	return { title, summary, datasets };
}
