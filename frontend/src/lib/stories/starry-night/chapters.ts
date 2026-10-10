// 그가 실패작이라 부른 밤 장 구성(D-42): 장마다 시간 표지 한 줄 · 카드 문단 · 문구가 기대는 사실(claims).
// 문구는 원문 그대로 두고(자리 채움 없음), 숫자 · 날짜는 storyChecks 가 데이터 묶음과 대조해 어긋나면 그 장 문단 · 시간 표지를 숨긴다.
// 5장 · 끝 장은 카드가 둘이다(카드마다 앞에 장면 구간이 하나씩 있다).
import type { CopySource } from '../../story/storyConfig.ts';
import type { EventId } from './starryData.ts';

export const CHAPTER_IDS = [
	'museum',
	'asylum',
	'village',
	'morning-star',
	'wind',
	'bars',
	'end'
] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

/** 문구가 기대는 사실 하나. 월 · 일이 null 이면 그 자리는 대조하지 않는다. */
export type Claim =
	| { kind: 'date'; event: EventId; year: number; month: number | null; day: number | null }
	// 태어난 날(born)부터 그 사건까지 만 나이
	| { kind: 'age'; event: EventId; years: number }
	// 두 사건 사이 개월 수(둘 다 일이 있으면 날짜로, 아니면 연월로 센다)
	| { kind: 'months-after'; from: EventId; to: EventId; min: number; max: number }
	// 두 사건 사이 햇수(연도 차)
	| { kind: 'years-after'; from: EventId; to: EventId; min: number; max: number }
	| { kind: 'present'; event: EventId };

export type Chapter = {
	id: ChapterId;
	// 읽기 보조기기용 구역 이름
	label: string;
	timeMark: string;
	timeMarkClaims: Claim[];
	// 카드마다 문단 목록
	cards: string[][];
	claims: Claim[];
};

export const STARRY_SUBTITLE = '누구나 아는 밤하늘. 그린 사람은 그 그림을 실패라고 불렀습니다.';

function date(event: EventId, year: number, month: number | null, day: number | null): Claim {
	return { kind: 'date', event, year, month, day };
}

