// 보이지 않는 짝 장 구성: 8장 32비트. 비트마다 글 자리(위 · 아래) · 스크롤 길이(vh) · 줄 문구, 장마다 시간 표지와 문구가 기대는 사실(claims).
// 문구 · 비트 길이는 시제품(sirius-flow.src.html, STEP 106~111) 그대로이고, 본문은 v3.1(사실 나열 → 한 줄기 이야기, D-43 보완 STEP 115·116)
// 숫자 · 날짜는 storyChecks 가 데이터 묶음과 대조해 어긋나면 그 장 글(또는 시간 표지 · 화면 표기)을 숨긴다.
import type { Claim as EventClaim } from '../../story/eventClaims.ts';
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

/** 문구가 기대는 사실 하나: 공용 종류(years-after · value · scaled-value) + 이 편 종류. 월 · 일이 null 이면 그 자리는 대조하지 않는다. */
export type Claim =
	| EventClaim<EventId>
	| { kind: 'present'; event: EventId }
	| { kind: 'date'; event: EventId; year: number; month: number | null; day: number | null }
	// 두 사건 사이 날 수(날짜 차, 둘 다 월 · 일이 있어야 셀 수 있다)
	| { kind: 'days-after'; from: EventId; to: EventId; min: number; max: number };

/** 글 자리: 1 · 8장은 화면 아래(언덕 장면이 위), 2~7장은 화면 위(그림이 아래). PC 는 둘 다 왼쪽 열 */
export type TextSlot = 'top' | 'bottom';

