// 바다 밑의 도시들 장별 곁들임 카드: 2 · 3편과 같은 "알고 보면"(fact) 카드, 카드마다 출처 1개(출처 페이지에서 문장을 확인한 것만).
// 데이터와 겹치는 사실이 있는 카드는 claim 으로 적어 storyChecks 가 데이터와 대조한다(어긋나면 그 카드만 숨김).
import type { CopySource } from '../../story/storyConfig.ts';
import type { AsideKind, StepAside } from '../../story/storySteps.ts';
import type { ChapterId } from './chapters.ts';

// 카드 출처를 확인한 날
export const ASIDE_SOURCE_AS_OF_DATE = '2026-10-11';

// 스토레가 해일 어림(지금으로부터 몇 년 전). 도거랜드가 다 잠긴 때가 이보다 나중이어야 "사라지기 전" 문구가 맞다.
export const STOREGGA_YEARS_AGO = 8_150;

// 카드 문구가 데이터에 기대는 사실
export const ASIDE_CLAIMS = [
	// 도거랜드가 다 잠긴 때가 스토레가 해일보다 나중이다
	'doggerland-after-storegga',
	// 헤라클레이온이 장소 데이터에 있다
	'heracleion-in-data'
] as const;
export type AsideClaim = (typeof ASIDE_CLAIMS)[number];

export type ChapterAside = {
	id: string;
	chapterId: ChapterId;
	kind: AsideKind;
	text: string;
	sourceName: string;
	sourceUrl: string;
	claim: AsideClaim | null;
};

export const CHAPTER_ASIDES: ChapterAside[] = [
	{
		id: 'mud-barrier',
		chapterId: 'atlantis',
		kind: 'fact',
		text: '플라톤에 따르면, 아틀란티스가 잠긴 자리는 배가 지나갈 수 없는 진흙 여울이 됐습니다.',
		sourceName: '플라톤 크리티아스(조엣 번역, Project Gutenberg)',
		sourceUrl: 'https://www.gutenberg.org/files/1571/1571-h/1571-h.htm',
		claim: null
	},
	{
		id: 'storegga',
		chapterId: 'doggerland',
		kind: 'fact',
		text: '도거랜드가 사라지기 전, 노르웨이 앞바다 해저 산사태(스토레가)가 일으킨 큰 해일이 덮쳤습니다(약 8,150년 전).',
		sourceName: 'Current Archaeology',
		sourceUrl:
			'https://archaeology.co.uk/articles/news/searching-for-the-storegga-tsunami-in-doggerland.htm',
		claim: 'doggerland-after-storegga'
	},
	{
		id: 'thonis',
		chapterId: 'heracleion',
		kind: 'fact',
		text: '헤라클레이온의 이집트 이름은 토니스입니다.',
		sourceName: 'Franck Goddio',
		sourceUrl: 'https://www.franckgoddio.org/projects/sunken-civilizations/heracleion/',
		claim: 'heracleion-in-data'
	},
	{
		id: 'two-dialogues',
		chapterId: 'end',
		kind: 'fact',
		text: '아틀란티스의 원전은 플라톤의 대화편 두 편(티마이오스 · 크리티아스)뿐입니다.',
		sourceName: 'Wikipedia',
		sourceUrl: 'https://en.wikipedia.org/wiki/Atlantis',
		claim: null
	}
];

/** 카드 출처를 문구 출처 모양으로: 이름 뒤에 확인한 날을 붙인다. id 는 카드 id 와 같다. */
export function asideCopySource(aside: ChapterAside): CopySource {
	return {
		id: aside.id,
		title: `${aside.sourceName} (${ASIDE_SOURCE_AS_OF_DATE} 기준)`,
		url: aside.sourceUrl
	};
}

/** 곁들임 카드 부품(Aside)이 받는 모양. */
export function asStepAside(aside: ChapterAside): StepAside {
	return { kind: aside.kind, text: aside.text, sources: [aside.id], image: null };
}
