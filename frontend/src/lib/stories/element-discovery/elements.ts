// 원소 발견사 스토리의 원소 목록 조립(순수 함수). 두 데이터셋(이름·발견 연도)을 원자 번호로 합친다.
import type { CellValue, PublishedDataset, PublishedRow } from '../../story/published.ts';
import { toSourceView, type SourceView } from '../../story/sourceViews.ts';

export type Discovery = { era: 'ancient' } | { era: 'dated'; year: number };

export type StoryElement = {
	atomicNumber: number;
	symbol: string;
	name: string;
	discovery: Discovery;
	nameSource: SourceView;
	discoverySource: SourceView;
};

function rowSourceView(dataset: PublishedDataset, row: PublishedRow): SourceView | null {
	const source = dataset.sources.find((candidate) => candidate.id === row.source);
	return source === undefined ? null : toSourceView(dataset.title, source);
}

function integerValue(value: CellValue | undefined): number | null {
	return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function textValue(value: CellValue | undefined): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function discoveryValue(values: Record<string, CellValue>): Discovery | null {
	if (values.era === 'ancient') return { era: 'ancient' };
	const year = integerValue(values.discovery_year);
	if (values.era === 'dated' && year !== null) return { era: 'dated', year };
	return null;
}

type NamedRow = { symbol: string; name: string; source: SourceView };
type DiscoveryRow = { discovery: Discovery; source: SourceView };

function indexNameRows(dataset: PublishedDataset): Map<number, NamedRow> | null {
	const byNumber = new Map<number, NamedRow>();
	for (const row of dataset.rows) {
		const atomicNumber = integerValue(row.values.atomic_number);
		const symbol = textValue(row.values.symbol);
		const name = textValue(row.values.name_ko);
		const source = rowSourceView(dataset, row);
		if (atomicNumber === null || symbol === null || name === null || source === null) return null;
		byNumber.set(atomicNumber, { symbol, name, source });
	}
	return byNumber;
}

function indexDiscoveryRows(dataset: PublishedDataset): Map<number, DiscoveryRow> | null {
	const byNumber = new Map<number, DiscoveryRow>();
	for (const row of dataset.rows) {
		const atomicNumber = integerValue(row.values.atomic_number);
		const discovery = discoveryValue(row.values);
		const source = rowSourceView(dataset, row);
		if (atomicNumber === null || discovery === null || source === null) return null;
		byNumber.set(atomicNumber, { discovery, source });
	}
	return byNumber;
}

/**
 * 이름 데이터셋과 발견 데이터셋을 원자 번호로 합친다. 칸 값이 형식에 맞지 않거나 두 데이터셋의 원자 번호
 * 집합이 다르면 null(화면은 형식 오류로 처리).
 */
export function buildElements(
	names: PublishedDataset,
	discoveries: PublishedDataset
): StoryElement[] | null {
	const nameRows = indexNameRows(names);
	const discoveryRows = indexDiscoveryRows(discoveries);
	if (nameRows === null || discoveryRows === null || nameRows.size !== discoveryRows.size) {
		return null;
	}
	const elements: StoryElement[] = [];
	for (const [atomicNumber, named] of nameRows) {
		const discovered = discoveryRows.get(atomicNumber);
		if (discovered === undefined) return null;
		elements.push({
			atomicNumber,
			symbol: named.symbol,
			name: named.name,
			discovery: discovered.discovery,
			nameSource: named.source,
			discoverySource: discovered.source
		});
	}
	return elements.sort((left, right) => left.atomicNumber - right.atomicNumber);
}

/** 발견 순서: 고대 먼저(원자 번호순), 그다음 연도순(같은 해는 원자 번호순). */
export function compareByDiscovery(left: StoryElement, right: StoryElement): number {
	const leftYear = left.discovery.era === 'dated' ? left.discovery.year : Number.NEGATIVE_INFINITY;
	const rightYear =
		right.discovery.era === 'dated' ? right.discovery.year : Number.NEGATIVE_INFINITY;
	if (leftYear !== rightYear) return leftYear - rightYear;
	return left.atomicNumber - right.atomicNumber;
}

export function discoveryLabel(discovery: Discovery): string {
	return discovery.era === 'ancient' ? '고대' : `${discovery.year}년`;
}
