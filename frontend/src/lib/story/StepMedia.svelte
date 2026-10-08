<script lang="ts">
	// 단계 카드 위쪽 그림 자리: 이미지면 StoryFigure, 코드로 그린 연출이면 id 에 맞는 SVG 를 둔다.
	import EclipseScene from './EclipseScene.svelte';
	import LeadBoxScene from './LeadBoxScene.svelte';
	import SpectrumScene from './SpectrumScene.svelte';
	import StoryFigure from './StoryFigure.svelte';
	import type { ResolvedMedia } from './storyMedia.ts';

	type Props = { media: ResolvedMedia; active: boolean };

	let { media, active }: Props = $props();
</script>

<div class="media" data-media-id={media.type === 'image' ? media.image.id : media.id}>
	{#if media.type === 'image'}
		<StoryFigure image={media.image} />
	{:else if media.id === 'spectrum'}
		<SpectrumScene {active} />
	{:else if media.id === 'eclipse'}
		<EclipseScene />
	{:else}
		<LeadBoxScene />
	{/if}
</div>

<style>
	.media {
		margin: 0 0 1rem;
	}

	/* 휴대폰에서 그림이 카드 글을 밀어내지 않도록 높이를 제한한다(SVG 는 비율을 지켜 가운데 놓인다). */
	.media :global(svg) {
		max-height: 30svh;
	}

	@media (min-width: 960px) {
		.media :global(svg) {
			max-height: none;
		}
	}
</style>
