// 보이지 않는 짝 문구-데이터 대조(순수 함수). 공용 eventClaims.ts 를 쓴다: 불일치가 있는 대상은 화면에서 숨긴다.
// 대상(target): 장 id(그 장 비트 글 전체) · timeMarkTarget(장 id)(시간 표지) · SCREEN_MARKS 의 target(장 밖 화면 표기).
// value · scaled-value · days-after 는 폐기된 6편(titanic, origin/feat/story-titanic) storyChecks 구현을 옮겼다(배율은 나누기로).
// years-after · value · scaled-value 는 공용 종류이고, present · date(연 · 월 · 일) · days-after 는 이 편에 둔다.
import type { EventRecord } from '../../story/eventData.ts';
import {
	claimProblem as eventClaimProblem,
	eventOf,
	findTargetMismatches,
	within,
	type StoryMismatch
} from '../../story/eventClaims.ts';
import { CHAPTERS, SCREEN_MARKS, type Claim } from './chapters.ts';
import type { UnseenData } from './unseenData.ts';

const MILLISECONDS_PER_DAY = 86_400_000;

export function timeMarkTarget(chapterId: string): string {
	return `${chapterId}/time-mark`;
}

function dayOf(record: EventRecord): number | null {
	if (record.month === null || record.day === null) return null;
	return Date.UTC(record.year, record.month - 1, record.day);
}

/** 두 기록 사이 날 수(날짜 차). 월 · 일이 없으면 null. */
export function daysBetween(from: EventRecord, to: EventRecord): number | null {
	const start = dayOf(from);
	const end = dayOf(to);
	return start === null || end === null ? null : (end - start) / MILLISECONDS_PER_DAY;
}

/** 문구가 기대는 사실이 데이터와 맞는가. 맞으면 null, 아니면 이유. */
export function claimProblem(claim: Claim, data: UnseenData): string | null {
	const { events } = data;
	switch (claim.kind) {
		case 'present':
			return eventOf(events, claim.event) === null ? `${claim.event}: not in data` : null;
		case 'date': {
			const found = eventOf(events, claim.event);
			const matches =
				found !== null &&
				found.year === claim.year &&
				(claim.month === null || found.month === claim.month) &&
				(claim.day === null || found.day === claim.day);
			return matches ? null : `${claim.event}: date differs`;
		}
		case 'days-after': {
			const from = eventOf(events, claim.from);
			const to = eventOf(events, claim.to);
			const amount = from === null || to === null ? null : daysBetween(from, to);
			return within(amount, claim.min, claim.max)
				? null
				: `${claim.from} → ${claim.to}: ${amount} (days-after)`;
		}
		default:
			return eventClaimProblem(claim, events);
	}
}

/**
 * 이 편 문구 대조 전체: 장마다 장 글 → 시간 표지, 그다음 장 밖 화면 표기(6장 속도 띠 · 4장 궤도).
 * 페이지 숨김과 관리자 대조(registry)가 같은 계산을 쓴다.
 */
export function storyMismatches(data: UnseenData): StoryMismatch[] {
	const chapters = CHAPTERS.flatMap((chapter) => [
		{ target: chapter.id, claims: chapter.claims },
		{ target: timeMarkTarget(chapter.id), claims: chapter.timeMarkClaims }
	]);
	return findTargetMismatches([...chapters, ...SCREEN_MARKS], (claim) => claimProblem(claim, data));
}
