<script lang="ts">
	// 단계 곁들임 카드 1장. 사실(fact)과 전해지는 이야기(legend)를 색뿐 아니라 라벨·테두리 모양으로도 구분한다.
	// 화면에 처음 들어올 때 한 번 0.3초 동안 나타나고, 동작 줄이기면 처음부터 보인다.
	import { onMount } from 'svelte';
	import type { AsideKind, StepAside } from './steps.ts';
	import type { CopySource } from './storyConfig.ts';
	import StoryFigure from './StoryFigure.svelte';
	import type { StoryImage } from './storyMedia.ts';

	type Props = { aside: StepAside; sources: CopySource[]; image: StoryImage | null };

	let { aside, sources, image }: Props = $props();

	const LABELS: Record<AsideKind, string> = { fact: '알고 보면', legend: '전해지는 이야기' };

	let box: HTMLElement;
	let shown = $state(false);

	onMount(() => {
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				shown = true;
				observer.disconnect();
			}
		});
		observer.observe(box);
		return () => observer.disconnect();
	});
</script>

<aside
	bind:this={box}
	class="aside {aside.kind}"
	class:shown
	data-aside-kind={aside.kind}
	aria-label={LABELS[aside.kind]}
>
	<p class="label">{LABELS[aside.kind]}</p>
	{#if image !== null}
		<StoryFigure {image} />
	{/if}
	<p class="text">{aside.text}</p>
	{#if sources.length > 0}
		<ul class="sources" aria-label="곁들임 출처">
			{#each sources as source (source.id)}
				<li>
					<a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
				</li>
			{/each}
		</ul>
	{/if}
</aside>

<style>
	.aside {
		margin: 1rem 0 0;
		padding: 0.875rem 1rem 0.25rem;
		border-radius: 10px;
		opacity: 0;
	}

	.aside.shown {
		animation: appear 0.3s ease-out forwards;
	}

	.fact {
		border: 1px solid var(--story-muted);
	}

	.legend {
		border: 2px dashed var(--story-legend);
		background: color-mix(in srgb, var(--story-legend) 8%, transparent);
	}

	.label {
		margin: 0;
		font-size: 0.8125rem;
		font-weight: 700;
	}

	.fact .label {
		color: var(--story-muted);
	}

	.legend .label {
		color: var(--story-legend);
	}

	.text {
		margin: 0.375rem 0 0;
		font-size: 0.9375rem;
	}

	.sources {
		display: flex;
		flex-wrap: wrap;
		gap: 0 1rem;
		margin: 0;
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

	@keyframes appear {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.aside,
		.aside.shown {
			opacity: 1;
			animation: none;
		}
	}
</style>
