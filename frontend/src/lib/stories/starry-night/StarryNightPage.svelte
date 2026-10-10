<script lang="ts">
	// 그가 실패작이라 부른 밤(D-42): 표지 → 6장 → 끝 → 출처. 시각이 주연이고 이야기는 받침이다.
	// 장치는 화면 위 시간 표지 한 줄뿐(계기판 · 질문 목록 · 곁들임 없음). 배경은 WebGL2 그림(StarryBackground)이고 카드가 그 위로 지나간다.
	// 장마다 카드 앞 빈 장면 구간을 지나는 동안 카메라 · 효과가 다음 자세로 옮겨 가고(starryScene.ts), 카드는 장면이 끝난 뒤 아래에서 올라온다.
	// 5장은 박자가 둘이라 장면 구간 · 카드가 둘이다. 장 판정은 스크롤 rAF 측정(4편과 같은 방식), 두 장 이상 건너뛰면 바로 놓는다.
	// 휴대폰은 초점을 화면 위쪽(36%)에, PC(1024px 이상)는 카드를 왼쪽 열에 두고 초점을 오른쪽(70%)에 둔다.
	// 표지: 그림 전체가 기본 초점 자리에서 시작해, 표지 이동 구간(표지 + cover-gap)과 1장 장면 구간을 이은 하나의 진행도로
	// 정중앙으로 옮겨 가며 확대해 1장 도착 자세까지 간다(전환 1회, STEP 95).
	// 끝: 마지막 카드 뒤 여운 구간(별빛이 잦아듦) → 암전 구간(캔버스가 바탕색으로) → 작품 라벨 → 출처. 동작 줄이기면 두 구간 없이 바로 라벨.
	import { onMount, untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { NO_ACTIVE_STEP } from '#lib/story/activeStep.ts';
	import LoadStatus from '#lib/story/LoadStatus.svelte';
	import SourceList from '#lib/story/SourceList.svelte';
	import StoryStage from '#lib/story/StoryStage.svelte';
	import type { LoadStorySource } from '#lib/story/storySource.ts';
	import { ARTWORK_LABEL, CHAPTER_COPY_SOURCES, CHAPTERS, STARRY_SUBTITLE } from './chapters.ts';
	import StarryBackground from './StarryBackground.svelte';
	import { afterglowScene, chapterProgress, sceneAt, timeMarkFor } from './starryScene.ts';
	import {
		hiddenStarryTargets,
		loadStarryNight,
		STARRY_NIGHT_IMAGES,
		type StarryNightData
	} from './starryStory.ts';
	import { LABEL_DETAILS_TARGET } from './storyChecks.ts';
	import './theme.css';

	type Props = { loadSource: LoadStorySource };

	let { loadSource }: Props = $props();

	type Ready = { data: StarryNightData; hiddenTargets: Set<string> };
	type ViewState = { kind: 'loading' } | { kind: 'error' } | ({ kind: 'ready' } & Ready);

	const SITE_NAME = 'Plotline';
	// 출처를 펼쳤을 때 목록 위에 두는 안내: 끝 장 편지의 한계 · 입체 효과로 채운 부분
	const SOURCE_GUIDES = [
		'끝 장의 편지에는 그림 이름이 적혀 있지 않습니다. 편지를 엮은 편집자는 이 그림을 가리키는 것으로 봅니다.',
		'그림이 입체로 보이도록, 사이프러스에 가려진 뒤쪽은 계산으로 채웠습니다. 원래 그림에는 없는 부분입니다.'
	];
	const IMAGE_CREDITS = ['깊이 계산: Depth Anything V2 Small(Apache-2.0)'];
	// 4편과 같은 값: 장 구역 윗변이 화면 위에서 이 비율 지점에 들어오면 그 장으로 바뀐다(화면 높이는 100svh).
	const SCENE_LINE_RATIO = 0.88;
	// 끝 장 편지 문장 끝이 화면 위에서 이 비율 지점을 지나면 별빛이 마지막으로 한 번 빛난다.
	const FLARE_LINE_RATIO = 0.6;
	// 별빛 표시 자리: 끝 장 첫 카드의 인용 문단(베르나르에게 쓴 편지) 바로 뒤
	const FLARE_PLACE = { card: 0, paragraph: 1 };
	const JUMP_CHAPTERS = 2;
	// 표지(-1)와 1장(0)은 표지 → 1장 이동 진행도 하나를 함께 쓴다(STEP 95).
	const OPENING_LAST_INDEX = 0;
	const BARS_CHAPTER = 'bars';
	// 3장은 장면 구간에 패닝 구간이 이어 붙는다(R6)
	const VILLAGE_CHAPTER = 'village';
	const END_CHAPTER = 'end';
	const PAINTING = STARRY_NIGHT_IMAGES[0];
	const GAP_OFFSETS = CHAPTERS.map((_, index) =>
		CHAPTERS.slice(0, index).reduce((sum, chapter) => sum + chapter.cards.length, 0)
	);

	let view = $state<ViewState>({ kind: 'loading' });
	let activeIndex = $state(NO_ACTIVE_STEP);
	let progress = $state(0);
	let jump = $state(false);
	let flarePassed = $state(false);
	let viewportProbe: HTMLElement;
	let viewportHeight = 0;
	let chapterElements = $state<HTMLElement[]>([]);
	// 장면 구간(카드마다 하나): 장 순서 · 카드 순서로 한 줄에 둔다. GAP_OFFSETS[장] 이 그 장 첫 구간 자리.
	let gapElements = $state<HTMLElement[]>([]);
	let flareMark = $state<HTMLElement>();
	let coverElement = $state<HTMLElement>();
	// 표지 → 1장 이동을 지난 정도(0~1): 표지와 1장(index 0)이 함께 쓰는 진행도
	let openingProgress = $state(0);
	// 끝 장 뒤 여운 구간 · 암전 구간(동작 줄이기면 없음)과 지난 정도(0~1)
	let afterglowElement = $state<HTMLElement>();
	let darkElement = $state<HTMLElement>();
	let afterglow = $state(0);
	let dim = $state(0);

	const ready = $derived(view.kind === 'ready' ? view : null);
	const target = $derived(
		afterglowScene(
			sceneAt(activeIndex, activeIndex <= OPENING_LAST_INDEX ? openingProgress : progress),
			afterglow
		)
	);
	const timeMark = $derived(ready === null ? null : timeMarkFor(activeIndex, ready.hiddenTargets));
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

	/** 구간 하나를 판정선이 지난 정도(구간이 없으면 0) */
	function passedRatio(line: number, element: HTMLElement | undefined): number {
		if (element === undefined) return 0;
		const rect = element.getBoundingClientRect();
		return chapterProgress(line, [{ top: rect.top, height: rect.height }]);
	}

	/**
	 * 표지 → 1장 이동을 지난 정도: 표지 아랫변이 화면 아래 끝에 있을 때(0)부터 1장 첫 장면 구간 아랫변이 판정선에 닿을 때(1)까지.
	 * 두 시점 사이 스크롤 거리 = (구간 아랫변 − 표지 아랫변) + (화면 높이 − 판정선)이고, 그중 지난 거리 = 화면 높이 − 표지 아랫변.
	 */
	function openingPassed(line: number): number {
		const firstGap = gapElements[0];
		if (coverElement === undefined || firstGap === undefined || viewportHeight <= 0) return 0;
		const coverBottom = coverElement.getBoundingClientRect().bottom;
		const span = firstGap.getBoundingClientRect().bottom - coverBottom + viewportHeight - line;
		if (span <= 0) return 1;
		return Math.min(1, Math.max(0, (viewportHeight - coverBottom) / span));
	}

	function measure(): void {
		const line = viewportHeight * SCENE_LINE_RATIO;
		openingProgress = openingPassed(line);
		afterglow = passedRatio(line, afterglowElement);
		dim = passedRatio(line, darkElement);
		let passed = NO_ACTIVE_STEP;
		chapterElements.forEach((element, index) => {
			if (element.getBoundingClientRect().top < line) passed = index;
		});
		if (passed !== activeIndex) {
			jump = Math.abs(passed - activeIndex) >= JUMP_CHAPTERS;
			activeIndex = passed;
		}
		progress = passed === NO_ACTIVE_STEP ? 0 : chapterProgress(line, gapsOf(passed));
		flarePassed =
			flareMark !== undefined &&
			flareMark.getBoundingClientRect().top < viewportHeight * FLARE_LINE_RATIO;
	}

	async function load(): Promise<void> {
		view = { kind: 'loading' };
		const result = await loadStarryNight(loadSource);
		if (result.kind === 'error') {
			view = { kind: 'error' };
			return;
		}
		view = { kind: 'ready', data: result.data, hiddenTargets: hiddenStarryTargets(result.data) };
	}

	$effect(() => {
		if (ready === null || chapterElements.length !== CHAPTERS.length) return;
		untrack(() => {
			readViewport();
			measure();
		});
		let frame = 0;
		const schedule = (): void => {
			if (frame !== 0) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
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
			cancelAnimationFrame(frame);
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

<main class="story starry-night-theme" data-chapter={activeId} data-progress={progress.toFixed(2)}>
	<div class="viewport-probe" aria-hidden="true" bind:this={viewportProbe}></div>
	<StoryStage>
		{#snippet background()}
			{#if ready !== null}
				<StarryBackground {target} instant={jump} flare={flarePassed} {dim} image={PAINTING} />
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
			{#if timeMark !== null}
				<div class="time-mark-bar">
					{#key timeMark}
						<p class="time-mark" aria-live="polite">{timeMark}</p>
					{/key}
				</div>
			{/if}
			{#if activeId === BARS_CHAPTER && !prefersReducedMotion.current}
				<p class="imagined-badge">상상: 창살 그림자</p>
			{/if}

			<header class="cover" bind:this={coverElement}>
				<h1>{ready.data.title}</h1>
				<p class="subtitle">{STARRY_SUBTITLE}</p>
				<p class="scroll-hint" aria-hidden="true">아래로 스크롤 ↓</p>
			</header>
			{#if !prefersReducedMotion.current}
				<!-- 표지 뒤 빈 구간: 1장 구역 윗변이 판정선(88%)에 닿는 때를 표지가 화면을 다 빠져나간 때로 맞춘다. -->
				<div class="cover-gap" aria-hidden="true"></div>
			{/if}

			{#each CHAPTERS as chapter, index (chapter.id)}
				{@const verified = !ready.hiddenTargets.has(chapter.id)}
				<section
					class="chapter"
					class:end={chapter.id === END_CHAPTER}
					aria-label={chapter.label}
					bind:this={chapterElements[index]}
				>
					{#each chapter.cards as paragraphs, cardIndex (cardIndex)}
						<div
							class="scene-gap"
							class:with-move={chapter.id === VILLAGE_CHAPTER}
							aria-hidden="true"
							bind:this={gapElements[GAP_OFFSETS[index] + cardIndex]}
						></div>
						<div class="card">
							{#if verified}
								{#each paragraphs as paragraph, paragraphIndex (paragraphIndex)}
									<p class="paragraph">{paragraph}</p>
									{#if chapter.id === END_CHAPTER && cardIndex === FLARE_PLACE.card && paragraphIndex === FLARE_PLACE.paragraph}
										<!-- 편지 문장 끝: 이 자리가 지나가면 별빛이 마지막으로 한 번 빛났다가 꺼진다. -->
										<div class="flare-mark" aria-hidden="true" bind:this={flareMark}></div>
									{/if}
								{/each}
							{/if}
						</div>
					{/each}
				</section>
			{/each}

			{#if !prefersReducedMotion.current}
				<div class="afterglow" aria-hidden="true" bind:this={afterglowElement}></div>
				<div class="dark" aria-hidden="true" bind:this={darkElement}></div>
			{/if}

			<section class="closing" aria-label="작품 정보와 출처">
				<div class="closing-body">
					<div class="artwork-label">
						<p class="label-title">{ARTWORK_LABEL.title}</p>
						{#if !ready.hiddenTargets.has(LABEL_DETAILS_TARGET)}
							<p>{ARTWORK_LABEL.details}</p>
						{/if}
						<p>{ARTWORK_LABEL.collection}</p>
					</div>
					<div class="sources">
						<SourceList
							sources={ready.data.sources}
							copySources={CHAPTER_COPY_SOURCES}
							images={STARRY_NIGHT_IMAGES}
							guides={SOURCE_GUIDES}
							imageCredits={IMAGE_CREDITS}
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
	:global(body:has(.starry-night-theme.story)) {
		margin: 0;
		background: #070b16;
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

	/* 시간 표지: 화면 위 한 줄. 관리자 미리보기에서는 띠 높이(--preview-band-height)만큼 내린다. */
	.time-mark-bar {
		position: fixed;
		top: calc(var(--preview-band-height, 0px) + 0.75rem);
		right: 0;
		left: 0;
		z-index: 2;
		display: flex;
		justify-content: center;
		pointer-events: none;
	}

	.time-mark {
		margin: 0;
		padding: 0.25rem 0.875rem;
		border-radius: 999px;
		background: rgb(7 11 22 / 55%);
		color: var(--story-text);
		font-size: 0.9375rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		animation: time-mark-in 0.9s ease-out;
	}

	@keyframes time-mark-in {
		from {
			opacity: 0;
		}

		to {
			opacity: 1;
		}
	}

	/* 상상 표시(6장 창살 그림자): 기존 이야기의 상상 표시와 같은 점선 테두리 · 색 */
	.imagined-badge {
		position: fixed;
		top: calc(var(--preview-band-height, 0px) + 3.25rem);
		right: 1rem;
		z-index: 2;
		margin: 0;
		padding: 0 0.5rem;
		border: 1px dashed var(--story-imagined);
		border-radius: 4px;
		background: rgb(7 11 22 / 70%);
		color: var(--story-imagined);
		font-size: 0.8125rem;
		font-weight: 700;
	}

	/* 표지 글은 화면 아래쪽에 둔다(그림은 위쪽 초점 자리). */
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

	/* 카드 앞 장면 구간(170svh, starryScene.ts SCENE_GAP_SVH) 동안 카메라 · 효과가 옮겨 가고, 카드는 장면이 끝난 뒤 올라온다.
	   카드 뒤 여백(40svh)은 다음 장 구역이 전환선(88%) 아래에 남아 장면이 머물게 한다. */
	.chapter {
		padding: 0 1rem 40svh;
	}

	/* 끝 장 카드 바로 뒤에 여운 구간이 이어진다(동작 줄이기면 출처 절 위 그라데이션이 간격이 된다). */
	.chapter.end {
		padding-bottom: 0;
	}

	/* 88svh = 판정선(SCENE_LINE_RATIO 0.88) × 화면 높이 */
	.cover-gap {
		height: 88svh;
	}

	/* 여운: 카드 없이 액자 속 그림만, 별빛이 0 으로 잦아든다. */
	.afterglow {
		height: 70svh;
	}

	/* 암전: 이 구간을 지나는 만큼 캔버스가 바탕색으로 어두워진다. */
	.dark {
		height: 40svh;
	}

	.scene-gap {
		height: 170svh;
	}

	/* 3장: 전환 170svh + 패닝 220svh(starryScene.ts VILLAGE_MOVE_SVH) */
	.scene-gap.with-move {
		height: 390svh;
	}

	.card {
		max-width: 560px;
		margin: 0 auto;
		padding: 0.5rem 1.25rem 1.25rem;
		border: 1px solid var(--story-cell-off);
		border-radius: 12px;
		background: rgb(7 11 22 / 88%);
		font-size: 1.0625rem;
	}

	.card:empty {
		display: none;
	}

	.paragraph {
		margin: 0.75rem 0 0;
	}

	.flare-mark {
		height: 0;
	}

	/* 출처 절: 화면 전체 폭을 테마 바탕색으로 덮어 뒤의 그림이 비치지 않게 한다.
	   윗변은 단단한 경계 없이 투명 → 바탕색 그라데이션으로 이어져 그림이 가로로 잘리는 선이 보이지 않는다. */
	.closing {
		position: relative;
		padding: 24svh 0 6rem;
		background: linear-gradient(to bottom, rgb(7 11 22 / 0%), var(--story-bg) 24svh);
	}

	.closing-body {
		max-width: 560px;
		margin: 0 auto;
		padding: 0 1rem;
		box-sizing: border-box;
		text-align: center;
	}

	/* 작품 라벨: 미술관 설명판처럼 작고 차분하게(상자 · 테두리 없음) */
	.artwork-label p {
		margin: 0;
		color: var(--story-muted);
		font-size: 0.875rem;
		line-height: 1.9;
		/* 휴대폰에서 둘째 줄 끝 단위(cm)만 홀로 떨어지지 않게 줄 길이를 고르게 */
		text-wrap: balance;
	}

	.artwork-label .label-title {
		color: var(--story-text);
		font-size: 1rem;
		font-weight: 700;
	}

	/* 펼친 목록은 왼쪽 맞춤 그대로, 출처 버튼만 가운데 */
	.sources {
		margin-top: 2rem;
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

	/* PC: 4편과 같은 4:6 구도. 카드(최대 460px)는 왼쪽 열, 그림 초점은 오른쪽. */
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

		.scene-gap.with-move {
			height: 320svh;
		}

		.card {
			--card-width: min(460px, 40% - 4rem);

			width: var(--card-width);
			max-width: none;
			margin: 0 0 0 calc(40% - 2rem - var(--card-width));
		}

		.afterglow {
			height: 60svh;
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
			max-width: calc(32% - 2rem);
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
