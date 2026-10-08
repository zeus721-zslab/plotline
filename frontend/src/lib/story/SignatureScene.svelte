<script lang="ts">
	// 시그니처 장면: 주기율표를 고정해 두고 단계 카드가 지나가면 그 단계까지 알려진 칸을 켠다.
	// 휴대폰에서는 강조 칸 쪽으로 확대해 보여 주고, PC 는 전체 표에 강조만 한다.
	import { onMount } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { MediaQuery } from 'svelte/reactivity';
	import { compareByDiscovery, type StoryElement } from './elements.ts';
	import PeriodicGrid from './PeriodicGrid.svelte';
	import StepCard from './StepCard.svelte';
	import type { StepSummary } from './steps.ts';
	import type { CopySource } from './storyConfig.ts';
	import { NO_ZOOM, zoomToCells } from './zoom.ts';

	type Props = {
		elements: StoryElement[];
		summaries: StepSummary[];
		// 문구가 데이터와 맞지 않아 문구를 숨길 단계 id
		hiddenSteps: Set<string>;
		copySources: CopySource[];
		onselect: (element: StoryElement, trigger: HTMLButtonElement) => void;
	};

	let { elements, summaries, hiddenSteps, copySources, onselect }: Props = $props();

	// 카드 윗변이 화면 위에서 60% 지점(휴대폰은 고정된 표 아래 영역)을 넘으면 그 단계로 바뀐다.
	const ACTIVE_LINE_RATIO = 0.6;
	const ACTIVE_AREA_MARGIN = `0px 0px -${Math.round((1 - ACTIVE_LINE_RATIO) * 100)}% 0px`;
	const STAGGER_MS = 40;
	// 한 단계에서 새로 켜지는 칸이 많아도 전체 지연이 이 값을 넘지 않게 간격을 줄인다.
	const MAX_STAGGER_SPREAD_MS = 900;
	// 예언 적중 단계에서 강조 칸을 발견 연도순으로 켜는 간격
	const REVEAL_INTERVAL_MS = 400;
	const MAX_CHIP_COUNT = 6;
	const NO_ACTIVE_STEP = -1;
	// theme 과 같은 기준: 이 폭 이상은 PC 배치(확대 없음)
	const wide = new MediaQuery('(min-width: 960px)');

	let cardList: HTMLElement;
	let activeIndex = $state(NO_ACTIVE_STEP);
	let gridWidth = $state(0);

	const byNumber = $derived(new Map(elements.map((element) => [element.atomicNumber, element])));
	const sourcesById = $derived(new Map(copySources.map((source) => [source.id, source])));
	const activeSummary = $derived(activeIndex === NO_ACTIVE_STEP ? null : summaries[activeIndex]);
	const litNumbers = $derived(
		activeSummary === null ? new Set<number>() : activeSummary.knownNumbers
	);
	const highlighted = $derived(
		activeSummary === null ? [] : activeSummary.highlightNumbers.flatMap(elementOf)
	);
	const highlightSet = $derived(new Set(highlighted.map((element) => element.atomicNumber)));
	// 칩 순서: 구성에 chips 가 있으면 그 순서, 없으면 강조 칸 중 원자 번호순 앞 6개(기존 규칙).
	const chips = $derived(
		activeSummary === null
			? []
			: activeSummary.step.chips.length > 0
				? activeSummary.step.chips.flatMap(elementOf)
				: highlighted.slice(0, MAX_CHIP_COUNT)
	);
	const predictedSet = $derived(
		new Set(activeSummary === null ? [] : activeSummary.step.predicted)
	);
	const delays = $derived.by(() => {
		if (activeSummary === null || prefersReducedMotion.current) return new Map<number, number>();
		const interval = Math.min(STAGGER_MS, MAX_STAGGER_SPREAD_MS / activeSummary.added.length);
		const staggered = activeSummary.added.map((element, order): [number, number] => [
			element.atomicNumber,
			Math.round(order * interval)
		]);
		const revealed = activeSummary.step.revealInOrder
			? [...highlighted]
					.sort(compareByDiscovery)
					.map((element, order): [number, number] => [
						element.atomicNumber,
						order * REVEAL_INTERVAL_MS
					])
			: [];
		// 뒤에 온 항목이 앞을 덮어써 순차 켜짐 칸은 연도순 간격을 따른다.
		return new Map([...staggered, ...revealed]);
	});
	// 고대·오늘 단계는 전체를 보여 준다.
	const zoom = $derived.by(() => {
		if (wide.current || activeSummary === null) return NO_ZOOM;
		const until = activeSummary.step.until.kind;
		if (until === 'ancient' || until === 'all') return NO_ZOOM;
		return zoomToCells(activeSummary.highlightNumbers, gridWidth);
	});

	function elementOf(atomicNumber: number): StoryElement[] {
		const element = byNumber.get(atomicNumber);
		return element === undefined ? [] : [element];
	}

	function stepSources(summary: StepSummary): CopySource[] {
		return summary.step.sources.flatMap((id) => {
			const source = sourcesById.get(id);
			return source === undefined ? [] : [source];
		});
	}

	onMount(() => {
		const cards = Array.from(cardList.querySelectorAll<HTMLElement>('[data-step-index]'));
		// 카드가 판정 영역(화면 위 ~ 판정선)에 드나들 때마다 "판정선을 이미 넘은 마지막 카드"를 다시 고른다.
		// 빠른 스크롤·중간 새로고침으로 카드가 판정선을 건너뛰어도 현재 단계가 맞게 잡힌다.
		const observer = new IntersectionObserver(
			() => {
				const activeLine = window.innerHeight * ACTIVE_LINE_RATIO;
				let passed = NO_ACTIVE_STEP;
				cards.forEach((card, index) => {
					if (card.getBoundingClientRect().top < activeLine) passed = index;
				});
				activeIndex = passed;
			},
			{ rootMargin: ACTIVE_AREA_MARGIN }
		);
		for (const card of cards) observer.observe(card);
		return () => observer.disconnect();
	});
