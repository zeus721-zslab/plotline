<script lang="ts">
	// 바다 밑의 도시들 배경: 화면 전체 Canvas 2D(seaRenderer.ts). 동작 줄이기 · 저사양이면 장마다 움직이지 않는 한 장만 그린다.
	// 프레임 루프는 3편 배경(FallBackground.svelte)과 같은 방식이다. progress 는 새 장으로 옮겨 간 정도, signature 는 시그니처 진행도(0~1),
	// instant 는 두 장 이상 건너뛰어 옮겨 가기 없이 바로 놓을지.
	import { onMount } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { isLowEndDevice, SeaRenderer, type SceneId } from './seaRenderer.ts';

	type Props = {
		scene: SceneId;
		progress: number;
		signature: number;
		instant: boolean;
	};

	let { scene, progress, signature, instant }: Props = $props();
	// 화면 확인용 표시(data-progress · data-signature): 소수 둘째 자리까지
	const PROGRESS_DIGITS = 2;
	const MILLISECONDS_PER_SECOND = 1000;
	// 탭을 오래 비웠다 돌아와도 한 번에 크게 건너뛰지 않게 프레임 간격 상한을 둔다.
	const MAX_FRAME_SECONDS = 0.1;

	let canvas: HTMLCanvasElement;
	let renderer = $state<SeaRenderer | null>(null);
	let lowEnd = $state(false);
	const still = $derived(prefersReducedMotion.current || lowEnd);

	onMount(() => {
		const created = new SeaRenderer(canvas, scene);
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
		renderer.setSignature(signature);
	});

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
	data-signature={signature.toFixed(PROGRESS_DIGITS)}
></canvas>

<style>
	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
