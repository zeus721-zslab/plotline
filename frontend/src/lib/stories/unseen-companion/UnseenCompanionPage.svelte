<script lang="ts">
	// 보이지 않는 짝(D-43): 표지 → 8장 30비트 → 출처. 시제품(sirius-flow.src.html)의 흐름 그대로, 화면은 진행 값(비트 · p)만으로 정해진다.
	// 배경은 Canvas 2D(UnseenBackground), 글은 화면에 고정된 글 층(DOM)이고 비트마다 스크롤 길이(vh)만큼 빈 구역이 지나간다.
	// 지금 비트 = 윗변이 화면 위를 지난 마지막 비트, p = 그 비트 안 진행 값. 첫 비트 앞(표지)에서는 글을 띄우지 않는다.
	// 휴대폰(세로)은 글이 화면 위 또는 아래 한 단, PC(가로 · 폭 1024px 이상)는 글이 왼쪽 열 · 그림은 오른쪽 영역(시제품 STEP 111 P1).
	import { onMount, untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import LoadStatus from '#lib/story/LoadStatus.svelte';
	import SourceList from '#lib/story/SourceList.svelte';
	import StoryStage from '#lib/story/StoryStage.svelte';
	import type { LoadStorySource } from '#lib/story/storySource.ts';
	import {
		BEATS,
		CHAPTER_COPY_SOURCES,
		CHAPTERS,
		ORBIT_TARGET,
		UNSEEN_SUBTITLE,
		VELOCITY_BAND_TARGET
	} from './chapters.ts';
	import { timeMarkTarget } from './storyChecks.ts';
	import UnseenBackground from './UnseenBackground.svelte';
	import type { HiddenMarks, TextBox } from './unseenRenderer.ts';
	import { beatAt, chapterOf, scrollFor, type BeatProgress, type BeatSpan } from './unseenScene.ts';
	import { hiddenUnseenTargets, loadUnseenCompanion, type UnseenStoryData } from './unseenStory.ts';
	import { splitLines, splitsChars, textFrame, textStyleOf } from './unseenText.ts';
	import './theme.css';

	type Props = { loadSource: LoadStorySource };

	let { loadSource }: Props = $props();

	type Ready = { data: UnseenStoryData; hiddenTargets: Set<string> };
	type ViewState = { kind: 'loading' } | { kind: 'error' } | ({ kind: 'ready' } & Ready);

	const SITE_NAME = 'Plotline';
	const RESIZE_DEBOUNCE_MS = 160;
	// 출처를 펼쳤을 때 목록 위에 두는 안내(연출 한정)
	const SOURCE_GUIDES = ['하늘에 놓인 대상들의 자리는 연출을 위한 배치로, 실제 위치와 다릅니다.'];
	// 데이터 출처 아래: 그림용 정적 JSON 처리
	const DATA_NOTE =
		'그림 자료: 시리우스 궤도는 Bond 2017 궤도 요소와 Hipparcos 고유운동으로, 51 페가시는 NASA Exoplanet Archive 기본값(원 궤도 근사)으로 계산했습니다. 화면의 흔들림은 시리우스 2배 · 51 페가시 300배로 키워 그렸습니다.';
	const LAST_INDEX = BEATS.length - 1;

	let view = $state<ViewState>({ kind: 'loading' });
	let frame = $state<BeatProgress>({ index: 0, p: 0 });
	// 첫 비트 윗변 앞(표지가 보이는 동안): 글을 띄우지 않는다
	let before = $state(true);
	let layoutKey = $state(0);
	let beatElements = $state<HTMLElement[]>([]);
	let textElements = $state<HTMLElement[]>([]);
	let spans: BeatSpan[] = [];

	const ready = $derived(view.kind === 'ready' ? view : null);
	const reduceMotion = $derived(prefersReducedMotion.current);
	const activeId = $derived(before ? null : BEATS[frame.index].beat.id);
	const hiddenMarks = $derived<HiddenMarks>({
		velocityBand: ready !== null && ready.hiddenTargets.has(VELOCITY_BAND_TARGET),
		orbit: ready !== null && ready.hiddenTargets.has(ORBIT_TARGET)
	});

	/** 비트마다 화면에 보일 글(문구 대조로 숨긴 장 문단 · 시간 표지는 뺀다)과 글자 나눔 */
	const texts = $derived(
		BEATS.map(({ chapterIndex, beat }) => {
			const chapter = CHAPTERS[chapterIndex];
			const hidden = ready === null ? new Set<string>() : ready.hiddenTargets;
			const isFirstOfChapter = chapter.beats[0].id === beat.id;
			const timeMark =
				isFirstOfChapter && !hidden.has(timeMarkTarget(chapter.id)) ? chapter.timeMark : null;
			const lines = hidden.has(chapter.id) ? [] : beat.lines;
			const style = textStyleOf(chapterOf(beat.id));
			const split = splitsChars(style, reduceMotion) ? splitLines(lines) : null;
			const chars =
				split === null
					? []
					: split.parts.flat().flatMap((part) => (part.kind === 'word' ? part.chars : []));
			return { beat, timeMark, lines, style, split, chars };
		})
	);

	const frames = $derived(
		texts.map((text, index) =>
			textFrame(text.style, frame.p, {
				active: !before && index === frame.index,
				first: index === 0,
				last: index === LAST_INDEX,
				reduceMotion,
				chars: text.chars
			})
		)
	);

	function measureSpans(): void {
		spans = beatElements.map((element) => {
			const rect = element.getBoundingClientRect();
			return { top: rect.top + window.scrollY, height: rect.height };
		});
	}

	function readFrame(): void {
		const y = window.scrollY;
		before = y < spans[0].top - 0.5;
		frame = beatAt(y, spans);
	}

	// 글 층 기준 글 상자(transform 은 offset 값에 영향이 없어 등장 방식과 무관하다)
	function textBoxes(): TextBox[] {
		return textElements.map((element, index) => ({
			id: BEATS[index].beat.id,
			top: element.offsetTop,
			height: element.offsetHeight,
			left: element.offsetLeft,
			width: element.offsetWidth
		}));
	}

	async function load(): Promise<void> {
		view = { kind: 'loading' };
		const result = await loadUnseenCompanion(loadSource);
		if (result.kind === 'error') {
			view = { kind: 'error' };
			return;
		}
		view = { kind: 'ready', data: result.data, hiddenTargets: hiddenUnseenTargets(result.data) };
	}

	$effect(() => {
		if (ready === null || beatElements.length !== BEATS.length) return;
		untrack(() => {
			measureSpans();
			readFrame();
			layoutKey += 1;
		});
		let scheduled = 0;
		const schedule = (): void => {
			if (scheduled !== 0) return;
			scheduled = requestAnimationFrame(() => {
				scheduled = 0;
				readFrame();
			});
		};
		// 창 크기가 바뀌면 비트 높이(vh)도 바뀌므로, 바뀌기 전 장면(비트 · 진행 값)을 기억했다가 같은 장면으로 되돌린다
		let resizeTimer = 0;
		let anchor: BeatProgress | null = null;
		const onResize = (): void => {
			if (anchor === null) anchor = before ? null : { ...frame };
			window.clearTimeout(resizeTimer);
			resizeTimer = window.setTimeout(() => {
				measureSpans();
				if (anchor !== null) window.scrollTo(0, scrollFor(anchor.index, anchor.p, spans));
				anchor = null;
				readFrame();
				layoutKey += 1;
			}, RESIZE_DEBOUNCE_MS);
		};
		window.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', onResize);
		return () => {
			cancelAnimationFrame(scheduled);
			window.clearTimeout(resizeTimer);
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

<main class="story unseen-companion-theme" data-beat={activeId} data-progress={frame.p.toFixed(4)}>
	<StoryStage>
		{#snippet background()}
			{#if ready !== null}
				<UnseenBackground {frame} {layoutKey} hidden={hiddenMarks} {textBoxes} />
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
			<header class="cover">
				<h1>{ready.data.title}</h1>
				<p class="subtitle">{UNSEEN_SUBTITLE}</p>
				<p class="scroll-hint" aria-hidden="true">아래로 스크롤 ↓</p>
			</header>

			<!-- 글 층: 화면에 고정. 비트 글 상자 30개가 모두 있고, 지금 비트만 보인다(진행 값으로 정한 style). -->
			<div class="text-layer">
				{#each texts as text, index (text.beat.id)}
					<div
						class="txt {text.beat.slot}"
						class:arc={text.style === 'arc'}
						class:empty={text.timeMark === null && text.lines.length === 0}
						data-beat={text.beat.id}
						style={frames[index].box}
						bind:this={textElements[index]}
					>
						{#if text.timeMark !== null}<span class="chapter">{text.timeMark}</span>{/if}
						{#if text.split === null}
							{#each text.lines as line, lineIndex (lineIndex)}
								<span class="line">{line}</span>
							{/each}
						{:else}
							{#each text.split.parts as parts, lineIndex (lineIndex)}
								<span class="line"
									>{#each parts as part, partIndex (partIndex)}{#if part.kind === 'space'}{part.text}{:else}<span
												class="word"
												>{#each part.chars as slot (slot.index)}<span
														class="ch"
														style={frames[index].chars[slot.index]}>{slot.text}</span
													>{/each}</span
											>{/if}{/each}</span
								>
							{/each}
						{/if}
					</div>
				{/each}
			</div>

			<div class="beats">
				{#each CHAPTERS as chapter, chapterIndex (chapter.id)}
					<section class="chapter-span" aria-label={chapter.label}>
						{#each chapter.beats as beat (beat.id)}
							{@const index = BEATS.findIndex((entry) => entry.beat.id === beat.id)}
							<div
								class="beat"
								data-beat={beat.id}
								data-chapter={chapterIndex + 1}
								style:height="{beat.heightVh}vh"
								bind:this={beatElements[index]}
							></div>
						{/each}
					</section>
				{/each}
				<div class="tail"></div>
			</div>

			<section class="closing" aria-label="출처">
				<div class="closing-body">
					<div class="sources">
						<SourceList
							sources={ready.data.sources}
							copySources={CHAPTER_COPY_SOURCES}
							images={[]}
							note={DATA_NOTE}
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
	:global(body:has(.unseen-companion-theme.story)) {
		margin: 0;
		background: #03050c;
		overflow-x: hidden;
	}

	.story {
		min-height: 100svh;
		background: transparent;
		-webkit-text-size-adjust: 100%;
	}

	.top {
		position: relative;
		z-index: 2;
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

	/* 표지 글은 화면 아래쪽에 둔다(언덕 장면은 위쪽). 표지 + 위 막대 = 화면 높이라 첫 비트는 표지가 다 지난 뒤 시작한다. */
	.cover {
		position: relative;
		z-index: 2;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		min-height: calc(100svh - 44px);
		padding: 0 1rem 10svh;
		box-sizing: border-box;
		line-height: 1.5;
		word-break: keep-all;
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
		color: var(--story-accent);
		font-size: 1.125rem;
		font-weight: 600;
	}

	.scroll-hint {
		margin: 1.5rem 0 0;
		color: var(--story-muted);
		font-weight: 600;
	}

	/* ---------- 글 층(시제품 #textLayer · .txt 그대로) ---------- */
	.text-layer {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 1;
		height: 100vh;
		height: 100svh;
		pointer-events: none;
	}

	.txt {
		/* 모바일(짧은 변 390px 이하)은 16px · 좌우 16px 그대로, 넓은 화면은 가운데 1단 최대 640px · 글자는 짧은 변에 비례해 20px 까지 */
		position: absolute;
		left: max(16px, calc(50% - 320px));
		right: max(16px, calc(50% - 320px));
		margin: 0;
		font-size: clamp(16px, calc(16px + (100vmin - 390px) * 0.006), 20px);
		line-height: 1.6;
		padding: 12px 16px;
		background: var(--story-card);
		border-radius: 10px;
		opacity: 0;
		word-break: keep-all;
		overflow-wrap: anywhere;
		will-change: transform, opacity, filter;
	}

	.txt.empty {
		visibility: hidden;
	}

	/* 위 여백: 높이 844px 까지 12px, 그보다 높으면 높이에 비례(상한 64px). 렌더러 TEXT_TOP 계산과 같은 식 */
	.txt.top {
		top: clamp(12px, calc(8vh - 56px), 64px);
		top: clamp(12px, calc(8svh - 56px), 64px);
	}

	.txt.bottom {
		bottom: 22px;
	}

	.line {
		display: block;
	}

	.chapter {
		display: block;
		font-size: clamp(13px, calc(13px + (100vmin - 390px) * 0.004875), 16.25px);
		color: var(--story-muted);
		margin-bottom: 2px;
	}

	.word {
		white-space: nowrap;
	}

	.ch {
		display: inline-block;
	}

	.arc .ch {
		transform-origin: 50% 240px;
	}

	.beats {
		position: relative;
	}

	.beat {
		position: relative;
	}

	.tail {
		height: 100vh;
		height: 100svh;
	}

	/* 출처 절: 화면 전체 폭을 테마 바탕색으로 덮어 뒤의 그림 · 글 층이 비치지 않게 한다(5편과 같은 그라데이션 윗변). */
	.closing {
		position: relative;
		z-index: 2;
		padding: 24svh 0 6rem;
		background: linear-gradient(to bottom, rgb(3 5 12 / 0%), var(--story-bg) 24svh);
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

	.next {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin-top: 2rem;
		color: var(--story-text);
		font-weight: 700;
	}

	/* PC(가로 화면 · 폭 1024px 이상, 시제품 STEP 111 P1): 글은 왼쪽 세로 열(화면 높이 가운데)로, 그림은 그 오른쪽 영역으로.
	   렌더러 WIDE_QUERY 와 같은 조건. 세로 가운데 맞춤은 transform 대신 위아래 0 + margin auto(글 등장 방식이 transform 을 쓴다) */
	@media (min-width: 1024px) and (orientation: landscape) {
		.txt,
		.txt.top,
		.txt.bottom {
			left: max(32px, 5vw);
			right: auto;
			width: clamp(320px, 30vw, 440px);
			box-sizing: border-box;
			top: 0;
			bottom: 0;
			margin: auto 0;
			height: fit-content;
			font-size: clamp(20px, 1.6vw, 26px);
			line-height: 1.65;
			padding: 20px 24px;
			background: rgba(3, 5, 12, 0.82);
			border-left: 3px solid rgba(255, 207, 122, 0.7);
			border-radius: 12px;
		}

		.chapter {
			font-size: 0.85em;
			color: var(--story-accent);
			margin-bottom: 6px;
		}

		/* 원호 회전 중심: 모바일 글자 16px 에서 240px(= 15em) 을 새 글자 크기에 비례 */
		.arc .ch {
			transform-origin: 50% 15em;
		}

		.top,
		.cover {
			max-width: 1600px;
			margin: 0 auto;
			padding-left: max(32px, 5vw);
			padding-right: 2rem;
		}

		.cover {
			justify-content: center;
			padding-bottom: 0;
		}

		.cover h1,
		.cover p {
			max-width: clamp(320px, 30vw, 440px);
		}

		h1 {
			font-size: 3rem;
		}
	}
</style>
