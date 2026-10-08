<script lang="ts">
	// 분광 분석 개념도: 불꽃 → 프리즘 → 무지개 띠. 단계에 들어오면 띠 위에 하늘색 선 2개, 빨간 선 2개가 차례로 떠오른다.
	// 선 위치는 색 이름(하늘색·짙은 빨강)을 보여 주려는 것이며 실제 파장 눈금이 아니다.
	type Props = { active: boolean };

	let { active }: Props = $props();

	// 띠 위 선의 x 좌표와 등장 순서(하늘색 둘 → 빨간색 둘)
	const BLUE_LINES = [226, 234];
	const RED_LINES = [292, 299];
</script>

<svg
	class="scene"
	class:play={active}
	viewBox="0 0 320 150"
	role="img"
	aria-label="불꽃의 빛이 프리즘을 지나 무지개 띠로 나뉘고, 띠 위에 하늘색 선 두 개와 빨간 선 두 개가 차례로 나타나는 개념도."
>
	<defs>
		<linearGradient id="spectrum-band" x1="0" x2="1" y1="0" y2="0">
			<stop offset="0" stop-color="#7b5cff" />
			<stop offset="0.22" stop-color="#3f7bff" />
			<stop offset="0.4" stop-color="#2fc4d8" />
			<stop offset="0.55" stop-color="#4fd36b" />
			<stop offset="0.7" stop-color="#f2e04b" />
			<stop offset="0.85" stop-color="#f29a3b" />
			<stop offset="1" stop-color="#e5463b" />
		</linearGradient>
	</defs>

	<!-- 불꽃 -->
	<path
		class="flame"
		d="M40 112 C22 104 24 84 36 70 C38 82 44 84 46 78 C44 66 50 56 58 50 C56 66 70 74 68 92 C66 106 56 114 40 112 Z"
	/>
	<rect class="burner" x="34" y="112" width="20" height="16" rx="2" />

	<!-- 빛줄기 → 프리즘 -->
	<line class="beam" x1="66" y1="84" x2="128" y2="80" />
	<polygon class="prism" points="150,46 120,104 180,104" />
	<!-- 프리즘에서 띠로 퍼지는 빛 -->
	<polygon class="fan" points="168,78 208,62 312,62 312,98 208,98 168,84" />

	<!-- 무지개 띠 -->
	<rect x="208" y="62" width="104" height="36" fill="url(#spectrum-band)" />

	{#each BLUE_LINES as x, order (x)}
		<line class="line blue" style:--order={order} x1={x} y1="58" x2={x} y2="102" />
	{/each}
	{#each RED_LINES as x, order (x)}
		<line
			class="line red"
			style:--order={order + BLUE_LINES.length}
			x1={x}
			y1="58"
			x2={x}
			y2="102"
		/>
	{/each}

	<text class="concept" x="312" y="140" text-anchor="end">개념도</text>
</svg>

<style>
	.scene {
		display: block;
		width: 100%;
		height: auto;
	}

	.flame {
		fill: var(--story-cell-on);
	}

	.burner {
		fill: var(--story-cell-off);
	}

	.beam {
		stroke: var(--story-text);
		stroke-width: 3;
	}

	.prism {
		fill: color-mix(in srgb, var(--story-text) 18%, transparent);
		stroke: var(--story-text);
		stroke-width: 1.5;
	}

	.fan {
		fill: color-mix(in srgb, var(--story-text) 10%, transparent);
	}

	/* 무지개 위에서도 보이도록 바탕색 그림자를 두른 굵은 선 */
	.line {
		stroke-width: 4;
		stroke-linecap: round;
		opacity: 0;
		transform: translateY(6px);
	}

	.blue {
		stroke: #8fdcff;
		filter: drop-shadow(0 0 1.5px var(--story-bg));
	}

	.red {
		stroke: #ff3b3b;
		filter: drop-shadow(0 0 1.5px var(--story-bg));
	}

	.play .line {
		animation: rise 0.5s ease-out forwards;
		animation-delay: calc(var(--order) * 0.45s);
	}

	.concept {
		fill: var(--story-muted);
		font-size: 11px;
	}

	@keyframes rise {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* 동작 줄이기: 선이 모두 떠오른 최종 상태로 멈춰 둔다. */
	@media (prefers-reduced-motion: reduce) {
		.line,
		.play .line {
			opacity: 1;
			transform: none;
			animation: none;
		}
	}
</style>
