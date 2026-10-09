<script lang="ts">
	// 빛의 나이 스토리: 표지 → 13장(달에서 M87 까지, 끝) → 출처. 상단 계기판 한 줄만 고정하고, 배경 캔버스 위로 카드가 지나간다.
	// 페이지 틀은 프리렌더하고 데이터는 클라이언트에서 /data/ 를 읽는다.
	import { onMount } from 'svelte';
	import { NO_ACTIVE_STEP, trackActiveStep } from '#lib/story/activeStep.ts';
	import Aside from '#lib/story/Aside.svelte';
	import LoadStatus from '#lib/story/LoadStatus.svelte';
	import SourceList from '#lib/story/SourceList.svelte';
	import StoryCard from '#lib/story/StoryCard.svelte';
	import StoryFigure from '#lib/story/StoryFigure.svelte';
	import StoryStage from '#lib/story/StoryStage.svelte';
	import { fillTemplate } from '#lib/story/storyConfig.ts';
	import type { StoryImage } from '#lib/story/storyMedia.ts';
	import {
		asideCopySource,
		asStepAside,
		CHAPTER_ASIDES,
		type ChapterAside
	} from '#lib/stories/light-age/asides.ts';
	import {
		CHAPTERS,
		chapterSlots,
		END_PARAGRAPH_2,
		END_PARAGRAPH_3,
		END_PARAGRAPH_4,
		LIGHT_AGE_SUBTITLE
	} from '#lib/stories/light-age/chapters.ts';
	import Gauge from '#lib/stories/light-age/Gauge.svelte';
	import {
		hiddenLightAgeTargets,
		LIGHT_AGE_IMAGES,
		loadLightAge,
		type LightAgeData
	} from '#lib/stories/light-age/lightAge.ts';
	import {
		distanceText,
		gaugeYearLabel,
		storyYear,
		travelTime,
		type TimeUnit
	} from '#lib/stories/light-age/lightTime.ts';
	import MomentList from '#lib/stories/light-age/MomentList.svelte';
	import NearStars from '#lib/stories/light-age/NearStars.svelte';
	import type { SceneId } from '#lib/stories/light-age/scenes.ts';
	import type { EarthMoment, SkyObject } from '#lib/stories/light-age/skyData.ts';
	import SkyBackground from '#lib/stories/light-age/SkyBackground.svelte';
	import {
		asideTarget,
		momentTarget,
		paragraph2Target
	} from '#lib/stories/light-age/storyChecks.ts';
	import '#lib/stories/light-age/theme.css';

	type Ready = {
		data: LightAgeData;
		slots: Record<string, string>;
		hiddenTargets: Set<string>;
		currentYear: number;
	};
	type ViewState = { kind: 'loading' } | { kind: 'error' } | ({ kind: 'ready' } & Ready);

	const SITE_NAME = 'Plotline';
	const SOURCE_NOTE =
		'거리는 출처의 값을 그대로 두고 화면에서 반올림했습니다. 빛이 오는 시간은 빛의 속도 초속 299,792.458 km 로 계산했고, 연도는 한국 시각 기준 올해에서 거슬러 셉니다.';
	// 카드 윗변이 화면 위에서 이 비율 지점을 넘으면 그 장이 활성이 된다.
	const ACTIVE_LINE_RATIO = 0.5;
	// 끝 장 그림자는 12장 → 13장 판정선(ACTIVE_LINE_RATIO)에서 커지기 시작해 12장 반지름과 이어진다.
	// 장 아랫변이 화면 위에서 이 비율 지점에 오면 다 덮인다(그 뒤 남은 여백 동안 검은 화면).
	const END_FINISH_BOTTOM_RATIO = 1.2;
	// 출처 절 "문구 출처": 곁들임 카드 출처 전부(카드 순서)
	const ASIDE_COPY_SOURCES = CHAPTER_ASIDES.map(asideCopySource);

	let view = $state<ViewState>({ kind: 'loading' });
	let activeIndex = $state(NO_ACTIVE_STEP);
	let endProgress = $state(0);
	let unitChangeCount = $state(0);
	let lastUnit: TimeUnit | null = null;
	let chapterElements = $state<HTMLElement[]>([]);

	const ready = $derived(view.kind === 'ready' ? view : null);
	const activeChapter = $derived(activeIndex === NO_ACTIVE_STEP ? null : CHAPTERS[activeIndex]);
	const scene = $derived<SceneId>(activeChapter === null ? 'cover' : activeChapter.scene);
	const endSection = $derived(
		chapterElements.length === CHAPTERS.length ? chapterElements[CHAPTERS.length - 1] : null
	);
	const gaugeObject = $derived(
		ready === null || activeChapter === null
			? undefined
			: ready.data.objects.get(activeChapter.gaugeObject)
	);

	async function load(): Promise<void> {
		view = { kind: 'loading' };
		const result = await loadLightAge();
		if (result.kind === 'error') {
			view = { kind: 'error' };
			return;
		}
		const now = new Date();
		const currentYear = storyYear(now);
		const slots = chapterSlots(result.data.objects, now);
		view = {
			kind: 'ready',
			data: result.data,
			slots,
			currentYear,
			hiddenTargets: hiddenLightAgeTargets(
				result.data.objects,
				result.data.moments,
				slots,
				currentYear
			)
		};
	}

	function objectsOf(objects: Map<string, SkyObject>, ids: string[]): SkyObject[] {
		return ids.flatMap((id) => {
			const object = objects.get(id);
			return object === undefined ? [] : [object];
		});
	}

	function shownMoments(current: Ready, chapterId: string, ids: string[]): EarthMoment[] {
		return ids.flatMap((id) => {
			const moment = current.data.moments.get(id);
			if (moment === undefined || current.hiddenTargets.has(momentTarget(chapterId, id))) return [];
			return [moment];
		});
	}

	function shownAsides(current: Ready, chapterId: string): ChapterAside[] {
		return CHAPTER_ASIDES.filter(
			(aside) =>
				aside.chapterId === chapterId &&
				!current.hiddenTargets.has(asideTarget(chapterId, aside.id))
		);
	}

	function imageOf(id: string | null): StoryImage | null {
		if (id === null) return null;
		const image = LIGHT_AGE_IMAGES.find((candidate) => candidate.id === id);
		return image === undefined ? null : image;
	}

	function changeActive(index: number): void {
		activeIndex = index;
		const chapter = index === NO_ACTIVE_STEP ? null : CHAPTERS[index];
		const object =
			ready === null || chapter === null ? undefined : ready.data.objects.get(chapter.gaugeObject);
		const unit = object === undefined ? null : travelTime(object).unit;
		// 처음 나타날 때는 강조하지 않고, 단위 단계가 바뀔 때만 강조한다.
		if (unit !== null && lastUnit !== null && unit !== lastUnit) unitChangeCount += 1;
		if (unit !== null) lastUnit = unit;
	}

	$effect(() => {
		if (ready === null || chapterElements.length !== CHAPTERS.length) return;
		return trackActiveStep(chapterElements, ACTIVE_LINE_RATIO, changeActive);
	});

	// 끝 장: 장 윗변이 판정선을 지날 때 0, 장 아랫변이 끝 지점에 올 때 1.
	$effect(() => {
		const section = endSection;
		if (section === null) return;
		const update = (): void => {
			const start = window.innerHeight * ACTIVE_LINE_RATIO;
			const finish = window.innerHeight * END_FINISH_BOTTOM_RATIO;
			const rect = section.getBoundingClientRect();
			// 윗변이 start 에서 (finish − 장 높이)까지 움직이는 거리
			const travel = Math.max(1, rect.height - (finish - start));
			endProgress = Math.min(1, Math.max(0, (start - rect.top) / travel));
		};
		update();
		window.addEventListener('scroll', update, { passive: true });
		window.addEventListener('resize', update);
		return () => {
			window.removeEventListener('scroll', update);
			window.removeEventListener('resize', update);
		};
	});

	onMount(() => {
		void load();
	});
