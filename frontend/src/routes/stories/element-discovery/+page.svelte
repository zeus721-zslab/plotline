<script lang="ts">
	// 원소 발견사 스토리: 표지 → 시그니처 장면 → 50년 구간 막대 → 직접 찾아보기 → 출처.
	// 페이지 틀은 프리렌더하고 데이터는 클라이언트에서 /data/ 를 읽는다.
	import { onMount } from 'svelte';
	import DecadeBars from '#lib/stories/element-discovery/DecadeBars.svelte';
	import { binDiscoveries, busiestBin } from '#lib/stories/element-discovery/discoveryBins.ts';
	import ElementSheet from '#lib/stories/element-discovery/ElementSheet.svelte';
	import {
		ELEMENT_DISCOVERY_CONFIG,
		ELEMENT_DISCOVERY_IMAGES,
		hiddenCopyTargets,
		loadElementDiscovery,
		shownCopySources,
		type ElementDiscoveryData
	} from '#lib/stories/element-discovery/elementDiscovery.ts';
	import type { StoryElement } from '#lib/stories/element-discovery/elements.ts';
	import LoadStatus from '#lib/story/LoadStatus.svelte';
	import PeriodicGrid from '#lib/stories/element-discovery/PeriodicGrid.svelte';
	import SignatureScene from '#lib/stories/element-discovery/SignatureScene.svelte';
	import SourceList from '#lib/story/SourceList.svelte';
	import { summarizeSteps } from '#lib/stories/element-discovery/steps.ts';
	import { fillTemplate } from '#lib/story/storyConfig.ts';
	import '#lib/stories/element-discovery/theme.css';

	type ViewState =
		| { kind: 'loading' }
		| { kind: 'error' }
		| { kind: 'ready'; data: ElementDiscoveryData; hiddenTargets: Set<string> };

	const SITE_NAME = 'Plotline';
	const SOURCE_NOTE = '발견 연도는 PubChem 표기를 그대로 따릅니다.';

	let view = $state<ViewState>({ kind: 'loading' });
	let selected = $state<StoryElement | null>(null);
	let selectedTrigger: HTMLButtonElement | null = null;

	const ready = $derived(view.kind === 'ready' ? view.data : null);
	const hiddenTargets = $derived(view.kind === 'ready' ? view.hiddenTargets : new Set<string>());
	const summaries = $derived(
		ready === null ? [] : summarizeSteps(ready.elements, ELEMENT_DISCOVERY_CONFIG.steps)
	);
	const bins = $derived(ready === null ? [] : binDiscoveries(ready.elements));
	const busiest = $derived(busiestBin(bins));
	const allNumbers = $derived(
		new Set<number>(ready === null ? [] : ready.elements.map((element) => element.atomicNumber))
	);

	async function load(): Promise<void> {
		view = { kind: 'loading' };
		const result = await loadElementDiscovery();
		view =
			result.kind === 'ok'
				? {
						kind: 'ready',
						data: result.data,
						hiddenTargets: hiddenCopyTargets(result.data.elements)
					}
				: { kind: 'error' };
	}

	function openElement(element: StoryElement, trigger: HTMLButtonElement): void {
		selectedTrigger = trigger;
		selected = element;
	}

	// 상세를 닫으면 누른 칸으로 포커스를 돌려 키보드·스크린리더 사용자가 위치를 잃지 않게 한다.
	function closeElement(): void {
		selected = null;
		if (selectedTrigger !== null) selectedTrigger.focus();
		selectedTrigger = null;
	}

	onMount(() => {
		void load();
	});
</script>

<svelte:head>
	<title>{ready === null ? SITE_NAME : `${ready.title} · ${SITE_NAME}`}</title>
</svelte:head>

<main class="story story-theme">
	<nav class="top">
		<a href="/">{SITE_NAME}</a>
	</nav>

	{#if ready === null}
		<div class="status">
			<LoadStatus status={view.kind === 'error' ? 'error' : 'loading'} onretry={load} />
		</div>
	{:else}
		<header class="cover">
			<h1>{ready.title}</h1>
			{#if ready.summary !== null}<p class="summary">{ready.summary}</p>{/if}
			<p class="scroll-hint" aria-hidden="true">아래로 스크롤 ↓</p>
		</header>

		<section aria-label="시기별로 채워지는 주기율표">
			<SignatureScene
				elements={ready.elements}
				{summaries}
				hiddenSteps={hiddenTargets}
				copySources={ELEMENT_DISCOVERY_CONFIG.copySources}
				images={ELEMENT_DISCOVERY_IMAGES}
				onselect={openElement}
			/>
		</section>

		<section class="block" aria-labelledby="bins-title">
			<h2 id="bins-title">{ELEMENT_DISCOVERY_CONFIG.bars.title}</h2>
			{#if busiest !== null}
				<p class="lead">
					{fillTemplate(ELEMENT_DISCOVERY_CONFIG.bars.body, {
						bin: busiest.label,
						n: busiest.count
					})}
				</p>
			{/if}
			<DecadeBars {bins} highlightId={busiest === null ? null : busiest.id} />
		</section>

		<section class="block" aria-labelledby="explore-title">
			<h2 id="explore-title">직접 찾아보기</h2>
			<p class="lead">칸을 누르면 원소의 이름과 발견 연도, 출처를 볼 수 있습니다.</p>
			<PeriodicGrid
				label="전체 주기율표"
				elements={ready.elements}
				litNumbers={allNumbers}
				onselect={openElement}
			/>
		</section>

		<section class="block" aria-label="출처">
			<SourceList
				sources={ready.sources}
				copySources={shownCopySources(hiddenTargets)}
				images={ELEMENT_DISCOVERY_IMAGES}
				note={SOURCE_NOTE}
			/>
		</section>

		<ElementSheet element={selected} onclose={closeElement} />
	{/if}
</main>

<style>
	/* 본문 밖(넘침 스크롤) 영역도 테마 바탕색(theme.css --story-bg 와 같은 값)으로 둔다. */
	:global(body:has(.story)) {
		margin: 0;
		background: #0f1a33;
	}

	.story {
		min-height: 100svh;
		line-height: 1.6;
		word-break: keep-all;
	}

	.top {
		padding: 0 1rem;
	}

	.top a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--story-muted);
		font-weight: 600;
		text-decoration: none;
	}

	.top a:focus-visible {
		outline: 3px solid var(--story-text);
		outline-offset: 2px;
	}

	.status {
		padding: 20vh 1rem;
	}

	.cover {
		display: flex;
		flex-direction: column;
		justify-content: center;
		min-height: calc(100svh - 44px);
		padding: 0 1rem;
		box-sizing: border-box;
	}

	h1 {
		margin: 0;
		font-size: 2.25rem;
		font-weight: 700;
		line-height: 1.25;
	}

	.summary {
		margin: 1rem 0 0;
		color: var(--story-muted);
		font-size: 1.0625rem;
	}

	.scroll-hint {
		margin: 3rem 0 0;
		color: var(--story-cell-on);
		font-weight: 600;
	}

	.block {
		padding: 4rem 1rem;
	}

	h2 {
		margin: 0 0 1.25rem;
		font-size: 1.375rem;
		font-weight: 700;
	}

	.lead {
		margin: -0.5rem 0 1.25rem;
		color: var(--story-muted);
	}

	@media (min-width: 960px) {
		.top,
		.cover,
		.block {
			max-width: 1200px;
			margin: 0 auto;
			padding-left: 2rem;
			padding-right: 2rem;
		}

		h1 {
			font-size: 3.25rem;
		}
	}
</style>
