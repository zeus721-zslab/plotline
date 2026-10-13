// 기기 판정(그리기 양 · 정지 그림 여부). 2편 skyRenderer 에 있던 것을 여러 편이 함께 쓰므로 옮겼다(D-45).

// 기기별 상한. 휴대폰은 화면이 작아 입자를 줄여도 밀도가 비슷하고, 30fps · 픽셀 배율 1.5 로 그리기 양을 1/4 가까이 줄인다.
export type RenderProfile = {
	stars: number;
	streaks: number;
	// 블랙홀 원반 위를 흐르는 호 조각 수
	diskPieces: number;
	fps: number;
	pixelRatioCap: number;
};
export const DESKTOP_PROFILE: RenderProfile = {
	stars: 180,
	streaks: 30,
	diskPieces: 160,
	fps: 60,
	pixelRatioCap: 2
};
export const MOBILE_PROFILE: RenderProfile = {
	stars: 80,
	streaks: 14,
	diskPieces: 70,
	fps: 30,
	pixelRatioCap: 1.5
};
const MOBILE_MAX_WIDTH_PX = 768;
// 저사양(코어 2개 이하 또는 메모리 2GB 이하)은 움직이지 않는 한 장만 그린다.
const LOW_END_MAX_CORES = 2;
const LOW_END_MAX_MEMORY_GB = 2;

function deviceMemoryGb(): number | null {
	// deviceMemory 는 일부 브라우저에만 있다(타입 정의에 없음).
	const memory: unknown = Reflect.get(navigator, 'deviceMemory');
	return typeof memory === 'number' ? memory : null;
}

export function isLowEndDevice(): boolean {
	const memory = deviceMemoryGb();
	return (
		navigator.hardwareConcurrency <= LOW_END_MAX_CORES ||
		(memory !== null && memory <= LOW_END_MAX_MEMORY_GB)
	);
}

export function pickProfile(viewportWidth: number): RenderProfile {
	return viewportWidth < MOBILE_MAX_WIDTH_PX ? MOBILE_PROFILE : DESKTOP_PROFILE;
}
