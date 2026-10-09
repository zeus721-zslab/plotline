<script lang="ts">
	// 출생 연도 입력: 연도를 넣고 확인을 누르면 범위(minYear ~ 올해)를 검사해 onresult 로 알린다(범위 밖이면 null).
	// 결과를 어떻게 보일지는 스토리마다 다르므로 이 부품은 입력과 안내 문장만 맡는다.
	type Props = { minYear: number; onresult: (year: number | null) => void };

	let { minYear, onresult }: Props = $props();

	// 보는 사람 기기의 시간대 기준 올해(입력 상한).
	const currentYear = new Date().getFullYear();

	let input = $state<number | null>(null);
	let invalid = $state(false);

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		const year = input;
		if (year === null || !Number.isInteger(year) || year < minYear || year > currentYear) {
			invalid = true;
			onresult(null);
			return;
		}
		invalid = false;
		onresult(year);
	}
</script>

<form class="form" onsubmit={submit} novalidate>
	<label for="birth-year">태어난 해</label>
	<div class="row">
		<input
			id="birth-year"
			type="number"
			inputmode="numeric"
			min={minYear}
			max={currentYear}
			placeholder={String(currentYear - 30)}
			bind:value={input}
			aria-describedby="birth-year-hint"
		/>
		<button type="submit">확인</button>
	</div>
	<p id="birth-year-hint" class="hint" class:invalid aria-live="polite">
		{#if invalid}{minYear}년부터 {currentYear}년 사이의 연도를 넣어 주세요.{/if}
	</p>
</form>

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
</style>
