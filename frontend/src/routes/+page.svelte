<script lang="ts">
	// 공개 첫 화면: 사이트 소개 + 스토리 표지 목록(목록은 클라이언트에서 index.json 을 읽는다).
	import { onMount } from 'svelte';
	import { loadStoryIndex } from '#lib/story/fetchPublished.ts';
	import LoadStatus from '#lib/story/LoadStatus.svelte';
	import type { StoryIndexEntry } from '#lib/story/published.ts';
	import StoryCoverCard from '#lib/story/StoryCoverCard.svelte';
	import { storyCover } from '#lib/stories/covers.ts';

	type ViewState =
		{ kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; stories: StoryIndexEntry[] };

	let view = $state<ViewState>({ kind: 'loading' });

	async function load(): Promise<void> {
		view = { kind: 'loading' };
		const result = await loadStoryIndex();
		// index.json 은 발행 순(오래된 것 먼저)이고 다음 이야기 링크가 그 순서를 따르므로, 화면에 그릴 때만 뒤집어 최신 발행을 맨 위에 둔다.
		view =
			result.kind === 'ok'
				? { kind: 'ready', stories: [...result.data.stories].reverse() }
				: { kind: 'error' };
	}

	onMount(() => {
		void load();
	});
</script>

<svelte:head>
	<title>Plotline</title>
	<meta name="description" content="숫자 몇 개로 읽는 긴 이야기" />
</svelte:head>

<main class="home">
	<header>
		<h1>Plotline</h1>
		<p class="tagline">숫자 몇 개로 읽는 긴 이야기</p>
	</header>

	<section aria-label="이야기 목록">
		{#if view.kind === 'ready'}
			{#if view.stories.length === 0}
				<p class="empty">아직 공개된 이야기가 없습니다</p>
			{:else}
				<ul class="stories">
					{#each view.stories as entry (entry.story)}
						{@const cover = storyCover(entry.story)}
						<li>
							<StoryCoverCard {entry} themeClass={cover.themeClass} preview={cover.preview} />
						</li>
					{/each}
				</ul>
			{/if}
		{:else}
			<LoadStatus status={view.kind} onretry={load} />
		{/if}
	</section>
</main>

<style>
	:global(body:has(.home)) {
		margin: 0;
		background: #f6f4ef;
	}

	.home {
		max-width: 1080px;
		min-height: 100svh;
		margin: 0 auto;
		padding: 2.5rem 1rem 4rem;
		box-sizing: border-box;
		color: #17203a;
		font-family: 'IBM Plex Sans KR', system-ui, sans-serif;
	}

	header {
		margin-bottom: 2rem;
	}

	h1 {
		margin: 0;
		font-size: 1.75rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.tagline {
		margin: 0.25rem 0 0;
		color: #4a5574;
	}

	.stories {
		display: grid;
		gap: 1.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.empty {
		color: #4a5574;
	}

	@media (min-width: 960px) {
		.home {
			padding: 4rem 2rem;
		}

		h1 {
			font-size: 2.25rem;
		}
	}
</style>
