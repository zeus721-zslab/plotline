// 스크롤 단계 판정: 카드 윗변이 판정선(화면 위에서 lineRatio 지점)을 넘으면 그 카드의 단계가 활성이 된다.

export const NO_ACTIVE_STEP = -1;

/**
 * 카드가 판정 영역(화면 위 ~ 판정선)에 드나들 때마다 "판정선을 이미 넘은 마지막 카드"를 다시 골라 onchange 로 알린다.
 * 빠른 스크롤·중간 새로고침으로 카드가 판정선을 건너뛰어도 현재 단계가 맞게 잡힌다.
 * 아무 카드도 넘지 않았으면 NO_ACTIVE_STEP. 돌려준 함수를 부르면 관찰을 멈춘다.
 */
export function trackActiveStep(
	cards: HTMLElement[],
	lineRatio: number,
	onchange: (index: number) => void
): () => void {
	const activeAreaMargin = `0px 0px -${Math.round((1 - lineRatio) * 100)}% 0px`;
	const observer = new IntersectionObserver(
		() => {
			const activeLine = window.innerHeight * lineRatio;
			let passed = NO_ACTIVE_STEP;
			cards.forEach((card, index) => {
				if (card.getBoundingClientRect().top < activeLine) passed = index;
			});
			onchange(passed);
		},
		{ rootMargin: activeAreaMargin }
	);
	for (const card of cards) observer.observe(card);
	return () => observer.disconnect();
}
