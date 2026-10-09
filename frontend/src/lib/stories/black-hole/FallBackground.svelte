<script lang="ts">
	// 사건의 지평선 너머 시그니처 배경: 화면 전체 Canvas 2D. 동작 줄이기 · 저사양이면 장마다 움직이지 않는 한 장만 그린다.
	// 프레임 루프는 2편 배경(SkyBackground.svelte)과 같은 방식이다. progress 는 새 장으로 옮겨 간 정도(장 앞 빈 장면 구간의 스크롤 위치, 0~1),
	// fade 는 7장 신호 띠 깜빡임이 사라진 정도(0~1), instant 는 두 장 이상 건너뛰어 옮겨 가기 없이 바로 놓을지.
	import { onMount } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { FallRenderer, isLowEndDevice } from './fallRenderer.ts';
	import type { MapLayout } from './mapLayout.ts';
	import type { SceneId } from './scenes.ts';

	type Props = {
		scene: SceneId;
		progress: number;
		fade: number;
		instant: boolean;
		layout: MapLayout;
	};

	let { scene, progress, fade, instant, layout }: Props = $props();
	// 화면 확인용 표시(data-progress): 소수 둘째 자리까지
	const PROGRESS_DIGITS = 2;

	const MILLISECONDS_PER_SECOND = 1000;
	// 탭을 오래 비웠다 돌아와도 한 번에 크게 건너뛰지 않게 프레임 간격 상한을 둔다.
	const MAX_FRAME_SECONDS = 0.1;

	let canvas: HTMLCanvasElement;
	let renderer = $state<FallRenderer | null>(null);
	let lowEnd = $state(false);
	const still = $derived(prefersReducedMotion.current || lowEnd);

	onMount(() => {
		const created = new FallRenderer(canvas, scene, layout);
		lowEnd = isLowEndDevice();
		created.resize();
		renderer = created;
		const onResize = (): void => {
			created.resize();
			if (still) created.drawStill();
		};
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	$effect(() => {
		if (renderer === null) return;
		renderer.setScene(scene, instant);
		if (still) renderer.drawStill();
	});

	// 정지 모드는 장마다 한 장만 그리므로 진행도가 바뀌어도 다시 그리지 않는다(값만 넘겨 둔다).
	$effect(() => {
		if (renderer === null) return;
		renderer.setProgress(progress);
		renderer.setFade(fade);
	});

	// 움직임: 기기별 프레임 상한(휴대폰 30fps)에 맞춰 그린다. 정지 모드면 위 효과가 장면이 바뀔 때만 한 장을 다시 그린다.
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

<canvas
	bind:this={canvas}
	data-still={still}
	data-scene={scene}
	data-progress={progress.toFixed(PROGRESS_DIGITS)}
></canvas>

<style>
	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
