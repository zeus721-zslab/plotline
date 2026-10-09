<script lang="ts">
	// 출생 연도 비교: 연도를 넣으면 그해까지 알려진 원소 수와 그 뒤 발견 수, 그 뒤 가장 최근 발견을 보여 준다.
	// 입력과 범위 검사는 공통 부품(BirthYearInput)이 맡는다.
	import BirthYearInput from '../../story/BirthYearInput.svelte';
	import CountUp from '../../story/CountUp.svelte';
	import { templateParts } from '../../story/storyConfig.ts';
	import { compareWithYear, type BirthYearResult } from './birthYear.ts';
	import type { BirthYearConfig } from './config.ts';
	import { discoveryLabel, type StoryElement } from './elements.ts';

	type Props = { config: BirthYearConfig; elements: StoryElement[] };

	let { config, elements }: Props = $props();

	let result = $state<BirthYearResult | null>(null);

	const parts = $derived(templateParts(config.result));

	function showResult(year: number | null): void {
		result = year === null ? null : compareWithYear(elements, year);
	}

	function slotValue(current: BirthYearResult, name: string): number | null {
		if (name === 'known') return current.known;
		if (name === 'after') return current.after;
		return null;
	}
</script>

<BirthYearInput minYear={config.minYear} onresult={showResult} />

{#if result !== null}
	<div class="result" aria-live="polite">
		<p class="sentence">
			{#each parts as part, index (index)}
				{#if part.kind === 'text'}{part.text}{:else if part.name === 'year'}{result.year}{:else}
					{@const value = slotValue(result, part.name)}
					{#if value === null}{`{${part.name}}`}{:else}<strong
							><CountUp {value} play={true} /></strong
						>{/if}
				{/if}
			{/each}
		</p>
		{#if result.recent.length > 0}
			<p class="recent-title">그 뒤 가장 최근에 발견된 원소</p>
			<ul class="recent">
				{#each result.recent as element (element.atomicNumber)}
					<li>{element.name} <span class="year">{discoveryLabel(element.discovery)}</span></li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<style>
	.result {
		margin: 1rem 0 0;
	}

	.sentence {
		margin: 0;
		font-size: 1.125rem;
	}

	.sentence strong {
		color: var(--story-cell-on);
		font-size: 1.5rem;
		font-variant-numeric: tabular-nums;
	}

	.recent-title {
		margin: 1rem 0 0.5rem;
		color: var(--story-muted);
		font-size: 0.9375rem;
	}

	.recent {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem 0.875rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.year {
		color: var(--story-muted);
		font-size: 0.875rem;
	}
</style>