export type Beat = {
	// 장-비트(예: 4-3)
	id: string;
	slot: TextSlot;
	// 이 비트의 스크롤 길이(vh)
	heightVh: number;
	lines: string[];
	// 끝 줄의 끝 부분 중 글 상자에서는 화면 읽기용으로만 두고 배경이 빛을 지운 글자로 드러낼 말(7-5 "암흑 물질.", 동작 줄이기면 굵은 평문). 끝 줄이 이 말로 끝나야 한다
	emphasis?: string;
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

function beat(
	id: string,
	slot: TextSlot,
	heightVh: number,
	lines: string[],
	emphasis?: string
): Beat {
	return emphasis === undefined
		? { id, slot, heightVh, lines }
		: { id, slot, heightVh, lines, emphasis };
}

const BESSEL_SENTENCE = '빛나는 것만 무게를 가진 건 아니라고.';

export const CHAPTERS: Chapter[] = [
	{
		id: 'hill',
		label: '1장',
		timeMark: '지금',
		timeMarkClaims: [],
		beats: [
			beat('1-1', 'bottom', 120, [
				'여름밤, 언덕 위에 망원경 하나.',
				'하늘에는 빛나는 것들만 보인다.'
			]),
			beat('1-2', 'bottom', 180, [
				'그중 가장 밝은 별, 시리우스.',
				'너무 밝아서, 그 옆은 늘 비어 보인다.'
			]),
			beat('1-3', 'bottom', 200, [
				'별은 하늘을 아주 천천히, 곧게 걸어간다.',
				'그런데 이 별은 비틀거리며 걷는다.'
			])
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
				'그 비틀거림을 처음 알아챈 사람은 독일의 천문학자 베셀이었다.',
				'그는 90년 가까이 쌓인 기록으로 시리우스가 걸어온 길을 다시 그렸다.'
			]),
			beat('2-2', 'top', 240, [
				'곧아야 할 길이 물결치고 있었다.',
				'누군가 옆에서 잡아당기며 함께 걷는 것처럼.'
			]),
			beat('2-3', 'top', 200, [
				'하지만 시리우스 옆에는 아무것도 보이지 않았다.',
				'그는 빛나지 않는 짝이 있다고 썼다. ' + BESSEL_SENTENCE
			]),
			beat('2-4', 'top', 220, [
				'그는 천왕성에서도 같은 의심을 품었다. 천왕성 역시 계산한 길에서 조금씩 어긋나고 있었기 때문이다.',
				'하지만 1846년 봄, 베셀은 시리우스의 짝도, 천왕성 바깥의 무언가도 보지 못한 채 세상을 떠났다.'
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
				'천왕성의 어긋남은 그 무렵 천문학자들의 오랜 숙제였다.',
				'파리의 르베리에가 그 숙제를 풀어, 바깥 행성이 있을 자리를 계산해 냈다.'
			]),
			beat('3-2', 'top', 260, [
				'하지만 파리에서는 선뜻 찾아 나서는 사람이 없었다.',
				'그해 가을, 그는 베를린 천문대의 갈레에게 편지를 보냈다. 이 자리를 봐 달라고.'
			]),
			beat('3-3', 'top', 220, [
				'편지가 도착한 날 밤, 갈레는 망원경을 그 자리로 돌렸다.',
				'곁에 있던 학생 다레스트가 새 별 지도를 펼쳐, 하늘과 하나씩 맞춰 보았다.'
			]),
			beat('3-4', 'top', 240, [
				'지도에 없는 별 하나. 계산한 자리에서 1도도 벗어나지 않은 곳, 해왕성이었다.',
				'베셀이 남긴 두 짐작 중 하나가 맞았다. 남은 하나는 시리우스의 보이지 않는 짝이었다.'
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
				'그 짝은 시리우스의 눈부신 빛 바로 옆에 숨어 있었다.',
				'그 빛을 가르려면, 더 크고 더 깨끗한 렌즈가 필요했다.'
			]),
			beat('4-2', 'top', 220, [
				'1862년 1월 31일, 미국의 렌즈 장인 클라크는 새로 만든 커다란 렌즈를 시험하려고',
				'하늘에서 가장 밝은 별을 겨눴다.'
			]),
			beat('4-3', 'top', 460, [
				'눈부신 빛 바로 옆에, 작은 점 하나.',
				'베셀이 짐작한 지 18년 만이었다.'
			]),
			beat('4-4', 'top', 320, [
				'그런데 이 짝은 이상했다. 시리우스를 흔들 만큼 무거운데, 빛은 거의 없었다.',
				'무겁고 어두운 별. 그건 대체 어떤 별일까.'
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
				'어두운 별은 식어 가는 별이라, 붉을 거라 여겨졌다. 1915년, 애덤스가 그 빛을 갈라 보았다.',
				'붉지 않았다. 하얗게 뜨거웠다.'
			]),
			beat('5-2', 'top', 300, [
				'뜨거운데 어둡다면, 빛을 내는 겉면이 아주 작다는 뜻이다.',
				'태양만큼 무거운 것이, 지구만 한 크기에 눌려 있었다.'
			]),
			beat('5-3', 'top', 200, [
				'숫자로는 실감이 나지 않는 무게였다.',
				'영국의 천문학자 에딩턴은 이렇게 풀어 말했다. 그 별의 물질 1톤이 성냥갑 하나에 들어간다고.'
			]),
			beat('5-4', 'top', 240, [
				'흔들림을 따라가, 이런 별까지 찾아냈다.',
				'그렇다면 다른 별을 도는 행성도, 흔들림으로 찾을 수 있지 않을까.'
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
				'행성은 스스로 빛나지 않는다. 별 곁에 있으면, 별빛에 가려 보이지 않는다.',
				'하지만 행성도 별을 끌어당긴다. 시리우스가 짝에게 끌려 흔들렸듯, 별도 아주 조금 흔들린다.'
			]),
			beat('6-2', 'top', 340, [
				'1995년, 스위스의 마요르와 켈로는 그 작은 흔들림을 찾아 태양을 닮은 별 51 페가시를 지켜봤다.',
				'별은 4일마다 우리 쪽으로 다가왔다 멀어지기를 되풀이하고 있었다.'
			]),
			beat('6-3', 'top', 260, [
				'그때까지 큰 행성은 별에서 먼, 차가운 곳에서만 생긴다고 여겨졌다. 목성처럼.',
				'그런데 목성 절반만큼 무거운 이 행성은 별에 바짝 붙어, 4일 만에 한 바퀴를 돌고 있었다. 있을 수 없는 자리였다.'
			]),
			beat('6-4', 'top', 280, [
				'그 뒤로 다른 별을 도는 행성 수천 개가 하나씩 이름을 얻었다.',
				'그런데 그보다 앞서, 별 하나가 아니라 은하 하나에서 같은 수수께끼를 본 사람이 있었다.'
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
				'미국의 천문학자 베라 루빈은 동료 포드와 함께, 이웃 은하 안드로메다의 별들이 도는 속도를 쟀다.',
				'태양계에서 바깥 행성이 느리게 돌듯, 은하 바깥의 별도 느려야 했다.'
			]),
			beat('7-2', 'top', 360, [
				'빛나는 별들은 은하 가운데에 몰려 있으니까.',
				'그런데 빛이 엷어지는 바깥에서도, 별들은 여전히 빠르게 돌고 있었다.'
			]),
			beat('7-3', 'top', 240, [
				'보이는 별의 무게만으로는, 그 속도를 붙잡아 둘 수 없었다.',
				'은하 둘레 어딘가에, 보이지 않는 무게가 있어야 했다.'
			]),
			// 7-4 · 7-5(STEP 117): 암흑 물질의 규모(윤곽 확대 · 1:5 비교)와 이름. 비트 높이는 기존 7장 평균(285vh)에 가깝게
			beat('7-4', 'top', 280, [
				'그 무게는 빛나는 별을 다 합친 것보다 훨씬 컸다.',
				'우주 전체로 보면, 보이지 않는 물질이 보이는 물질보다 다섯 배쯤 많다.'
			]),
			beat(
				'7-5',
				'top',
				280,
				[
					'빛을 내지도, 비추지도 않는 것. 그 정체는 아직 아무도 모른다.',
					'사람들은 그것을 이렇게 부른다. 암흑 물질.'
				],
				'암흑 물질.'
			),
			beat('7-6', 'top', 260, [
				'126년 전, 시리우스를 보던 베셀이 쓴 말이 다시 떠오른다.',
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
			beat('8-1', 'bottom', 260, ['다시 언덕. 시리우스는 여전히 밤하늘에서 가장 밝다.']),
			beat('8-2', 'bottom', 240, [
				'그 옆의 작은 짝은 지금도 맨눈에 보이지 않는다.',
				'은하를 붙잡은 것도, 여전히 보이지 않는다.'
			]),
			beat('8-3', 'bottom', 180, [
				'우리가 보는 하늘은 빛나는 것들의 하늘이다.',
				'하지만 그 하늘을 붙잡고 있는 건, 보이지 않는 것들인지도 모른다.'
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

const CHECKED_ON = '2026-10-13 확인';

/** 문구 출처(출처 절): 데이터 묶음과 대조하지 않는 문장의 근거 */
export const CHAPTER_COPY_SOURCES: CopySource[] = [
	{
		id: 'bertone-hooper-2016',
		title: `Bertone & Hooper 2016, A History of Dark Matter(원문 'But light is no real property of mass.'를 인용 부호 없이 풀어 씀(mass → 무게)) · ${CHECKED_ON}`,
		url: 'https://arxiv.org/abs/1605.04909'
	},
	{
		id: 'not-on-the-map',
		title: `"That Star Is Not on the Map": The German Side of the discovery(천왕성 궤도 문제는 오랜 과제였고 아라고의 권유로 르베리에가 맡음 · 파리에서 바로 찾지 않아 베를린의 갈레에게 편지를 보냄 · 학생 다레스트가 새 베를린 별 지도로 하늘과 대조) · ${CHECKED_ON}`,
		url: 'https://arxiv.org/abs/2108.06305'
	},
	{
		id: 'linda-hall-clark',
		title: `Linda Hall Library: Alvan Graham Clark(당시 가장 큰 굴절 렌즈 시험 중 발견, 밝은 빛 옆이라 관측이 어려웠음) · ${CHECKED_ON}`,
		url: 'https://www.lindahall.org/about/news/scientist-of-the-day/alvan-graham-clark/'
	},
	{
		id: 'sirius-dim-companion-expectation',
		title: `어두운 별 = 식은 붉은 별이라는 당시 예상 · ${CHECKED_ON}`,
		url: 'https://en.wikipedia.org/wiki/Sirius'
	},
	{
		id: 'stars-and-atoms',
		title: `Eddington, Stars and Atoms(1927)(물질 1톤이 성냥갑에 들어가는 밀도) · ${CHECKED_ON}`,
		url: 'https://www.gutenberg.org/ebooks/73362'
	},
	{
		id: '51-pegasi-b',
		title: `51 Pegasi b(최소 질량 약 0.46 목성 질량 — "목성 절반만큼 무거운") · ${CHECKED_ON}`,
		url: 'https://en.wikipedia.org/wiki/51_Pegasi_b'
	},
	{
		id: 'planet-formation-theory-1995',
		title: `당시 큰 행성은 별에서 먼 차가운 곳에서만 생긴다고 여겨짐 · ${CHECKED_ON}`,
		url: 'https://arxiv.org/abs/1210.2471'
	},
	{
		id: 'bertone-hooper-dark-matter',
		title: `Bertone & Hooper 2016, A History of Dark Matter(암흑 물질 명칭과 정체 미확인) · ${CHECKED_ON}`,
		url: 'https://arxiv.org/abs/1605.04909'
	},
	{
		id: 'planck-2018',
		title: `Planck 2018 결과(암흑 물질 약 27%, 보통 물질 약 5% — "보이지 않는 물질이 보이는 물질보다 다섯 배쯤") · ${CHECKED_ON}`,
		url: 'https://arxiv.org/abs/1807.06209'
	}
];

/** 화면 순서대로 모든 비트(장 순서 · 장 안 순서) */
export const BEATS: { chapterIndex: number; beat: Beat }[] = CHAPTERS.flatMap(
	(chapter, chapterIndex) => chapter.beats.map((each) => ({ chapterIndex, beat: each }))
);
