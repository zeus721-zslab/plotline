<script lang="ts">
	// 사라진 세 자리(D-47): 표지 → 7장 32비트(장마다 제목 구간) → 끝 화면 → 출처. 시제품(chaos-full.src.html, STEP 133~141)의 흐름 그대로.
	// 트랙은 구간마다 CSS vh 높이(story/beatTrack, 표지 260vh · 장 제목 90vh · 비트 · 끝 화면 150vh)이고, 스크롤 위치 → 구간 · 진행값만으로
	// 글(실제 스크롤)과 그림(완화 스크롤)이 정해진다. 그림은 Canvas 2D 한 장(ChaosBackground), 글 · 표식은 화면 고정 글 층(ChaosOverlay).
	// 정지 모드(동작 줄이기 또는 저사양)는 글을 연출 없이 바로 보여 주고, 그림은 구간마다 정지 그림 한 장이다.
	// 관리자 미리보기도 이 컴포넌트를 쓴다(loadSource 만 다르다).
	import { onMount, tick, untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import {
		layoutTrack,
		resolveIndex,
		scrollForIndex,
		type TrackLayout
	} from '#lib/story/beatTrack.ts';
	import { isLowEndDevice } from '#lib/story/device.ts';
	import LoadStatus from '#lib/story/LoadStatus.svelte';
	import NextStoryLink from '#lib/story/NextStoryLink.svelte';
	import SourceList from '#lib/story/SourceList.svelte';
	import StoryStage from '#lib/story/StoryStage.svelte';
	import type { LoadStorySource } from '#lib/story/storySource.ts';
	import ChaosBackground from './ChaosBackground.svelte';
	import { screenFigures } from './chaosData.ts';
	import ChaosOverlay from './ChaosOverlay.svelte';
	import type { SceneFigures } from './chaosPaint.ts';
	import type { OverlayMeasure } from './chaosRenderer.ts';
	import {
		entryOf,
		screenReaderText,
		type CaptionTargets,
		type TrackPosition,
		type YearValues
	} from './chaosScene.ts';
	import { hiddenChaosTargets, loadVanishedDigits, type ChaosStoryData } from './chaosStory.ts';
	import { CHAPTER_COPY_SOURCES, END_VH, TRACK_ENTRIES, type TrackEntry } from './chapters.ts';
	import {
		BAR_TARGET,
		CALENDAR_TARGET,
		COVER_TARGET,
		ENSEMBLE_CAPTION_TARGET,
		ENSEMBLE_TARGET,
		FULL_VALUE_TARGET,
		PRINTED_VALUE_TARGET,
		WEATHER_CAPTION_TARGET
	} from './storyChecks.ts';
	import { CAPTION_ENSEMBLE, CAPTION_WEATHER } from './storyText.ts';
	import './theme.css';

	type Props = { loadSource: LoadStorySource };

	let { loadSource }: Props = $props();

	type Ready = { data: ChaosStoryData; hiddenTargets: Set<string> };
	type ViewState = { kind: 'loading' } | { kind: 'error' } | ({ kind: 'ready' } & Ready);

	const SITE_NAME = 'Plotline';
	const PERCENT = 100;
	const TRACK_TOTAL_VH = TRACK_ENTRIES.reduce((sum, entry) => sum + entry.vh, 0);
	// 캡션 문구 속 숫자를 대조하는 대상(storyChecks SCREEN_MARKS)
	const CAPTION_TARGETS: CaptionTargets = new Map([
		[CAPTION_WEATHER, WEATHER_CAPTION_TARGET],
		[CAPTION_ENSEMBLE, ENSEMBLE_CAPTION_TARGET]
	]);
	const START: TrackPosition = { index: 0, p: 0 };

	let view = $state<ViewState>({ kind: 'loading' });
	let layout = $state<TrackLayout | null>(null);
	let layoutKey = $state(0);
	let trackTop = $state(0);
	let text = $state<TrackPosition>(START);
	let picture = $state<TrackPosition>(START);
	let onscreen = $state(false);
	let lowEnd = $state(false);
	let trackElement = $state<HTMLElement>();
	let endElement = $state<HTMLElement>();
	let overlay = $state<ChaosOverlay>();
	let layoutWidth = 0;

	const ready = $derived(view.kind === 'ready' ? view : null);
	// 정지 모드: 동작 줄이기 또는 저사양(1~7편과 같은 판정)
	const still = $derived(prefersReducedMotion.current || lowEnd);
	const hidden = $derived(ready === null ? new Set<string>() : ready.hiddenTargets);
	const shown = (target: string, value: string | null): string | null =>
		hidden.has(target) ? null : value;
	const figures = $derived.by((): SceneFigures | null => {
		if (ready === null) return null;
		const raw = screenFigures(ready.data);
		const calendar =
			raw.reliableDays === null || raw.limitDays === null || hidden.has(CALENDAR_TARGET)
				? null
				: { reliableDays: raw.reliableDays, limitDays: raw.limitDays };
		return {
			fullValueText: shown(FULL_VALUE_TARGET, raw.fullValueText),
			printedValueText: shown(PRINTED_VALUE_TARGET, raw.printedValueText),
			calendar,
			ensembleMembers: hidden.has(ENSEMBLE_TARGET) ? null : raw.ensembleMembers,
			barShortMm: hidden.has(BAR_TARGET) ? null : raw.barShortMm
		};
	});
	const years = $derived<YearValues | null>(
		ready === null ? null : screenFigures(ready.data).years
	);
	const measure: OverlayMeasure = {
		mark: () => (overlay === undefined ? null : overlay.measureMark()),
		bigNumber: () => (overlay === undefined ? null : overlay.measureBigNumber())
	};

	/** 확인용 구간 이름(비트 id · chapter-N · cover · finale) */
	function sectionName(entry: TrackEntry): string {
		if (entry.kind === 'beat') return entry.beatId;
		if (entry.kind === 'chapter') return `chapter-${entry.chapter}`;
		return entry.kind;
	}

	function srText(entry: TrackEntry, title: string): string {
		if (entry.kind === 'beat' && hidden.has(entry.beatId)) return '';
		if (entry.kind === 'cover' && hidden.has(COVER_TARGET)) return title;
		return screenReaderText(entry, title);
	}

	// ---------- 스크롤 → 구간 ----------
	function measureTrack(): TrackLayout | null {
		if (trackElement === undefined) return null;
		const rect = trackElement.getBoundingClientRect();
		trackTop = rect.top + window.scrollY;
		// 트랙 높이는 구간 vh 의 합이므로, CSS 100vh 의 px 값을 그대로 되짚는다(D-47 D3)
		return layoutTrack(TRACK_ENTRIES, (rect.height / TRACK_TOTAL_VH) * PERCENT);
	}

	function readText(): void {
		if (layout === null) return;
		const next = resolveIndex(window.scrollY - trackTop, layout);
		if (next.index !== text.index || next.p !== text.p) text = next;
	}

	async function relayout(anchor: TrackPosition | null): Promise<void> {
		await tick();
		layoutWidth = document.documentElement.clientWidth;
		const next = measureTrack();
		if (next === null) return;
		const changed = layout === null || Math.abs(next.total - layout.total) > 0.5;
		layout = next;
		if (anchor !== null && changed)
			window.scrollTo(0, trackTop + scrollForIndex(anchor.index, anchor.p, next));
		layoutKey += 1;
		readText();
	}

	async function load(): Promise<void> {
		view = { kind: 'loading' };
		const result = await loadVanishedDigits(loadSource);
		if (result.kind === 'error') {
			view = { kind: 'error' };
			return;
		}
		view = { kind: 'ready', data: result.data, hiddenTargets: hiddenChaosTargets(result.data) };
	}

	$effect(() => {
		if (ready === null || trackElement === undefined || endElement === undefined) return;
		const element = trackElement;
		const end = endElement;
		let scheduled = 0;
		let resizeQueued = 0;
		const schedule = (): void => {
			if (scheduled !== 0) return;
			scheduled = requestAnimationFrame(() => {
				scheduled = 0;
				readText();
			});
		};
		// 크기가 바뀌면 트랙을 다시 재고(폭이 바뀌면 같은 구간 · 진행값 자리로 되돌린다) 캔버스도 다시 잡는다(layoutKey)
		const onResize = (): void => {
			if (resizeQueued !== 0) return;
			resizeQueued = requestAnimationFrame(() => {
				resizeQueued = 0;
				const widthChanged = document.documentElement.clientWidth !== layoutWidth;
				void relayout(widthChanged ? { ...text } : null);
			});
		};
		// 트랙(+ 끝 여백)이 화면에 있으면 그림 루프를 돈다. 출처 절이 화면을 덮으면 멈춘다
		let trackVisible = false;
		let endVisible = false;
		const observer = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (entry.target === element) trackVisible = entry.isIntersecting;
				else if (entry.target === end) endVisible = entry.isIntersecting;
			}
			onscreen = trackVisible || endVisible;
		});
		observer.observe(element);
		observer.observe(end);
		void untrack(() => relayout(null));
		window.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', onResize);
		return () => {
			observer.disconnect();
			cancelAnimationFrame(scheduled);
			cancelAnimationFrame(resizeQueued);
			window.removeEventListener('scroll', schedule);
			window.removeEventListener('resize', onResize);
		};
	});

	onMount(() => {
		lowEnd = isLowEndDevice();
		void load();
	});
