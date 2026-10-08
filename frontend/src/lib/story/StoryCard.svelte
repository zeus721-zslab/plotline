<script lang="ts">
	// 스토리 단계 카드 틀: 그림 · 단계 이름 · 제목 · 이야기 · 곁들임 카드 · (스토리별 내용) · 문구 출처.
	import type { Snippet } from 'svelte';
	import Aside from './Aside.svelte';
	import type { CopySource } from './storyConfig.ts';
	import type { StoryImage } from './storyMedia.ts';
	import type { StepAside } from './storySteps.ts';

	type Props = {
		label: string;
		title: string;
		// 자리 채움이 끝난 문구
		body: string;
		// 문구가 데이터와 대조를 통과했는가. 아니면 그림·제목·이야기·곁들임·문구 출처를 숨긴다.
		verified: boolean;
		sources: CopySource[];
		aside: StepAside | null;
		asideSources: CopySource[];
		asideImage: StoryImage | null;
		// 카드 맨 위 그림
		media?: Snippet;
		// 곁들임 카드 아래 · 문구 출처 위에 놓을 스토리별 내용(대조 결과와 관계없이 보인다)
		children?: Snippet;
	};

	let {
		label,
		title,
		body,
		verified,
		sources,
		aside,
		asideSources,
		asideImage,
		media,
		children
	}: Props = $props();
</script>

<article class="card">
	{#if verified && media !== undefined}
		{@render media()}
	{/if}
	<p class="label">{label}</p>
	{#if verified}
		<h3>{title}</h3>
		<p class="body">{body}</p>
		{#if aside !== null}
			<Aside {aside} sources={asideSources} image={asideImage} />
		{/if}
	{/if}
	{#if children !== undefined}
		{@render children()}
	{/if}
	{#if verified && sources.length > 0}
		<ul class="sources" aria-label="문구 출처">
			{#each sources as source (source.id)}
				<li>
					<a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
				</li>
			{/each}
		</ul>
	{/if}
</article>

<style>
	.card {
		padding: 1.25rem 1.25rem 1rem;
		border: 1px solid var(--story-cell-off);
		border-radius: 12px;
		background: color-mix(in srgb, var(--story-bg) 88%, black);
	}

	.label {
		margin: 0;
		color: var(--story-cell-on);
		font-size: 0.9375rem;
		font-weight: 700;
	}

	h3 {
		margin: 0.25rem 0 0;
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1.4;
	}

	.body {
		margin: 0.625rem 0 0;
	}

	.sources {
		display: flex;
		flex-wrap: wrap;
		gap: 0 1rem;
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
	}

	.sources a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--story-muted);
		font-size: 0.8125rem;
	}

	.sources a:focus-visible {
		outline: 3px solid var(--story-text);
		outline-offset: 2px;
	}
</style>
