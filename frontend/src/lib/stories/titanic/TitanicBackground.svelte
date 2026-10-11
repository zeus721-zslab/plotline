<script lang="ts">
	// 마지막 2시간 40분 배경: 화면 전체 Canvas 2D(titanicRenderer.ts). 하늘 계산 자료(정적 JSON)를 읽은 뒤 그린다.
	// 동작 줄이기면 장마다 정지 구도 한 장만 그리고(매 프레임 그리기 없음), 2D 캔버스가 없거나 자료를 읽지 못하면 안내 한 줄을 둔다.
	// 탭이 숨으면 그리기를 멈춘다.
	import { onMount } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { parseSkyData, SKY_FILES, type SkyData } from './skyData.ts';
	import { TitanicRenderer } from './titanicRenderer.ts';
	import type { SceneFrame } from './titanicScene.ts';

	type Props = { frame: SceneFrame };

	let { frame }: Props = $props();

	let canvas = $state<HTMLCanvasElement>();
	let renderer = $state<TitanicRenderer | null>(null);
	let unavailable = $state(false);

	async function fetchJson(path: string): Promise<unknown> {
		const response = await fetch(path);
		if (!response.ok) throw new Error(`sky data ${path}: ${response.status}`);
		return response.json();
	}

	async function loadSky(): Promise<SkyData | null> {
		const [stars, bodies] = await Promise.all([
			fetchJson(SKY_FILES.stars),
			fetchJson(SKY_FILES.bodies)
		]);
		return parseSkyData(stars, bodies);
	}

	function start(element: HTMLCanvasElement): () => void {
		const ctx = element.getContext('2d', { alpha: false });
		if (ctx === null) {
			unavailable = true;
			return () => {};
		}
		let created: TitanicRenderer | null = null;
		let disposed = false;
		const onResize = (): void => created?.resize();
		const onVisibility = (): void => created?.setPaused(document.hidden);
		loadSky()
			.then((sky) => {
				if (disposed) return;
				if (sky === null) {
					console.error('titanic sky data has an unexpected shape');
					unavailable = true;
					return;
				}
				created = new TitanicRenderer(element, ctx, sky, !prefersReducedMotion.current);
				renderer = created;
			})
			.catch((error: unknown) => {
				console.error('titanic sky data failed to load', error);
				unavailable = true;
			});
		window.addEventListener('resize', onResize);
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			disposed = true;
			created?.dispose();
			renderer = null;
			window.removeEventListener('resize', onResize);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	}

	onMount(() => {
		if (canvas === undefined) return;
		return start(canvas);
	});

	$effect(() => {
		if (renderer === null) return;
		renderer.setFrame(frame);
	});
</script>

<div class="stage">
	<canvas bind:this={canvas} class:hidden={unavailable}></canvas>
	{#if unavailable}
		<p class="notice">이 기기에서는 밤하늘 장면을 볼 수 없어 글만 보여 드립니다.</p>
	{/if}
</div>

<style>
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

	.notice {
		position: absolute;
		top: 40%;
		right: 1rem;
		left: 1rem;
		margin: 0;
		color: var(--story-muted);
		font-size: 0.875rem;
		text-align: center;
	}
</style>
