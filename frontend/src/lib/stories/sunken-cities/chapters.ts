// 바다 밑의 도시들 장 구성: 질문 · 답 · 문단 · 장소 · 계기판 · 사진 자리.
// 축은 "바다에 잠긴 도시가 있었다는 걸 우리는 어떻게 아는가"(D-41): 장마다 질문 하나에 답하고, 답하지 못한 한계가 다음 장의 질문이 된다.
// 문구의 {이름} 자리는 그 장 장소의 데이터로 채운다(placeSlots). 문구가 기대는 사실은 claims 로 적어 storyChecks 가 대조한다.
// 답 한 줄은 그 장 문단 안에 같은 사실이 있는 것만 쓰고, 답 속 숫자는 문단과 같은 자리 값을 쓴다.
import type { CopySource } from '../../story/storyConfig.ts';
import { measureOf, type PlaceId, type SunkenData } from './sunkenData.ts';
import { depthText, yearPointOf, yearsAgoText } from './sunkenMath.ts';

export const SUNKEN_SUBTITLE = '바다에 잠긴 도시가 있었다는 걸, 우리는 어떻게 알까요';

export const CHAPTER_IDS = [
	'atlantis',
	'lyonesse',
	'doggerland',
	'pavlopetri',
	'baiae',
	'heracleion',
	'port-royal',
	'end'
] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

// 문구가 데이터에 기대는 사실
export const CHAPTER_CLAIMS = [
	// 발견 · 첫 기록 연도 줄이 있다(2 · 3 · 4 · 6장 {discovered})
	'lyonesse-discovered',
	'doggerland-discovered',
	'pavlopetri-discovered',
	'heracleion-discovered',
	// 수심 줄이 있다(3 · 4 · 5 · 6장 {depth})
	'doggerland-depth',
	'pavlopetri-depth',
	'baiae-depth',
	'heracleion-depth',
	// 도거랜드가 다 잠긴 때 줄이 있다(3장 {end_years})
	'doggerland-end',
	// 바이아이는 천천히 잠겼고 잠기기 시작한 때 줄이 있다(5장 "천천히 · 4세기")
	'baiae-gradual',
	// 파블로페트리는 잠기기 시작한 때 · 다 잠긴 때 줄이 없다(4장 "아직 정확히 모릅니다")
	'pavlopetri-unknown-time',
	// 포트로열은 1692년에 한 번에 잠겼다(7장 "그 자리에서")
	'port-royal-1692'
] as const;
export type ChapterClaim = (typeof CHAPTER_CLAIMS)[number];

// 문단: 표시 없는 본문, 또는 전설 · 상상 · 사실 표시 블록
export type ParagraphKind = 'body' | 'legend' | 'imagined' | 'fact';
export type ChapterParagraph = { kind: ParagraphKind; text: string };

export type Chapter = {
	id: ChapterId;
	label: string;
	title: string;
	place: PlaceId | null;
	paragraphs: ChapterParagraph[];
	// 계기판 조각(" · " 로 잇는다). 첫 조각은 장 이름. 자리가 빈 조각이 있으면 계기판 전체를 숨긴다(대조). 계기판이 없는 장은 null.
	gauge: string[] | null;
	// 질문 목록 한 줄과 그 답. 끝 장은 질문이 없다.
	question: string | null;
	answer: string | null;
	claims: ChapterClaim[];
	// 사진 자리: 이미지 목록 id. 넣을 사진이 없으면 null.
	photo: string | null;
};

function body(text: string): ChapterParagraph {
	return { kind: 'body', text };
}

function legend(text: string): ChapterParagraph {
	return { kind: 'legend', text };
}

function imagined(text: string): ChapterParagraph {
	return { kind: 'imagined', text };
}

function fact(text: string): ChapterParagraph {
	return { kind: 'fact', text };
}

