// 빛의 나이 장 구성: 문구 · 쓰는 천체 · 그때 지구 사건 · 배경 장면 · 사진 자리.
// 문구의 {이름} 자리는 데이터로 계산한 값으로 채운다(chapterSlots). 문구가 기대는 사실은 claims 로 적어 storyChecks 가 데이터와 대조한다.
import {
	departureYear,
	storyToday,
	storyYear,
	travelTime,
	voyagerVerb,
	yearLabel
} from './lightTime.ts';
import type { SceneId } from './scenes.ts';
import type { SkyObject } from './skyData.ts';

// 표지 부제(가제). 바꿀 때는 이 한 곳만 고친다.
export const LIGHT_AGE_SUBTITLE = '빛을 거슬러 5,500만 년';

// 문구가 데이터에 기대는 사실
export const CHAPTER_CLAIMS = [
	// 해왕성 빛은 반나절(12시간)이 걸리지 않는다
	'neptune-under-half-day',
	// 보이저 1호 거리 = 빛으로 꼭 하루 · 정확한 거리 표기
	'voyager-one-light-day',
	// 프록시마는 태양 다음으로 가장 가까운 별
	'proxima-nearest-star',
	// 이 천체는 블랙홀이다
	'black-hole'
] as const;
export type ChapterClaim = (typeof CHAPTER_CLAIMS)[number];

export type Chapter = {
	id: string;
	label: string;
	title: string;
	body: string;
	// 문구가 쓰는 천체(sky_objects.object_id)
	objects: string[];
	// 계기판이 보이는 천체
	gaugeObject: string;
	// 그때 지구 사건(earth_moments.moment_id). 대조를 통과한 것만 보인다(빛이 닿을 때 사건은 대조 제외).
	moments: string[];
	claims: ChapterClaim[];
	scene: SceneId;
	// 사진 자리: 이미지 목록 id. 넣을 사진이 없으면 null(화면에서 숨김).
	photo: string | null;
	// 5장: 가까운 별 연도 되감기 · 출생 연도
	nearStars: boolean;
	// 4장: 정확한 거리 한 줄
	exactDistance: boolean;
	// 13장: 둘째 문단이 기대는 사건(그때 지구 목록에는 안 보임). 하나라도 대조에 실패하면 그 문단만 숨긴다.
	paragraph2Moments: string[];
};

const PROXIMA = 'proxima';

// 13장 둘째 문단은 두 사건(그때 지구 목록에는 보이지 않고, 대조로만 쓴다) 대조를 통과했을 때만 보인다.
export const END_PARAGRAPH_2_MOMENTS = ['pleiades_imjin', 'sgr_ice_age'];
export const END_PARAGRAPH_2 =
	'달도 해도, 우리 눈에 보이는 건 늘 조금 지난 모습입니다. 그 사이에는 임진왜란 무렵 출발한 별빛도, 빙하기에 은하 한가운데를 떠난 빛도 섞여 있습니다.';
export const END_PARAGRAPH_3 =
	'저마다 다른 시대에 출발한 빛이 먼 길을 건너와, 오늘 밤 한 하늘에 모여 있는 셈입니다.';
export const END_PARAGRAPH_4 = '그리고 그 끝에는, 빛조차 돌아오지 못하는 곳이 있습니다.';

