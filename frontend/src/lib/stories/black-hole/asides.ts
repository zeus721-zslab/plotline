// 사건의 지평선 너머 장별 곁들임 카드: 2편과 같은 "알고 보면"(fact) 카드, 카드마다 출처 1개(출처 페이지를 직접 확인한 것만).
// 데이터와 겹치는 사실이 있는 카드는 claim 으로 적어 storyChecks 가 데이터와 대조한다(어긋나면 그 카드만 숨김).
import type { CopySource } from '../../story/storyConfig.ts';
import type { AsideKind, StepAside } from '../../story/storySteps.ts';

// 카드 출처를 확인한 날
export const ASIDE_SOURCE_AS_OF_DATE = '2026-10-10';

// 카드 문구가 데이터에 기대는 사실
export const ASIDE_CLAIMS = [
	// 백조자리 X-1 이 블랙홀 데이터에 있다
	'cygnus-x1-in-data'
] as const;
export type AsideClaim = (typeof ASIDE_CLAIMS)[number];

export type ChapterAside = {
	id: string;
	// CHAPTERS[].id
	chapterId: string;
	kind: AsideKind;
	text: string;
	sourceName: string;
	sourceUrl: string;
	claim: AsideClaim | null;
};

export const CHAPTER_ASIDES: ChapterAside[] = [
	{
		id: 'm87-jet',
		chapterId: 'far',
		kind: 'fact',
		text: '삼키기만 하는 줄 알았던 블랙홀이 약 5,000광년 길이의 제트를 뿜습니다.',
		sourceName: 'NASA',
		sourceUrl: 'https://science.nasa.gov/image-article/apod-2025-february-20-messier-87/',
		claim: null
	},
	{
		id: 'not-a-vacuum',
		chapterId: 'disk',
		kind: 'fact',
		text: '블랙홀은 우주 청소기가 아닙니다. 태양이 같은 질량의 블랙홀로 바뀌어도 지구는 지금 궤도를 그대로 돕니다. 대신 몹시 추워질 뿐입니다.',
		sourceName: 'NASA',
		sourceUrl: 'https://science.nasa.gov/universe/black-holes/',
		claim: null
	},
	{
		id: 'lensed-disk',
		chapterId: 'shadow',
		kind: 'fact',
		text: '블랙홀 뒤쪽 원반의 빛이 휘어, 그림자 위아래로 보입니다.',
		sourceName: 'NASA',
		sourceUrl: 'https://science.nasa.gov/universe/black-holes/anatomy/',
		claim: null
	},
	{
		id: 'photon-rings',
		chapterId: 'photon-sphere',
		kind: 'fact',
		text: '고리는 한 겹이 아닙니다. 블랙홀을 여러 바퀴 돈 빛이 겹겹의 고리를 만듭니다.',
		sourceName: 'NASA',
		sourceUrl: 'https://science.nasa.gov/universe/black-holes/anatomy/',
		claim: null
	},
	{
		id: 'jet-wobble',
		chapterId: 'ergosphere',
		kind: 'fact',
		text: 'M87 블랙홀이 돈다는 직접 증거가 있습니다. 블랙홀에서 뻗은 제트가 팽이처럼 약 11년 주기로 흔들립니다.',
		sourceName: 'NAOJ',
		sourceUrl: 'https://www.cfca.nao.ac.jp/en/pr/20230928',
		claim: null
	},
	{
		id: 'cygnus-bet',
		chapterId: 'spaghetti',
		kind: 'fact',
		text: "백조자리 X-1을 두고 스티븐 호킹과 킵 손이 1975년 내기를 했습니다. 호킹은 '블랙홀이 아니다'에 걸었고, 1990년 졌다고 인정했습니다.",
		sourceName: 'Caltech',
		sourceUrl: 'https://library.caltech.edu/c.php?g=1245803&p=9124930',
		claim: 'cygnus-x1-in-data'
	},
	{
		id: 'evaporation',
		chapterId: 'end',
		kind: 'fact',
		text: '초거대 블랙홀이 빛을 흘리며 모두 증발하는 데는 약 10¹⁰⁶년이 걸립니다. 1 뒤에 0이 106개 붙는 햇수입니다.',
		sourceName: 'Ohio State University',
		sourceUrl: 'https://www.astronomy.ohio-state.edu/ryden.1/ast162_10/notes42.html',
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
