// 사건의 지평선 너머 장 구성: 문구 · 경계 · 계기판 · 배경 장면 · 사진 자리 · 상상 표시.
// 문구의 {이름} 자리는 데이터로 계산한 값으로 채운다(chapterSlots). 문구가 기대는 사실은 claims 로 적어 storyChecks 가 데이터와 대조한다.
import type { CopySource } from '../../story/storyConfig.ts';
import { massEokText } from './fallMath.ts';
import { CYGNUS_X1_HOLE, M87_HOLE, type BlackHole, type BoundaryId } from './holeData.ts';
import type { SceneId } from './scenes.ts';

export const BLACK_HOLE_SUBTITLE = '블랙홀로 떨어진 여행자';

// 문구가 데이터에 기대는 사실
export const CHAPTER_CLAIMS = [
	// 장의 경계가 바로 앞 경계보다 안쪽이다(여행자가 바깥에서 안으로 차례로 지난다)
	'inward-order',
	// 그림자는 실제 경계가 아니다
	'shadow-not-physical',
	// 작용권은 한 숫자 반지름이 없다(회전 블랙홀에서만, 숫자 없이 글로 표시)
	'ergosphere-no-radius',
	// 지평선 반지름 = 지평선의 1배(km 계산 기준)
	'horizon-unit',
	// M87 블랙홀은 지평선에서 몸이 늘어나지 않을 만큼 크다(조석력 1G 미만 기준 질량 초과)
	'm87-gentle-horizon'
] as const;
export type ChapterClaim = (typeof CHAPTER_CLAIMS)[number];

export type GaugeSpec =
	// 숫자 없이 글로 표시하는 장
	| { kind: 'text'; text: string }
	// M87 질량 · 경계 배수로 계산하는 장
	| { kind: 'boundary'; boundary: BoundaryId };

export type Chapter = {
	id: SceneId;
	label: string;
	title: string;
	body: string;
	// 장이 다루는 경계(배경 띠 강조 · inward-order 대조). 없으면 null.
	boundary: BoundaryId | null;
	gauge: GaugeSpec;
	claims: ChapterClaim[];
	// 사진 자리: 이미지 목록 id. 넣을 사진이 없으면 null.
	photo: string | null;
	// 장 전체가 상상(카드에 "상상" 표시). 일부만 상상이면 false 로 두고 그 문단을 followers 의 imagined 로 둔다.
	imagined: boolean;
	// 배경 그림이 상상 장면(지평선 안 · 스파게티화 · 특이점 · 화이트홀)이면 "코드로 그린 상상도" 표기
	imaginedDrawing: boolean;
	// 본문 뒤에 이어지는 문단(7장 여행자 쪽 · 10장 세 갈래 · 11장 화이트홀 상상)
	followers: ChapterFollower[];
};

export type ChapterFollower =
	| { kind: 'who'; who: string; text: string }
	| { kind: 'options'; items: string[] }
	| { kind: 'imagined'; text: string };

// 계기판 글(숫자 없는 장)
const FAR_GAUGE: GaugeSpec = { kind: 'text', text: 'M87까지 아직 멀리 · 시간 차이 거의 없음' };
const INSIDE_GAUGE: GaugeSpec = { kind: 'text', text: '지평선 안 · 머물 수 없음' };

// 9장 분기: "다른 블랙홀이었다면?" 을 누르면 보이는 문구(백조자리 X-1 질량 대조를 통과했을 때만 버튼이 보인다)
export const BRANCH_CHAPTER: SceneId = 'spaghetti';
export const BRANCH_BUTTON = '다른 블랙홀이었다면?';
export const BRANCH_TEXT =
	'처음 발견된 블랙홀, 백조자리 X-1(태양 약 {cyg_x1_mass}배)이었다면 이 일은 지평선에 닿기도 전에 일어났습니다. 작은 블랙홀이 더 위험합니다.';

