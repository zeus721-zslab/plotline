// 마지막 2시간 40분 장 구성(D-43): 장마다 시간 표지 한 줄 · 카드 문단 · 문구가 기대는 사실(claims).
// 문구는 원문 그대로 두고, 숫자 · 시각은 storyChecks 가 데이터 묶음과 대조해 어긋나면 그 장 문단(또는 시간 표지)을 숨긴다.
// 카드마다 앞에 장면 구간이 하나씩 있다(장면이 바뀌는 동안 글을 비운다).
import type { CopySource } from '../../story/storyConfig.ts';
import type { EventId } from './titanicData.ts';

export const CHAPTER_IDS = [
	'now',
	'stars',
	'collision',
	'signals',
	'last-signal',
	'dawn',
	'epilogue'
] as const;
export type ChapterId = (typeof CHAPTER_IDS)[number];

/** 문구가 기대는 사실 하나. 범위(min · max)는 양 끝을 포함한다. */
export type Claim =
	// 날짜. 월 · 일이 null 이면 그 자리는 대조하지 않는다.
	| { kind: 'date'; event: EventId; year: number; month: number | null; day: number | null }
	// 선박 시각. 분이 null 이면 시만 대조한다("4시가 조금 지나").
	| { kind: 'time'; event: EventId; hour: number; minute: number | null }
	// 태어난 날(born)부터 그 사건 날짜까지 만 나이
	| { kind: 'age'; born: EventId; event: EventId; years: number }
	// 두 사건 사이 분(날짜 · 시각이 모두 있어야 한다)
	| { kind: 'minutes-after'; from: EventId; to: EventId; min: number; max: number }
	// 두 사건 사이 날 수(날짜 차)
	| { kind: 'days-after'; from: EventId; to: EventId; min: number; max: number }
	// 두 사건 사이 햇수(연도 차)
	| { kind: 'years-after'; from: EventId; to: EventId; min: number; max: number }
	// 그 사건부터 올해(이야기 기준 연도)까지 햇수
	| { kind: 'years-since'; event: EventId; min: number }
	// 수량
	| { kind: 'value'; event: EventId; min: number; max: number }
	// 수량 × 배수(해리 → km 등)
	| { kind: 'scaled-value'; event: EventId; factor: number; min: number; max: number }
	// 두 수량의 차(from − minus)
	| { kind: 'value-gap'; from: EventId; minus: EventId; min: number; max: number };

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

export const TITANIC_SUBTITLE =
	'그날 밤, 바다는 거울처럼 잔잔했고 하늘에는 별이 유난히 많았습니다.';

// 해리 → km
export const KILOMETERS_PER_NAUTICAL_MILE = 1.852;
const UNBOUNDED = Number.POSITIVE_INFINITY;

function date(event: EventId, year: number, month: number | null, day: number | null): Claim {
	return { kind: 'date', event, year, month, day };
}

function time(event: EventId, hour: number, minute: number | null): Claim {
	return { kind: 'time', event, hour, minute };
}

function value(event: EventId, min: number, max: number): Claim {
	return { kind: 'value', event, min, max };
}

