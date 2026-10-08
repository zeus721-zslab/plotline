<script lang="ts">
	// 표지 퀴즈: 보기 하나를 누르면 정답을 강조하고 나머지는 흐리게, 정답 문구를 보여 준다. 다시 고를 수 없다.
	import { fillTemplate } from '../../story/storyConfig.ts';
	import type { QuizConfig } from './config.ts';

	type Props = { quiz: QuizConfig; answer: number; dated: number };

	let { quiz, answer, dated }: Props = $props();

	let chosen = $state<number | null>(null);

	const answerText = $derived(fillTemplate(quiz.answer, { ancient: answer, dated }));
</script>

<div class="quiz">
	<p class="question" id="quiz-question">{quiz.question}</p>
	<div class="choices" role="group" aria-labelledby="quiz-question">
		{#each quiz.choices as choice (choice)}
			<button
				type="button"
				class:correct={chosen !== null && choice === answer}
				class:faded={chosen !== null && choice !== answer}
				aria-pressed={chosen === choice}
				disabled={chosen !== null}
				onclick={() => (chosen = choice)}
			>
				{choice}개
			</button>
		{/each}
	</div>
	<p class="result" aria-live="polite">
		{#if chosen !== null}<span class="answer">{answerText}</span>{/if}
	</p>
</div>

<style>
	.quiz {
		margin: 2.5rem 0 0;
	}

	.question {
		margin: 0 0 0.75rem;
		font-size: 1.125rem;
		font-weight: 600;
	}

	.choices {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
		max-width: 24rem;
	}

	button {
		min-height: 48px;
		border: 1px solid var(--story-muted);
		border-radius: 8px;
		background: transparent;
		color: var(--story-text);
		font: inherit;
		font-size: 1.125rem;
		font-weight: 700;
		cursor: pointer;
		transition: opacity 300ms ease-out;
	}

	button:disabled {
		cursor: default;
	}

	button:focus-visible {
		outline: 3px solid var(--story-text);
		outline-offset: 2px;
	}

	button.correct {
		border-color: var(--story-cell-on);
		background: var(--story-cell-on);
		color: var(--story-bg);
	}

	button.faded {
		opacity: 0.4;
	}

	.result {
		min-height: 3.25rem;
		margin: 0.75rem 0 0;
	}

	.answer {
		display: block;
		animation: answer-in 400ms ease-out;
	}

	@keyframes answer-in {
		from {
			opacity: 0;
			transform: translateY(0.5rem);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none;
		}

		.answer {
			animation: none;
		}
	}
</style>
