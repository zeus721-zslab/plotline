// 데이터셋 출처를 화면 표시용으로 바꾸기(순수 함수).
import type { PublishedDataset, PublishedSource } from './published.ts';

// 화면 표시용 출처. 데이터셋 제목을 함께 들고 다녀 "제목: URL (기준 날짜)" 를 만들 수 있게 한다.
export type SourceView =
	| { datasetTitle: string; kind: 'external'; url: string; asOfDate: string }
	| { datasetTitle: string; kind: 'self' };

export function toSourceView(datasetTitle: string, source: PublishedSource): SourceView {
	if (source.kind === 'self') return { datasetTitle, kind: 'self' };
	return { datasetTitle, kind: 'external', url: source.url, asOfDate: source.as_of_date };
}

export function datasetSourceViews(dataset: PublishedDataset): SourceView[] {
	return dataset.sources.map((source) => toSourceView(dataset.title, source));
}
