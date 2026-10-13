// 보이지 않는 짝 데이터 해석(순수 함수): 발행 파일 sirius_unseen 을 사건 → 기록(날짜 · 수량) 지도로 바꾼다(공용 eventData.ts).
// 수량 칸은 정수다. 소수 값은 ×100 · ×1000 으로 저장한다.
import { buildEventMap, type EventRecord } from '../../story/eventData.ts';
import type { PublishedDataset } from '../../story/published.ts';

export const EVENT_IDS = [
	'sirius_brightest',
	'bradley_epoch',
	'bessel_uranus_lecture',
	'bessel_letter',
	'bessel_died',
	'leverrier_letter',
	'berlin_received',
	'neptune_found',
	'neptune_offset',
	'clark_sighting',
	'adams_spectrum',
	'siriusb_mass',
	'siriusb_radius',
	'sirius_orbit_period',
	'eddington_book',
	'peg_announced',
	'peg_period',
	'peg_wobble',
	'exoplanet_count',
	'rubin_andromeda'
] as const;
export type EventId = (typeof EVENT_IDS)[number];

export type UnseenData = { events: Map<EventId, EventRecord> };

/** 사건 줄을 읽는다. 형식이 다른 줄이 있거나 같은 사건이 두 번 나오면 null. */
export function buildUnseenData(dataset: PublishedDataset): UnseenData | null {
	const events = buildEventMap(dataset, EVENT_IDS);
	return events === null ? null : { events };
}
