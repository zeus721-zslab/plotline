<script lang="ts">
	// 5장 가까운 별 연도 되감기: 별마다 빛이 떠난 해. 출생 연도를 넣으면 "당신이 N살 때" · "태어나기 N년 전"을 잇는다.
	import BirthYearInput from '../../story/BirthYearInput.svelte';
	import { birthRelation, departureYear, distanceText, yearLabel } from './lightTime.ts';
	import type { SkyObject } from './skyData.ts';

	type Props = { stars: SkyObject[]; currentYear: number };

	let { stars, currentYear }: Props = $props();

	// 1편 출생 연도 입력과 같은 하한
	const MIN_BIRTH_YEAR = 1900;

	let birthYear = $state<number | null>(null);
</script>

<ol class="stars">
	{#each stars as star (star.id)}
		{@const leftYear = departureYear(star, currentYear)}
		<li>
			<span class="name">{star.nameKo}</span>
			<span class="distance">{distanceText(star)}</span>
			<span class="left">{yearLabel(leftYear)}에 떠난 빛</span>
			{#if birthYear !== null}
				<span class="relation">{birthRelation(leftYear, birthYear)}</span>
			{/if}
		</li>
	{/each}
</ol>

<div class="birth">
	<BirthYearInput minYear={MIN_BIRTH_YEAR} onresult={(year) => (birthYear = year)} />
</div>

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

	.relation {
		flex-basis: 100%;
		color: var(--story-text);
	}

	.birth {
		margin-top: 1.25rem;
	}
</style>
