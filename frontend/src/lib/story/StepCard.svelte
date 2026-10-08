<script lang="ts">
	// 시그니처 장면 단계 카드 1장: 그림 · 단계 이름 · 제목 · 이야기 · 곁들임 카드 · 문구 출처 · 그때까지 알려진 원소 수.
	import Aside from './Aside.svelte';
	import CountUp from './CountUp.svelte';
	import StepMedia from './StepMedia.svelte';
	import type { StepSummary } from './steps.ts';
	import { fillTemplate, type CopySource } from './storyConfig.ts';
	import type { ResolvedMedia, StoryImage } from './storyMedia.ts';

	type Props = {
		summary: StepSummary;
		total: number;
		// 직전 단계의 알려진 원소 수(이 단계가 켜질 때 여기서부터 센다)
		previousCount: number;
		active: boolean;
		// 문구가 데이터와 대조를 통과했는가. 아니면 그림·제목·이야기·곁들임·출처를 숨긴다.
		verified: boolean;
		sources: CopySource[];
		media: ResolvedMedia | null;
		asideSources: CopySource[];
		asideImage: StoryImage | null;
	};

	let {
		summary,
		total,
		previousCount,
		active,
		verified,
		sources,
		media,
		asideSources,
		asideImage
	}: Props = $props();

	const count = $derived(summary.knownNumbers.size);
	const body = $derived(fillTemplate(summary.step.body, { count }));
</script>

<article class="card">
	{#if verified && media !== null}
		<StepMedia {media} {active} />
	{/if}
	<p class="label">{summary.step.label}</p>
	{#if verified}
		<h3>{summary.step.title}</h3>
		<p class="body">{body}</p>
		{#if summary.step.aside !== null}
			<Aside aside={summary.step.aside} sources={asideSources} image={asideImage} />
		{/if}
	{/if}
	<p class="count">
		<span class="count-value"><CountUp value={count} from={previousCount} play={active} /></span>
		<span class="count-unit">/ {total}개 알려짐</span>
	</p>
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

	.count {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin: 1rem 0 0;
	}

	.count-value {
		font-size: 3rem;
		font-weight: 700;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.count-unit {
		color: var(--story-muted);
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
