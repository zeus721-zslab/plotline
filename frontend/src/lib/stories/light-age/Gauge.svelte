<script lang="ts">
	// 상단 계기판 한 줄: "빛으로 {빛 이동 시간} · {빛이 떠난 때}". 단위 단계가 바뀔 때만(changeCount 증가) 강조한다.
	type Props = { travel: string; departure: string; changeCount: number };

	let { travel, departure, changeCount }: Props = $props();
</script>

<div class="gauge">
	<p class="line">
		{#key changeCount}
			<span class="travel" class:changed={changeCount > 0}>빛으로 {travel}</span>
		{/key}
		<span class="separator" aria-hidden="true">·</span>
		<span class="departure">{departure}</span>
	</p>
</div>

<style>
	.gauge {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: center;
		/* 휴대폰 높이(844px)의 6% 안팎. 고정 영역은 이 한 줄뿐이다. */
		height: 48px;
		padding: 0 1rem;
		box-sizing: border-box;
		background: color-mix(in srgb, var(--story-bg) 82%, transparent);
		border-bottom: 1px solid var(--story-cell-off);
	}

	.line {
		margin: 0;
		overflow: hidden;
		font-size: 0.9375rem;
		font-variant-numeric: tabular-nums;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.travel {
		color: var(--story-cell-on);
		font-weight: 700;
	}

	.travel.changed {
		animation: unit-change 1.2s ease-out;
	}

	.separator {
		margin: 0 0.375rem;
		color: var(--story-muted);
	}

	.departure {
		color: var(--story-text);
	}

	@keyframes unit-change {
		0% {
			color: var(--story-cell-bright);
			text-shadow: 0 0 12px var(--story-cell-on);
		}
		100% {
			text-shadow: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.travel.changed {
			animation: none;
		}
	}
</style>
