<script lang="ts">
	// 질문 목록(1~7장 고정 상자): 장마다 질문 하나. 지금 장의 질문이 켜지고, 그 장 본문을 지나면 답이 채워진다(지난 장의 답은 남는다).
	// PC(1024px 이상)는 카드 반대편(오른쪽) 위에 일곱 줄을 늘 펼쳐 두고, 휴대폰은 계기판 아래 한 줄(지금 질문)만 두고 누를 때만 펼친다.
	// 끝 장(8장)에서는 이 상자를 쓰지 않고 카드 안 목록(QuestionSummary)으로 보인다.
	type TrailRow = {
		id: string;
		number: number;
		question: string;
		// 대조에 걸려 숨긴 답은 null
		answer: string | null;
		answered: boolean;
	};

	type Props = {
		rows: TrailRow[];
		currentId: string;
	};

	let { rows, currentId }: Props = $props();

	const LIST_ID = 'sunken-question-list';
	let toggleButton: HTMLButtonElement;

	// 펼침은 누를 때만. 장 id 만 읽어 두어 장이 바뀌면 다시 계산돼 접히고(false), 누르면 이 값을 덮어쓴다(쓰기 가능한 $derived).
	let expanded = $derived.by(() => {
		void currentId;
		return false;
	});
	const current = $derived(rows.find((row) => row.id === currentId));
	const answeredCount = $derived(rows.filter((row) => row.answered && row.answer !== null).length);

	function toggle(): void {
		expanded = !expanded;
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || !expanded) return;
		expanded = false;
		toggleButton.focus();
	}
</script>

<nav class="trail" aria-label="질문 목록">
	<button
		class="toggle"
		type="button"
		aria-expanded={expanded}
		aria-controls={LIST_ID}
		bind:this={toggleButton}
		onclick={toggle}
		onkeydown={onKeydown}
	>
		{#if current === undefined}
			<span class="toggle-text">질문 {rows.length}개 · 답 {answeredCount}개</span>
		{:else}
			<span class="toggle-number">{current.number}/{rows.length}</span>
			<span class="toggle-text">{current.question}</span>
			{#if current.answered && current.answer !== null}
				<span class="toggle-done" aria-label="답 채움">✓</span>
			{/if}
		{/if}
		<span class="chevron" aria-hidden="true">{expanded ? '▴' : '▾'}</span>
	</button>
	<p class="heading" aria-hidden="true">질문 목록</p>
	<ol id={LIST_ID} class="list" class:open={expanded}>
		{#each rows as row (row.id)}
			{@const shown = row.answered && row.answer !== null}
			<li
				class:current={row.id === currentId}
				class:answered={shown}
				aria-current={row.id === currentId ? 'step' : undefined}
				data-question={row.id}
			>
				<span class="number" aria-hidden="true">{row.number}</span>
				<div class="text">
					<p class="question">{row.question}</p>
					{#if shown}
						<p class="answer" data-answer={row.id}>{row.answer}</p>
					{/if}
				</div>
			</li>
		{/each}
	</ol>
</nav>

<style>
	/* 휴대폰: 계기판(48px) 바로 아래 한 줄. 펼치면 목록이 그 아래로 내려온다.
	   바탕은 불투명(카드와 같은 테마 표면색)으로 두어 아래 카드 글자가 비치지 않게 한다. */
	.trail {
		position: fixed;
		top: 48px;
		right: 0;
		left: 0;
		z-index: 2;
		background: color-mix(in srgb, var(--story-bg) 88%, black);
		border-bottom: 1px solid var(--story-cell-off);
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 44px;
		padding: 0 1rem;
		border: 0;
		background: transparent;
		color: var(--story-text);
		font: inherit;
		font-size: 0.875rem;
		text-align: left;
		cursor: pointer;
	}

	.toggle:focus-visible {
		outline: 3px solid var(--story-text);
		outline-offset: -3px;
	}

	.toggle-number {
		flex: none;
		color: var(--story-cell-on);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.toggle-text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.toggle-done {
		flex: none;
		color: var(--story-cell-on);
		font-weight: 700;
	}

	.chevron {
		flex: none;
		color: var(--story-muted);
	}

	.heading {
		display: none;
	}

	/* 펼친 높이는 내용 높이와 화면 60% 중 작은 쪽. 넘치면 상자 안에서만 스크롤한다(페이지로 번지지 않게). */
	.list {
		display: none;
		max-height: 60svh;
		margin: 0;
		padding: 0 1rem 0.75rem;
		overflow-y: auto;
		overscroll-behavior: contain;
		list-style: none;
	}

	.list.open {
		display: grid;
		gap: 0.375rem;
	}

	li {
		display: flex;
		gap: 0.5rem;
		padding: 0.25rem 0.5rem;
		border-left: 2px solid transparent;
		color: var(--story-muted);
	}

	li.current {
		border-left-color: var(--story-cell-on);
		color: var(--story-text);
	}

	.number {
		flex: none;
		width: 1rem;
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
		animation: answer-in 0.6s ease-out;
	}

	@keyframes answer-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.answer {
			animation: none;
		}
	}

	/* PC: 카드 반대편(오른쪽) 위에 일곱 줄을 늘 펼친다. 1600px 구도의 오른쪽 끝에 맞춘다. */
	@media (min-width: 1024px) {
		.trail {
			top: calc(48px + 1rem);
			right: calc(max(0px, (100vw - 1600px) / 2) + 2rem);
			left: auto;
			width: 300px;
			padding: 0.75rem 0.5rem 0.75rem 0.75rem;
			border: 1px solid var(--story-cell-off);
			border-radius: 12px;
			box-sizing: border-box;
		}

		.toggle {
			display: none;
		}

		.heading {
			display: block;
			margin: 0 0 0.375rem;
			color: var(--story-muted);
			font-size: 0.75rem;
			font-weight: 700;
		}

		.list,
		.list.open {
			display: grid;
			gap: 0.25rem;
			max-height: none;
			padding: 0;
			overflow: visible;
		}
	}
</style>