export const CHAPTERS: Chapter[] = [
	{
		id: 'moon',
		label: '1장',
		title: '달',
		body: '지금 보는 달은 {time_moon} 전의 달입니다. 달빛이 여기까지 오는 데 그만큼 걸립니다.',
		objects: ['moon'],
		gaugeObject: 'moon',
		moments: [],
		claims: [],
		scene: 'moon',
		photo: null,
		nearStars: false,
		exactDistance: false,
		paragraph2Moments: []
	},
	{
		id: 'sun',
		label: '2장',
		title: '태양',
		body: '우리가 보는 태양은 {time_sun} 전의 모습입니다. 태양이 지금 사라져도 우리는 {plain_sun} 동안 알지 못합니다.',
		objects: ['sun'],
		gaugeObject: 'sun',
		moments: [],
		claims: [],
		scene: 'sun',
		photo: null,
		nearStars: false,
		exactDistance: false,
		paragraph2Moments: []
	},
	{
		id: 'planets',
		label: '3장',
		title: '목성 · 해왕성',
		body: '우리가 보는 목성은 {time_jupiter} 전, 해왕성은 {time_neptune} 전의 모습입니다. 태양계 끝자락까지도 빛으로는 반나절이 걸리지 않습니다.',
		objects: ['jupiter', 'neptune'],
		gaugeObject: 'neptune',
		moments: [],
		claims: ['neptune-under-half-day'],
		scene: 'planets',
		photo: null,
		nearStars: false,
		exactDistance: false,
		paragraph2Moments: []
	},
	{
		id: 'voyager',
		label: '4장',
		title: '보이저 1호',
		body: '1977년에 떠난 보이저 1호가 2026년 11월 18일, 빛으로 꼭 하루 걸리는 거리에 {voyager_verb}. 사람이 만든 물건으로는 처음입니다. 49년을 날아간 거리가 빛에게는 하루입니다.',
		objects: ['voyager1'],
		gaugeObject: 'voyager1',
		moments: [],
		claims: ['voyager-one-light-day'],
		scene: 'voyager',
		photo: 'voyager-launch',
		nearStars: false,
		exactDistance: true,
		paragraph2Moments: []
	},
	{
		id: 'near-stars',
		label: '5장',
		title: '가까운 별',
		body: '태양 다음으로 가까운 별, 프록시마 센타우리도 {time_proxima} 전의 모습입니다.',
		objects: [PROXIMA, 'sirius', 'vega'],
		gaugeObject: PROXIMA,
		moments: [],
		claims: ['proxima-nearest-star'],
		scene: 'near-stars',
		photo: null,
		nearStars: true,
		exactDistance: false,
		paragraph2Moments: []
	},
	{
		id: 'pleiades',
		label: '6장',
		title: '플레이아데스 성단',
		body: '우리가 보는 플레이아데스 성단은 {time_pleiades} 전의 모습입니다.',
		objects: ['pleiades'],
		gaugeObject: 'pleiades',
		moments: ['pleiades_imjin'],
		claims: [],
		scene: 'pleiades',
		photo: 'pleiades',
		nearStars: false,
		exactDistance: false,
		paragraph2Moments: []
	},
	{
		id: 'orion',
		label: '7장',
		title: '오리온 대성운',
		body: '우리가 보는 오리온 대성운은 {time_orion_nebula} 전의 모습입니다.',
		objects: ['orion_nebula'],
		gaugeObject: 'orion_nebula',
		moments: ['orion_bulguksa'],
		claims: [],
		scene: 'orion',
		photo: 'orion-nebula',
		nearStars: false,
		exactDistance: false,
		paragraph2Moments: []
	},
	{
		id: 'crab',
		label: '8장',
		title: '게성운',
		body: '우리가 보는 게성운은 {time_crab_nebula} 전의 모습입니다.',
		objects: ['crab_nebula'],
		gaugeObject: 'crab_nebula',
		moments: ['crab_neolithic', 'crab_guest_star'],
		claims: [],
		scene: 'crab',
		photo: 'crab-nebula',
		nearStars: false,
		exactDistance: false,
		paragraph2Moments: []
	},
	{
		id: 'sgr-a',
		label: '9장',
		title: '궁수자리 A*',
		body: '우리 은하 한가운데에서 오는 빛은 {time_sgr_a_star} 전에 출발했습니다. 그 중심에는 빛조차 빠져나오지 못하는 블랙홀, 궁수자리 A*가 있습니다.',
		objects: ['sgr_a_star'],
		gaugeObject: 'sgr_a_star',
		moments: ['sgr_ice_age'],
		claims: ['black-hole'],
		scene: 'sgr-a',
		photo: null,
		nearStars: false,
		exactDistance: false,
		paragraph2Moments: []
	},
	{
		id: 'lmc',
		label: '10장',
		title: '대마젤란은하',
		body: '우리가 보는 대마젤란은하는 {time_lmc} 전의 모습입니다.',
		objects: ['lmc'],
		gaugeObject: 'lmc',
		moments: ['lmc_shellfish'],
		claims: [],
		scene: 'lmc',
		photo: null,
		nearStars: false,
		exactDistance: false,
		paragraph2Moments: []
	},
	{
		id: 'andromeda',
		label: '11장',
		title: '안드로메다은하',
		body: '맨눈으로도 보이는 안드로메다은하는 {time_andromeda} 전의 모습입니다.',
		objects: ['andromeda'],
		gaugeObject: 'andromeda',
		moments: ['andromeda_tools'],
		claims: [],
		scene: 'andromeda',
		photo: 'andromeda',
		nearStars: false,
		exactDistance: false,
		paragraph2Moments: []
	},
	{
		id: 'm87',
		label: '12장',
		title: 'M87',
		body: '우리가 보는 M87 은하는 {time_m87} 전의 모습입니다. 그 한가운데에는 빛조차 빠져나오지 못하는 블랙홀이 있습니다.',
		objects: ['m87'],
		gaugeObject: 'm87',
		moments: ['m87_hothouse'],
		claims: ['black-hole'],
		scene: 'm87',
		photo: null,
		nearStars: false,
		exactDistance: false,
		paragraph2Moments: []
	},
	{
		id: 'end',
		label: '13장',
		title: '끝',
		body: '밤하늘을 올려다보면, 우리는 사실 과거를 보고 있습니다.',
		objects: [],
		gaugeObject: 'm87',
		moments: [],
		claims: [],
		scene: 'end',
		photo: null,
		nearStars: false,
		exactDistance: false,
		paragraph2Moments: END_PARAGRAPH_2_MOMENTS
	}
];

/** 문구 자리 값: 천체마다 time_{id}(약 N) · plain_{id}("약" 없음) · left_{id}(빛이 떠난 해), 그리고 보이저 동사. */
export function chapterSlots(objects: Map<string, SkyObject>, now: Date): Record<string, string> {
	const currentYear = storyYear(now);
	const slots: Record<string, string> = { voyager_verb: voyagerVerb(storyToday(now)) };
	for (const object of objects.values()) {
		const time = travelTime(object);
		slots[`time_${object.id}`] = time.text;
		slots[`plain_${object.id}`] = time.plain;
		slots[`left_${object.id}`] = yearLabel(departureYear(object, currentYear));
	}
	return slots;
}
