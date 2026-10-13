// 비트 트랙 스크롤(순수 함수, D-47 D1): 세로로 이어 붙인 구간(표지 · 장 제목 · 비트 · 끝 화면 등)의 배치와 스크롤 위치 → 구간 · 진행값.
// 구간 종류와 높이 공식은 편이 정하고, 여기서는 구간마다 길이(vh) 하나만 받는다.
// 길이는 CSS vh 그대로 둔다(D-47 D3): viewportHeight 는 CSS 100vh 의 px 값이고, 구간마다 반올림하지 않는다(CSS 배치와 같은 값).
// 호출 계약: 구간은 하나 이상이고 길이(vh)는 0 보다 크다(빈 트랙 · 길이 0 구간이면 진행값이 정해지지 않는다).

const PERCENT = 100;

export type TrackSpan = { vh: number };

/** 구간 배치(px): 구간마다 윗변 · 높이, 전체 길이 */
export type TrackLayout = { tops: number[]; heights: number[]; total: number };

/** 지금 구간 번호와 그 구간 안 진행값(0~1) */
export type TrackPosition = { index: number; p: number };

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function layoutTrack(entries: readonly TrackSpan[], viewportHeight: number): TrackLayout {
	const tops: number[] = [];
	const heights: number[] = [];
	let top = 0;
	for (const entry of entries) {
		const height = (entry.vh * viewportHeight) / PERCENT;
		tops.push(top);
		heights.push(height);
		top += height;
	}
	return { tops, heights, total: top };
}

/** scrollY: 트랙 윗변 기준 스크롤 위치(px). 트랙 앞은 첫 구간 p 0, 뒤는 마지막 구간 p 1 */
export function resolveIndex(scrollY: number, layout: TrackLayout): TrackPosition {
	const last = layout.tops.length - 1;
	let index = last;
	for (let candidate = 0; candidate < last; candidate++) {
		if (scrollY < layout.tops[candidate] + layout.heights[candidate]) {
			index = candidate;
			break;
		}
	}
	return { index, p: clamp01((scrollY - layout.tops[index]) / layout.heights[index]) };
}

/** 구간 index 의 진행값 p 에 해당하는 트랙 기준 스크롤 위치(px). 화면 크기가 바뀐 뒤 같은 자리로 되돌릴 때 쓴다 */
export function scrollForIndex(index: number, p: number, layout: TrackLayout): number {
	return layout.tops[index] + p * layout.heights[index];
}