export const CHAPTERS: Chapter[] = [
	{
		id: 'museum',
		label: '1장',
		timeMark: '지금 · 뉴욕',
		timeMarkClaims: [{ kind: 'present', event: 'moma_acquired' }],
		cards: [
			[
				'뉴욕 현대미술관의 한 벽에는, 아마 한 번쯤은 보셨을 밤하늘이 걸려 있습니다.',
				'소용돌이치는 하늘과 불꽃처럼 솟은 나무, 그 아래 잠든 작은 마을. 1889년 6월, 서른여섯 살의 빈센트 반 고흐가 그린 그림입니다.',
				'이 그림을 그릴 때, 그는 정신병원에 있었습니다.'
			]
		],
		claims: [
			date('painted', 1889, 6, null),
			{ kind: 'age', event: 'painted', years: 36 },
			{ kind: 'present', event: 'moma_acquired' }
		]
	},
	{
		id: 'asylum',
		label: '2장',
		timeMark: '1888년 12월 → 1889년 5월',
		timeMarkClaims: [date('ear', 1888, 12, null), date('admitted', 1889, 5, null)],
		cards: [
			[
				'그곳에 들어가기 반년 전, 고흐는 남프랑스의 아를에 있었습니다. 두 달 전부터 화가 고갱과 한집에서 지내고 있었지만, 두 사람의 사이는 날카롭게 틀어져 있었습니다.',
				'1888년 12월 23일 밤, 그는 급성 정신 발작을 일으켜 자신의 왼쪽 귀를 잘라 냈습니다. 왜 그랬느냐는 의사의 물음에, 그는 "순전히 개인적인 일"이라고만 답했습니다.',
				'그 뒤로도 발작은 다시 찾아왔습니다. 겨울 내내 병원을 드나들던 그는, 이듬해 5월 스스로 생레미의 정신병원에 들어가기로 합니다.',
				'그곳에서 그에게 허락된 바깥은, 쇠창살이 달린 창 하나였습니다.'
			]
		],
		claims: [
			// "반년 전": 귀 사건(1888년 12월)에서 병원에 들어간 때(1889년 5월)까지
			{ kind: 'months-after', from: 'ear', to: 'admitted', min: 4, max: 6 },
			date('ear', 1888, 12, 23),
			{ kind: 'present', event: 'arles_hospital' },
			date('admitted', 1889, 5, null),
			{ kind: 'years-after', from: 'ear', to: 'admitted', min: 1, max: 1 }
		]
	},
	{
		id: 'village',
		label: '3장',
		timeMark: '1889년 6월',
		timeMarkClaims: [date('painted', 1889, 6, null)],
		cards: [
			[
				'창 너머로는 담장에 둘러싸인 밀밭과 먼 언덕이 보였습니다.',
				'그런데 그림 속 이 마을은, 그 창에서 보이지 않는 마을입니다. 그는 이 밤하늘을 밤이 아니라 낮에, 1층 작업실에서 그렸습니다. 보이지 않는 마을에는 기억과 상상으로 하나씩 불을 밝혀 넣었습니다.',
				'그렇다면 그가 창으로 실제로 본 것은 무엇이었을까요.'
			]
		],
		claims: []
	},
	{
		id: 'morning-star',
		label: '4장',
		timeMark: '1889년 6월 · 새벽',
		timeMarkClaims: [date('morning_star_letter', 1889, 6, null)],
		cards: [
			[
				'해 뜨기 전의 하늘이었습니다. 그 무렵 그는 동생 테오에게 이렇게 썼습니다.',
				'"오늘 아침, 해 뜨기 한참 전에 창으로 들판을 내다봤어. 샛별 하나만 떠 있었는데, 아주 크게 보이더라."',
				'그 별은 금성이었습니다. 그는 그 새벽의 별을, 이 밤하늘 한가운데 크게 옮겨 놓았습니다.',
				'그리고 별 주위의 하늘이, 움직이기 시작합니다.'
			]
		],
		claims: [{ kind: 'present', event: 'morning_star_letter' }]
	},
	{
		id: 'wind',
		label: '5장',
		timeMark: '1889년 6월',
		timeMarkClaims: [date('painted', 1889, 6, null)],
		cards: [
			[
				'그는 하늘에 바람을 그렸습니다. 별과 달을 휘감으며, 하늘 전체가 굽이쳐 흐르는 바람을. 보이는 대로가 아니라, 느끼는 대로.'
			],
			[
				'그로부터 135년이 지난 2024년, 물리학자들이 이 하늘을 분석했습니다. 소용돌이들의 크기와 간격, 밝기가 실제 난류를 지배하는 법칙과 닮아 있었습니다.',
				'그 법칙을 콜모고로프가 세운 것은 1941년, 그림보다 반세기 뒤의 일입니다. 그가 느낀 바람은, 어쩌면 진짜 바람이었습니다.',
				'하지만 그 시절, 이 그림을 알아본 사람은 거의 없었습니다. 그림을 가장 먼저 본 사람조차 그랬습니다.'
			]
		],
		claims: [
			{ kind: 'years-after', from: 'painted', to: 'turbulence_study', min: 135, max: 135 },
			date('turbulence_study', 2024, null, null),
			date('kolmogorov', 1941, null, null),
			{ kind: 'years-after', from: 'painted', to: 'kolmogorov', min: 50, max: 59 }
		]
	},
	{
		id: 'bars',
		label: '6장',
		timeMark: '1889년 10월',
		timeMarkClaims: [date('theo_reply', 1889, 10, null)],
		cards: [
			[
				'그해 가을, 형이 보내온 새 그림들을 본 테오가 답장을 썼습니다. 누구보다 형의 그림을 믿어 온 동생이었지만, 이번에는 조심스럽게 걱정을 꺼냈습니다.',
				'"달빛 아래 마을이나 산을 그린 새 그림들에서, 형이 무엇을 붙잡으려 하는지는 분명히 느껴져. 그런데 양식을 찾다 보면, 사물의 진짜 감정이 사라지는 것 같아."',
				"테오가 말한 '달빛 아래 마을'이 바로 이 그림입니다. 그 편지는 쇠창살 달린 방에 있던 그에게 닿았습니다."
			]
		],
		claims: [{ kind: 'present', event: 'theo_reply' }]
	},
	{
		id: 'end',
		label: '끝',
		timeMark: '1889년 11월 → 1890년 7월 → 지금',
		timeMarkClaims: [date('bernard_letter', 1889, 11, null), date('died', 1890, 7, null)],
		cards: [
			[
				'그는 테오에게 이 그림을 두둔하기도 했습니다. 하지만 마음 한편의 생각은 달랐던 모양입니다. 다섯 달 뒤인 11월, 그는 친구 에밀 베르나르에게 이렇게 털어놓습니다.',
				'"그런데 또 별을 너무 크게 그려 버리고 말았어. 또 실패야. 이젠 정말 지긋지긋해."',
				'그래도 그는 붓을 놓지 않았습니다. 이듬해 5월 정신병원을 나와 파리 근처의 작은 마을 오베르쉬르우아즈로 옮긴 그는, 그곳에서 보낸 70일 동안 74점의 그림을 그렸습니다.',
				'그 여름이 그의 마지막이었습니다. 1890년 7월 29일, 서른일곱 살의 고흐는 세상을 떠났습니다. 평생 형을 뒷바라지한 테오도, 여섯 달 뒤 형의 뒤를 따랐습니다.'
			],
			[
				'살아 있는 동안, 그의 그림은 거의 팔리지 않았습니다.',
				'지금 암스테르담에는 그의 이름을 단 미술관이 있고, 뉴욕의 이 그림 앞에서는 오늘도 사람들이 발걸음을 멈춥니다. 한 사람이 실패라고 불렀던 밤이, 세상에서 가장 널리 알려진 밤하늘 가운데 하나가 된 것입니다.',
				'처음 이 그림 앞에 섰을 때 우리가 본, 그 커다란 별.',
				'그것은 그가 너무 크게 그렸다며 지긋지긋해하던, 바로 그 별입니다.'
			]
		],
		claims: [
			{ kind: 'months-after', from: 'painted', to: 'bernard_letter', min: 5, max: 5 },
			date('died', 1890, 7, 29),
			{ kind: 'age', event: 'died', years: 37 },
			{ kind: 'months-after', from: 'died', to: 'theo_died', min: 5.5, max: 6.5 },
			// "이듬해": 베르나르에게 쓴 편지(1889년)에서 죽음(1890년)까지(오베르로 옮긴 해와 같다)
			{ kind: 'years-after', from: 'bernard_letter', to: 'died', min: 1, max: 1 }
		]
	}
];

