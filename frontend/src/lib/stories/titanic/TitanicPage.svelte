<script lang="ts">
	// 마지막 2시간 40분(D-43): 표지 → 6장 → 에필로그 → 출처. 배경은 Canvas 2D 밤바다(TitanicBackground)이고 카드가 그 위로 지나간다.
	// 장치는 화면 위 시간 표지 한 줄과 시계(1912년 그 밤의 선박 시각)뿐이다. 장마다 카드 앞 빈 장면 구간을 지나는 동안
	// 장면이 흘러가고(titanicScene.ts), 카드는 그 뒤에 올라온다. 장 판정은 스크롤 rAF 측정(5편과 같은 방식).
	// 에필로그 앞에는 물속으로 내려가는 암전 구간(60svh)이 있고, 그 뒤 23:40 별하늘로 돌아와 멈춘다.
	// 동작 줄이기면 장마다 정지 구도 한 장만 그리고, 암전 구간은 두지 않는다.
	import { onMount, untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { NO_ACTIVE_STEP } from '#lib/story/activeStep.ts';
	import LoadStatus from '#lib/story/LoadStatus.svelte';
	import SourceList from '#lib/story/SourceList.svelte';
	import StoryStage from '#lib/story/StoryStage.svelte';
	import type { LoadStorySource } from '#lib/story/storySource.ts';
	import { CHAPTER_COPY_SOURCES, CHAPTERS, TITANIC_SUBTITLE } from './chapters.ts';
	import { timeMarkTarget } from './storyChecks.ts';
	import TitanicBackground from './TitanicBackground.svelte';
	import {
		changesSceneAfter,
		chapterProgress,
		clockFor,
		COVER_FRAME,
		frameAt,
		showsAurora,
		stillFrameAt
	} from './titanicScene.ts';
	import { hiddenTitanicTargets, loadTitanic, type TitanicStoryData } from './titanicStory.ts';
	import './theme.css';

	type Props = { loadSource: LoadStorySource };

	let { loadSource }: Props = $props();

	type Ready = { data: TitanicStoryData; hiddenTargets: Set<string> };
	type ViewState = { kind: 'loading' } | { kind: 'error' } | ({ kind: 'ready' } & Ready);

	const SITE_NAME = 'Plotline';
	// 출처를 펼쳤을 때 목록 위에 두는 안내
	const SOURCE_GUIDES = [
		'배·빙산·보트는 평면 실루엣으로 그린 연출이며, 별 밝기와 크기는 과장했습니다(위치는 계산값).',
		'오로라는 증언만 있고 모양 자료가 없어 상상으로 그렸습니다.'
	];
	// 데이터 출처 아래 한 줄: 하늘 계산 자료
	const SKY_NOTE =
		'별 위치: Hipparcos 항성 목록 — Credit: ESA (CC BY-NC 3.0 IGO) · 해·달·행성: JPL DE421 · 계산: skyfield 1.55';
	// 5편과 같은 값: 장 구역 윗변이 화면 위에서 이 비율 지점에 들어오면 그 장으로 바뀐다(화면 높이는 100svh).
	const SCENE_LINE_RATIO = 0.88;
	// 다음 장이 다른 장면이면, 다음 장 윗변이 판정선 위 이 비율(화면 높이) 안으로 다가오는 동안 검은 막을 내린다.
	const LEAVING_RATIO = 0.3;
	// 장면이 멈춰 있는 장(1장 · 3장)은 장면 구간을 짧게 둔다.
	const SHORT_GAP_CHAPTERS = new Set(['now', 'collision']);
	const EPILOGUE_CHAPTER = 'epilogue';
	const GAP_OFFSETS = CHAPTERS.map((_, index) =>
		CHAPTERS.slice(0, index).reduce((sum, chapter) => sum + chapter.cards.length, 0)
	);

	let view = $state<ViewState>({ kind: 'loading' });
	let activeIndex = $state(NO_ACTIVE_STEP);
	let progress = $state(0);
	let dive = $state(1);
	let leaving = $state(0);
	let viewportProbe: HTMLElement;
	let viewportHeight = 0;
	let chapterElements = $state<HTMLElement[]>([]);
	// 장면 구간(카드마다 하나): 장 순서 · 카드 순서로 한 줄에 둔다. GAP_OFFSETS[장] 이 그 장 첫 구간 자리.
	let gapElements = $state<HTMLElement[]>([]);
	let diveElement = $state<HTMLElement>();

	const ready = $derived(view.kind === 'ready' ? view : null);
	const frame = $derived.by(() => {
		if (prefersReducedMotion.current) return stillFrameAt(activeIndex);
		if (activeIndex === NO_ACTIVE_STEP) return COVER_FRAME;
		return frameAt(activeIndex, progress, dive, leaving);
	});
	const clock = $derived(clockFor(activeIndex, frame));
	const timeMark = $derived.by(() => {
		if (ready === null || activeIndex < 0 || activeIndex >= CHAPTERS.length) return null;
		const chapter = CHAPTERS[activeIndex];
		return ready.hiddenTargets.has(timeMarkTarget(chapter.id)) ? null : chapter.timeMark;
	});
	const activeId = $derived(activeIndex === NO_ACTIVE_STEP ? null : CHAPTERS[activeIndex].id);

	function readViewport(): void {
		const probed = viewportProbe.getBoundingClientRect().height;
		viewportHeight = probed > 0 ? probed : window.innerHeight;
	}

	function gapsOf(chapterIndex: number): { top: number; height: number }[] {
		const start = GAP_OFFSETS[chapterIndex];
		const elements = gapElements.slice(start, start + CHAPTERS[chapterIndex].cards.length);
		return elements.map((element) => {
			const rect = element.getBoundingClientRect();
			return { top: rect.top, height: rect.height };
		});
	}

	/** 물속 암전 구간을 판정선이 지난 정도(구간이 없으면 다 지난 것으로) */
	function divePassed(line: number): number {
		if (diveElement === undefined) return 1;
		const rect = diveElement.getBoundingClientRect();
		return chapterProgress(line, [{ top: rect.top, height: rect.height }]);
	}

	/** 다음 장이 다른 장면일 때 이 장을 떠나는 정도(다음 장 윗변이 판정선에 다가온 만큼) */
	function leavingRatio(line: number, index: number): number {
		const next = chapterElements[index + 1];
		if (!changesSceneAfter(index) || next === undefined) return 0;
		const distance = next.getBoundingClientRect().top - line;
		const span = viewportHeight * LEAVING_RATIO;
		return Math.min(1, Math.max(0, 1 - distance / span));
	}

	function measure(): void {
		const line = viewportHeight * SCENE_LINE_RATIO;
		let passed = NO_ACTIVE_STEP;
		chapterElements.forEach((element, index) => {
			if (element.getBoundingClientRect().top < line) passed = index;
		});
		activeIndex = passed;
		progress = passed === NO_ACTIVE_STEP ? 0 : chapterProgress(line, gapsOf(passed));
		dive = divePassed(line);
		leaving = passed === NO_ACTIVE_STEP ? 0 : leavingRatio(line, passed);
	}

	async function load(): Promise<void> {
		view = { kind: 'loading' };
		const result = await loadTitanic(loadSource);
		if (result.kind === 'error') {
			view = { kind: 'error' };
			return;
		}
		view = {
			kind: 'ready',
			data: result.data,
			hiddenTargets: hiddenTitanicTargets(result.data, new Date())
		};
	}

	$effect(() => {
		if (ready === null || chapterElements.length !== CHAPTERS.length) return;
		untrack(() => {
			readViewport();
			measure();
		});
		let scheduled = 0;
		const schedule = (): void => {
			if (scheduled !== 0) return;
			scheduled = requestAnimationFrame(() => {
				scheduled = 0;
				measure();
			});
		};
		const onResize = (): void => {
			readViewport();
			schedule();
		};
		window.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', onResize);
		return () => {
			cancelAnimationFrame(scheduled);
			window.removeEventListener('scroll', schedule);
			window.removeEventListener('resize', onResize);
		};
	});

	onMount(() => {
		void load();
	});
</script>

<svelte:head>
	<title>{ready === null ? SITE_NAME : `${ready.data.title} · ${SITE_NAME}`}</title>
</svelte:head>

<main
	class="story titanic-theme"
	data-chapter={activeId}
	data-progress={progress.toFixed(3)}
	data-clock={clock}
>
	<div class="viewport-probe" aria-hidden="true" bind:this={viewportProbe}></div>
	<StoryStage>
		{#snippet background()}
			{#if ready !== null}
				<TitanicBackground {frame} />
			{/if}
		{/snippet}

		<nav class="top">
			<a href="/">{SITE_NAME}</a>
		</nav>

		{#if ready === null}
			<div class="status">
				<LoadStatus status={view.kind === 'error' ? 'error' : 'loading'} onretry={load} />
			</div>
		{:else}
			{#if timeMark !== null || clock !== null}
				<div class="time-mark-bar">
					{#if timeMark !== null}
						{#key timeMark}
							<p class="time-mark" aria-live="polite">{timeMark}</p>
						{/key}
					{/if}
					{#if clock !== null}
						<!-- 그 밤의 선박 시각: 스크롤 따라 바뀌므로 읽기 보조기기에는 시간 표지만 알린다. -->
						<p class="clock" aria-hidden="true">{clock}</p>
					{/if}
				</div>
			{/if}
			{#if showsAurora(frame)}
				<p class="imagined-badge">상상: 오로라</p>
			{/if}

			<header class="cover">
				<h1>{ready.data.title}</h1>
				<p class="subtitle">{TITANIC_SUBTITLE}</p>
				<p class="scroll-hint" aria-hidden="true">아래로 스크롤 ↓</p>
			</header>

			{#each CHAPTERS as chapter, index (chapter.id)}
				{@const verified = !ready.hiddenTargets.has(chapter.id)}
				<section class="chapter" aria-label={chapter.label} bind:this={chapterElements[index]}>
					{#if chapter.id === EPILOGUE_CHAPTER && !prefersReducedMotion.current}
						<!-- 물속으로 내려가는 암전(0.6화면 분량) -->
						<div class="dive" aria-hidden="true" bind:this={diveElement}></div>
					{/if}
					{#each chapter.cards as paragraphs, cardIndex (cardIndex)}
						<div
							class="scene-gap"
							class:short={SHORT_GAP_CHAPTERS.has(chapter.id)}
							aria-hidden="true"
							bind:this={gapElements[GAP_OFFSETS[index] + cardIndex]}
						></div>
						<div class="card">
							{#if verified}
								{#each paragraphs as paragraph, paragraphIndex (paragraphIndex)}
									<p class="paragraph">{paragraph}</p>
								{/each}
							{/if}
						</div>
					{/each}
				</section>
			{/each}

			<section class="closing" aria-label="출처">
				<div class="closing-body">
					<div class="sources">
						<SourceList
							sources={ready.data.sources}
							copySources={CHAPTER_COPY_SOURCES}
							images={[]}
							note={SKY_NOTE}
							guides={SOURCE_GUIDES}
						/>
					</div>
					{#if ready.data.next !== null}
						<a class="next" href="/stories/{ready.data.next.story}">
							다음 이야기: {ready.data.next.title}
						</a>
					{/if}
				</div>
			</section>
		{/if}
	</StoryStage>
</main>

<style>
	/* 본문 밖(넘침 스크롤) 영역도 테마 바탕색(theme.css --story-bg 와 같은 값)으로 둔다. */
	:global(body:has(.titanic-theme.story)) {
		margin: 0;
		background: #03050b;
	}

	.story {
		min-height: 100svh;
		line-height: 1.7;
		word-break: keep-all;
		background: transparent;
	}

	.viewport-probe {
		position: fixed;
		top: 0;
		left: 0;
		width: 0;
		height: 100svh;
		visibility: hidden;
		pointer-events: none;
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
		text-shadow: 0 1px 3px rgb(0 0 0 / 80%);
	}

	.top a:focus-visible,
	.next:focus-visible {
		outline: 3px solid var(--story-text);
		outline-offset: 2px;
	}

	.status {
		padding: 20vh 1rem;
	}

	/* 시간 표지 · 시계: 화면 위 가운데. 관리자 미리보기에서는 띠 높이(--preview-band-height)만큼 내린다. */
	.time-mark-bar {
		position: fixed;
		top: calc(var(--preview-band-height, 0px) + 0.75rem);
		right: 0;
		left: 0;
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		pointer-events: none;
	}

	.time-mark {
		margin: 0;
		padding: 0.25rem 0.875rem;
		border-radius: 999px;
		background: rgb(3 5 11 / 55%);
		color: var(--story-text);
		font-size: 0.9375rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		animation: time-mark-in 0.9s ease-out;
	}

	/* 시계: 시제품 v3 와 같은 고정폭 숫자 */
	.clock {
		margin: 0;
		padding: 0.125rem 0.625rem;
		border-radius: 999px;
		background: rgb(3 5 11 / 55%);
		color: var(--story-text);
		font:
			500 15px/1.2 ui-monospace,
			'SF Mono',
			Menlo,
			Consolas,
			monospace;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.08em;
		text-shadow: 0 0 8px rgb(0 0 0 / 60%);
	}

	@keyframes time-mark-in {
		from {
			opacity: 0;
		}

		to {
			opacity: 1;
		}
	}

	/* 상상 표시(6장 오로라): 기존 이야기의 상상 표시와 같은 점선 테두리 · 색 */
	.imagined-badge {
		position: fixed;
		top: calc(var(--preview-band-height, 0px) + 4.75rem);
		right: 1rem;
		z-index: 2;
		margin: 0;
		padding: 0 0.5rem;
		border: 1px dashed var(--story-imagined);
		border-radius: 4px;
		background: rgb(3 5 11 / 70%);
		color: var(--story-imagined);
		font-size: 0.8125rem;
		font-weight: 700;
	}

	/* 표지 글은 화면 아래쪽(바다 위)에 둔다. */
	.cover {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		min-height: calc(100svh - 44px);
		padding: 0 1rem 10svh;
		box-sizing: border-box;
		text-shadow: 0 2px 8px rgb(0 0 0 / 85%);
	}

	h1 {
		margin: 0;
		font-size: 2.25rem;
		font-weight: 700;
		line-height: 1.25;
	}

	.subtitle {
		margin: 1rem 0 0;
		color: var(--story-cell-on);
		font-size: 1.125rem;
		font-weight: 600;
	}

	.scroll-hint {
		margin: 1.5rem 0 0;
		color: var(--story-muted);
		font-weight: 600;
	}

	/* 카드 앞 장면 구간(170svh) 동안 장면이 흘러가고, 카드는 그 뒤에 올라온다.
	   카드 뒤 여백(40svh)은 다음 장 구역이 판정선(88%) 아래에 남아 장면이 머물게 한다. */
	.chapter {
		padding: 0 1rem 40svh;
	}

	.scene-gap {
		height: 170svh;
	}

	.scene-gap.short {
		height: 60svh;
	}

	/* 물속 암전: 0.6화면 분량 */
	.dive {
		height: 60svh;
	}

	.card {
		max-width: 560px;
		margin: 0 auto;
		padding: 0.5rem 1.25rem 1.25rem;
		border: 1px solid var(--story-cell-off);
		border-radius: 12px;
		background: rgb(3 5 11 / 88%);
		font-size: 1.0625rem;
	}

	.card:empty {
		display: none;
	}

	.paragraph {
		margin: 0.75rem 0 0;
	}

	/* 출처 절: 화면 전체 폭을 테마 바탕색으로 덮는다(윗변은 투명 → 바탕색 그라데이션). */
	.closing {
		position: relative;
		padding: 24svh 0 6rem;
		background: linear-gradient(to bottom, rgb(3 5 11 / 0%), var(--story-bg) 24svh);
	}

	.closing-body {
		max-width: 560px;
		margin: 0 auto;
		padding: 0 1rem;
		box-sizing: border-box;
		text-align: center;
	}

	/* 펼친 목록은 왼쪽 맞춤 그대로, 출처 버튼만 가운데 */
	.sources {
		text-align: left;
	}

	.sources :global(summary) {
		margin-inline: auto;
	}

	.next {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin-top: 2rem;
		color: var(--story-text);
		font-weight: 700;
	}

	/* PC: 5편과 같은 4:6 구도. 카드(최대 460px)는 왼쪽 열. */
	@media (min-width: 1024px) {
		.chapter {
			max-width: 1600px;
			margin: 0 auto;
			padding-right: 0;
			padding-left: 0;
		}

		.scene-gap {
			height: 140svh;
		}

		.card {
			--card-width: min(460px, 40% - 4rem);

			width: var(--card-width);
			max-width: none;
			margin: 0 0 0 calc(40% - 2rem - var(--card-width));
		}

		.top,
		.cover {
			max-width: 1600px;
			margin: 0 auto;
			padding-left: 2rem;
			padding-right: 2rem;
		}

		.cover {
			justify-content: center;
			padding-bottom: 0;
		}

		.cover h1,
		.cover p {
			max-width: calc(40% - 2rem);
		}

		h1 {
			font-size: 3rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.time-mark {
			animation: none;
		}
	}
</style>