</script>

<svelte:head>
	<title>{ready === null ? SITE_NAME : `${ready.data.title} · ${SITE_NAME}`}</title>
</svelte:head>

<main class="story light-age-theme">
	<StoryStage>
		{#snippet background()}
			<SkyBackground {scene} {endProgress} />
		{/snippet}

		<nav class="top">
			<a href="/">{SITE_NAME}</a>
		</nav>

		{#if ready === null}
			<div class="status">
				<LoadStatus status={view.kind === 'error' ? 'error' : 'loading'} onretry={load} />
			</div>
		{:else}
			{#if gaugeObject !== undefined}
				<Gauge
					travel={travelTime(gaugeObject).text}
					departure={gaugeYearLabel(gaugeObject, ready.currentYear)}
					changeCount={unitChangeCount}
				/>
			{/if}

			<header class="cover">
				<h1>{ready.data.title}</h1>
				<p class="subtitle">{LIGHT_AGE_SUBTITLE}</p>
				<p class="scroll-hint" aria-hidden="true">아래로 스크롤 ↓</p>
			</header>

			{#each CHAPTERS as chapter, index (chapter.id)}
				{@const image = imageOf(chapter.photo)}
				{@const exactObject = ready.data.objects.get(chapter.gaugeObject)}
				<section
					class="chapter"
					class:end={chapter.scene === 'end'}
					class:m87={chapter.scene === 'm87'}
					aria-label={`${chapter.label} ${chapter.title}`}
					bind:this={chapterElements[index]}
				>
					{#snippet photo()}
						{#if image !== null}<StoryFigure {image} />{/if}
					{/snippet}
					<div class="card">
						<StoryCard
							label={chapter.label}
							title={chapter.title}
							body={fillTemplate(chapter.body, ready.slots)}
							verified={!ready.hiddenTargets.has(chapter.id)}
							sources={[]}
							aside={null}
							asideSources={[]}
							asideImage={null}
							media={image === null ? undefined : photo}
						>
							{#if chapter.exactDistance && exactObject !== undefined}
								<p class="exact">정확한 거리 <strong>{distanceText(exactObject)}</strong></p>
							{/if}
							{#if chapter.nearStars}
								<NearStars
									stars={objectsOf(ready.data.objects, chapter.objects)}
									currentYear={ready.currentYear}
								/>
							{/if}
							<MomentList moments={shownMoments(ready, chapter.id, chapter.moments)} />
							{#if chapter.id === 'end'}
								<!-- 13장 둘째 문단: 두 사건 대조를 통과했을 때만 보인다. 나머지 문단은 항상 보인다. -->
								{#if !ready.hiddenTargets.has(paragraph2Target(chapter.id))}
									<p class="body">{END_PARAGRAPH_2}</p>
								{/if}
								<p class="body">{END_PARAGRAPH_3}</p>
								<p class="body">{END_PARAGRAPH_4}</p>
							{/if}
							<!-- 곁들임 카드는 1편처럼 장 문구가 대조를 통과했을 때만 보인다. -->
							{#if !ready.hiddenTargets.has(chapter.id)}
								{#each shownAsides(ready, chapter.id) as aside (aside.id)}
									<Aside
										aside={asStepAside(aside)}
										sources={[asideCopySource(aside)]}
										image={null}
									/>
								{/each}
							{/if}
							{#if chapter.scene === 'm87'}
								<p class="imagined">배경의 검은 그림자: 코드로 그린 상상도</p>
							{/if}
						</StoryCard>
					</div>
				</section>
			{/each}

			<section class="closing" aria-label="출처">
				<SourceList
					sources={ready.data.sources}
					copySources={ASIDE_COPY_SOURCES}
					images={LIGHT_AGE_IMAGES}
					note={SOURCE_NOTE}
				/>
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
	:global(body:has(.light-age-theme.story)) {
		margin: 0;
		background: #070b16;
	}

	.story {
		min-height: 100svh;
		line-height: 1.6;
		word-break: keep-all;
		background: transparent;
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
		margin: 3rem 0 0;
		color: var(--story-muted);
		font-weight: 600;
	}

	/* 장 사이를 비워 배경이 보이게 한다. */
	.chapter {
		padding: 0 1rem 70svh;
	}

	/* 12장(M87)은 카드 앞을 화면 하나만큼 비운다. 장 윗변(여백 포함)이 판정선(화면 중간)을 넘는 순간 12장이 활성이
	   되므로, 그때 카드 윗변은 화면 아래 50% 지점에 있고, 반 화면을 더 내릴 때까지 카드 없이 블랙홀 전체가 보인다.
	   그다음에도 카드는 블랙홀 맨 아래(아래쪽 고리, 390x844 약 53% · 1280x720 약 66% 높이)에 닿을 때까지 가리지 않는다. */
	.chapter.m87 {
		padding-top: 100svh;
	}

	/* 끝 장은 그림자가 화면을 다 덮을 때까지 스크롤할 거리를 둔다. */
	.chapter.end {
		padding-bottom: 110svh;
	}

	.card {
		max-width: 560px;
		margin: 0 auto;
	}

	/* 13장 둘째 문단 이후: StoryCard 안 본문과 같은 간격(StoryCard.svelte .body 와 같은 값, 이 블록은 부모 쪽에서 그려 따로 둔다). */
	.body {
		margin: 0.625rem 0 0;
	}

	.exact {
		margin: 1rem 0 0;
		color: var(--story-muted);
	}

	.exact strong {
		color: var(--story-text);
		font-variant-numeric: tabular-nums;
	}

	.imagined {
		margin: 1rem 0 0;
		color: var(--story-muted);
		font-size: 0.875rem;
	}

	.closing {
		max-width: 560px;
		margin: 0 auto;
		padding: 2rem 1rem 6rem;
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
