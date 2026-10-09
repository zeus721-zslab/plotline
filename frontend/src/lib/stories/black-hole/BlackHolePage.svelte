<script lang="ts">
	// 사건의 지평선 너머 스토리: 표지(2편 끝 그림자) → 11장(멀리서 → 지평선 → 특이점 → 끝) → 출처. 상단 계기판 한 줄만 고정하고,
	// 블랙홀 단면 지도 캔버스 위로 카드가 지나간다. 데이터는 출처(loadSource)에서 읽는다(D-37). 끝에는 다음 이야기 링크가 없다(D-39).
	// 장마다 카드 앞에 빈 장면 구간을 두어, 배경(카메라 · 띠 강조 · 여행자)이 먼저 다음 경계로 옮겨 간 뒤 카드가 올라오게 한다.
	// PC(1024px 이상)는 최대 1600px 구도를 4:6 으로 나눠 카드를 왼쪽 열의 가운데 선 쪽에 두고, 지도 초점은 오른쪽 영역에 둔다(fallRenderer.ts 와 같은 값).
	// 지도 그림은 화면 전체 폭에 깔린다.
	import { onMount, untrack } from 'svelte';
	import { NO_ACTIVE_STEP } from '#lib/story/activeStep.ts';
	import Aside from '#lib/story/Aside.svelte';
	import LoadStatus from '#lib/story/LoadStatus.svelte';
	import SourceList from '#lib/story/SourceList.svelte';
	import StoryCard from '#lib/story/StoryCard.svelte';
	import StoryFigure from '#lib/story/StoryFigure.svelte';
	import StoryStage from '#lib/story/StoryStage.svelte';
	import { fillTemplate } from '#lib/story/storyConfig.ts';
	import type { LoadStorySource } from '#lib/story/storySource.ts';
	import type { StoryImage } from '#lib/story/storyMedia.ts';
	import { asideCopySource, asStepAside, CHAPTER_ASIDES, type ChapterAside } from './asides.ts';
	import {
		BLACK_HOLE_IMAGES,
		hiddenBlackHoleTargets,
		loadBlackHole,
		type BlackHoleData
	} from './blackHoleStory.ts';
	import BranchToggle from './BranchToggle.svelte';
	import {
		BLACK_HOLE_SUBTITLE,
		BRANCH_CHAPTER,
		BRANCH_TEXT,
		CHAPTER_COPY_SOURCES,
		CHAPTERS,
		chapterSlots,
		type Chapter
	} from './chapters.ts';
	import FallBackground from './FallBackground.svelte';
	import { branchGaugeText, gaugeReading } from './fallMath.ts';
	import Gauge from './Gauge.svelte';
	import { CYGNUS_X1_HOLE, M87_HOLE } from './holeData.ts';
	import { buildMapLayout, type MapLayout } from './mapLayout.ts';
	import type { SceneId } from './scenes.ts';
	import { asideTarget, branchGaugeTarget, branchTarget, gaugeTarget } from './storyChecks.ts';
	import './theme.css';

	type Props = { loadSource: LoadStorySource };

	let { loadSource }: Props = $props();

	type Ready = {
		data: BlackHoleData;
		slots: Record<string, string>;
		hiddenTargets: Set<string>;
		layout: MapLayout;
	};
	type ViewState = { kind: 'loading' } | { kind: 'error' } | ({ kind: 'ready' } & Ready);
	type GaugeView =
		{ kind: 'reading'; distance: string; time: string } | { kind: 'text'; text: string };

	const SITE_NAME = 'Plotline';
	const SOURCE_NOTE =
		'질량과 경계 배수는 출처의 값을 그대로 두고 화면에서 계산했습니다. 지평선 반지름은 태양 질량 1배당 2.953 km 로 셈하고 앞 두 자리로 반올림했습니다. "여기 머문다면" 시간은 그 자리에 멈춰 있는 사람 기준이며, 블랙홀의 회전을 뺀 어림(√(1 − 1/r), r 은 지평선의 몇 배)입니다.';
	// 장 구역(빈 장면 구간 포함) 윗변이 화면 위에서 이 비율 지점(화면 아래쪽)에 들어오면 배경 · 계기판이 그 장으로 바뀐다.
	// 장 판정은 배경 장면 · 계기판에만 쓰고, 카드 쪽(문구 대조 숨김 등)은 장 판정과 무관하다.
	// 화면 높이는 innerHeight 대신 작은 화면 높이(100svh, .viewport-probe)를 쓴다. 휴대폰 주소창이 접히고 펴져도 값이 그대로라
	// 전환선이 흔들리지 않고, 빈 장면 구간(CSS svh)과 같은 기준이 된다.
	const SCENE_LINE_RATIO = 0.88;
	// 전환선을 지난 뒤 이만큼(화면 높이 비율) 스크롤하는 동안 배경이 새 장으로 옮겨 간다. 빈 장면 구간(CSS .scene-gap)보다 짧아
	// 카드가 화면 아래 75% 선에 닿기 전에 끝난다.
	const TRANSITION_SHARE = 0.35;
	// 7장 신호 띠 깜빡임: 전환선을 지나 이 구간(화면 높이 비율)을 스크롤하는 동안 간격이 벌어지고 붉어지다 평평해진다.
	// 카드 윗변이 75% 선에 오기(빈 장면 구간 + 13svh: 휴대폰 78svh · PC 58svh) 전에 끝난다.
	// 휴대폰은 앞 장 카드(뒤 여백 40svh)가 신호 띠(계기판 바로 아래)를 지나간 뒤(약 42svh)부터, PC 는 카드가 띠를 가리지 않아
	// 띠가 다 나타난 뒤부터 센다.
	const FADE_WINDOW_MOBILE = { start: 0.45, end: 0.72 };
	const FADE_WINDOW_DESKTOP = { start: 0.25, end: 0.52 };
	// BlackHolePage 의 PC 미디어 쿼리 · fallRenderer.ts SPLIT_MIN_WIDTH_PX 와 같은 값
	const DESKTOP_QUERY = '(min-width: 1024px)';
	// 한 번에 이만큼 이상 장이 바뀌면(위치 복원 · 빠른 스크롤) 배경을 옮겨 가기 없이 그 장 값으로 바로 놓는다.
	const JUMP_CHAPTERS = 2;
	const FULL_PROGRESS = 1;
	// 출처 절 "문구 출처": 장 문구 출처 다음에 곁들임 카드 출처(카드 순서)
	const COPY_SOURCES = [...CHAPTER_COPY_SOURCES, ...CHAPTER_ASIDES.map(asideCopySource)];

	let view = $state<ViewState>({ kind: 'loading' });
	let activeIndex = $state(NO_ACTIVE_STEP);
	let sceneProgress = $state(FULL_PROGRESS);
	let sceneFade = $state(FULL_PROGRESS);
	let sceneJump = $state(false);
	let viewportProbe: HTMLElement;
	// 전환선 기준 화면 높이(100svh)와 7장 신호 띠 깜빡임이 사라지는 구간. 화면 크기 이벤트 때만 다시 잰다.
	let viewportHeight = 0;
	let fadeWindow = FADE_WINDOW_MOBILE;
	let branchOpen = $state(false);
	let chapterElements = $state<HTMLElement[]>([]);

	const ready = $derived(view.kind === 'ready' ? view : null);
	const activeChapter = $derived(activeIndex === NO_ACTIVE_STEP ? null : CHAPTERS[activeIndex]);
	const scene = $derived<SceneId>(sceneOf(activeChapter, branchOpen));
	const gauge = $derived(
		ready === null || activeChapter === null ? null : gaugeOf(ready, activeChapter)
	);

	function sceneOf(chapter: Chapter | null, branch: boolean): SceneId {
		if (chapter === null) return 'cover';
		// 9장 분기를 누른 동안만 작은 블랙홀 화면
		return chapter.id === BRANCH_CHAPTER && branch ? 'spaghetti-small' : chapter.id;
	}

	function gaugeOf(current: Ready, chapter: Chapter): GaugeView | null {
		if (chapter.id === BRANCH_CHAPTER && branchOpen) return branchGaugeOf(current);
		if (current.hiddenTargets.has(gaugeTarget(chapter.id))) return null;
		if (chapter.gauge.kind === 'text') return { kind: 'text', text: chapter.gauge.text };
		const m87 = current.data.holes.get(M87_HOLE);
		const boundary = current.data.boundaries.get(chapter.gauge.boundary);
		if (m87 === undefined || boundary === undefined || boundary.radiusRs === null) return null;
		const reading = gaugeReading(m87.massSolar, boundary.radiusRs);
		return reading === null ? null : { kind: 'reading', ...reading };
	}

	/** 9장 분기를 누른 동안: 작은 블랙홀 이름과 지평선 반지름 */
	function branchGaugeOf(current: Ready): GaugeView | null {
		if (current.hiddenTargets.has(branchGaugeTarget(BRANCH_CHAPTER))) return null;
		const cygnus = current.data.holes.get(CYGNUS_X1_HOLE);
		return cygnus === undefined ? null : { kind: 'text', text: branchGaugeText(cygnus) };
	}

	function readViewport(): void {
		const probed = viewportProbe.getBoundingClientRect().height;
		viewportHeight = probed > 0 ? probed : window.innerHeight;
		fadeWindow = window.matchMedia(DESKTOP_QUERY).matches
			? FADE_WINDOW_DESKTOP
			: FADE_WINDOW_MOBILE;
	}

	function clampShare(value: number): number {
		return Math.min(FULL_PROGRESS, Math.max(0, value));
	}

	/** 전환선을 지난 마지막 장 · 그 장으로 옮겨 간 정도(0~1) · 7장 신호 띠 깜빡임이 사라진 정도를 잰다. 표지에서는 옮겨 갈 것이 없어 1. */
	function measureScene(): void {
		const line = viewportHeight * SCENE_LINE_RATIO;
		let passed = NO_ACTIVE_STEP;
		chapterElements.forEach((element, index) => {
			if (element.getBoundingClientRect().top < line) passed = index;
		});
		if (passed !== activeIndex) {
			sceneJump = Math.abs(passed - activeIndex) >= JUMP_CHAPTERS;
			activeIndex = passed;
		}
		if (passed === NO_ACTIVE_STEP) {
			sceneProgress = FULL_PROGRESS;
			sceneFade = FULL_PROGRESS;
			return;
		}
		const moved = (line - chapterElements[passed].getBoundingClientRect().top) / viewportHeight;
		sceneProgress = clampShare(moved / TRANSITION_SHARE);
		sceneFade = clampShare((moved - fadeWindow.start) / (fadeWindow.end - fadeWindow.start));
	}

	async function load(): Promise<void> {
		view = { kind: 'loading' };
		const result = await loadBlackHole(loadSource);
		if (result.kind === 'error') {
			view = { kind: 'error' };
			return;
		}
		const slots = chapterSlots(result.data.holes);
		view = {
			kind: 'ready',
			data: result.data,
			slots,
			hiddenTargets: hiddenBlackHoleTargets(result.data, slots),
			layout: buildMapLayout(result.data.boundaries)
		};
	}

	function imageOf(id: string | null): StoryImage | null {
		if (id === null) return null;
		const image = BLACK_HOLE_IMAGES.find((candidate) => candidate.id === id);
		return image === undefined ? null : image;
	}

	function shownAsides(current: Ready, chapterId: string): ChapterAside[] {
		return CHAPTER_ASIDES.filter(
			(aside) =>
				aside.chapterId === chapterId &&
				!current.hiddenTargets.has(asideTarget(chapterId, aside.id))
		);
	}

	// 스크롤 · 화면 크기가 바뀔 때 장 · 진행도를 프레임당 한 번만 다시 잰다(장 판정도 같은 전환선 · 같은 화면 높이로).
	// 잰 값(activeIndex)을 이 효과가 다시 따라가지 않게 untrack 으로 잰다.
	$effect(() => {
		if (ready === null || chapterElements.length !== CHAPTERS.length) return;
		untrack(() => {
			readViewport();
			measureScene();
		});
		let frame = 0;
		const schedule = (): void => {
			if (frame !== 0) return;
			frame = requestAnimationFrame(() => {
				frame = 0;
				measureScene();
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

<main class="story black-hole-theme">
	<div class="viewport-probe" aria-hidden="true" bind:this={viewportProbe}></div>
	<StoryStage>
		{#snippet background()}
			{#if ready !== null}
				<FallBackground
					{scene}
					progress={sceneProgress}
					fade={sceneFade}
					instant={sceneJump}
					layout={ready.layout}
				/>
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
			{#if gauge !== null}
				{#if gauge.kind === 'reading'}
					<Gauge reading={gauge} />
				{:else}
					<Gauge text={gauge.text} />
				{/if}
			{/if}

			<header class="cover">
				<h1>{ready.data.title}</h1>
				<p class="subtitle">{BLACK_HOLE_SUBTITLE}</p>
				<p class="scroll-hint" aria-hidden="true">아래로 스크롤 ↓</p>
			</header>

			{#each CHAPTERS as chapter, index (chapter.id)}
				{@const image = imageOf(chapter.photo)}
				{@const verified = !ready.hiddenTargets.has(chapter.id)}
				<section
					class="chapter"
					aria-label={`${chapter.label} ${chapter.title}`}
					bind:this={chapterElements[index]}
				>
					<div class="scene-gap" aria-hidden="true"></div>
					{#snippet media()}
						{#if chapter.imagined}
							<p class="imagined-tag">상상</p>
						{/if}
						{#if image !== null}<StoryFigure {image} />{/if}
					{/snippet}
					<div class="card">
						<StoryCard
							label={chapter.label}
							title={chapter.title}
							body={fillTemplate(chapter.body, ready.slots)}
							{verified}
							sources={[]}
							aside={null}
							asideSources={[]}
							asideImage={null}
							media={image === null && !chapter.imagined ? undefined : media}
						>
							<!-- 본문에 이어지는 문단 · 분기 · 곁들임 카드는 장 문구가 대조를 통과했을 때만 보인다. -->
							{#if verified}
								{#each chapter.followers as follower, followerIndex (followerIndex)}
									{#if follower.kind === 'who'}
										<p class="who">{follower.who}</p>
										<p class="body">{follower.text}</p>
									{:else if follower.kind === 'options'}
										<ol class="options">
											{#each follower.items as item (item)}
												<li>{item}</li>
											{/each}
										</ol>
									{:else}
										<div class="imagined-part">
											<p class="imagined-tag">상상</p>
											<p class="body">{follower.text}</p>
										</div>
									{/if}
								{/each}
								{#if chapter.id === BRANCH_CHAPTER && !ready.hiddenTargets.has(branchTarget(chapter.id))}
									<BranchToggle
										bind:open={branchOpen}
										text={fillTemplate(BRANCH_TEXT, ready.slots)}
									/>
								{/if}
								{#each shownAsides(ready, chapter.id) as aside (aside.id)}
									<Aside
										aside={asStepAside(aside)}
										sources={[asideCopySource(aside)]}
										image={null}
									/>
								{/each}
							{/if}
							{#if chapter.imaginedDrawing}
								<p class="drawing-note">배경 그림: 코드로 그린 상상도</p>
							{/if}
						</StoryCard>
					</div>
				</section>
			{/each}

			<section class="closing" aria-label="출처">
				<SourceList
					sources={ready.data.sources}
					copySources={COPY_SOURCES}
					images={BLACK_HOLE_IMAGES}
					note={SOURCE_NOTE}
				/>
			</section>
		{/if}
	</StoryStage>
</main>

<style>
	/* 본문 밖(넘침 스크롤) 영역도 테마 바탕색(theme.css --story-bg 와 같은 값)으로 둔다. */
	:global(body:has(.black-hole-theme.story)) {
		margin: 0;
		background: #03040a;
	}

	.story {
		min-height: 100svh;
		line-height: 1.6;
		word-break: keep-all;
		background: transparent;
	}

	/* 전환선 기준 화면 높이(작은 화면 높이 100svh)를 재는 보이지 않는 막대 */
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
		font-size: 2.5rem;
		font-weight: 700;
		line-height: 1.2;
	}

	.subtitle {
		margin: 1rem 0 0;
		color: var(--story-cell-on);
		font-size: 1.25rem;
		font-weight: 600;
	}

	.scroll-hint {
		margin: 3rem 0 0;
		color: var(--story-muted);
		font-weight: 600;
	}

	/* 장 사이를 비워 배경이 보이게 한다. 카드 앞 빈 장면 구간(.scene-gap) 동안 배경이 먼저 옮겨 가고(TRANSITION_SHARE 35svh),
	   카드는 그 뒤에 화면 아래에서 올라온다. 카드 뒤 여백(40svh)은 짧은 카드가 화면 가운데에 있을 때도 다음 장 구역이 전환선(88%)
	   아래에 남아 그 장 배경이 유지되게 한다(카드 가운데일 때 다음 구역 윗변 = 50% + 카드 절반 + 40% ≥ 90%). */
	.chapter {
		padding: 0 1rem 40svh;
	}

	.scene-gap {
		height: 65svh;
	}

	.card {
		max-width: 560px;
		margin: 0 auto;
	}

	/* 휴대폰: 카드가 화면 가운데에 와도 지도 초점(위쪽 약 1/3)을 덜 가리게 카드 안 사진을 낮춘다. */
	@media (max-width: 1023px) {
		.card :global(figure img) {
			max-height: 24svh;
		}
	}

	/* PC: 구도는 최대 1600px 가운데 정렬, 그 안을 4:6 으로 나눈다(fallRenderer.ts COMPOSITION_MAX_PX · CARD_COLUMN_SHARE).
	   카드(최대 460px)는 왼쪽 열의 오른쪽 끝(가운데 선에서 2rem 안쪽)에 붙이고, 지도 초점은 오른쪽 6할 영역에 둔다(그림은 화면 전체 폭).
	   카드가 지도를 가리지 않으므로 빈 장면 구간은 전환(35svh)이 끝나고 카드가 75% 선 아래에서 들어올 만큼만 둔다. */
	@media (min-width: 1024px) {
		.chapter {
			max-width: 1600px;
			margin: 0 auto;
			padding-right: 0;
			padding-left: 0;
		}

		.scene-gap {
			height: 45svh;
		}

		.card {
			--card-width: min(460px, 40% - 4rem);

			width: var(--card-width);
			max-width: none;
			margin: 0 0 0 calc(40% - 2rem - var(--card-width));
		}
	}

	/* StoryCard 안 본문과 같은 간격(StoryCard.svelte .body 와 같은 값, 이 블록은 부모 쪽에서 그려 따로 둔다). */
	.body {
		margin: 0.625rem 0 0;
	}

	.who {
		margin: 1rem 0 0;
		color: var(--story-cell-on);
		font-size: 0.9375rem;
		font-weight: 700;
	}

	.options {
		display: grid;
		gap: 0.5rem;
		margin: 0.75rem 0 0;
		padding: 0;
		list-style: none;
		counter-reset: option;
	}

	.options li {
		padding: 0.625rem 0.75rem 0.625rem 2.25rem;
		position: relative;
		border: 1px dashed var(--story-imagined);
		border-radius: 8px;
		counter-increment: option;
	}

	.options li::before {
		position: absolute;
		left: 0.75rem;
		color: var(--story-imagined);
		font-weight: 700;
		content: counter(option) '.';
	}

	/* "상상" 표시: 색뿐 아니라 글자 · 점선 테두리로도 구분한다. */
	.imagined-tag {
		display: inline-block;
		margin: 0 0 0.5rem;
		padding: 0 0.5rem;
		border: 1px dashed var(--story-imagined);
		border-radius: 4px;
		color: var(--story-imagined);
		font-size: 0.8125rem;
		font-weight: 700;
	}

	.imagined-part {
		margin: 1rem 0 0;
		padding: 0.75rem;
		border: 1px dashed var(--story-imagined);
		border-radius: 8px;
	}

	.imagined-part .body {
		margin: 0;
	}

	.drawing-note {
		margin: 1rem 0 0;
		color: var(--story-muted);
		font-size: 0.875rem;
	}

	.closing {
		max-width: 560px;
		margin: 0 auto;
		padding: 2rem 1rem 6rem;
	}

	@media (min-width: 960px) {
		.top,
		.cover {
			max-width: 1200px;
			margin: 0 auto;
			padding-left: 2rem;
			padding-right: 2rem;
		}

		h1 {
			font-size: 3.5rem;
		}
	}
</style>
