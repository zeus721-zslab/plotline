// 넘을 수 없는 선 데이터 해석(순수 함수): 발행 파일 bell_line 을 사건 → 기록(날짜 · 수량) 지도로 바꾼다(공용 eventData.ts).
// 수량 칸은 정수다. 점수는 ×10, 시간은 ns 로 저장한다.
import { buildEventMap, type EventRecord } from '../../story/eventData.ts';
import type { PublishedDataset } from '../../story/published.ts';

export const EVENT_IDS = [
	'einstein_lightquanta',
	'born_letter',
	'solvay_1927',
	'solvay_1930',
	'epr_paper',
	'einstein_died',
	'bohr_died',
	'bell_theorem',
	'chsh_paper',
	'freedman_clauser',
	'aspect_meets_bell',
	'aspect_fixed',
	'aspect_switching',
	'nobel_2022',
	'classical_bound',
	'quantum_bound',
	'switch_distance',
	'switch_separation',
	'photon_flight',
	'signal_time',
	'switch_interval'
] as const;
export type EventId = (typeof EVENT_IDS)[number];

export type LineData = { events: Map<EventId, EventRecord> };

/** 사건 줄을 읽는다. 형식이 다른 줄이 있거나 같은 사건이 두 번 나오면 null. */
export function buildLineData(dataset: PublishedDataset): LineData | null {
	const events = buildEventMap(dataset, EVENT_IDS);
	return events === null ? null : { events };
}