export const CHAPTERS: Chapter[] = [
	{
		id: 'now',
		label: '1장',
		timeMark: '지금 · 북대서양',
		timeMarkClaims: [],
		cards: [
			[
				'캐나다 뉴펀들랜드에서 남동쪽으로 약 600km, 북대서양 바다 밑 3,800m에 배 한 척이 누워 있습니다.',
				'빛이 닿지 않는 그곳에서, 배는 백 년이 넘도록 같은 자리에 있었습니다.',
				'그 배가 가라앉던 밤, 그 위의 하늘은 어떤 하늘이었을까요.'
			]
		],
		claims: [
			value('wreck_depth', 3800, 3800),
			// "백 년이 넘도록": 가라앉은 해부터 올해까지 100년 초과
			{ kind: 'years-since', event: 'sank', min: 101 }
		]
	},
	{
		id: 'stars',
		label: '2장',
		timeMark: '1912년 4월 14일 · 21:00',
		timeMarkClaims: [date('collision', 1912, 4, 14)],
		cards: [
			[
				'1912년 4월 14일 일요일 밤. 영국을 떠나 뉴욕으로 향하던 타이태닉호는 출항한 지 나흘이 지난 밤을 지나고 있었습니다.',
				'그날 바다에는 바람 한 점 없었습니다. 파도도 너울도 없이 수면은 거울처럼 잔잔했고, 달은 아직 떠오르기 전이었습니다. 대신 하늘에는 별이 유난히 많았습니다. 그 배에 타고 있던 과학 교사 로렌스 비즐리는 훗날 이렇게 적었습니다.',
				'"그날 밤, 별들은 정말로 살아서 말을 거는 것 같았다."'
			],
			[
				'같은 시각, 배 위쪽 갑판의 작은 무선실에서는 두 젊은이가 쉴 새 없이 전신 키를 두드리고 있었습니다. 스물다섯 살 잭 필립스와 스물두 살 해럴드 브라이드. 승객들이 육지로 보내는 전보가 산더미처럼 밀려 있었습니다.',
				'그 무선실에는 낮부터 다른 배들의 경고가 들어오고 있었습니다. 앞바다에 빙산이 떠 있다는 경고였습니다. 하루 동안 적어도 여섯 번. 그중 몇은 선장에게 전해졌지만, 몇은 끝내 함교에 닿지 못했습니다.',
				'밤 10시 55분, 가까운 바다에 멈춰 선 캘리포니언호에서 또 신호가 왔습니다. "우리는 얼음에 둘러싸여 멈춰 섰다." 귀가 울릴 만큼 가까운 신호였고, 육지와 교신하던 필립스는 끼어들지 말라고 답했습니다. 30분 뒤, 캘리포니언호의 무선사는 수신기를 끄고 잠자리에 들었습니다.',
				'그로부터 10분 뒤, 망대의 견시가 어둠 속에서 무언가를 보았습니다.'
			]
		],
		claims: [
			{ kind: 'age', born: 'phillips_born', event: 'collision', years: 25 },
			{ kind: 'age', born: 'bride_born', event: 'collision', years: 22 },
			value('ice_warnings', 6, UNBOUNDED),
			time('californian_stopped', 22, 55),
			{ kind: 'minutes-after', from: 'californian_stopped', to: 'evans_off', min: 25, max: 40 },
			{ kind: 'minutes-after', from: 'evans_off', to: 'collision', min: 5, max: 15 },
			// "출항한 지 나흘이 지난 밤"
			{ kind: 'days-after', from: 'departed', to: 'collision', min: 4, max: 4 }
		]
	},
	{
		id: 'collision',
		label: '3장',
		timeMark: '23:40',
		timeMarkClaims: [time('collision', 23, 40)],
		cards: [
			[
				'빙산이었습니다. 배는 급히 방향을 틀었지만, 오른쪽 옆구리가 빙산을 긁으며 지나갔습니다.',
				'갑판 위의 많은 사람은 그 충돌을 거의 느끼지 못했습니다. 바다는 여전히 잔잔했고, 별도 그대로였습니다.',
				'하지만 물은 이미 배 안으로 들어오고 있었습니다.',
				'자정이 조금 지나, 선장이 무선실 문을 열었습니다.'
			]
		],
		claims: [time('collision', 23, 40)]
	},
	{
		id: 'signals',
		label: '4장',
		timeMark: '4월 15일 · 00:15',
		timeMarkClaims: [date('first_cqd', 1912, 4, 15), time('first_cqd', 0, 15)],
		cards: [
			[
				'선장의 지시로 필립스는 조난 신호를 보내기 시작했습니다. 처음에는 오래 써 온 신호 \'CQD\'였습니다. 30분쯤 지나 브라이드가 반쯤 농담으로 말했습니다. "새 신호 SOS도 보내 봐요. 이번이 보낼 마지막 기회일지도 모르잖아요."',
				'신호는 어두운 바다로 퍼져 나갔습니다. 남동쪽으로 약 107km 떨어진 곳에서, 카르파티아호의 무선사 해럴드 코탐이 잠자리에 들기 직전 그 신호를 받았습니다. 카르파티아호는 곧바로 뱃머리를 돌렸습니다. 있는 힘을 다해 달려도 네 시간 거리였습니다.'
			],
			[
				'훨씬 가까운 곳에도 불빛이 하나 있었습니다. 타이태닉호의 갑판에서는 수평선 위에 다른 배의 불빛이 보였고, 하늘로 쏘아 올린 흰 신호탄은 캘리포니언호의 갑판에서도 보였습니다. 하지만 그 배의 무선실은 꺼져 있었고, 여덟 발의 신호탄은 끝내 구조 요청으로 읽히지 않았습니다. 타이태닉호에서 본 그 불빛이 정말 캘리포니언호였는지는 지금도 다툼이 있습니다.',
				'그동안 갑판에서는 구명보트가 하나둘 바다로 내려갔습니다. 보트 스무 척에 탈 수 있는 사람은 모두 1,178명, 배에 탄 사람은 2,200명이 넘었습니다. 그런데도 보트들은 자리를 비운 채 내려갔습니다. 이 배가 정말 가라앉으리라고 믿지 않은 사람이 많았다고 전해집니다. 그렇게 비어 내려간 자리가 500석이 넘었습니다.',
				'새벽 1시 45분, 코탐이 받은 타이태닉호의 마지막 또렷한 신호는 이랬습니다. "기관실이 보일러까지 물에 잠겼다."',
				'하늘은, 여전히 아름다웠습니다.'
			]
		],
		claims: [
			{ kind: 'minutes-after', from: 'first_cqd', to: 'first_sos', min: 25, max: 35 },
			// "약 107km": 해리 × 1.852
			{
				kind: 'scaled-value',
				event: 'carpathia_distance',
				factor: KILOMETERS_PER_NAUTICAL_MILE,
				min: 100,
				max: 110
			},
			value('lifeboats', 20, 20),
			value('lifeboat_capacity', 1178, 1178),
			// "2,200명이 넘었습니다"
			value('aboard', 2201, UNBOUNDED),
			// "비어 내려간 자리가 500석이 넘었습니다": 정원 − 보트로 떠난 사람
			{
				kind: 'value-gap',
				from: 'lifeboat_capacity',
				minus: 'left_in_boats',
				min: 501,
				max: UNBOUNDED
			},
			time('last_clear_signal', 1, 45)
		]
	},
	{
		id: 'last-signal',
		label: '5장',
		timeMark: '02:05',
		timeMarkClaims: [time('released', 2, 5)],
		cards: [
			[
				'새벽 2시 5분, 선장은 두 무선사에게 이제 각자 살 길을 찾으라고 말했습니다. 그래도 필립스는 자리를 떠나지 않았습니다. 살아남은 브라이드는 훗날 이렇게 말했습니다.',
				'"마지막 그 끔찍한 15분 동안 필립스가 한 일을, 나는 평생 잊지 못할 것이다."',
				'2시 17분, 마지막 신호가 끊겼습니다.'
			],
			[
				'그리고 배의 불빛이 한 번 깜빡였습니다. 다시 켜지는가 싶더니, 모두 꺼졌습니다.',
				'불빛이 사라지자 배는 별이 가려진 검은 모양으로만 보였습니다. 2시 20분, 그 모양마저 수면 아래로 사라졌습니다.',
				'그날 밤 1,500명이 넘는 사람이 돌아오지 못했습니다. 필립스도 그중 한 사람이었습니다.',
				'바다 위에는, 처음과 똑같은 별이 남았습니다.'
			]
		],
		claims: [
			time('released', 2, 5),
			time('last_signal', 2, 17),
			time('sank', 2, 20),
			value('deaths', 1500, UNBOUNDED)
		]
	},
	{
		id: 'dawn',
		label: '6장',
		timeMark: '03:00',
		timeMarkClaims: [time('aurora', 3, 0)],
		cards: [
			[
				'보트 위의 사람들은 추위 속에서 밤을 버텼습니다. 새벽 3시쯔음, 북쪽 하늘에 희미한 빛줄기가 일렁였습니다. 구조선의 불빛인 줄 알았다는 사람도 있었지만, 그것은 오로라였습니다.',
				'4시가 조금 지나, 마침내 카르파티아호가 나타났습니다.'
			],
			[
				'그리고 날이 밝기 시작했습니다. 비즐리는 그 새벽을 이렇게 기억합니다.',
				'"그리고 별들이 천천히 죽어 갔다. 수평선 바로 위에서, 다른 별들이 다 사라진 뒤에도 오래 남아 있던 하나만 빼고."',
				'그 마지막 별은 금성이었을 것입니다.'
			],
			[
				'빛이 바다를 비추자, 사람들은 그제야 주위를 볼 수 있었습니다. 사방이 빙산이었습니다. 높이가 수십 미터에 이르는 빙산만 스무 개가 넘었고, 그 너머 수평선에는 끝이 보이지 않는 얼음 벌판이 펼쳐져 있었습니다.',
				'밤새 어둠 속에서 보이지 않던 것이었습니다.',
				'바람이 없어 빙산 밑동에 부서지는 물결이 없었고, 달이 없어 얼음을 비춰 줄 빛도 없었습니다. 그날 밤을 그토록 아름답게 만든 고요가, 어쩌면 그 밤을 가장 위험하게 만든 것이었는지도 모릅니다.',
				'카르파티아호는 아침 8시 반까지 보트를 모두 건져 올렸습니다. 살아 돌아온 사람은 700명 남짓이었습니다. 브라이드도 그중 한 사람이었습니다. 그는 동상 걸린 발로 카르파티아호의 무선실에 앉아, 살아남은 사람들의 이름을 육지로 보내는 일을 도왔습니다.'
			]
		],
		claims: [
			time('aurora', 3, 0),
			time('carpathia_arrived', 4, null),
			time('rescue_done', 8, 30),
			// "스무 개가 넘었고"
			value('icebergs', 21, UNBOUNDED),
			// "700명 남짓"
			value('survivors', 700, 720)
		]
	},
	{
		id: 'epilogue',
		label: '에필로그',
		timeMark: '1985년 9월 → 지금',
		timeMarkClaims: [date('wreck_found', 1985, 9, null)],
		cards: [
			[
				'73년 뒤인 1985년 9월 1일, 해저 탐사 장비의 카메라가 바다 밑 3,800m에서 타이태닉호를 찾아냈습니다. 그날 밤 무선실이 불러 준 위치에서 20km 넘게 떨어진 곳이었습니다.',
				'배는 지금도 그 어둠 속에 누워 있습니다.',
				'그리고 그 위의 하늘에는, 해마다 4월 이 무렵이면 그날 밤의 별들이 같은 자리로 떠오릅니다.',
				'비즐리가 살아서 말을 거는 것 같다고 했던, 바로 그 별들입니다.'
			]
		],
		claims: [
			{ kind: 'years-after', from: 'sank', to: 'wreck_found', min: 73, max: 73 },
			value('wreck_depth', 3800, 3800),
			// "20km 넘게": 정수 해리 × 1.852 는 20 이 될 수 없어 이상(≥)으로 둔다
			{
				kind: 'scaled-value',
				event: 'position_error',
				factor: KILOMETERS_PER_NAUTICAL_MILE,
				min: 20,
				max: UNBOUNDED
			}
		]
	}
];

