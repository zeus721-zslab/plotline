<script lang="ts">
	// 그가 실패작이라 부른 밤 배경: 화면 전체 WebGL2 캔버스(starryRenderer.ts). 동작 줄이기면 정지 그림(평면 · 별빛 없음)만,
	// WebGL2 가 없거나 준비에 실패하면 정지 그림과 안내 한 줄을 둔다. 탭이 숨으면 그리기를 멈춘다.
	import { onMount } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import type { StoryImage } from '#lib/story/storyMedia.ts';
	import { StarryRenderer } from './starryRenderer.ts';
	import {
		COVER_POSE,
		focusFor,
		FRAME_MARGIN,
		PAINTING_ASPECT,
		shotOf,
		type SceneTarget
	} from './starryScene.ts';

	// dim: 끝의 암전 정도(0 = 그대로 · 1 = 테마 바탕색). 캔버스 밝기를 1 - dim 으로 둔다.
	type Props = {
		target: SceneTarget;
		instant: boolean;
		flare: boolean;
		dim: number;
		image: StoryImage;
	};

	let { target, instant, flare, dim, image }: Props = $props();

	let canvas = $state<HTMLCanvasElement>();
	let renderer = $state<StarryRenderer | null>(null);
	let unavailable = $state(false);
	// 텍스처를 다 읽기 전에는 정지 그림을 먼저 보인다(첫 화면이 비지 않게).
	let loaded = $state(false);
	let stageWidth = $state(0);
	let stageHeight = $state(0);
	const still = $derived(prefersReducedMotion.current || unavailable);

	type Placement = { centerX: number; centerY: number; width: number; frame: number };

	/**
	 * 텍스처를 읽는 동안의 정지 그림 자리: 렌더러 첫 프레임의 표지 구도(shotOf(COVER_POSE))와 같은 자리 · 크기라
	 * 캔버스로 바뀔 때 그림이 움직이지 않는다. 테두리 두께는 렌더러 액자 폭(FRAME_MARGIN)과 같게 둔다.
	 */
	function coverPlacement(width: number, height: number): Placement | null {
		if (width === 0 || height === 0) return null;
		const shot = shotOf(COVER_POSE, width / height, focusFor(width));
		const pixelsPerWorld = height / Math.exp(shot.logHeight);
		return {
			centerX: shot.focusX * width - shot.x * pixelsPerWorld,
			centerY: shot.focusY * height + shot.y * pixelsPerWorld,
			width: (PAINTING_ASPECT + 2 * FRAME_MARGIN) * pixelsPerWorld,
			frame: FRAME_MARGIN * pixelsPerWorld
		};
	}

	// 동작 줄이기 · WebGL 없음의 정지 그림은 지금 자리(카드를 피한 초점 자리) 그대로 둔다.
	const loadingPlacement = $derived(still ? null : coverPlacement(stageWidth, stageHeight));

	function start(element: HTMLCanvasElement): () => void {
		const gl = element.getContext('webgl2', { antialias: true, alpha: false });
		if (gl === null) {
			unavailable = true;
			return () => {};
		}
		let created: StarryRenderer;
		try {
			created = new StarryRenderer(element, gl);
		} catch (error) {
			console.error('starry renderer setup failed', error);
			unavailable = true;
			return () => {};
		}
		renderer = created;
		created
			.load()
			.then(() => {
				loaded = true;
			})
			.catch((error: unknown) => {
				console.error('starry textures failed to load', error);
				unavailable = true;
			});
		const onResize = (): void => created.requestDraw();
		const onVisibility = (): void => created.setPaused(document.hidden);
		window.addEventListener('resize', onResize);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			created.dispose();
			renderer = null;
			window.removeEventListener('resize', onResize);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	}

	onMount(() => {
		// 동작 줄이기로 시작하면 WebGL 을 만들지 않는다.
		if (prefersReducedMotion.current || canvas === undefined) return;
		return start(canvas);
	});

	$effect(() => {
		if (renderer === null) return;
		renderer.setTarget(target, instant);
	});

	$effect(() => {
		if (renderer === null) return;
		renderer.setFlare(flare);
	});

	// 보는 중에 동작 줄이기가 켜지면 그리기를 멈춘다.
	$effect(() => {
		if (renderer === null) return;
		renderer.setPaused(still);
	});
</script>

<div class="stage" data-still={still} bind:clientWidth={stageWidth} bind:clientHeight={stageHeight}>
	{#if !prefersReducedMotion.current}
		<canvas bind:this={canvas} class:hidden={still} style:opacity={dim > 0 ? 1 - dim : null}
		></canvas>
	{/if}
	{#if still || !loaded}
		<!-- 읽는 동안: 화면 크기를 재기 전에는 숨기고(다른 자리에 잠깐 보이지 않게), 잰 뒤 표지 구도 자리에 둔다. -->
		<div
			class="still"
			class:pending={!still && loadingPlacement === null}
			style:left={loadingPlacement === null ? null : `${loadingPlacement.centerX}px`}
			style:top={loadingPlacement === null ? null : `${loadingPlacement.centerY}px`}
			style:width={loadingPlacement === null ? null : `${loadingPlacement.width}px`}
			style:--frame-width={loadingPlacement === null ? null : `${loadingPlacement.frame}px`}
		>
			<img src={image.files.large} alt="" width={image.width} height={image.height} />
			{#if unavailable}
				<p class="notice">이 기기에서는 움직이는 장면을 볼 수 없어 그림만 보여 드립니다.</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* 캔버스가 그려지기 전 · 끝의 암전에서 비치는 바탕도 테마 바탕색으로 */
	.stage {
		position: absolute;
		inset: 0;
		background: var(--story-bg);
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		background: var(--story-bg);
	}

	canvas.hidden {
		display: none;
	}

	/* 렌더러의 초점 자리와 같게: 휴대폰은 화면 위 36%, PC(1024px 이상)는 오른쪽 70% */
	.still {
		position: absolute;
		top: 36%;
		left: 50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		width: min(92vw, 60svh * 1.263);
		transform: translate(-50%, -50%);
	}

	.still.pending {
		visibility: hidden;
	}

	.still img {
		display: block;
		width: 100%;
		height: auto;
		border: var(--frame-width, 8px) solid #2b1d0e;
		outline: 2px solid #8a6a3a;
		outline-offset: -5px;
		box-sizing: border-box;
		box-shadow: 0 18px 50px rgb(0 0 0 / 60%);
	}

	.notice {
		margin: 0;
		color: var(--story-muted);
		font-size: 0.875rem;
		text-align: center;
	}

	@media (min-width: 1024px) {
		.still {
			top: 50%;
			left: 70%;
			width: min(52vw, 76svh * 1.263);
		}
	}
</style>