</script>

<svelte:head>
	<title>{ready === null ? SITE_NAME : `${ready.data.title} · ${SITE_NAME}`}</title>
</svelte:head>

<main
	class="story vanished-digits-theme"
	data-section={sectionName(entryOf(text))}
	data-progress={text.p.toFixed(4)}
>
	<StoryStage>
		{#snippet background()}
			{#if ready !== null && figures !== null}
				<ChaosBackground
					{layout}
					{layoutKey}
					{trackTop}
					{text}
					{still}
					{onscreen}
					{figures}
					{measure}
					onpicture={(position) => {
						if (position.index !== picture.index || position.p !== picture.p) picture = position;
					}}
				/>
			{/if}
		{/snippet}

		<nav class="top">
			<a href="/">{SITE_NAME}</a>
		</nav>

		{#if ready === null || figures === null || years === null}
			<div class="status">
				<LoadStatus status={view.kind === 'error' ? 'error' : 'loading'} onretry={load} />
			</div>
		{:else}
			<ChaosOverlay
				bind:this={overlay}
				{text}
				{picture}
				{still}
				{hidden}
				fullValueText={figures.fullValueText}
				printedValueText={figures.printedValueText}
				{years}
				captionTargets={CAPTION_TARGETS}
				title={ready.data.title}
			/>

			<!-- 이야기 트랙: 구간 높이는 CSS vh 그대로(구간마다 반올림하지 않는다). 읽기 보조기기는 구간마다 둔 글(.sr)을 읽는다 -->
			<div class="track" bind:this={trackElement}>
				{#each TRACK_ENTRIES as entry, index (index)}
					<section
						class={entry.kind}
						data-beat={entry.kind === 'beat' ? entry.beatId : undefined}
						data-chapter={entry.kind === 'chapter' ? entry.chapter : undefined}
						style:height="{entry.vh}vh"
					>
						<p class="sr">{srText(entry, ready.data.title)}</p>
					</section>
				{/each}
			</div>
			<!-- 끝 화면이 진행값 1 에 닿도록 두는 여백(트랙 구간 아님) -->
			<div class="end" bind:this={endElement} style:height="{END_VH}vh"></div>

			<section class="closing" aria-label="출처">
				<div class="closing-body">
					<div class="sources">
						<SourceList
							sources={ready.data.sources}
							copySources={CHAPTER_COPY_SOURCES}
							images={[]}
						/>
					</div>
					<NextStoryLink next={ready.data.next} />
				</div>
			</section>
		{/if}
	</StoryStage>
</main>

<style>
	/* 본문 밖(넘침 스크롤) 영역도 테마 바탕색(theme.css --story-bg 와 같은 값)으로 둔다(1~7편과 같은 방식, D-47 D8). */
	:global(body:has(.vanished-digits-theme.story)) {
		margin: 0;
		background: #0a0b0d;
		overflow-x: hidden;
		-webkit-font-smoothing: antialiased;
	}

	.story {
		min-height: 100svh;
		background: transparent;
		-webkit-text-size-adjust: 100%;
	}

	.top {
		position: relative;
		z-index: 3;
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

	.track,
	.track section {
		position: relative;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: pre-wrap;
	}

	/* 출처 절: 화면 전체 폭을 테마 바탕색으로 덮어 뒤의 그림 · 글 층이 비치지 않게 한다(7편과 같은 그라데이션 윗변) */
	.closing {
		position: relative;
		z-index: 5;
		padding: 24svh 0 6rem;
		background: linear-gradient(to bottom, rgb(10 11 13 / 0%), var(--story-bg) 24svh);
		line-height: 1.7;
		word-break: keep-all;
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
</style>