export const CHAPTERS: Chapter[] = [
	{
		id: 'far',
		label: '1장',
		title: '멀리서',
		body: '태양 {m87_mass}개만큼 무거운 M87의 그림자 앞, 여행자가 우주선 문을 엽니다. 약속은 하나. "1초마다 손전등을 깜빡일게." 우리는 남아서 그 빛을 세기로 합니다.',
		boundary: null,
		gauge: FAR_GAUGE,
		claims: [],
		photo: 'm87-jet',
		imagined: false,
		imaginedDrawing: false,
		followers: []
	},
	{
		id: 'disk',
		label: '2장',
		title: '강착 원반',
		body: '블랙홀 둘레의 가스는 빛에 가까운 속도로 돌며 달아오르고, 원반 위를 덮은 코로나는 10억 도에 이릅니다. 2편에서 본 밝은 고리가 바로 이 빛입니다. 다행히 여행자는 타지 않는 옷을 입었습니다. 이야기니까요.',
		boundary: null,
		gauge: FAR_GAUGE,
		claims: [],
		photo: 'm87-shadow',
		imagined: false,
		imaginedDrawing: false,
		followers: []
	},
	{
		id: 'isco',
		label: '3장',
		title: '가장 안쪽 안정 궤도',
		body: '여기서부터는 돌고 싶어도 원을 그리며 머물 수 없습니다. 바닥이 사라진 회전목마처럼, 여행자는 안쪽으로 미끄러지기 시작합니다.',
		boundary: 'isco',
		gauge: { kind: 'boundary', boundary: 'isco' },
		claims: ['inward-order'],
		photo: null,
		imagined: false,
		imaginedDrawing: false,
		followers: []
	},
	{
		id: 'shadow',
		label: '4장',
		title: '그림자 가장자리',
		body: '2편 마지막에 화면을 덮은 검은 원. 여행자는 지금 그 안에 있습니다. 그런데 벽을 지나는 느낌은 없었습니다. 그림자는 블랙홀이 빛을 휘어 실제보다 크게 보이게 만든 모습이고, 진짜 경계는 아직 아래입니다.',
		boundary: 'shadow',
		gauge: { kind: 'boundary', boundary: 'shadow' },
		claims: ['inward-order', 'shadow-not-physical'],
		photo: 'm87-shadow',
		imagined: false,
		imaginedDrawing: false,
		followers: []
	},
	{
		id: 'photon-sphere',
		label: '5장',
		title: '광자구',
		body: '여행자가 손전등을 옆으로 비춥니다. 빛은 블랙홀을 한 바퀴 돌아 여행자의 뒤통수를 비춥니다. 머리 위 우주는 점점 작은 원 하나로 모여듭니다.',
		boundary: 'photon_sphere',
		gauge: { kind: 'boundary', boundary: 'photon_sphere' },
		claims: ['inward-order'],
		photo: 'plunge',
		imagined: false,
		imaginedDrawing: false,
		followers: []
	},
	{
		id: 'ergosphere',
		label: '6장',
		title: '작용권',
		body: '가만히 있으려 해도 몸이 돕니다. 블랙홀이 돌면서 공간까지 끌고 돌기 때문입니다. 여기에는 "멈춤"이 없습니다.',
		boundary: 'ergosphere',
		gauge: { kind: 'text', text: '작용권 · 회전 블랙홀에서만' },
		claims: ['ergosphere-no-radius'],
		photo: null,
		imagined: false,
		imaginedDrawing: false,
		followers: []
	},
	{
		id: 'horizon',
		label: '7장',
		title: '사건의 지평선',
		body: '깜빡임은 점점 붉어지고 어두워지다, 마침내 보이지 않게 됩니다. 우리 눈에는 여기서 끝입니다.',
		boundary: 'horizon',
		gauge: { kind: 'boundary', boundary: 'horizon' },
		claims: ['inward-order', 'horizon-unit'],
		photo: 'plunge',
		imagined: false,
		imaginedDrawing: false,
		followers: [
			{
				kind: 'who',
				who: '여행자',
				text: '아무 일도 없었습니다. 경계선도, 표지판도 없이. 손전등은 여전히 1초에 한 번 깜빡입니다. 누구의 시계도 틀리지 않았습니다.'
			}
		]
	},
	{
		id: 'inside',
		label: '8장',
		title: '지평선 안',
		body: '여기부터는 우리가 볼 수 없는 곳입니다. 여행자는 돌아서 보지만, 어느 쪽으로 가도 길은 중심으로 이어집니다. 돌아가려면 방향이 아니라 미래를 바꿔야 합니다. 중심은 이제 "저기"가 아니라 "내일"입니다.',
		boundary: null,
		gauge: INSIDE_GAUGE,
		claims: [],
		photo: null,
		imagined: false,
		imaginedDrawing: true,
		followers: []
	},
	{
		id: 'spaghetti',
		label: '9장',
		title: '스파게티화',
		body: '발끝이 머리보다 조금 더 세게 당겨집니다. 조금, 조금 더. 여행자는 국수처럼 늘어납니다.',
		boundary: null,
		gauge: INSIDE_GAUGE,
		claims: ['m87-gentle-horizon'],
		photo: null,
		imagined: false,
		imaginedDrawing: true,
		followers: []
	},
	{
		id: 'singularity',
		label: '10장',
		title: '특이점',
		body: '여기서부터는 아무도 모릅니다. 계산이 "무한대"를 내놓는 곳은 자연의 끝이라기보다 우리 이론이 멈추는 곳입니다. 과학자들이 떠올린 이야기는 셋.',
		boundary: null,
		gauge: INSIDE_GAUGE,
		claims: [],
		photo: null,
		imagined: true,
		imaginedDrawing: true,
		followers: [
			{
				kind: 'options',
				items: [
					'모든 것이 끝난다',
					'여행자가 기억하는 것들은 어떤 식으로든 우주 어딘가에 남는다',
					'모든 것을 내뱉기만 하는 "화이트홀"이 있다'
				]
			}
		]
	},
	{
		id: 'end',
		label: '11장',
		title: '끝',
		body: '우리 창에는 이제 아무것도 보이지 않습니다. 블랙홀도 영원하지 않습니다. 상상할 수 없이 긴 시간 동안 조금씩 빛을 흘리며 줄어듭니다.',
		boundary: null,
		gauge: INSIDE_GAUGE,
		claims: [],
		photo: null,
		imagined: false,
		imaginedDrawing: true,
		followers: [
			{
				kind: 'imagined',
				text: '어떤 과학자들은 그 마지막에 블랙홀이 뒤집혀 화이트홀이 되고, 삼켰던 것을 내놓는다고 상상합니다. 그날이 온다면, 아무도 남지 않은 우주 한쪽에서 손전등 하나가 다시 깜빡일지도 모릅니다. 1초에 한 번.'
			}
		]
	}
];

