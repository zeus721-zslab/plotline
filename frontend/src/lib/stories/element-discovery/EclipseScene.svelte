<script lang="ts">
	// 헬륨 개념도: 달에 가려진 태양과 퍼지는 코로나, 아래 스펙트럼 띠에서 처음 보는 선 하나가 깜박인다.
	// 선 위치는 노란빛 근처라는 것만 보여 주며 실제 파장 눈금이 아니다.
	const SUN_X = 160;
	const SUN_Y = 62;
	const SUN_RADIUS = 34;
	// 띠(x 60~260)의 노란빛 근처
	const NEW_LINE_X = 196;
</script>

<svg
	class="scene"
	viewBox="0 0 320 160"
	role="img"
	aria-label="달에 가려진 태양 둘레로 코로나가 퍼지고, 아래 스펙트럼 띠에서 노란 선 하나가 깜박이는 개념도."
>
	<defs>
		<radialGradient id="eclipse-corona">
			<stop offset="0.45" style:stop-color="var(--story-cell-bright)" stop-opacity="0.9" />
			<stop offset="1" style:stop-color="var(--story-cell-bright)" stop-opacity="0" />
		</radialGradient>
		<linearGradient id="eclipse-band" x1="0" x2="1" y1="0" y2="0">
			<stop offset="0" stop-color="#7b5cff" />
			<stop offset="0.22" stop-color="#3f7bff" />
			<stop offset="0.4" stop-color="#2fc4d8" />
			<stop offset="0.55" stop-color="#4fd36b" />
			<stop offset="0.7" stop-color="#f2e04b" />
			<stop offset="0.85" stop-color="#f29a3b" />
			<stop offset="1" stop-color="#e5463b" />
		</linearGradient>
	</defs>

	<circle class="corona" cx={SUN_X} cy={SUN_Y} r={SUN_RADIUS * 2} fill="url(#eclipse-corona)" />
	<circle class="moon" cx={SUN_X} cy={SUN_Y} r={SUN_RADIUS} />

	<rect x="60" y="122" width="200" height="18" fill="url(#eclipse-band)" />
	<!-- 노란 영역 위에서도 보이도록 바탕색 테두리 위에 밝은 선을 겹친다. -->
	<g class="new-line">
		<line class="outline" x1={NEW_LINE_X} y1="116" x2={NEW_LINE_X} y2="146" />
		<line class="core" x1={NEW_LINE_X} y1="116" x2={NEW_LINE_X} y2="146" />
	</g>

	<text class="concept" x="312" y="154" text-anchor="end">개념도</text>
</svg>

<style>
	.scene {
		display: block;
		width: 100%;
		height: auto;
	}

	.corona {
		transform-box: fill-box;
		transform-origin: center;
		animation: spread 4s ease-in-out infinite alternate;
	}

	.moon {
		fill: var(--story-bg);
		stroke: color-mix(in srgb, var(--story-text) 35%, transparent);
		stroke-width: 1;
	}

	.new-line {
		animation: blink 1.6s steps(1, end) infinite;
	}

	.outline {
		stroke: var(--story-bg);
		stroke-width: 7;
	}

	.core {
		stroke: var(--story-text);
		stroke-width: 3;
	}

	.concept {
		fill: var(--story-muted);
		font-size: 11px;
	}

	@keyframes spread {
		from {
			transform: scale(0.9);
			opacity: 0.75;
		}
		to {
			transform: scale(1.08);
			opacity: 1;
		}
	}

	/* 한 주기(1.6초)의 절반은 보이고 절반은 사라진다. */
	@keyframes blink {
		0% {
			opacity: 1;
		}
		50% {
			opacity: 0;
		}
	}

	/* 동작 줄이기: 코로나는 펼친 상태, 선은 보이는 상태로 멈춘다. */
	@media (prefers-reduced-motion: reduce) {
		.corona,
		.new-line {
			animation: none;
		}
	}
</style>
