<script lang="ts">
	// 50년 구간별 발견 수 가로 막대. 화면에 처음 들어올 때 한 번만 채운다. 강조 구간만 강조색으로 칠한다.
	import { onMount } from 'svelte';
	import type { DiscoveryBin } from './discoveryBins.ts';

	type Props = { bins: DiscoveryBin[]; highlightId: string | null };

	let { bins, highlightId }: Props = $props();

	let container: HTMLElement;
	let filled = $state(false);

	const maxCount = $derived(Math.max(1, ...bins.map((bin) => bin.count)));

	onMount(() => {
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				filled = true;
				observer.disconnect();
			}
		});
		observer.observe(container);
		return () => observer.disconnect();
	});
</script>

<ol class="bars" bind:this={container}>
	{#each bins as bin (bin.id)}
		<li class="bar-row" class:busiest={bin.id === highlightId}>
			<span class="bar-label">{bin.label}</span>
			<span class="track" aria-hidden="true">
				<span class="fill" style:width="{filled ? (bin.count / maxCount) * 100 : 0}%"></span>
			</span>
			<span class="bar-count">{bin.count}개</span>
		</li>
	{/each}
</ol>

<style>
	.bars {
		display: grid;
		gap: 0.625rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.bar-row {
		display: grid;
		grid-template-columns: 6.5rem 1fr 3rem;
		align-items: center;
		gap: 0.75rem;
	}

	.bar-label {
		color: var(--story-muted);
		font-size: 0.875rem;
		font-variant-numeric: tabular-nums;
	}

	.track {
		height: 1.25rem;
		border-radius: 3px;
		background: var(--story-cell-off);
		overflow: hidden;
	}

	.fill {
		display: block;
		height: 100%;
		background: var(--story-muted);
		transition: width 700ms ease-out;
	}

	.busiest .fill {
		background: var(--story-cell-on);
	}

	.busiest .bar-label,
	.busiest .bar-count {
		color: var(--story-cell-on);
	}

	.bar-count {
		text-align: right;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	@media (prefers-reduced-motion: reduce) {
		.fill {
			transition: none;
		}
	}
</style>
