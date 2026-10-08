<script lang="ts">
	// 퀴리 노트 그림: 회색 납 상자 안의 실험 노트, 상자 바깥으로 방사 표시 고리가 천천히 퍼진다.
	const CENTER_X = 160;
	const CENTER_Y = 80;
	// 고리 3개가 한 주기를 나눠 차례로 퍼진다.
	const RING_COUNT = 3;
	const rings = Array.from({ length: RING_COUNT }, (_, order) => order);
</script>

<svg
	class="scene"
	viewBox="0 0 320 160"
	role="img"
	aria-label="회색 납 상자 안에 실험 노트가 들어 있고, 상자 바깥으로 방사선을 나타내는 고리가 퍼지는 그림."
>
	{#each rings as order (order)}
		<circle class="ring" style:--order={order} cx={CENTER_X} cy={CENTER_Y} r="62" />
	{/each}

	<!-- 납 상자(뚜껑 열린 단면) -->
	<rect class="box" x="104" y="44" width="112" height="82" rx="4" />
	<rect class="box-inner" x="114" y="54" width="92" height="64" rx="2" />
	<rect class="lid" x="98" y="34" width="124" height="12" rx="3" />

	<!-- 노트 -->
	<rect class="note" x="130" y="62" width="60" height="48" rx="2" />
	<line class="note-spine" x1="136" y1="62" x2="136" y2="110" />
	{#each [74, 84, 94] as y (y)}
		<line class="note-line" x1="142" y1={y} x2="182" y2={y} />
	{/each}
</svg>

<style>
	.scene {
		display: block;
		width: 100%;
		height: auto;
	}

	.ring {
		fill: none;
		stroke: var(--story-cell-on);
		stroke-width: 2;
		transform-box: fill-box;
		transform-origin: center;
		opacity: 0;
		animation: spread 6s linear infinite;
		animation-delay: calc(var(--order) * -2s);
	}

	.box {
		fill: #6f7684;
	}

	.box-inner {
		fill: #3c424e;
	}

	.lid {
		fill: #8a919e;
	}

	.note {
		fill: #efe6cf;
	}

	.note-spine {
		stroke: #b79a62;
		stroke-width: 2;
	}

	.note-line {
		stroke: #9b8f74;
		stroke-width: 1.5;
	}

	@keyframes spread {
		from {
			transform: scale(1);
			opacity: 0.9;
		}
		to {
			transform: scale(1.9);
			opacity: 0;
		}
	}

	/* 동작 줄이기: 고리 3개를 서로 다른 크기로 펼친 상태로 멈춘다. */
	@media (prefers-reduced-motion: reduce) {
		.ring {
			animation: none;
			opacity: 0.6;
			transform: scale(calc(1.1 + var(--order) * 0.3));
		}
	}
</style>