export const CHAPTERS: Chapter[] = [
	{
		id: 'atlantis',
		label: '1장',
		title: '아틀란티스',
		place: null,
		paragraphs: [
			legend(
				'약 2,400년 전, 플라톤은 바다 건너 거대한 섬나라를 썼습니다. 물과 땅이 번갈아 고리를 이룬 도시, 붉게 빛나는 금속 오레이칼코스로 두른 성벽. 그리고 거센 지진과 홍수 끝에, 하루 낮과 하룻밤 만에 바다가 그 나라를 삼켰다고.'
			),
			body(
				'이 이야기가 나오는 곳은 플라톤의 대화편 두 편, 《티마이오스》와 《크리티아스》입니다. 플라톤의 글과 별개로 아틀란티스가 있었음을 보여 주는 고대 기록이나 유물은 알려져 있지 않습니다.'
			),
			body(
				'그렇다면 실제로 바다에 잠긴 도시들은 무엇을 남겼을까요? 전설 한 줄에서 시작해, 마지막에는 한 도시가 가라앉은 시각을 분 단위까지 알게 됩니다.'
			)
		],
		gauge: ['아틀란티스', '전설', '위치 모름'],
		question: '이야기는 어디서 왔나',
		answer: '플라톤의 글 두 편',
		claims: [],
		photo: 'kircher-atlantis'
	},
	{
		id: 'lyonesse',
		label: '2장',
		title: '리오네스',
		place: 'lyonesse',
		paragraphs: [
			legend(
				'영국 남서쪽 끝 콘월에는 바다에 잠긴 나라 리오네스의 전설이 있습니다. 하룻밤 사이 바다가 덮쳤고, 단 한 사람만 흰 말을 타고 빠져나왔다고. 잔잔한 날엔 지금도 바다 밑에서 교회 종소리가 들린다고.'
			),
			fact(
				'그 앞바다의 실리 제도에서는 썰물 때 모래톱 위로 돌담이 드러납니다. 수천 년 전 사람들이 밭의 경계로 쌓은 담이, 바다가 차오르며 물에 잠긴 것입니다. {discovered}년에 처음 기록됐습니다.'
			),
			body(
				'전설과 닮은 땅은 있었습니다. 하지만 이 돌담이 리오네스였다는 증거는 없습니다. 닮았다고 해서 전설이 사실이 되지는 않습니다. 그럼 바다 밑에 정말 사람이 살았다는 건, 어떻게 알 수 있을까요?'
			)
		],
		gauge: ['리오네스', '전설', '흔적은 실리 제도 주변'],
		question: '전설과 닮은 땅이 있나',
		answer: '썰물 때 드러나는 돌담 · 같은 곳인지는 모름',
		claims: ['lyonesse-discovered'],
		photo: null
	},
	{
		id: 'doggerland',
		label: '3장',
		title: '도거랜드',
		place: 'doggerland',
		paragraphs: [
			body(
				'{discovered}년 9월 밤, 북해에서 조업하던 어선 콜린다 호의 그물에 커다란 토탄 덩어리가 걸려 올라왔습니다. 그 속에서 나온 것은 뼈나 뿔을 깎아 만든, 길이 20cm 남짓한 작살 끝. 영국 노퍽 해안에서 약 40km, 수심 약 {depth} 바닥에서 올라온 것이었습니다.'
			),
			body(
				'영국과 유럽 대륙은 한때 걸어서 오갈 수 있는 땅으로 이어져 있었습니다. 사냥하며 살던 그 땅은 수천 년에 걸쳐 차오르는 바다에 조금씩 잠겼고, {end_years} 전 거의 사라졌습니다.'
			),
			imagined('마지막 사람들이 언덕으로 물러나며, 날마다 가까워지는 해안선을 바라봅니다.'),
			body(
				'작살은 이곳에 사람이 살았다는 걸 알려 줍니다. 하지만 그 사람들의 집이 어디 있었는지는 알려 주지 않습니다.'
			)
		],
		// 수심은 넣지 않는다: 작살이 올라온 지점의 수심이라 땅 전체 수심으로 읽힌다.
		gauge: ['도거랜드', '바다에 잠긴 지 {end_years}'],
		question: '정말 사람이 살았나',
		answer: '{discovered}년 그물에 걸려 올라온 작살 끝',
		claims: ['doggerland-discovered', 'doggerland-depth', 'doggerland-end'],
		photo: null
	},
	{
		id: 'pavlopetri',
		label: '4장',
		title: '파블로페트리',
		place: 'pavlopetri',
		paragraphs: [
			body(
				'그리스 남쪽 바닷가, 수심 {depth} 아래에 돌들이 흩어져 있습니다. {discovered}년 이곳을 찾은 조사자들이 돌의 줄을 따라가자, 벽과 벽 사이가 길이 되고, 길이 모인 자리에 집과 무덤이 드러났습니다. 세계에서 가장 오래된 수중 도시 가운데 하나로 꼽히는 곳입니다.'
			),
			imagined('물빛이 흔들리는 사이, 골목에 사람 그림자가 잠깐 겹쳤다 사라집니다.'),
			body(
				'도시의 모양은 알았습니다. 하지만 이 도시가 왜, 언제 물에 잠겼는지는 아직 정확히 모릅니다.'
			)
		],
		gauge: ['파블로페트리', '언제 잠겼는지 모름', '수심 약 {depth}'],
		question: '도시의 모양을 알 수 있나',
		answer: '골목 · 집 · 무덤의 배치',
		claims: ['pavlopetri-discovered', 'pavlopetri-depth', 'pavlopetri-unknown-time'],
		photo: null
	},
	{
		id: 'baiae',
		label: '5장',
		title: '바이아이',
		place: 'baiae',
		paragraphs: [
			body(
				'이탈리아 나폴리 근처 바다, 수심 {depth}. 로마 시대 모자이크 바닥 위로 물고기가 지나갑니다. 로마 황제와 귀족들이 별장을 짓던 온천 휴양 도시였습니다.'
			),
			body(
				'건물이 무너져 바다로 쓸려 들어간 걸까요? 아닙니다. 땅 자체가 내려앉았습니다. 이 일대는 화산 지대라 땅이 숨 쉬듯 천천히 오르내리고, 4세기 무렵부터 바닷물이 들어오기 시작했습니다.'
			),
			body(
				'어떻게 잠겼는지는 알았습니다. 하지만 잠긴 까닭을 아는 것과, 그곳이 옛 기록 속 어느 도시인지 알아내는 것은 다른 문제입니다.'
			)
		],
		gauge: ['바이아이', '잠기기 시작한 지 {start_years}', '수심 약 {depth}'],
		question: '어떻게 잠겼나',
		answer: '땅이 천천히 내려앉음',
		claims: ['baiae-depth', 'baiae-gradual'],
		photo: null
	},
	{
		id: 'heracleion',
		label: '6장',
		title: '헤라클레이온',
		place: 'heracleion',
		paragraphs: [
			legend(
				'약 2,500년 전 그리스 역사가 헤로도토스는 이런 이야기를 남겼습니다. 헬레네를 데리고 달아나던 트로이 왕자 파리스가 거센 바람에 밀려 나일강 하구의 헤라클레스 신전에 닿았고, 그때 하구를 지키던 관리의 이름은 토니스였다고.'
			),
			body(
				'그 뒤 이 항구 도시는 바다에 잠겨 위치조차 잊혔습니다. {discovered}년, 이집트 앞바다 수심 약 {depth}에서 수중 조사단이 거대한 석상과 신전 터를 찾아냈습니다. 진흙 속에서 나온 석비에는 그 비를 세울 곳의 이름이 새겨져 있었습니다. 토니스-헤라클레이온.'
			),
			body(
				'파리스가 정말 이곳에 왔는지는 알 수 없습니다. 이 장의 발견은, 그의 기록 속 지명이 바닷속에 실제로 있었다는 것입니다. 남은 질문은 하나. 바다는 정확히 언제 도시를 삼켰을까요?'
			)
		],
		gauge: ['헤라클레이온', '바다에 잠긴 지 {end_years}', '수심 약 {depth}'],
		question: '기록 속 그곳인가',
		answer: '헤로도토스의 지명과 석비의 이름',
		claims: ['heracleion-discovered', 'heracleion-depth'],
		photo: null
	},
	{
		id: 'port-royal',
		label: '7장',
		title: '포트로열',
		place: 'port_royal',
		paragraphs: [
			body(
				'{end_year}년 6월 7일 한낮, 카리브해의 항구 도시 포트로열이 지진에 흔들렸습니다. 도시의 3분의 2가 그 자리에서 바다로 가라앉았습니다.'
			),
			body(
				'수백 년 뒤 바닷속 발굴에서 회중시계 하나가 올라왔습니다. 바늘은 11시 43분에 멈춰 있었습니다. 지진이 도시를 덮친 시각입니다.'
			),
			legend('살아남은 사람들은 이곳이 죄 많은 도시라 벌을 받은 것이라고 말했습니다.')
		],
		gauge: ['포트로열', '바다에 잠긴 지 {end_years}'],
		question: '언제였나',
		answer: '{end_year}년 6월 7일 11시 43분',
		claims: ['port-royal-1692'],
		photo: 'port-royal-1692'
	},
	{
		id: 'end',
		label: '8장',
		title: '끝',
		place: null,
		paragraphs: [
			body('다른 곳에는 돌담과 작살과 골목과 석비와 시계가 남아 있었습니다.'),
			body(
				'아틀란티스에 대해 우리가 가진 것은, 지금도 플라톤의 글 두 편뿐입니다. 많은 학자는 이 나라를 플라톤이 지어낸 이야기로 봅니다.'
			)
		],
		gauge: null,
		question: null,
		answer: null,
		claims: [],
		photo: null
	}
];

