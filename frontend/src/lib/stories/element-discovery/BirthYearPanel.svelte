<script lang="ts">
	// 출생 연도 비교: 연도를 넣으면 그해까지 알려진 원소 수와 그 뒤 발견 수, 그 뒤 가장 최근 발견을 보여 준다.
	import CountUp from '../../story/CountUp.svelte';
	import { templateParts } from '../../story/storyConfig.ts';
	import { compareWithYear, type BirthYearResult } from './birthYear.ts';
	import type { BirthYearConfig } from './config.ts';
	import { discoveryLabel, type StoryElement } from './elements.ts';

	type Props = { config: BirthYearConfig; elements: StoryElement[] };

	let { config, elements }: Props = $props();

	// 보는 사람 기기의 시간대 기준 올해(입력 상한). 발견 연도는 시간대 없는 연도 값이다.
	const currentYear = new Date().getFullYear();

	let input = $state<number | null>(null);
	let result = $state<BirthYearResult | null>(null);
	let invalid = $state(false);

	const parts = $derived(templateParts(config.result));

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		const year = input;
		if (year === null || !Number.isInteger(year) || year < config.minYear || year > currentYear) {
			invalid = true;
			result = null;
			return;
		}
		invalid = false;
		result = compareWithYear(elements, year);
	}

	function slotValue(current: BirthYearResult, name: string): number | null {
		if (name === 'known') return current.known;
		if (name === 'after') return current.after;
		return null;
	}
</script>

<form class="form" onsubmit={submit} novalidate>
	<label for="birth-year">태어난 해</label>
	<div class="row">
		<input
			id="birth-year"
			type="number"
			inputmode="numeric"
			min={config.minYear}
			max={currentYear}
			placeholder={String(currentYear - 30)}
			bind:value={input}
			aria-describedby="birth-year-hint"
		/>
		<button type="submit">확인</button>
	</div>
	<p id="birth-year-hint" class="hint" class:invalid aria-live="polite">
		{#if invalid}{config.minYear}년부터 {currentYear}년 사이의 연도를 넣어 주세요.{/if}
	</p>
</form>

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
	label {
		display: block;
		margin: 0 0 0.5rem;
		color: var(--story-muted);
		font-size: 0.9375rem;
	}

	.row {
		display: flex;
		gap: 0.5rem;
		max-width: 20rem;
	}

	input {
		flex: 1;
		min-width: 0;
		min-height: 48px;
		padding: 0 0.75rem;
		border: 1px solid var(--story-muted);
		border-radius: 8px;
		background: var(--story-cell-off);
		color: var(--story-text);
		font: inherit;
		font-size: 1.125rem;
		font-variant-numeric: tabular-nums;
	}

	button {
		min-width: 5rem;
		min-height: 48px;
		border: 0;
		border-radius: 8px;
		background: var(--story-cell-on);
		color: var(--story-bg);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	input:focus-visible,
	button:focus-visible {
		outline: 3px solid var(--story-text);
		outline-offset: 2px;
	}

	.hint {
		min-height: 1.5rem;
		margin: 0.5rem 0 0;
		font-size: 0.875rem;
	}

	.hint.invalid {
		color: var(--story-cell-bright);
	}

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
