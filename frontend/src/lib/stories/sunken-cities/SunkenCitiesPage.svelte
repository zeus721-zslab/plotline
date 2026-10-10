<script lang="ts">
	// 바다 밑의 도시들 스토리: 표지 → 8장(아틀란티스 → 바다에 잠긴 여섯 곳 → 끝) → 출처 · 다음 이야기.
	// 축은 "바다에 잠긴 도시가 있었다는 걸 우리는 어떻게 아는가"(D-41): 장마다 질문 하나에 답하고, 질문 목록(QuestionTrail)에 답이 쌓인다.
	// 상단 계기판 한 줄과 질문 목록만 고정하고, 수면 아래 배경 캔버스 위로 카드가 지나간다. 데이터는 출처(loadSource)에서 읽는다(D-37).
	// 장 전환은 3편에서 검증한 방식을 이 파일에 옮겨 쓴다: 장마다 카드 앞 빈 장면 구간 동안 배경이 먼저 옮겨 가고 카드가 나중에 올라오며,
	// 장 판정은 스크롤 rAF 측정, 두 장 이상 건너뛰면 바로 놓는다. 시그니처(3 · 4 · 7 · 8장)는 그 뒤 구간의 스크롤 진행도를 따른다.
	// PC(1024px 이상)는 최대 1600px 구도를 4:6 으로 나눠 카드를 왼쪽 열에 두고, 배경 윤곽 · 질문 목록은 오른쪽 영역에 둔다(seaRenderer.ts 와 같은 값).
	import { onMount, untrack } from 'svelte';
	import { NO_ACTIVE_STEP } from '#lib/story/activeStep.ts';
	import Aside from '#lib/story/Aside.svelte';
	import LoadStatus from '#lib/story/LoadStatus.svelte';
	import SourceList from '#lib/story/SourceList.svelte';
	import StoryCard from '#lib/story/StoryCard.svelte';
	import StoryFigure from '#lib/story/StoryFigure.svelte';
	import StoryStage from '#lib/story/StoryStage.svelte';
	import { fillTemplate, type CopySource } from '#lib/story/storyConfig.ts';
	import type { LoadStorySource } from '#lib/story/storySource.ts';
	import type { StoryImage } from '#lib/story/storyMedia.ts';
	import { storyYear } from '../light-age/lightTime.ts';
	import { asideCopySource, asStepAside, CHAPTER_ASIDES, type ChapterAside } from './asides.ts';
	import {
		CHAPTER_COPY_SOURCES,
		CHAPTERS,
		chapterSlots,
		slotsOf,
		SUNKEN_SUBTITLE,
		type Chapter,
		type ChapterId,
		type ChapterSlots,
		type ParagraphKind
	} from './chapters.ts';
	import Gauge from './Gauge.svelte';
	import QuestionSummary from './QuestionSummary.svelte';
	import QuestionTrail from './QuestionTrail.svelte';
	import SeaBackground from './SeaBackground.svelte';
	import type { SceneId } from './seaRenderer.ts';
	import { answerTarget, asideTarget, gaugeTarget } from './storyChecks.ts';
	import { CRITERION_IDS, type Criterion } from './sunkenData.ts';
	import {
		hiddenSunkenTargets,
		loadSunkenCities,
		SUNKEN_CITIES_IMAGES,
		type SunkenCitiesData
	} from './sunkenStory.ts';
	import './theme.css';

	type Props = { loadSource: LoadStorySource };

	let { loadSource }: Props = $props();

	type Ready = {
		data: SunkenCitiesData;
		slots: ChapterSlots;
		hiddenTargets: Set<string>;
		quoteSources: CopySource[];
	};
	type ViewState = { kind: 'loading' } | { kind: 'error' } | ({ kind: 'ready' } & Ready);
	type TrailRow = {
		id: ChapterId;
		number: number;
		question: string;
		answer: string | null;
		answered: boolean;
		remains: string | null;
	};

	const SITE_NAME = 'Plotline';
	const SOURCE_NOTE =
		'장소 수치는 출처의 값을 그대로 두고, "잠긴 지 ○년"은 화면에서 계산했습니다(1,000년 이상은 100년 단위로 반올림, 연도 범위는 가운데 값). 근거가 없는 항목은 데이터에 줄을 두지 않았습니다. 질문 목록의 답은 그 장 문구에 있는 사실만 씁니다.';
	// 3편 BlackHolePage 와 같은 값: 장 구역 윗변이 화면 위에서 이 비율 지점에 들어오면 배경 · 계기판이 그 장으로 바뀐다.
	// 화면 높이는 작은 화면 높이(100svh, .viewport-probe)를 쓴다.
	const SCENE_LINE_RATIO = 0.88;
	// 장 본문 끝(.answer-mark)이 화면 위에서 이 비율 지점을 지나면 그 장의 답을 채운다.
	const ANSWER_LINE_RATIO = 0.6;
	// 전환선을 지난 뒤 이만큼(화면 높이 비율) 스크롤하는 동안 배경이 새 장으로 옮겨 간다(빈 장면 구간보다 짧다).
	const TRANSITION_SHARE = 0.35;
	// 시그니처 구간(전환선을 지난 뒤 화면 높이 비율): 옮겨 가기가 끝난 뒤 시작해, 카드 윗변이 75% 선에 오기
	// (빈 장면 구간 + 13svh: 휴대폰 78svh · PC 58svh) 전에 끝난다.
	const SIGNATURE_WINDOW_MOBILE = { start: 0.38, end: 0.75 };
	const SIGNATURE_WINDOW_DESKTOP = { start: 0.36, end: 0.56 };
	// seaRenderer.ts SPLIT_MIN_WIDTH_PX 와 같은 값
	const DESKTOP_QUERY = '(min-width: 1024px)';
	// 한 번에 이만큼 이상 장이 바뀌면(위치 복원 · 빠른 스크롤) 배경을 옮겨 가기 없이 그 장 값으로 바로 놓는다.
	const JUMP_CHAPTERS = 2;
	const FULL_PROGRESS = 1;
	// 끝 장 목록에서 답 아래에 남은 흔적을 적는 줄: 아틀란티스. 근거는 1장 본문
	// "플라톤의 글과 별개로 … 고대 기록이나 유물은 알려져 있지 않습니다"라 1장 답과 함께 숨는다.
	const REMAINS_UNKNOWN_CHAPTER: ChapterId = 'atlantis';
	const REMAINS_UNKNOWN_TEXT = '남은 흔적: 알려진 것 없음';
	const END_CHAPTER: ChapterId = 'end';
	// 원문 구절 출처(조엣 번역, 구텐베르크): 대화편별 페이지
	const WORK_SOURCES: Record<Criterion['work'], { name: string; url: string }> = {
		timaeus: {
			name: '플라톤 티마이오스',
			url: 'https://www.gutenberg.org/files/1572/1572-h/1572-h.htm'
		},
		critias: {
			name: '플라톤 크리티아스',
			url: 'https://www.gutenberg.org/files/1571/1571-h/1571-h.htm'
		}
	};
	const PARAGRAPH_TAGS: Record<Exclude<ParagraphKind, 'body'>, string> = {
		legend: '전설',
		imagined: '상상',
		fact: '사실'
	};

	let view = $state<ViewState>({ kind: 'loading' });
	let activeIndex = $state(NO_ACTIVE_STEP);
	let sceneProgress = $state(FULL_PROGRESS);
	let sceneSignature = $state(FULL_PROGRESS);
	let sceneJump = $state(false);
	// 장마다 본문 끝을 지났는가(답 채움)
	let answeredChapters = $state<boolean[]>(CHAPTERS.map(() => false));
	let viewportProbe: HTMLElement;
	let viewportHeight = 0;
	let signatureWindow = SIGNATURE_WINDOW_MOBILE;
	let chapterElements = $state<HTMLElement[]>([]);
	let answerMarks = $state<HTMLElement[]>([]);

	const ready = $derived(view.kind === 'ready' ? view : null);
	const activeChapter = $derived(activeIndex === NO_ACTIVE_STEP ? null : CHAPTERS[activeIndex]);
	const scene = $derived<SceneId>(activeChapter === null ? 'cover' : activeChapter.id);
	const gaugeParts = $derived(
		ready === null || activeChapter === null ? null : gaugePartsOf(ready, activeChapter)
	);
	// 고정 질문 상자는 1~7장에서만 둔다(끝 장은 카드 안 목록).
	const trailChapterId = $derived(
		activeChapter === null || activeChapter.id === END_CHAPTER ? null : activeChapter.id
	);
	const trailRows = $derived(ready === null ? [] : trailRowsOf(ready, answeredChapters));

	/** 계기판 조각. 대조에 걸리면 빈 목록. */
	function gaugePartsOf(current: Ready, chapter: Chapter): string[] {
		if (chapter.gauge === null || current.hiddenTargets.has(gaugeTarget(chapter.id))) return [];
		const slots = slotsOf(current.slots, chapter.id);
		return chapter.gauge.map((part) => fillTemplate(part, slots));
	}

	/** 답이 보여도 되는가: 장 문단과 답 한 줄이 모두 대조를 통과해야 한다. */
	function answerShown(current: Ready, chapter: Chapter): boolean {
		return (
			!current.hiddenTargets.has(chapter.id) && !current.hiddenTargets.has(answerTarget(chapter.id))
		);
	}

	function trailRowsOf(current: Ready, answered: boolean[]): TrailRow[] {
		return CHAPTERS.flatMap((chapter, index) => {
			if (chapter.question === null) return [];
			const answer =
				chapter.answer !== null && answerShown(current, chapter)
					? fillTemplate(chapter.answer, slotsOf(current.slots, chapter.id))
					: null;
			return [
				{
					id: chapter.id,
					number: index + 1,
					question: chapter.question,
					answer,
					answered: answered[index],
					remains:
						chapter.id === REMAINS_UNKNOWN_CHAPTER && answer !== null ? REMAINS_UNKNOWN_TEXT : null
				}
			];
		});
	}

	function readViewport(): void {
		const probed = viewportProbe.getBoundingClientRect().height;
		viewportHeight = probed > 0 ? probed : window.innerHeight;
		signatureWindow = window.matchMedia(DESKTOP_QUERY).matches
			? SIGNATURE_WINDOW_DESKTOP
			: SIGNATURE_WINDOW_MOBILE;
	}

	function clampShare(value: number): number {
		return Math.min(FULL_PROGRESS, Math.max(0, value));
	}

	/** 장 본문 끝이 답 선을 지났는지 장마다 잰다. 바뀐 장이 있을 때만 상태를 바꾼다. */
	function measureAnswers(): void {
		const line = viewportHeight * ANSWER_LINE_RATIO;
		const next = CHAPTERS.map((_, index) => {
			const mark = answerMarks[index];
			return mark !== undefined && mark.getBoundingClientRect().top < line;
		});
		if (next.some((value, index) => value !== answeredChapters[index])) answeredChapters = next;
	}

	/** 전환선을 지난 마지막 장 · 그 장으로 옮겨 간 정도(0~1) · 시그니처 진행도(0~1)를 잰다. 표지에서는 1. */
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
			sceneSignature = FULL_PROGRESS;
			return;
		}
		const moved = (line - chapterElements[passed].getBoundingClientRect().top) / viewportHeight;
		sceneProgress = clampShare(moved / TRANSITION_SHARE);
		sceneSignature = clampShare(
			(moved - signatureWindow.start) / (signatureWindow.end - signatureWindow.start)
		);
	}

	function measure(): void {
		measureScene();
		measureAnswers();
	}

	/** 원문 구절 출처: 조건마다 대화편 · 원문 위치 · 조엣 번역 구절(출처 절 전용) */
	function quoteSourcesOf(data: SunkenCitiesData): CopySource[] {
		return CRITERION_IDS.flatMap((criterion) => {
			const found = data.criteria.get(criterion);
			if (found === undefined) return [];
			const work = WORK_SOURCES[found.work];
			return [
				{
					id: `quote-${criterion}`,
					title: `${work.name} ${found.passage} (조엣 번역): "${found.quoteEn}"`,
					url: work.url
				}
			];
		});
	}

	async function load(): Promise<void> {
		view = { kind: 'loading' };
		const result = await loadSunkenCities(loadSource);
		if (result.kind === 'error') {
			view = { kind: 'error' };
			return;
		}
		const year = storyYear(new Date());
		const slots = chapterSlots(result.data, year);
		view = {
			kind: 'ready',
			data: result.data,
			slots,
			hiddenTargets: hiddenSunkenTargets(result.data, slots, year),
			quoteSources: quoteSourcesOf(result.data)
		};
	}

	function imageOf(id: string | null): StoryImage | null {
		if (id === null) return null;
		const image = SUNKEN_CITIES_IMAGES.find((candidate) => candidate.id === id);
		return image === undefined ? null : image;
	}

	function shownAsides(current: Ready, chapterId: string): ChapterAside[] {
		return CHAPTER_ASIDES.filter(
			(aside) =>
				aside.chapterId === chapterId &&
				!current.hiddenTargets.has(asideTarget(chapterId, aside.id))
		);
	}

	function copySourcesOf(current: Ready): CopySource[] {
		return [
			...current.quoteSources,
			...CHAPTER_COPY_SOURCES,
			...CHAPTER_ASIDES.map(asideCopySource)
		];
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

<main class="story sunken-cities-theme">
	<div class="viewport-probe" aria-hidden="true" bind:this={viewportProbe}></div>
	<StoryStage>
		{#snippet background()}
			{#if ready !== null}
				<SeaBackground
					{scene}
					progress={sceneProgress}
					signature={sceneSignature}
					instant={sceneJump}
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
			{#if gaugeParts !== null}
				<Gauge parts={gaugeParts} />
			{/if}
			{#if trailChapterId !== null}
				<QuestionTrail rows={trailRows} currentId={trailChapterId} />
			{/if}

			<header class="cover">
				<h1>{ready.data.title}</h1>
				<p class="subtitle">{SUNKEN_SUBTITLE}</p>
				<p class="scroll-hint" aria-hidden="true">아래로 스크롤 ↓</p>
			</header>

			{#each CHAPTERS as chapter, index (chapter.id)}
				{@const image = imageOf(chapter.photo)}
				{@const verified = !ready.hiddenTargets.has(chapter.id)}
				{@const slots = slotsOf(ready.slots, chapter.id)}
				<section
					class="chapter"
					class:end={chapter.id === END_CHAPTER}
					aria-label={`${chapter.label} ${chapter.title}`}
					bind:this={chapterElements[index]}
				>
					<div class="scene-gap" aria-hidden="true"></div>
					{#snippet media()}
						{#if image !== null}<StoryFigure {image} />{/if}
					{/snippet}
					<div class="card">
						<!-- 문단은 전설 · 상상 · 사실 표시 블록이 섞여 있어 StoryCard 의 body 대신 아래에서 그린다(body 는 비워 둔다). -->
						<StoryCard
							label={chapter.label}
							title={chapter.title}
							body=""
							{verified}
							sources={[]}
							aside={null}
							asideSources={[]}
							asideImage={null}
							media={image === null ? undefined : media}
						>
							<!-- 문단 · 곁들임 카드는 장 문구가 대조를 통과했을 때만 보인다. -->
							<!-- 끝 장: 본문 앞에 질문 7개와 답(줄마다 자기 대조를 따른다). -->
							{#if chapter.id === END_CHAPTER}
								<QuestionSummary rows={trailRows} />
							{/if}
							{#if verified}
								{#each chapter.paragraphs as paragraph, paragraphIndex (paragraphIndex)}
									{#if paragraph.kind === 'body'}
										<p class="paragraph">{fillTemplate(paragraph.text, slots)}</p>
									{:else}
										<div class="follower {paragraph.kind}" data-follower={paragraph.kind}>
											<p class="mark-tag {paragraph.kind}-tag">{PARAGRAPH_TAGS[paragraph.kind]}</p>
											<p class="follower-text">{fillTemplate(paragraph.text, slots)}</p>
										</div>
									{/if}
								{/each}
							{/if}
							<!-- 본문 끝: 이 자리가 답 선을 지나면 질문 목록에 이 장의 답을 채운다. -->
							<div class="answer-mark" aria-hidden="true" bind:this={answerMarks[index]}></div>
							{#if verified}
								{#each shownAsides(ready, chapter.id) as aside (aside.id)}
									<Aside
										aside={asStepAside(aside)}
										sources={[asideCopySource(aside)]}
										image={null}
									/>
								{/each}
							{/if}
						</StoryCard>
					</div>
				</section>
			{/each}

			<section class="closing" aria-label="출처와 다음 이야기">
				<div class="sources">
					<SourceList
						sources={ready.data.sources}
						copySources={copySourcesOf(ready)}
						images={SUNKEN_CITIES_IMAGES}
						note={SOURCE_NOTE}
					/>
				</div>
				{#if ready.data.next !== null}
					<a class="next" href="/stories/{ready.data.next.story}">
						다음 이야기: {ready.data.next.title}
					</a>
				{/if}
			</section>
		{/if}
	</StoryStage>
</main>

<style>
	/* 본문 밖(넘침 스크롤) 영역도 테마 바탕색(theme.css --story-bg 와 같은 값)으로 둔다. */
	:global(body:has(.sunken-cities-theme.story)) {
		margin: 0;
		background: #04161c;
	}

	.story {
		min-height: 100svh;
		line-height: 1.6;
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
	}

	.top a:focus-visible,
	.next:focus-visible {
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
		margin: 2rem 0 0;
		color: var(--story-muted);
		font-weight: 600;
	}

	/* 장 사이를 비워 배경이 보이게 한다(3편과 같은 값). 카드 앞 빈 장면 구간 동안 배경이 먼저 옮겨 가고(35svh) 시그니처가 이어진 뒤,
	   카드가 화면 아래에서 올라온다. 카드 뒤 여백(40svh)은 다음 장 구역이 전환선(88%) 아래에 남아 그 장 배경이 유지되게 한다. */
	.chapter {
		padding: 0 1rem 40svh;
	}

	.chapter.end {
		padding-bottom: 4rem;
	}

	.scene-gap {
		height: 65svh;
	}

	.card {
		max-width: 560px;
		margin: 0 auto;
	}

	/* StoryCard 의 body 는 비워 두므로(문단은 아래에서 그린다) 빈 문단 자리를 없앤다. */
	.card :global(article > p.body:empty) {
		display: none;
	}

	@media (max-width: 1023px) {
		.card :global(figure img) {
			max-height: 24svh;
		}
	}

	/* PC: 3편과 같은 4:6 구도. 카드(최대 460px)는 왼쪽 열 가운데 선 쪽, 배경 윤곽 · 질문 목록은 오른쪽 영역. */
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

	.paragraph {
		margin: 0.625rem 0 0;
	}

	.follower-text {
		margin: 0;
	}

	.answer-mark {
		height: 0;
	}

	/* 전설 · 상상 · 사실 표시: 색뿐 아니라 글자 · 테두리 모양으로도 구분한다(전설 · 상상 점선, 사실 실선). */
	.mark-tag {
		display: inline-block;
		margin: 0 0 0.5rem;
		padding: 0 0.5rem;
		border-radius: 4px;
		font-size: 0.8125rem;
		font-weight: 700;
	}

	.legend-tag {
		border: 1px dashed var(--story-legend);
		color: var(--story-legend);
	}

	.imagined-tag {
		border: 1px dashed var(--story-imagined);
		color: var(--story-imagined);
	}

	.fact-tag {
		border: 1px solid var(--story-muted);
		color: var(--story-muted);
	}

	.follower {
		margin: 0.75rem 0 0;
		padding: 0.75rem;
		border-radius: 8px;
	}

	.follower.legend {
		border: 1px dashed var(--story-legend);
	}

	.follower.imagined {
		border: 1px dashed var(--story-imagined);
	}

	.follower.fact {
		border: 1px solid var(--story-cell-off);
	}

	.closing {
		max-width: 880px;
		margin: 0 auto;
		padding: 0 1rem 6rem;
		box-sizing: border-box;
	}

	.sources {
		margin-top: 2rem;
	}

	.next {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin-top: 2rem;
		color: var(--story-text);
		font-weight: 700;
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