function yearsSlot(
	data: SunkenData,
	place: PlaceId,
	measure: 'submerge_start' | 'submerge_end',
	storyYear: number
): string | null {
	const point = yearPointOf(measureOf(data, place, measure));
	return point === null ? null : yearsAgoText(storyYear, point);
}

/** 장소 문구 자리 값. 데이터에 없으면 그 자리는 비워 둔다(대조가 그 문구 · 계기판 · 답을 숨긴다). */
export function placeSlots(
	data: SunkenData,
	place: PlaceId,
	storyYear: number
): Record<string, string> {
	const slots: Record<string, string> = {};
	const endYears = yearsSlot(data, place, 'submerge_end', storyYear);
	if (endYears !== null) slots.end_years = endYears;
	const startYears = yearsSlot(data, place, 'submerge_start', storyYear);
	if (startYears !== null) slots.start_years = startYears;
	// 다 잠긴 해가 한 해로 적힌 경우만(범위면 "○년 6월 7일" 같은 날짜 문구를 쓸 수 없다)
	const end = measureOf(data, place, 'submerge_end');
	if (end !== null && end.yearFrom !== null && end.yearTo === null) {
		slots.end_year = String(end.yearFrom);
	}
	const depth = measureOf(data, place, 'depth');
	const depthValue = depth === null ? null : depthText(depth);
	if (depthValue !== null) slots.depth = depthValue;
	const discovered = measureOf(data, place, 'discovered');
	if (discovered !== null && discovered.yearFrom !== null) {
		slots.discovered = String(discovered.yearFrom);
	}
	return slots;
}

