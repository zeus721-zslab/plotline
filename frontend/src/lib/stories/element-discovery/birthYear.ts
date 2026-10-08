// 출생 연도 비교(순수 함수): 그해까지 알려진 원소 수 · 그 뒤 발견 수 · 그 뒤 가장 최근 발견.
import { compareByDiscovery, type StoryElement } from './elements.ts';

const RECENT_COUNT = 3;

export type BirthYearResult = {
	year: number;
	known: number;
	after: number;
	// 그해 뒤 발견 가운데 가장 최근 것부터
	recent: StoryElement[];
};

export function compareWithYear(elements: StoryElement[], year: number): BirthYearResult {
	const later = elements.filter(
		(element) => element.discovery.era === 'dated' && element.discovery.year > year
	);
	const recent = [...later].sort((left, right) => compareByDiscovery(right, left));
	return {
		year,
		known: elements.length - later.length,
		after: later.length,
		recent: recent.slice(0, RECENT_COUNT)
	};
}
