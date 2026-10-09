<script lang="ts">
	// 첫 화면 스토리 표지 1장: 질문 문장(없으면 제목) · 요약 · 스토리별 미리보기 그림.
	// 테마 클래스와 그림은 스토리마다 다르므로 부르는 쪽이 넘긴다.
	import type { Component } from 'svelte';
	import type { StoryIndexEntry } from './published.ts';

	type Props = { entry: StoryIndexEntry; themeClass: string; preview: Component | null };

	let { entry, themeClass, preview: Preview }: Props = $props();
</script>

<a class="cover {themeClass}" href="/stories/{entry.story}">
	<span class="question">{entry.question === undefined ? entry.title : entry.question}</span>
	<span class="summary">{entry.summary}</span>
	{#if Preview !== null}
		<span class="preview"><Preview /></span>
	{/if}
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