const CHECKED_ON = '2026-10-11 확인';

/** 문구 출처(출처 절) */
export const CHAPTER_COPY_SOURCES: CopySource[] = [
	{
		id: 'beesley',
		title: `Lawrence Beesley, The Loss of the S.S. Titanic(1912, Project Gutenberg #6675) — 별 · 새벽의 마지막 별 · 고요한 바다 · ${CHECKED_ON}`,
		url: 'https://www.gutenberg.org/ebooks/6675'
	},
	{
		id: 'bot-boats',
		title: `British Wreck Commissioner's Inquiry 보고서: 구명보트(척수 · 정원 · 떠난 사람) · ${CHECKED_ON}`,
		url: 'https://www.titanicinquiry.org/BOTInq/BOTReport/BOTRepBoats.php'
	},
	{
		id: 'bot-messages',
		title: `British Wreck Commissioner's Inquiry 보고서: 받은 빙산 경고 · ${CHECKED_ON}`,
		url: 'https://www.titanicinquiry.org/BOTInq/BOTReport/botRepMessages.php'
	},
	{
		id: 'us-rostron',
		title: `US Senate Inquiry 로스트런 선장 증언(카르파티아호 · 날이 밝은 뒤의 빙산) · ${CHECKED_ON}`,
		url: 'https://www.titanicinquiry.org/USInq2/AmInq01Rostron02.php'
	},
	{
		id: 'wiki-bride',
		title: `Harold Bride(Wikipedia) — 필립스에 대한 증언 · 카르파티아호 무선실 · ${CHECKED_ON}`,
		url: 'https://en.wikipedia.org/wiki/Harold_Bride'
	},
	{
		id: 'wiki-cottam',
		title: `Harold Cottam(Wikipedia) — 조난 신호 수신 · 마지막 또렷한 신호 · ${CHECKED_ON}`,
		url: 'https://en.wikipedia.org/wiki/Harold_Cottam'
	},
	{
		id: 'wiki-evans',
		title: `Cyril Furmstone Evans(Wikipedia) — 캘리포니언호 신호 · 수신기를 끈 때 · ${CHECKED_ON}`,
		url: 'https://en.wikipedia.org/wiki/Cyril_Furmstone_Evans'
	},
	{
		id: 'wiki-cqd',
		title: `CQD(Wikipedia) — CQD 와 SOS · ${CHECKED_ON}`,
		url: 'https://en.wikipedia.org/wiki/CQD'
	},
	{
		id: 'wiki-wreck',
		title: `Wreck of the Titanic(Wikipedia) — 1985년 발견 · 수심 · 위치 차이 · ${CHECKED_ON}`,
		url: 'https://en.wikipedia.org/wiki/Wreck_of_the_Titanic'
	},
	{
		id: 'loc-stars',
		title: `Library of Congress, The "Stars" of Titanic — 그날 밤 달 위상 · ${CHECKED_ON}`,
		url: 'https://blogs.loc.gov/inside_adams/2012/04/the-stars-of-titanic/'
	},
	{
		id: 'space-aurora',
		title: `Space.com — 그날 밤 오로라 목격 기록 · ${CHECKED_ON}`,
		url: 'https://www.space.com/titanic-sunk-by-aurora'
	}
];
