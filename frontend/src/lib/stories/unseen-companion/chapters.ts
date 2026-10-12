// 보이지 않는 짝 장 구성: 8장 30비트. 비트마다 글 자리(위 · 아래) · 스크롤 길이(vh) · 줄 문구, 장마다 시간 표지와 문구가 기대는 사실(claims).
// 문구 · 비트 길이는 시제품(sirius-flow.src.html, STEP 106~111) 그대로이고, 본문은 2곳(2-1 · 6-3)만 고쳤다(D-43).
// 숫자 · 날짜는 storyChecks 가 데이터 묶음과 대조해 어긋나면 그 장 글(또는 시간 표지 · 화면 표기)을 숨긴다.
import type { CopySource } from '../../story/storyConfig.ts';
import type { EventId } from './unseenData.ts';

export const CHAPTER_IDS = [
	'hill',
	'bessel',
	'neptune',
	'clark',
	'white-dwarf',
	'pegasi',
	'rubin',
	'return'
] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

/** 문구가 기대는 사실 하나. 월 · 일이 null 이면 그 자리는 대조하지 않는다. */
export type Claim =
	| { kind: 'present'; event: EventId }
	| { kind: 'date'; event: EventId; year: number; month: number | null; day: number | null }
	// 두 사건 사이 햇수(연도 차)
	| { kind: 'years-after'; from: EventId; to: EventId; min: number; max: number }
	// 두 사건 사이 날 수(날짜 차, 둘 다 월 · 일이 있어야 셀 수 있다)
	| { kind: 'days-after'; from: EventId; to: EventId; min: number; max: number }
	// 수량 칸 값이 범위 안
	| { kind: 'value'; event: EventId; min: number; max: number }
	// 수량 칸을 divisor 로 나눈 값이 범위 안(×100 · ×1000 으로 정수 저장한 값)
	| { kind: 'scaled-value'; event: EventId; divisor: number; min: number; max: number };

/** 글 자리: 1 · 8장은 화면 아래(언덕 장면이 위), 2~7장은 화면 위(그림이 아래). PC 는 둘 다 왼쪽 열 */
export type TextSlot = 'top' | 'bottom';

export type Beat = {
	// 장-비트(예: 4-3)
	id: string;
	slot: TextSlot;
	// 이 비트의 스크롤 길이(vh)
	heightVh: number;
	lines: string[];
};

export type Chapter = {
	id: ChapterId;
	// 읽기 보조기기용 구역 이름
	label: string;
	// 장 첫 비트 글 위에 붙는 시간 표지
	timeMark: string;
	timeMarkClaims: Claim[];
	beats: Beat[];
	claims: Claim[];
};

export const UNSEEN_SUBTITLE = '흔들림으로 찾은, 보이지 않는 것들';

function date(event: EventId, year: number, month: number | null, day: number | null): Claim {
	return { kind: 'date', event, year, month, day };
}

function beat(id: string, slot: TextSlot, heightVh: number, lines: string[]): Beat {
	return { id, slot, heightVh, lines };
}

const BESSEL_SENTENCE = '"빛은 질량의 진짜 성질이 아니다."';