/** 문구 자리 값: M87 질량(억 단위) · 백조자리 X-1 질량(반올림 정수). 데이터에 없으면 그 자리는 비워 둔다(대조가 그 문구를 숨긴다). */
export function chapterSlots(holes: Map<string, BlackHole>): Record<string, string> {
	const slots: Record<string, string> = {};
	const m87 = holes.get(M87_HOLE);
	if (m87 !== undefined) slots.m87_mass = massEokText(m87.massSolar);
	const cygnus = holes.get(CYGNUS_X1_HOLE);
	if (cygnus !== undefined) slots.cyg_x1_mass = String(Math.round(cygnus.massSolar));
	return slots;
}

// 장 문구가 기대는 사실의 출처(출처 절 "문구 출처"). 근거 설명은 본문에 넣지 않고 여기로 모은다.
export const CHAPTER_COPY_SOURCES: CopySource[] = [
	{
		id: 'copy-eso1907',
		title: 'ESO — M87 블랙홀 첫 사진 · 질량 (2026-10-10 기준)',
		url: 'https://www.eso.org/public/news/eso1907/'
	},
	{
		id: 'copy-naoj-spin',
		title: 'NAOJ — M87 블랙홀 회전 증거 (2026-10-10 기준)',
		url: 'https://www.cfca.nao.ac.jp/en/pr/20230928'
	},
	{
		id: 'copy-nasa-anatomy',
		title: 'NASA — 블랙홀의 구조 (2026-10-10 기준)',
		url: 'https://science.nasa.gov/universe/black-holes/anatomy/'
	},
	{
		id: 'copy-jila-orbit',
		title: '콜로라도 대학교 JILA — 블랙홀 궤도 (2026-10-10 기준)',
		url: 'https://jila.colorado.edu/~ajsh/bh/orbit.html'
	},
	{
		id: 'copy-jila-approach',
		title:
			'콜로라도 대학교 JILA — 블랙홀에 다가가기 · 가장 안쪽 안정 궤도(지평선의 3배) (2026-10-10 기준)',
		url: 'https://jila.colorado.edu/~ajsh/bh/approach.html'
	},
	{
		id: 'copy-jila-singularity',
		title: '콜로라도 대학교 JILA — 특이점으로 떨어지기 · 지평선의 조석력 (2026-10-10 기준)',
		url: 'https://jila.colorado.edu/~ajsh/bh/singularity.html'
	},
	{
		id: 'copy-jila-white-hole',
		title: '콜로라도 대학교 JILA — 화이트홀과 웜홀 (2026-10-10 기준)',
		url: 'https://jila.colorado.edu/~ajsh/bh/schww.html'
	},
	{
		id: 'copy-arxiv-white-hole',
		title: 'arXiv 1407.0989 — 블랙홀에서 화이트홀로 넘어가는 가설 (2026-10-10 기준)',
		url: 'https://arxiv.org/abs/1407.0989'
	},
	{
		id: 'copy-arxiv-cygnus',
		title: 'arXiv 2102.09091 — 백조자리 X-1 질량 (2026-10-10 기준)',
		url: 'https://arxiv.org/abs/2102.09091'
	}
];