/** 끝맺음 작품 라벨(미술관 설명판, 1장 '미술관의 한 벽'과 짝). 크기 · 소장은 문구 출처 moma-79802. */
export const ARTWORK_LABEL = {
	title: '빈센트 반 고흐, 〈별이 빛나는 밤〉',
	details: '1889년 6월, 생레미드프로방스 · 캔버스에 유채 · 73.7 × 92.1 cm',
	// details 의 그린 때(1889년 6월)는 데이터와 대조한다(어긋나면 그 줄만 숨김)
	detailsClaims: [date('painted', 1889, 6, null)],
	collection: '뉴욕 현대미술관 소장'
};

const CHECKED_ON = '2026-10-11 확인';

/** 문구 출처(출처 절). 편지는 vangoghletters(반 고흐 미술관 · 하위헌스 연구소) 판. */
export const CHAPTER_COPY_SOURCES: CopySource[] = [
	{
		id: 'letter-728-notes',
		title: `편지 728 주석(1888년 12월 23일 발작 · 귀 · 고갱 · 의사에게 한 답) · ${CHECKED_ON}`,
		url: 'https://vangoghletters.org/vg/letters/let728/notes.html'
	},
	{
		id: 'letter-750-notes',
		title: `편지 750 주석(아를 병원 재입원) · ${CHECKED_ON}`,
		url: 'https://vangoghletters.org/vg/letters/let750/notes.html'
	},
	{
		id: 'letter-776',
		title: `편지 776(테오에게, 쇠창살 창 너머 담장에 둘러싸인 밀밭) · ${CHECKED_ON}`,
		url: 'https://vangoghletters.org/vg/letters/let776/letter.html'
	},
	{
		id: 'letter-777',
		title: `편지 777(테오에게, 해 뜨기 전 샛별) · ${CHECKED_ON}`,
		url: 'https://vangoghletters.org/vg/letters/let777/letter.html'
	},
	{
		id: 'letter-782',
		title: `편지 782(테오에게, 새 별밤 습작) · ${CHECKED_ON}`,
		url: 'https://vangoghletters.org/vg/letters/let782/letter.html'
	},
	{
		id: 'letter-813',
		title: `편지 813(테오의 답장, 달빛 아래 마을 · 양식과 진짜 감정 — 주석: 이 그림) · ${CHECKED_ON}`,
		url: 'https://vangoghletters.org/vg/letters/let813/letter.html'
	},
	{
		id: 'letter-822',
		title: `편지 822(에밀 베르나르에게)(이 그림을 두둔했다는 주석 15 포함): "Cependant encore une fois je me laisse aller à faire des étoiles trop grande &c., nouvel echec et j'en ai assez." · ${CHECKED_ON}`,
		url: 'https://vangoghletters.org/vg/letters/let822/print.html'
	},
	{
		id: 'moma-79802',
		title: `MoMA 작품 페이지: The Starry Night · ${CHECKED_ON}`,
		url: 'https://www.moma.org/collection/works/79802'
	},
	{
		id: 'ma-2024',
		title: `Ma et al. 2024, Physics of Fluids(그림 속 소용돌이와 난류 법칙) · ${CHECKED_ON}`,
		url: 'https://doi.org/10.1063/5.0213627'
	},
	{
		id: 'orsay-auvers',
		title: `오르세 미술관: Van Gogh in Auvers-sur-Oise(1890년 5월 20일 이주 · 70일 · 74점) · ${CHECKED_ON}`,
		url: 'https://www.musee-orsay.fr/en/program/whats-on/exhibitions/presentation/van-gogh-auvers-sur-oise'
	}
];
