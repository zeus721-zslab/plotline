<script lang="ts">
	// 시그니처 장면 단계 카드 1장: 공통 카드 틀(StoryCard)에 단계 그림과 그때까지 알려진 원소 수를 넣는다.
	import CountUp from '../../story/CountUp.svelte';
	import StoryCard from '../../story/StoryCard.svelte';
	import { fillTemplate, type CopySource } from '../../story/storyConfig.ts';
	import type { StoryImage } from '../../story/storyMedia.ts';
	import StepMedia from './StepMedia.svelte';
	import type { ResolvedMedia } from './stepMedia.ts';
	import type { StepSummary } from './steps.ts';

	type Props = {
		summary: StepSummary;
		total: number;
		// 직전 단계의 알려진 원소 수(이 단계가 켜질 때 여기서부터 센다)
		previousCount: number;
		active: boolean;
		// 문구가 데이터와 대조를 통과했는가. 아니면 그림·제목·이야기·곁들임·출처를 숨긴다.
		verified: boolean;
		sources: CopySource[];
		media: ResolvedMedia | null;
		asideSources: CopySource[];
		asideImage: StoryImage | null;
	};

	let {
		summary,
		total,
		previousCount,
		active,
		verified,
		sources,
		media,
		asideSources,
		asideImage
	}: Props = $props();

	const count = $derived(summary.knownNumbers.size);
	const body = $derived(fillTemplate(summary.step.body, { count }));
</script>

{#snippet stepFigure()}
	{#if media !== null}
		<StepMedia {media} {active} />
	{/if}
{/snippet}

<StoryCard
	label={summary.step.label}
	title={summary.step.title}
	{body}
	{verified}
	{sources}
	aside={summary.step.aside}
	{asideSources}
	{asideImage}
	media={stepFigure}
>
	<p class="count">
		<span class="count-value"><CountUp value={count} from={previousCount} play={active} /></span>
		<span class="count-unit">/ {total}개 알려짐</span>
	</p>
</StoryCard>

<style>
	.count {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin: 1rem 0 0;
	}

	.count-value {
		font-size: 3rem;
		font-weight: 700;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.count-unit {
		color: var(--story-muted);
	}
</style>
