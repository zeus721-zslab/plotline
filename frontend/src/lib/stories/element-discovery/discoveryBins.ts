// 50년 구간별 발견 수 집계(순수 함수).
// 정의: 분자 = 구간 [시작, 시작+49] 에 discovery_year 가 든 원소 수 · 고대는 별도 1구간 · 첫 구간 시작 =
// 가장 이른 발견 연도를 50 으로 내림 · 마지막 구간 = 가장 늦은 발견 연도가 든 구간 · 빈 구간도 0 으로 둔다.
import type { StoryElement } from './elements.ts';

export const BIN_YEARS = 50;
const ANCIENT_BIN_ID = 'ancient';

export type DiscoveryBin = { id: string; label: string; count: number };

function binStart(year: number): number {
	return Math.floor(year / BIN_YEARS) * BIN_YEARS;
}

export function binDiscoveries(elements: StoryElement[]): DiscoveryBin[] {
	const years: number[] = [];
	let ancientCount = 0;
	for (const element of elements) {
		if (element.discovery.era === 'ancient') ancientCount += 1;
		else years.push(element.discovery.year);
	}
	const bins: DiscoveryBin[] = [{ id: ANCIENT_BIN_ID, label: '고대', count: ancientCount }];
	if (years.length === 0) return bins;

	const firstStart = binStart(Math.min(...years));
	const lastStart = binStart(Math.max(...years));
	for (let start = firstStart; start <= lastStart; start += BIN_YEARS) {
		const end = start + BIN_YEARS - 1;
		bins.push({
			id: String(start),
			label: `${start}–${end}`,
			count: years.filter((year) => year >= start && year <= end).length
		});
	}
	return bins;
}

/** 발견 수가 가장 많은 50년 구간(고대 제외). 같으면 이른 구간. 연도 있는 발견이 없으면 null. */
export function busiestBin(bins: DiscoveryBin[]): DiscoveryBin | null {
	let busiest: DiscoveryBin | null = null;
	for (const bin of bins) {
		if (bin.id === ANCIENT_BIN_ID) continue;
		if (busiest === null || bin.count > busiest.count) busiest = bin;
	}
	return busiest;
}
