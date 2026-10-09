// 빛의 나이 장별 곁들임 카드: 1편과 같은 "알고 보면"(fact) · "전해지는 이야기"(legend) 구분, 카드마다 출처 1개.
// 데이터와 겹치는 숫자가 있는 카드는 claim 으로 적어 storyChecks 가 데이터와 대조한다(어긋나면 그 카드만 숨김).
import type { CopySource } from '../../story/storyConfig.ts';
import type { AsideKind, StepAside } from '../../story/storySteps.ts';

// 카드 출처를 확인한 날
export const ASIDE_SOURCE_AS_OF_DATE = '2026-10-09';

// 카드 문구가 데이터에 기대는 숫자
export const ASIDE_CLAIMS = [
	// "우리에게 오는 8분" = 태양 빛 이동 시간 표기
	'sun-eight-minutes',
	// "1054년의 '객성'" = 게성운 객성 사건 연도
	'crab-guest-star-1054'
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
		id: 'moon-receding',
		chapterId: 'moon',
		kind: 'fact',
		text: '달은 해마다 약 3.8cm씩 지구에서 멀어지고 있습니다.',
		sourceName: 'NASA NSSDC',
		sourceUrl: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html',
		claim: null
	},
	{
		id: 'moon-rabbit',
		chapterId: 'moon',
		kind: 'legend',
		text: '옛사람들은 달 속에서 토끼가 계수나무 아래 방아를 찧는다고 여겼습니다. 고구려 고분벽화에도 토끼가 든 달이 그려져 있습니다.',
		sourceName: '한국민족문화대백과사전 「달」',
		sourceUrl: 'https://encykorea.aks.ac.kr/Article/E0013699',
		claim: null
	},
	{
		id: 'sun-interior',
		chapterId: 'sun',
		kind: 'fact',
		text: '햇빛의 에너지는 태양 깊은 곳에서 바깥층 경계까지 빠져나오는 데만 약 100만 년이 걸립니다. 우리에게 오는 8분은 마지막 구간입니다.',
		sourceName: 'NASA 마셜 우주비행센터',
		sourceUrl: 'https://solarscience.msfc.nasa.gov/interior.shtml',
		claim: 'sun-eight-minutes'
	},
	{
		id: 'neptune-predicted',
		chapterId: 'planets',
		kind: 'fact',
		text: '해왕성은 망원경보다 계산이 먼저 찾았습니다. 예측한 위치를 따라 1846년 9월 23일에 발견됐습니다.',
		sourceName: 'NASA NSSDC',
		sourceUrl: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/neptunefact.html',
		claim: null
	},
	{
		id: 'golden-record',
		chapterId: 'voyager',
		kind: 'fact',
		text: '보이저 1호에는 55개 언어의 인사말과 자연의 소리, 여러 시대의 음악을 담은 금 레코드가 실려 있습니다.',
		sourceName: 'NASA',
		sourceUrl: 'https://science.nasa.gov/mission/voyager/voyager-golden-record-overview/',
		claim: null
	},
	{
		id: 'pale-blue-dot',
		chapterId: 'voyager',
		kind: 'fact',
		text: "1990년 2월 14일, 보이저 1호가 뒤돌아 찍은 지구는 화소 한 칸 크기의 빛점이었습니다. '창백한 푸른 점'이라 불리는 사진입니다.",
		sourceName: 'NASA',
		sourceUrl: 'https://science.nasa.gov/mission/voyager/voyager-1s-pale-blue-dot/',
		claim: null
	},
	{
		id: 'sirius-nile',
		chapterId: 'near-stars',
		kind: 'fact',
		text: '고대 이집트 사람들은 새벽에 시리우스가 처음 떠오르는 때가 나일강이 넘치기 시작하는 무렵이라는 것을 알고 있었습니다.',
		sourceName: '브리태니커 「Sirius」',
		sourceUrl: 'https://www.britannica.com/place/Sirius-star',
		claim: null
	},
	{
		id: 'vega-summer-triangle',
		chapterId: 'near-stars',
		kind: 'fact',
		text: '여름밤의 직녀성이 바로 베가입니다. 독수리자리의 견우성(알테어)과 함께 여름철 대삼각형을 이룹니다.',
		sourceName: '한국천문연구원',
		sourceUrl: 'https://www.kasi.re.kr/kor/publication/post/photoGallery/4351',
		claim: null
	},
	{
		id: 'gyeonu-jiknyeo',
		chapterId: 'near-stars',
		kind: 'legend',
		text: '은하수를 사이에 두고 떨어진 견우와 직녀는 칠월 칠석에만 까막까치가 놓은 오작교에서 만난다고 전합니다.',
		sourceName: '한국민족문화대백과사전 「견우직녀 설화」',
		sourceUrl: 'https://encykorea.aks.ac.kr/Article/E0002170',
		claim: null
	},
	{
		id: 'pleiades-members',
		chapterId: 'pleiades',
		kind: 'fact',
		text: '맨눈에는 예닐곱 개로 보이지만, 실제로는 1천 개가 넘는 별이 모인 무리입니다.',
		sourceName: 'NASA',
		sourceUrl:
			'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-45/',
		claim: null
	},
	{
		id: 'jomsaengi-bogi',
		chapterId: 'pleiades',
		kind: 'legend',
		text: '음력 2월 6일 저녁, 달과 플레이아데스 성단(좀생이별) 사이를 보고 한 해 농사를 점쳤습니다. 나란히 가면 풍년, 멀리 떨어지면 흉년이라 여겼습니다(좀생이보기).',
		sourceName: '한국민족문화대백과사전 「좀생이보기」',
		sourceUrl: 'https://encykorea.aks.ac.kr/Article/E0052883',
		claim: null
	},
	{
		id: 'orion-star-forming',
		chapterId: 'orion',
		kind: 'fact',
		text: '오리온 대성운은 지구에서 가장 가까운 큰 별 탄생 지역입니다. 지금도 새 별이 만들어지고 있습니다.',
		sourceName: 'NASA',
		sourceUrl:
			'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-42/',
		claim: null
	},
	{
		id: 'guest-star-daylight',
		chapterId: 'crab',
		kind: 'fact',
		text: "송나라 기록에 따르면 1054년의 '객성'(갑자기 나타난 별)은 23일 동안 낮에도 보였습니다.",
		sourceName: 'NASA',
		sourceUrl:
			'https://imagine.gsfc.nasa.gov/educators/programs/fermi/classroom/docs/supernova_poster_back.pdf',
		claim: 'crab-guest-star-1054'
	},
	{
		id: 'crab-pulsar',
		chapterId: 'crab',
		kind: 'fact',
		text: '게성운 한가운데에는 1초에 30번 도는 중성자별이 있어, 등대처럼 빛을 깜빡입니다.',
		sourceName: 'NASA',
		sourceUrl:
			'https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/messier-1/',
		claim: null
	},
	{
		id: 'galactic-center-nobel',
		chapterId: 'sgr-a',
		kind: 'fact',
		text: '은하 중심을 도는 별들의 궤도를 수십 년 동안 재어 보이지 않는 무거운 천체를 밝혀냈고, 이 연구는 2020년 노벨 물리학상을 받았습니다.',
		sourceName: 'ESO',
		sourceUrl: 'https://www.eso.org/public/news/eso2208-eht-mw/',
		claim: null
	},
	{
		id: 'sn-1987a',
		chapterId: 'lmc',
		kind: 'fact',
		text: '1987년 2월, 대마젤란은하에서 별이 폭발하는 초신성(SN 1987A)이 관측됐습니다.',
		sourceName: 'NASA',
		sourceUrl: 'https://science.nasa.gov/asset/hubble/supernova-1987a/',
		claim: null
	},
	{
		id: 'andromeda-collision',
		chapterId: 'andromeda',
		kind: 'fact',
		text: '안드로메다은하와 우리 은하는 약 40억 년 뒤 정면으로 만나고, 그 뒤 약 20억 년에 걸쳐 하나로 합쳐질 것으로 예측됩니다.',
		sourceName: 'NASA',
		sourceUrl:
			'https://science.nasa.gov/missions/hubble/nasas-hubble-shows-milky-way-is-destined-for-head-on-collision/',
		claim: null
	},
	{
		id: 'first-black-hole-image',
		chapterId: 'm87',
		kind: 'fact',
		text: '2019년 4월 10일, 사람이 처음 찍은 블랙홀 사진이 공개됐습니다. 그 블랙홀의 질량은 태양의 65억 배입니다.',
		sourceName: 'ESO',
		sourceUrl: 'https://www.eso.org/public/news/eso1907/',
		claim: null
	}
];

/** 카드 출처를 1편 문구 출처 모양으로: 이름 뒤에 확인한 날을 붙인다. id 는 카드 id 와 같다. */
export function asideCopySource(aside: ChapterAside): CopySource {
	return {
		id: aside.id,
		title: `${aside.sourceName} (${ASIDE_SOURCE_AS_OF_DATE} 기준)`,
		url: aside.sourceUrl
	};
}

/** 1편 곁들임 카드 부품(Aside)이 받는 모양. */
export function asStepAside(aside: ChapterAside): StepAside {
	return { kind: aside.kind, text: aside.text, sources: [aside.id], image: null };
}
