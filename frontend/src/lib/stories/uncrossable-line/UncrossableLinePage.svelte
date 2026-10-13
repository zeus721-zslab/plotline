<script lang="ts">
	// 넘을 수 없는 선(D-44): 표지 → 9장 38비트(장 사이 암전 구간에 장 제목 카드) → 출처. 시제품(flow.src.html, STEP 120~123)의 흐름 그대로.
	// 배경은 Canvas 2D 한 장 + 8장 물결 WebGL(LineBackground), 글은 화면 아래 고정된 자막 한 칸(DOM)에 한 문장씩 보인다.
	// 장면은 스크롤 위치 → 구간(비트 · 진행값 p)만으로 정해지고, 문장은 p 를 문장 구간(cuts)으로 나눠 고른다(lineScene.ts).
	// 오른쪽 위 연도 · 왼쪽 위 장 바로가기 · 오른쪽 아래 정직성 표기는 이야기 구간 안에서만 보인다(표지 · 출처에서는 숨김).
	import { onMount, tick, untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { isLowEndDevice } from '#lib/story/device.ts';
	import LoadStatus from '#lib/story/LoadStatus.svelte';
	import SourceList from '#lib/story/SourceList.svelte';
	import StoryStage from '#lib/story/StoryStage.svelte';
	import type { LoadStorySource } from '#lib/story/storySource.ts';
	import {
		BEATS,
		CHAPTERS,
		SCORE_75_TARGET,
		SCORE_84_TARGET,
		SCORE_85_TARGET
	} from './chapters.ts';
	import LineBackground from './LineBackground.svelte';
	import type { CoverLine, HiddenMarks } from './lineRenderer.ts';
	import {
		BEAT_SENTENCES,
		ENTRIES,
		layoutTrack,
		resolveTrack,
		sentenceIndex,
		trackScrollFor,
		type TrackLayout,
		type TrackState
	} from './lineScene.ts';
	import { hiddenLineTargets, loadUncrossableLine, type LineStoryData } from './lineStory.ts';
	import {
		chapterCardAlpha,
		chapterYear,
		exitOpacity,
		navChapterOf,
		noteOf,
		rollingYear,
		SETTLED_FRAME,
		subStyleOf,
		subtitleFrame,
		SUB_EXIT_MS,
		YEAR_ROLL_MS,
		yearOf,
		type SubFrame
	} from './lineText.ts';
	import './theme.css';

	type Props = { loadSource: LoadStorySource };

	let { loadSource }: Props = $props();

	type Ready = { data: LineStoryData; hiddenTargets: Set<string> };
	type ViewState = { kind: 'loading' } | { kind: 'error' } | ({ kind: 'ready' } & Ready);
	// 이야기 구간 앞(표지) · 안 · 뒤(출처)
	type Phase = 'before' | 'track' | 'after';

	const SITE_NAME = 'Plotline';
	// 휴대폰 주소창 접힘 정도의 높이 변화로는 구간을 다시 잡지 않는다(시제품 RELAYOUT_HEIGHT_DELTA)
	const RELAYOUT_HEIGHT_DELTA = 150;
	const INITIAL_TRACK: TrackState = {
		kind: 'gap',
		entryIndex: 0,
		p: 0,
		prev: 0,
		next: 1,
		prevLocal: 0
	};

	let view = $state<ViewState>({ kind: 'loading' });
	let layout = $state<TrackLayout | null>(null);
	let layoutKey = $state(0);
	let track = $state<TrackState>(INITIAL_TRACK);
	let phase = $state<Phase>('before');
	let onscreen = $state(false);
	let lowEnd = $state(false);
	let yearText = $state('');
	let trackElement = $state<HTMLElement>();
	let coverElement = $state<HTMLElement>();
	let coverLineElement = $state<HTMLElement>();
	// 표지 구간에서만 기준선 위치(그 밖에는 null)
	let cover = $state<CoverLine | null>(null);
	let subElement = $state<HTMLElement>();
	let oldElement = $state<HTMLElement>();
	let rippleMap = $state<SVGFEDisplacementMapElement>();
	let rippleNoise = $state<SVGFETurbulenceElement>();
	let trackTop = 0;
	let layoutWidth = 0;
	let layoutHeight = 0;

	const ready = $derived(view.kind === 'ready' ? view : null);
	// 정지 모드: 동작 줄이기 또는 저사양(1~5편과 같은 판정). 자막은 즉시 전문, 장면은 비트마다 정지 그림
	const still = $derived(prefersReducedMotion.current || lowEnd);
	const hidden = $derived(ready === null ? new Set<string>() : ready.hiddenTargets);
	const marks = $derived<HiddenMarks>({
		score75: hidden.has(SCORE_75_TARGET),
		score84: hidden.has(SCORE_84_TARGET),
		score85: hidden.has(SCORE_85_TARGET)
	});
	const activeId = $derived(
		phase === 'track' && track.kind === 'beat' ? BEATS[track.beatIndex].beat.id : null
	);
	const chromeShown = $derived(phase === 'track');
	// 정직성 표기: 사라지는 동안에도 글을 남겨 두고 불투명도만 내린다
	let noteText = $state('');
	let noteShown = $state(false);
	const navChapter = $derived(chromeShown ? navChapterOf(track) : 0);
	// 장 제목 카드: 장 사이 암전 구간 가운데에서만(카드 내용은 마지막으로 보인 장을 유지해 사라질 때도 글이 남는다)
	const cardAlpha = $derived(chromeShown ? chapterCardAlpha(track) : 0);
	let cardChapter = $state(1);
	const cardYear = $derived.by(() => {
		const mark = chapterYear(cardChapter);
		return hidden.has(mark.target) ? '' : String(mark.year);
	});

	// ---------- 자막(글은 상태로 두어 Svelte 가 그리고, 시간 구동 연출인 스타일만 DOM 에 직접 준다) ----------
	let subText = $state('');
	let oldText = $state('');
	let subKey: string | null = null;
	let subStart = 0;
	let subChapter = 0;
	let subSettled = true;
	let oldSettled = true;
	let oldStartOpacity = 0;
	let yearShown = 0;
	let yearFrom = 0;
	let yearTarget = 0;
	let yearStart = 0;
	let animationFrame = 0;

	function applyFrame(element: HTMLElement, frame: SubFrame): void {
		element.style.opacity = String(frame.opacity);
		element.style.filter = frame.filter;
		element.style.transform = frame.transform;
		element.style.textShadow = frame.textShadow;
		element.style.clipPath = frame.clipPath;
	}

	/** 지금 장면의 문장(숨긴 비트는 빈 글) */
	function sentenceOf(state: TrackState): { key: string; text: string } {
		if (phase !== 'track' || state.kind !== 'beat') return { key: '', text: '' };
		const index = sentenceIndex(state.beatIndex, state.p);
		const id = BEATS[state.beatIndex].beat.id;
		const text = hidden.has(id) ? '' : BEAT_SENTENCES[state.beatIndex].sentences[index];
		return { key: `${id}:${index}`, text };
	}

	function setSentence(now: number): void {
		if (subElement === undefined || oldElement === undefined) return;
		const { key, text } = sentenceOf(track);
		if (key === subKey) return;
		// 바뀌기 전 문장은 겹친 칸에서 SUB_EXIT_MS 안에 사라진다(새 문장은 처음부터 다시 연출)
		const previous = subText;
		oldText = previous;
		oldStartOpacity = still || previous === '' ? 0 : Number(subElement.style.opacity) || 0;
		applyFrame(oldElement, { ...SETTLED_FRAME, opacity: oldStartOpacity });
		oldSettled = oldStartOpacity === 0;
		subKey = key;
		subText = text;
		subElement.dataset.key = key;
		subElement.dataset.start = String(now);
		subStart = now;
		subChapter = track.kind === 'beat' ? track.chapter : 0;
		subSettled = false;
		if (still) {
			// 동작 줄이기 · 저사양: 연출 없이 즉시 표시
			applyFrame(subElement, { ...SETTLED_FRAME, opacity: text === '' ? 0 : 1 });
			subSettled = true;
		}
	}

	function animateOld(now: number): void {
		if (oldSettled || oldElement === undefined) return;
		const elapsed = now - subStart;
		oldElement.style.opacity = String(exitOpacity(oldStartOpacity, elapsed));
		if (elapsed >= SUB_EXIT_MS) {
			oldElement.style.opacity = '0';
			oldText = '';
			oldSettled = true;
		}
	}

	function animateSentence(now: number): void {
		if (subSettled || subElement === undefined) return;
		if (subText === '') {
			applyFrame(subElement, { ...SETTLED_FRAME, opacity: 0 });
			subSettled = true;
			return;
		}
		const frame = subtitleFrame(subStyleOf(subChapter), now - subStart, now);
		applyFrame(subElement, frame);
		if (frame.ripple !== null && rippleMap !== undefined && rippleNoise !== undefined) {
			rippleMap.setAttribute('scale', frame.ripple.scale);
			rippleNoise.setAttribute('baseFrequency', frame.ripple.frequency);
		}
		if (frame.done) subSettled = true;
	}

	function setYear(now: number): void {
		const mark = yearOf(track);
		if (!chromeShown || hidden.has(mark.target)) {
			// 숨긴 연도(또는 이야기 구간 밖)는 비우고, 다음에 보일 연도는 굴리지 않고 바로 놓는다
			yearShown = 0;
			yearTarget = 0;
			yearText = '';
			return;
		}
		if (mark.year === yearTarget) return;
		yearFrom = yearShown === 0 ? mark.year : yearShown;
		yearTarget = mark.year;
		yearStart = now;
	}

	function animateYear(now: number): boolean {
		if (yearTarget === 0) return false;
		const elapsed = still ? YEAR_ROLL_MS : now - yearStart;
		const value = rollingYear(yearFrom, yearTarget, elapsed);
		if (value !== yearShown) {
			yearShown = value;
			yearText = String(value);
		}
		return value !== yearTarget;
	}

	// 문장 · 연도 연출은 움직이는 동안만 rAF 를 돈다(새 문장 SUB_ENTER_MS · 지난 문장 SUB_EXIT_MS · 연도 YEAR_ROLL_MS)
	function animate(now: number): void {
		animationFrame = 0;
		animateSentence(now);
		animateOld(now);
		const rolling = animateYear(now);
		if (!subSettled || !oldSettled || rolling) animationFrame = requestAnimationFrame(animate);
	}

	function updateText(now: number): void {
		setSentence(now);
		setYear(now);
		if (chromeShown && track.kind === 'gap' && track.next !== 0) cardChapter = track.next;
		const note = chromeShown ? noteOf(track) : '';
		if (note !== '') noteText = note;
		noteShown = note !== '';
		if (animationFrame === 0) animate(now);
	}

	// ---------- 스크롤 → 구간 ----------
	function measureTrackTop(): void {
		if (trackElement === undefined) return;
		trackTop = trackElement.getBoundingClientRect().top + window.scrollY;
	}

	// 표지 기준선: 표지 안 높이 0 표시 요소의 화면 y 를 스크롤 · 리사이즈 때마다 다시 읽는다(표지 글과 선이 어긋나지 않게).
	// c 는 스크롤 0 부터 표지 높이까지 0~1
	function readCover(): CoverLine | null {
		if (phase !== 'before' || coverElement === undefined || coverLineElement === undefined)
			return null;
		const height = coverElement.offsetHeight;
		const c = height > 0 ? Math.min(1, Math.max(0, window.scrollY / height)) : 1;
		return { y: coverLineElement.getBoundingClientRect().top, c };
	}

	function readTrack(now: number): void {
		if (layout === null) return;
		const relative = window.scrollY - trackTop;
		phase = relative < 0 ? 'before' : relative >= layout.total ? 'after' : 'track';
		track = resolveTrack(relative, layout);
		cover = readCover();
		updateText(now);
	}

	async function relayout(): Promise<void> {
		const anchor = phase === 'track' ? { entryIndex: track.entryIndex, p: track.p } : null;
		layoutWidth = document.documentElement.clientWidth;
		layoutHeight = window.innerHeight;
		const next = layoutTrack(layoutHeight);
		layout = next;
		await tick();
		measureTrackTop();
		if (anchor !== null)
			window.scrollTo(0, trackTop + trackScrollFor(anchor.entryIndex, anchor.p, next));
	}

	async function load(): Promise<void> {
		view = { kind: 'loading' };
		const result = await loadUncrossableLine(loadSource);
		if (result.kind === 'error') {
			view = { kind: 'error' };
			return;
		}
		view = { kind: 'ready', data: result.data, hiddenTargets: hiddenLineTargets(result.data) };
	}

	$effect(() => {
		if (ready === null || trackElement === undefined || coverElement === undefined) return;
		const element = trackElement;
		const coverTarget = coverElement;
		let disposed = false;
		let scheduled = 0;
		let resizeQueued = 0;
		const schedule = (): void => {
			if (scheduled !== 0) return;
			scheduled = requestAnimationFrame((now) => {
				scheduled = 0;
				readTrack(now);
			});
		};
		// 크기가 바뀌면 캔버스는 늘 다시 잡고(layoutKey), 구간 높이는 폭이 바뀌었거나 높이가 크게 바뀐 때만 다시 잡는다
		const onResize = (): void => {
			if (resizeQueued !== 0) return;
			resizeQueued = requestAnimationFrame(async (now) => {
				resizeQueued = 0;
				const width = document.documentElement.clientWidth;
				const height = window.innerHeight;
				if (width !== layoutWidth || Math.abs(height - layoutHeight) > RELAYOUT_HEIGHT_DELTA)
					await relayout();
				else measureTrackTop();
				if (disposed) return;
				layoutKey += 1;
				readTrack(now);
			});
		};
		// 표지 또는 이야기 구간이 화면에 있으면 루프를 돈다(표지의 기준선 맥박도 루프가 그린다)
		let coverVisible = false;
		let trackVisible = false;
		const observer = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (entry.target === coverTarget) coverVisible = entry.isIntersecting;
				else if (entry.target === element) trackVisible = entry.isIntersecting;
			}
			onscreen = coverVisible || trackVisible;
		});
		observer.observe(element);
		observer.observe(coverTarget);
		void untrack(relayout).then(() => {
			if (disposed) return;
			layoutKey += 1;
			readTrack(performance.now());
		});
		window.addEventListener('scroll', schedule, { passive: true });
		window.addEventListener('resize', onResize);
		return () => {
			disposed = true;
			observer.disconnect();
			cancelAnimationFrame(scheduled);
			cancelAnimationFrame(resizeQueued);
			cancelAnimationFrame(animationFrame);
			animationFrame = 0;
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
	class="story uncrossable-line-theme"
	data-beat={activeId}
	data-progress={track.p.toFixed(4)}
	data-phase={phase}
>
	<StoryStage>
		{#snippet background()}
			{#if ready !== null}
				<LineBackground {track} {layoutKey} {marks} {still} {onscreen} {cover} />
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
			<header class="cover" bind:this={coverElement}>
				<h1>{ready.data.title}</h1>
				<!-- 기준선 자리(높이 0). 배경 렌더러가 이 요소의 화면 y 에 붉은 선을 긋는다 -->
				<div class="cover-line" aria-hidden="true" bind:this={coverLineElement}></div>
				<p class="scroll-hint" aria-hidden="true">아래로 스크롤 ↓</p>
			</header>

			<!-- 자막 · 화면 표기(화면에 고정). 자막은 들어오는 문장과 사라지는 문장을 같은 칸에 겹쳐 놓는다(아래 끝 맞춤) -->
			<svg class="defs" aria-hidden="true" focusable="false">
				<filter id="line-ripple" x="-10%" y="-40%" width="120%" height="180%">
					<feTurbulence
						bind:this={rippleNoise}
						type="fractalNoise"
						baseFrequency="0.012 0.09"
						numOctaves="2"
						seed="3"
						result="noise"
					></feTurbulence>
					<feDisplacementMap
						bind:this={rippleMap}
						in="SourceGraphic"
						in2="noise"
						scale="0"
						xChannelSelector="R"
						yChannelSelector="G"
					></feDisplacementMap>
				</filter>
			</svg>
			<div class="shade" aria-hidden="true"></div>
			<div class="subwrap">
				<div class="substack">
					<p class="sub" aria-hidden="true" bind:this={oldElement}>{oldText}</p>
					<p class="sub current" aria-live="polite" bind:this={subElement}>
						<span>{subText}</span>
					</p>
				</div>
			</div>
			<nav class="jump" class:shown={chromeShown} aria-label="장 바로가기">
				{#each CHAPTERS as chapter (chapter.number)}
					<a
						href="#ch-{chapter.number}"
						class:on={navChapter === chapter.number}
						aria-label="{chapter.number}장">{chapter.number}</a
					>
				{/each}
			</nav>
			<div class="year" class:shown={chromeShown} aria-hidden="true">{yearText}</div>
			<div class="chapter-card" aria-hidden="true" style:opacity={cardAlpha.toFixed(3)}>
				<div class="num">{cardChapter}장</div>
				<div class="title">{CHAPTERS[cardChapter - 1].title}</div>
				<div class="when">{cardYear}</div>
			</div>
			<div class="note" style:opacity={noteShown ? 1 : 0}>{noteText}</div>

			<!-- 이야기 구간: 장 사이 암전 구간(gap)과 비트 구간(beat). 높이는 vh 를 화면 높이 px 로 바꿔 둔다(시제품 layout) -->
			<div class="track" bind:this={trackElement}>
				{#each ENTRIES as entry, index (index)}
					{#if entry.kind === 'beat'}
						{@const beat = BEATS[entry.beatIndex].beat}
						<div
							class="beat"
							data-beat={beat.id}
							data-chapter={entry.chapter}
							id={entry.index === 0 ? `ch-${entry.chapter}` : undefined}
							style:height={layout === null ? `${entry.vh}vh` : `${layout.heights[index]}px`}
						>
							<p class="sr">{hidden.has(beat.id) ? '' : beat.text}</p>
						</div>
					{:else}
						<div
							class="gap"
							style:height={layout === null ? `${entry.vh}vh` : `${layout.heights[index]}px`}
						></div>
					{/if}
				{/each}
			</div>

			<section class="closing" aria-label="출처">
				<div class="closing-body">
					<div class="sources">
						<SourceList sources={ready.data.sources} copySources={[]} images={[]} />
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
	:global(body:has(.uncrossable-line-theme.story)) {
		margin: 0;
		background: #0a0807;
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
	.next:focus-visible,
	.jump a:focus-visible {
		outline: 3px solid var(--story-text);
		outline-offset: 2px;
	}

	.status {
		padding: 20vh 1rem;
	}

	/* 표지: 표지 + 위 막대 = 화면 높이라 이야기 구간(첫 장 제목 카드)은 표지가 다 지난 뒤 시작한다 */
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

	.scroll-hint {
		margin: 1.5rem 0 0;
		color: var(--story-muted);
		font-weight: 600;
	}

	/* 휴대폰 · 태블릿: 제목 아래 12px(제목과 안내 사이)에 선이 지나간다. 아래 여백을 같은 값만큼 빼 제목 · 안내 위치는 그대로 둔다 */
	.cover-line {
		height: 0;
		margin: 12px 0 -12px;
	}

	/* ---------- 자막 · 화면 표기(시제품 #shade · #subwrap · #jump · #year · #chapter · #note) ---------- */
	.defs {
		position: absolute;
		width: 0;
		height: 0;
	}

	/* 휴대폰: 자막을 그림 바로 아래(28%)로 올린 만큼 그림자층을 높여 자막 대비 14 이상을 지킨다(STEP 131 측정: 74% 14.0 · 76% 14.2) */
	.shade {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		height: 76%;
		z-index: 2;
		pointer-events: none;
		background: linear-gradient(
			to top,
			rgba(5, 4, 3, 0.88) 0%,
			rgba(5, 4, 3, 0.66) 36%,
			rgba(5, 4, 3, 0.24) 70%,
			rgba(5, 4, 3, 0) 100%
		);
	}

	.subwrap {
		position: fixed;
		left: 0;
		right: 0;
		/* 휴대폰 세로: 그림(화면 위 0.38~0.45)과 떨어지지 않게 자막을 그림 바로 아래에 둔다(STEP 131) */
		bottom: 28%;
		z-index: 3;
		pointer-events: none;
		display: flex;
		justify-content: center;
		padding: 0 20px;
	}

	.substack {
		display: grid;
		max-width: 720px;
		width: 100%;
		justify-items: center;
		align-items: end;
	}

	.sub {
		grid-area: 1 / 1;
		margin: 0;
		max-width: 720px;
		text-align: center;
		font-size: 17px;
		line-height: 1.62;
		letter-spacing: -0.005em;
		word-break: keep-all;
		overflow-wrap: break-word;
		text-wrap: balance;
		color: var(--story-text);
		text-shadow: var(--sub-shadow);
		opacity: 0;
		transform-origin: 50% 100%;
	}

	.jump {
		position: fixed;
		top: calc(10px + env(safe-area-inset-top));
		left: 10px;
		z-index: 4;
		display: flex;
		gap: 4px;
		visibility: hidden;
	}

	.jump a {
		font-size: 11px;
		color: rgba(240, 228, 212, 0.72);
		text-decoration: none;
		font-variant-numeric: tabular-nums;
		padding: 4px 8px;
		border-radius: 999px;
		background: rgba(255, 245, 230, 0.07);
		border: 1px solid rgba(255, 240, 220, 0.12);
	}

	.jump a.on {
		color: #fff6ea;
		background: rgba(255, 245, 230, 0.16);
	}

	.year {
		position: fixed;
		top: calc(14px + env(safe-area-inset-top));
		right: 14px;
		z-index: 4;
		pointer-events: none;
		font-size: 12px;
		letter-spacing: 0.14em;
		color: rgba(240, 228, 212, 0.72);
		font-variant-numeric: tabular-nums;
		text-shadow: var(--sub-shadow);
		visibility: hidden;
	}

	.jump.shown,
	.year.shown {
		visibility: visible;
	}

	.chapter-card {
		position: fixed;
		left: 0;
		right: 0;
		top: 38%;
		z-index: 3;
		text-align: center;
		opacity: 0;
		pointer-events: none;
		padding: 0 20px;
	}

	.chapter-card .num {
		font-size: 12px;
		letter-spacing: 0.3em;
		color: rgba(240, 228, 212, 0.6);
	}

	.chapter-card .title {
		margin-top: 12px;
		font-size: 21px;
		font-weight: 300;
		letter-spacing: 0.04em;
		color: var(--story-text);
		word-break: keep-all;
	}

	.chapter-card .when {
		margin-top: 12px;
		font-size: 12px;
		letter-spacing: 0.22em;
		color: rgba(240, 228, 212, 0.55);
		font-variant-numeric: tabular-nums;
	}

	.note {
		position: fixed;
		right: 12px;
		bottom: calc(10px + env(safe-area-inset-bottom));
		z-index: 4;
		font-size: 10.5px;
		color: rgba(235, 222, 205, 0.6);
		opacity: 0;
		transition: opacity 0.6s;
		pointer-events: none;
	}

	.track {
		position: relative;
	}

	.beat,
	.gap {
		position: relative;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	/* 출처 절: 화면 전체 폭을 테마 바탕색으로 덮어 뒤의 그림 · 자막 층이 비치지 않게 한다(6편과 같은 그라데이션 윗변). */
	.closing {
		position: relative;
		z-index: 5;
		padding: 24svh 0 6rem;
		background: linear-gradient(to bottom, rgb(10 8 7 / 0%), var(--story-bg) 24svh);
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

	@media (min-width: 768px) {
		.subwrap {
			bottom: 13%;
		}

		.sub {
			font-size: 22px;
			line-height: 1.6;
		}

		.shade {
			height: 42%;
		}

		.chapter-card .title {
			font-size: 28px;
		}
	}

	/* PC 가로 화면(6편과 같은 조건): 표지 위에서 62% 에 기준선, 제목은 선 위 20px · 안내는 선 아래 22px 에 왼쪽 12vw 로 맞추고 나머지는 비워 둔다.
	   제목 줄 높이를 1 로 두어 글자 아래쪽이 상자 아래쪽에 가깝게 한다 */
	@media (min-width: 1024px) and (orientation: landscape) {
		.cover {
			display: block;
			padding: 0;
		}

		.cover-line {
			position: absolute;
			top: 62%;
			right: 0;
			left: 0;
			margin: 0;
		}

		h1 {
			position: absolute;
			bottom: calc(38% + 20px);
			left: 12vw;
			font-size: clamp(2.25rem, 2.4vw, 3rem);
			font-weight: 300;
			line-height: 1;
			letter-spacing: 0.18em;
			color: var(--story-text);
		}

		.scroll-hint {
			position: absolute;
			top: calc(62% + 22px);
			left: 12vw;
			margin: 0;
			font-size: 12px;
			letter-spacing: 0.2em;
			color: var(--story-muted);
			opacity: 0.7;
		}
	}
</style>