export const CHAPTERS: Chapter[] = [
	{
		id: 'hill',
		label: '1장',
		timeMark: '지금',
		timeMarkClaims: [],
		beats: [
			beat('1-1', 'bottom', 120, ['여름밤, 언덕 위에 망원경 하나.']),
			beat('1-2', 'bottom', 180, [
				'밤하늘에서 가장 밝은 별, 시리우스.',
				'너무 밝아서, 그 옆은 늘 비어 보인다.'
			]),
			beat('1-3', 'bottom', 200, ['그런데 이 별은, 똑바로 걷지 않는다.'])
		],
		claims: [{ kind: 'present', event: 'sirius_brightest' }]
	},
	{
		id: 'bessel',
		label: '2장',
		timeMark: '1844',
		timeMarkClaims: [date('bessel_letter', 1844, null, null)],
		beats: [
			beat('2-1', 'top', 340, [
				'독일 쾨니히스베르크의 천문학자 프리드리히 베셀은',
				'90년 가까이 쌓인 기록에서 시리우스의 길을 다시 그렸다.'
			]),
			beat('2-2', 'top', 240, ['곧아야 할 길이 물결치고 있었다.']),
			beat('2-3', 'top', 200, ['그는 보이지 않는 짝이 이 별을 끌고 있다고 썼다.', BESSEL_SENTENCE]),
			beat('2-4', 'top', 220, [
				'그는 천왕성 너머에도 보이지 않는 무언가가 있다고 믿었다.',
				'그리고 1846년 봄, 둘 중 어느 것도 보지 못한 채 세상을 떠났다.'
			])
		],
		claims: [
			// "90년 가까이": 가장 이른 기록(브래들리 1755)에서 편지(1844)까지
			{ kind: 'years-after', from: 'bradley_epoch', to: 'bessel_letter', min: 85, max: 90 },
			date('bessel_died', 1846, null, null),
			{ kind: 'present', event: 'bessel_uranus_lecture' }
		]
	},
	{
		id: 'neptune',
		label: '3장',
		timeMark: '1846',
		timeMarkClaims: [date('leverrier_letter', 1846, null, null)],
		beats: [
			beat('3-1', 'top', 300, [
				'그해 가을, 파리의 르베리에가 베를린으로 편지를 보냈다.',
				'천왕성을 비틀고 있는 무언가가 하늘의 이 자리에 있을 거라고.'
			]),
			beat('3-2', 'top', 260, [
				'편지가 도착한 날 밤, 갈레는 망원경을 그 자리로 돌렸다.',
				'옆에서 성도를 펼친 다레스트가 말했다. 그 별은 지도에 없다고.'
			]),
			beat('3-3', 'top', 220, ['계산이 가리킨 자리에서 1도도 벗어나지 않은 곳. 해왕성이었다.']),
			beat('3-4', 'top', 240, [
				'펜 끝으로 행성까지 찾았다.',
				'그렇다면 시리우스의 짝은, 왜 아직 보이지 않을까.'
			])
		],
		claims: [
			// "그해 가을": 베셀이 세상을 떠난 해(1846)와 편지를 보낸 해가 같다
			{ kind: 'years-after', from: 'bessel_died', to: 'leverrier_letter', min: 0, max: 0 },
			// "편지가 도착한 날 밤"
			{ kind: 'days-after', from: 'berlin_received', to: 'neptune_found', min: 0, max: 0 },
			// "1도도 벗어나지 않은"
			{ kind: 'value', event: 'neptune_offset', min: 0, max: 1 }
		]
	},
	{
		id: 'clark',
		label: '4장',
		timeMark: '1862',
		timeMarkClaims: [date('clark_sighting', 1862, null, null)],
		beats: [
			beat('4-1', 'top', 200, [
				'미국 매사추세츠의 렌즈 장인 앨번 그레이엄 클라크.',
				'미시시피의 대학이 주문한 렌즈는, 남북전쟁 때문에 주인을 잃고 공방에 남아 있었다.'
			]),
			beat('4-2', 'top', 220, [
				'1862년 1월 31일 밤, 그는 그 렌즈를 시험하려고',
				'하늘에서 가장 밝은 별을 겨눴다.'
			]),
			beat('4-3', 'top', 460, ['눈부신 빛 바로 옆에, 작은 점 하나.']),
			beat('4-4', 'top', 320, [
				'베셀이 보이지 않는 짝을 쓴 지 18년.',
				'그런데 그 짝은 이상했다. 너무 어두운데, 너무 무거웠다.'
			])
		],
		claims: [
			date('clark_sighting', 1862, 1, 31),
			{ kind: 'years-after', from: 'bessel_letter', to: 'clark_sighting', min: 18, max: 18 }
		]
	},
	{
		id: 'white-dwarf',
		label: '5장',
		timeMark: '1915',
		timeMarkClaims: [date('adams_spectrum', 1915, null, null)],
		beats: [
			beat('5-1', 'top', 300, [
				'윌슨산 천문대의 애덤스가 그 작은 별의 빛을 갈라 보았다.',
				'어두운 별은 붉어야 했는데, 하얗게 뜨거웠다.'
			]),
			beat('5-2', 'top', 300, [
				'뜨거운데 어둡다면, 아주 작다는 뜻이다.',
				'태양만큼 무거운 것이, 지구만 한 크기에 눌려 있었다.'
			]),
			beat('5-3', 'top', 200, [
				'영국의 에딩턴은 그 밀도를 이렇게 말했다.',
				'1톤이 성냥갑 하나에 들어간다고.'
			]),
			beat('5-4', 'top', 240, [
				'흔들림만으로 보이지 않는 별을 찾아냈다.',
				'그렇다면 다른 해를 도는 행성도, 흔들림으로 찾을 수 있을까.'
			])
		],
		claims: [
			// "태양만큼 무거운": 질량(×1000 태양 질량)
			{ kind: 'scaled-value', event: 'siriusb_mass', divisor: 1000, min: 0.9, max: 1.1 },
			// "지구만 한 크기": 반지름(km, 지구 6,371km)
			{ kind: 'value', event: 'siriusb_radius', min: 5000, max: 7000 },
			{ kind: 'present', event: 'eddington_book' }
		]
	},
	{
		id: 'pegasi',
		label: '6장',
		timeMark: '1995',
		timeMarkClaims: [date('peg_announced', 1995, null, null)],
		beats: [
			beat('6-1', 'top', 240, [
				'스위스 제네바의 마요르와 켈로는',
				'태양을 닮은 별 하나의 빛을 매일 밤 쟀다.'
			]),
			beat('6-2', 'top', 340, ['별이 4일마다, 아주 조금씩 다가왔다 멀어지고 있었다.']),
			beat('6-3', 'top', 260, [
				'목성 절반만큼 무거운 행성이, 해에 바짝 붙어 4일 만에 한 바퀴를 돌고 있었다.',
				'있을 수 없는 자리였다. 처음엔 많은 사람이 믿지 않았다.'
			]),
			beat('6-4', 'top', 280, [
				'태양 밖의 해를 도는 행성 수천 개가, 이날부터 하나씩 이름을 얻었다.',
				'그런데 흔들리는 것이 별 하나가 아니라, 은하 전체라면?'
			])
		],
		claims: [
			// "4일마다 · 4일 만에": 공전 주기(×100 일)
			{ kind: 'scaled-value', event: 'peg_period', divisor: 100, min: 3.5, max: 4.5 },
			// "수천 개"
			{ kind: 'value', event: 'exoplanet_count', min: 1000, max: 9999 }
		]
	},
	{
		id: 'rubin',
		label: '7장',
		timeMark: '1970',
		timeMarkClaims: [date('rubin_andromeda', 1970, null, null)],
		beats: [
			beat('7-1', 'top', 280, [
				'미국의 베라 루빈은 동료 켄트 포드와',
				'이웃 은하 안드로메다의 별들이 도는 속도를 쟀다.'
			]),
			beat('7-2', 'top', 360, [
				'바깥의 별은 느리게 돌아야 했다. 빛이 거기서 엷어지니까.',
				'그런데 바깥의 별들도, 여전히 빠르게 돌고 있었다.'
			]),
			beat('7-3', 'top', 240, [
				'보이는 별만으로는 이 은하를 붙잡을 수 없었다.',
				'보이지 않는 무언가가, 보이는 것보다 훨씬 많이 있어야 했다.'
			]),
			beat('7-4', 'top', 260, [
				'126년 전, 베셀이 시리우스를 보며 쓴 문장이 돌아온다.',
				BESSEL_SENTENCE
			])
		],
		claims: [
			{ kind: 'years-after', from: 'bessel_letter', to: 'rubin_andromeda', min: 126, max: 126 }
		]
	},
	{
		id: 'return',
		label: '8장',
		timeMark: '다시, 지금',
		timeMarkClaims: [],
		beats: [
			beat('8-1', 'bottom', 260, ['시리우스는 여전히 밤하늘에서 가장 밝다.']),
			beat('8-2', 'bottom', 240, [
				'그 옆의 작은 별은 맨눈에 보이지 않고,',
				'은하를 붙잡은 것도 끝내 보이지 않는다.'
			]),
			beat('8-3', 'bottom', 180, [
				'우리가 보는 하늘은, 빛나는 것들의 하늘이다.',
				'하늘을 붙잡고 있는 건, 보이지 않는 것들이었는지도 모른다.'
			])
		],
		claims: []
	}
];

