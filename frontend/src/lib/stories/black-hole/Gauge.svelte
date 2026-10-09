<script lang="ts">
	// 상단 계기판: "중심까지 약 N km · 여기 머문다면 바깥 1시간 = M분"(M87 질량 · 경계 배수로 계산), 숫자가 없는 장은 글 한 줄.
	// 휴대폰 폭에서는 두 부분을 두 줄로 나눠 48px 띠 안에 다 보이게 한다.
	import GaugeBar from '#lib/story/GaugeBar.svelte';
	import type { GaugeReading } from './fallMath.ts';

	type Props = { reading: GaugeReading } | { text: string };

	let props: Props = $props();
</script>

<GaugeBar>
	{#if 'reading' in props}
		<p class="line split">
			<span class="part">{props.reading.distance}</span>
			<span class="separator" aria-hidden="true">·</span>
			<span class="part">{props.reading.time}</span>
		</p>
	{:else}
		<p class="line">{props.text}</p>
	{/if}
</GaugeBar>

<style>
	.line {
		margin: 0;
		overflow: hidden;
		color: var(--story-text);
		font-size: 0.9375rem;
		font-variant-numeric: tabular-nums;
		text-align: center;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.part:first-child {
		color: var(--story-cell-on);
		font-weight: 700;
	}

	.separator {
		margin: 0 0.375rem;
		color: var(--story-muted);
	}

	@media (max-width: 599px) {
		.line.split {
			font-size: 0.8125rem;
			line-height: 1.3;
		}

		.split .part {
			display: block;
		}

		.split .separator {
			display: none;
		}
	}
</style>
