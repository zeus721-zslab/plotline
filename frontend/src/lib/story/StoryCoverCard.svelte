<script lang="ts">
	// 첫 화면 스토리 표지 1장: 질문 문장 · 요약 · 작은 주기율표 미리보기.
	import PeriodicPreview from './PeriodicPreview.svelte';
	import type { StoryIndexEntry } from './published.ts';
	import './theme.css';

	type Props = { entry: StoryIndexEntry };

	let { entry }: Props = $props();
</script>

<a class="cover story-theme" href="/stories/{entry.story}">
	<span class="question">{entry.question}</span>
	<span class="summary">{entry.summary}</span>
	<span class="preview"><PeriodicPreview /></span>
</a>

<style>
	.cover {
		display: grid;
		gap: 1rem;
		padding: 1.75rem 1.25rem 1.5rem;
		border-radius: 16px;
		text-decoration: none;
	}

	.cover:focus-visible {
		outline: 3px solid var(--story-bg);
		outline-offset: 3px;
	}

	.question {
		font-size: 1.75rem;
		font-weight: 700;
		line-height: 1.3;
		word-break: keep-all;
	}

	.summary {
		color: var(--story-muted);
		line-height: 1.6;
		word-break: keep-all;
	}

	.preview {
		display: block;
		margin-top: 0.5rem;
	}

	@media (min-width: 960px) {
		.cover {
			grid-template-columns: 1fr 1fr;
			align-items: center;
			padding: 2.5rem;
		}

		.question {
			font-size: 2.25rem;
		}

		.preview {
			grid-column: 2;
			grid-row: 1 / span 2;
		}
	}
</style>
