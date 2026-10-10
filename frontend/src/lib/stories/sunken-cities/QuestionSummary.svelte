<script lang="ts">
	// 끝 장(8장) 카드 안 질문 목록: 1~7장 질문과 답을 본문 앞에 일반 블록으로 그린다(고정 상자를 펼치지 않는다).
	type SummaryRow = {
		id: string;
		number: number;
		question: string;
		// 대조에 걸려 숨긴 답은 null
		answer: string | null;
		answered: boolean;
		// 답 아래 흐린 한 줄(아틀란티스: 남은 흔적). 없으면 null.
		remains: string | null;
	};

	type Props = { rows: SummaryRow[] };

	let { rows }: Props = $props();
</script>

<section class="summary" aria-label="질문 목록">
	<ol class="list">
		{#each rows as row (row.id)}
			{@const shown = row.answered && row.answer !== null}
			<li data-summary={row.id}>
				<span class="number" aria-hidden="true">{row.number}</span>
				<div class="text">
					<p class="question">{row.question}</p>
					{#if shown}
						<p class="answer">{row.answer}</p>
						{#if row.remains !== null}
							<p class="remains" data-remains={row.id}>{row.remains}</p>
						{/if}
					{/if}
				</div>
			</li>
		{/each}
	</ol>
</section>

<style>
	.summary {
		margin: 0.625rem 0 0;
	}

	.list {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		gap: 0.5rem;
	}

	.number {
		flex: none;
		width: 1rem;
		color: var(--story-muted);
		font-size: 0.8125rem;
		font-variant-numeric: tabular-nums;
		line-height: 1.5;
	}

	.text {
		min-width: 0;
	}

	.question {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
		line-height: 1.5;
	}

	.answer {
		margin: 0.125rem 0 0;
		color: var(--story-cell-on);
		font-size: 0.8125rem;
		line-height: 1.45;
	}

	.remains {
		margin: 0.125rem 0 0;
		color: var(--story-muted);
		font-size: 0.8125rem;
		line-height: 1.45;
	}
</style>