</script>

<div class="scene">
	<div class="graphic">
		<p class="caption" aria-hidden="true">
			{#if activeSummary !== null}
				<strong>{activeSummary.step.label}</strong>
				· {activeSummary.knownNumbers.size} / {elements.length}
			{/if}
		</p>
		<div class="grid-frame" bind:clientWidth={gridWidth}>
			<div
				class="zoom"
				data-zoom-scale={zoom.scale}
				style:transform="translate({zoom.x}px, {zoom.y}px) scale({zoom.scale})"
			>
				<PeriodicGrid
					label="단계별 주기율표"
					{elements}
					{litNumbers}
					{delays}
					highlightNumbers={highlightSet}
					predictedNumbers={predictedSet}
					visualScale={zoom.scale}
					{onselect}
				/>
			</div>
		</div>
		<ul class="chips" aria-label="강조한 원소">
			{#each chips as element (element.atomicNumber)}
				<li>{element.name}</li>
			{/each}
		</ul>
	</div>
	<ol class="steps" bind:this={cardList}>
		{#each summaries as summary, index (summary.step.id)}
			<li class="step">
				<div data-step-index={index}>
					<StepCard
						{summary}
						total={elements.length}
						previousCount={index === 0 ? 0 : summaries[index - 1].knownNumbers.size}
						active={index === activeIndex}
						verified={!hiddenSteps.has(summary.step.id)}
						sources={stepSources(summary)}
					/>
				</div>
			</li>
		{/each}
	</ol>
</div>

<style>
	.scene {
		position: relative;
	}

	.graphic {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		height: 50svh;
		padding: 0 1rem;
		background: var(--story-bg);
	}

	.caption {
		min-height: 1.5rem;
		margin: 0 0 0.5rem;
		color: var(--story-muted);
		font-size: 0.9375rem;
		font-variant-numeric: tabular-nums;
	}

	.caption strong {
		color: var(--story-cell-on);
	}

	/* 표 높이(10줄)와 칩 줄이 고정 영역을 넘지 않도록 폭을 높이 기준으로도 제한한다.
	   확대한 표는 이 틀 밖으로 나가지 않게 자른다. */
	.grid-frame {
		width: min(100%, calc((50svh - 7rem) * 1.8));
		margin: 0 auto;
		overflow: hidden;
	}

	.zoom {
		transform-origin: 0 0;
		transition: transform 0.7s ease;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.375rem;
		min-height: 2rem;
		margin: 0.75rem 0 0;
		padding: 0;
		list-style: none;
	}

	.chips li {
		padding: 0.125rem 0.625rem;
		border: 1px solid var(--story-cell-bright);
		border-radius: 999px;
		color: var(--story-cell-bright);
		font-size: 0.875rem;
	}

	.steps {
		margin: 0;
		padding: 0 1rem 30vh;
		list-style: none;
	}

	.step {
		display: flex;
		align-items: center;
		min-height: 80vh;
	}

	.step > div {
		width: 100%;
	}

	@media (min-width: 960px) {
		.scene {
			display: grid;
			grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
			gap: 3rem;
			max-width: 1200px;
			margin: 0 auto;
			padding: 0 2rem;
		}

		.graphic {
			grid-column: 2;
			grid-row: 1;
			align-self: start;
			height: 100vh;
			padding: 0;
		}

		.grid-frame {
			width: min(100%, calc((100vh - 9rem) * 1.8));
		}

		.steps {
			grid-column: 1;
			grid-row: 1;
			padding: 30vh 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.zoom {
			transition: none;
		}
	}
</style>