export type ChapterSlots = Map<ChapterId, Record<string, string>>;

/** 장마다 자리 값(장소가 없는 장은 빈 값). */
export function chapterSlots(data: SunkenData, storyYear: number): ChapterSlots {
	return new Map(
		CHAPTERS.map((chapter) => [
			chapter.id,
			chapter.place === null ? {} : placeSlots(data, chapter.place, storyYear)
		])
	);
}

export function slotsOf(slots: ChapterSlots, chapterId: ChapterId): Record<string, string> {
	const found = slots.get(chapterId);
	return found === undefined ? {} : found;
}

// 장 문구가 기대는 사실의 출처(출처 절 "문구 출처"). 페이지에서 문장을 확인한 것만 둔다(2026-10-11).
// 원문 구절(티마이오스 · 크리티아스)은 데이터 조건 줄에서 따로 만든다. 장소 수치는 데이터 출처에 있다.
export const CHAPTER_COPY_SOURCES: CopySource[] = [
	{
		id: 'copy-britannica-atlantis',
		title: 'Britannica — 아틀란티스, 전설의 주요 원전은 플라톤의 두 대화편 (2026-10-11 기준)',
		url: 'https://www.britannica.com/topic/Atlantis-legendary-island'
	},
	{
		id: 'copy-natgeo-atlantis',
		title:
			'National Geographic — 플라톤의 글이 아틀란티스의 유일한 기록 · 많은 학자는 지어낸 이야기로 봄 (2026-10-11 기준)',
		url: 'https://www.nationalgeographic.com/history/article/atlantis'
	},
	{
		id: 'copy-wikipedia-lyonesse',
		title: 'Wikipedia — 리오네스: 흰 말을 탄 생존자 · 바다 밑 종소리 전승 (2026-10-11 기준)',
		url: 'https://en.wikipedia.org/wiki/Lyonesse'
	},
	{
		id: 'copy-crawford-lyonesse',
		title:
			'O. G. S. Crawford, "Lyonesse", Antiquity (1927) — 실리 제도 썰물 때 드러나는 밭 돌담 (2026-10-11 기준)',
		url: 'https://www.cambridge.org/core/services/aop-cambridge-core/content/view/37725F1992B3D4ADF36561E144227F11/S0003598X00000028a.pdf/lyonesse.pdf'
	},
	{
		id: 'copy-herodotus',
		title:
			'헤로도토스 역사 2.113(매콜리 번역) — 파리스 · 헬레네 · 하구 관리 토니스 (2026-10-11 기준)',
		url: 'https://lexundria.com/hdt/2.113/mcly'
	},
	{
		id: 'copy-port-royal-heath',
		title: '에마누엘 히스 목사의 편지(1692) — 포트로열 지진을 신의 심판으로 봄 (2026-10-11 기준)',
		url: 'https://jamaicaportroyal.com/eyewitness.html'
	},
	{
		id: 'copy-archaeology-colinda',
		title:
			'Archaeology — 1931년 9월 어선 콜린다 호 · 노퍽 해안 25마일 · 수심 120피트 · 뼈나 뿔로 깎은 8.5인치 작살 (2026-10-11 기준)',
		url: 'https://archaeology.org/issues/march-april-2022/letters-from/doggerland-mesolithic-submerged-landscape/'
	},
	{
		id: 'copy-unesco-pavlopetri',
		title: 'UNESCO — 파블로페트리, 세계에서 가장 오래된 수중 도시 (2026-10-11 기준)',
		url: 'https://www.unesco.org/en/articles/pavlopetri-named-2016-world-monuments-watch-site'
	},
	{
		id: 'copy-campi-flegrei-baia',
		title:
			'캄피 플레그레이 고고학 공원 — 바이아 수중 공원, 로마 제국 말기부터 땅 높이 변동(브라디시즘)의 영향 (2026-10-11 기준, 웹 아카이브로 확인)',
		url: 'https://pafleg.cultura.gov.it/it/4405/news/187/nuovo-percorso-di-visita-al-parco-sommerso'
	},
	{
		id: 'copy-goddio-stele',
		title:
			'Franck Goddio — 헤라클레이온 석비, 세울 곳의 이름 토니스-헤라클레이온이 새겨짐 (2026-10-11 기준)',
		url: 'https://www.franckgoddio.org/projects/sunken-civilizations/heracleion/interactive-map/thonis-heracleion/stele-of-thonis-heracleion/'
	},
	{
		id: 'copy-usgs-watch',
		title:
			'USGS 1692년 6월 7일 자메이카 지진(텍사스 A&M 해양고고학연구소 인용) — 바닷속 발굴에서 나온 회중시계, 11시 43분에 멈춘 바늘 (2026-10-11 기준, 웹 아카이브로 확인)',
		url: 'https://earthquake.usgs.gov/earthquakes/world/events/1692_06_07.php'
	}
];