/** 장 밖 화면 표기(그림)가 기대는 사실. 어긋나면 그 표기만 숨긴다(storyChecks 대상 이름과 같다). */
export const VELOCITY_BAND_TARGET = 'pegasi/velocity-band';
export const ORBIT_TARGET = 'clark/orbit';

export const SCREEN_MARKS: { target: string; claims: Claim[] }[] = [
	// 6장 속도 띠: 51 페가시가 초속 약 56m 로 다가왔다 멀어진다
	{
		target: VELOCITY_BAND_TARGET,
		claims: [{ kind: 'value', event: 'peg_wobble', min: 50, max: 60 }]
	},
	// 4장 두 별의 50년 궤도(×100 년)
	{
		target: ORBIT_TARGET,
		claims: [
			{ kind: 'scaled-value', event: 'sirius_orbit_period', divisor: 100, min: 49.5, max: 50.5 }
		]
	}
];

const CHECKED_ON = '2026-10-12 확인';

/** 문구 출처(출처 절): 데이터 묶음과 대조하지 않는 문장의 근거 */
export const CHAPTER_COPY_SOURCES: CopySource[] = [
	{
		id: 'bertone-hooper-2016',
		title: `Bertone & Hooper 2016, A History of Dark Matter(베셀 문장 "빛은 질량의 진짜 성질이 아니다") · ${CHECKED_ON}`,
		url: 'https://arxiv.org/abs/1605.04909'
	},
	{
		id: 'not-on-the-map',
		title: `"That Star Is Not on the Map": The German Side of the discovery(갈레 · 다레스트, 지도에 없는 별) · ${CHECKED_ON}`,
		url: 'https://arxiv.org/abs/2108.06305'
	},
	{
		id: 'linda-hall-clark',
		title: `Linda Hall Library: Alvan Graham Clark(미시시피 대학 렌즈 · 남북전쟁) · ${CHECKED_ON}`,
		url: 'https://www.lindahall.org/about/news/scientist-of-the-day/alvan-graham-clark/'
	},
	{
		id: 'stars-and-atoms',
		title: `Eddington, Stars and Atoms(1927)(1톤이 성냥갑에 들어가는 밀도) · ${CHECKED_ON}`,
		url: 'https://www.gutenberg.org/ebooks/73362'
	},
	{
		id: '51-pegasi-b',
		title: `51 Pegasi b(최소 질량 약 0.46 목성 질량 — "목성 절반만큼 무거운") · ${CHECKED_ON}`,
		url: 'https://en.wikipedia.org/wiki/51_Pegasi_b'
	}
];

/** 화면 순서대로 모든 비트(장 순서 · 장 안 순서) */
export const BEATS: { chapterIndex: number; beat: Beat }[] = CHAPTERS.flatMap(
	(chapter, chapterIndex) => chapter.beats.map((each) => ({ chapterIndex, beat: each }))
);
