<script lang="ts">
	// 5장 가까운 별 연도 되감기: 별마다 빛이 떠난 해를 계산된 연도 문구로 보여 준다.
	import { departureYear, distanceText, yearLabel } from './lightTime.ts';
	import type { SkyObject } from './skyData.ts';

	type Props = { stars: SkyObject[]; currentYear: number };

	let { stars, currentYear }: Props = $props();
</script>

<ol class="stars">
	{#each stars as star (star.id)}
		{@const leftYear = departureYear(star, currentYear)}
		<li>
			<span class="name">{star.nameKo}</span>
			<span class="distance">{distanceText(star)}</span>
			<span class="left">{yearLabel(leftYear)}의 모습</span>
		</li>
	{/each}
</ol>

<style>
	.stars {
		display: grid;
		gap: 0.75rem;
		margin: 1rem 0 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.125rem 0.625rem;
		padding: 0.625rem 0.75rem;
		border-radius: 8px;
		background: var(--story-cell-off);
	}

	.name {
		font-weight: 700;
	}

	.distance {
		color: var(--story-muted);
		font-size: 0.875rem;
	}

	.left {
		flex-basis: 100%;
		color: var(--story-cell-on);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
</style>
