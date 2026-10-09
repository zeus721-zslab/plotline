<script lang="ts">
	// 빛의 나이 시그니처 배경: 화면 전체 Canvas 2D. 동작 줄이기 · 저사양이면 움직이지 않는 한 장만 그린다.
	import { onMount } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import type { SceneId } from './scenes.ts';
	import { isLowEndDevice, SkyRenderer } from './skyRenderer.ts';

	type Props = { scene: SceneId; endProgress: number };

	let { scene, endProgress }: Props = $props();

	const MILLISECONDS_PER_SECOND = 1000;
	// 탭을 오래 비웠다 돌아와도 한 번에 크게 건너뛰지 않게 프레임 간격 상한을 둔다.
	const MAX_FRAME_SECONDS = 0.1;

	let canvas: HTMLCanvasElement;
	let renderer = $state<SkyRenderer | null>(null);
	let lowEnd = $state(false);
	const still = $derived(prefersReducedMotion.current || lowEnd);

	onMount(() => {
		const created = new SkyRenderer(canvas, scene);
		lowEnd = isLowEndDevice();
		created.resize();
		renderer = created;
		let lastScrollY = window.scrollY;
		const onResize = (): void => {
			created.resize();
			if (still) created.drawStill();
		};
		const onScroll = (): void => {
			created.addScroll(Math.abs(window.scrollY - lastScrollY) / window.innerHeight);
			lastScrollY = window.scrollY;
		};
		window.addEventListener('resize', onResize);
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			window.removeEventListener('resize', onResize);
			window.removeEventListener('scroll', onScroll);
		};
	});

	$effect(() => {
		if (renderer === null) return;
		renderer.setScene(scene);
		if (still) renderer.drawStill();
	});

	$effect(() => {
		if (renderer === null) return;
		renderer.setEndProgress(endProgress);
		if (still) renderer.drawStill();
	});

	// 움직임: 기기별 프레임 상한(휴대폰 30fps)에 맞춰 그린다. 정지 모드면 위 두 효과가 장면 · 진행이 바뀔 때만 한 장을 다시 그린다.
	$effect(() => {
		const active = renderer;
		if (active === null) return;
		if (still) {
			active.drawStill();
			return;
		}
		const frameInterval = MILLISECONDS_PER_SECOND / active.framesPerSecond;
		let frame = 0;
		let last = performance.now();
		const tick = (now: number): void => {
			frame = requestAnimationFrame(tick);
			const gap = now - last;
			if (gap < frameInterval - 1) return;
			last = now;
			active.step(Math.min(MAX_FRAME_SECONDS, gap / MILLISECONDS_PER_SECOND));
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});
</script>

<canvas bind:this={canvas} data-still={still}></canvas>

<style>
	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
