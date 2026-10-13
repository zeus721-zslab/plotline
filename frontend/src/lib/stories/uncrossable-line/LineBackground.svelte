<script lang="ts">
	// 넘을 수 없는 선 배경: 화면 전체 Canvas 2D(lineRenderer.ts) + 그 아래 8장 물결용 WebGL 캔버스.
	// rAF 루프를 상시 돌려 시간 효과(맥박 · 흔들림 · 불씨)를 그린다(D-44). 다만 다음 경우에는 루프를 멈추고 한 장만 그린다:
	// 탭이 숨었을 때 · 이야기 구간이 화면 밖일 때(onscreen false) · 정지 모드(still: 동작 줄이기 또는 저사양 — 비트마다 정지 그림).
	// 2D 캔버스를 만들 수 없으면 6편처럼 정지 그림(표지 그림)과 안내 한 줄을 둔다.
	import { onMount } from 'svelte';
	import CoverPreview from './CoverPreview.svelte';
	import {
		createLineRenderer,
		STILL_TIME,
		type CoverLine,
		type HiddenMarks,
		type LineRenderer
	} from './lineRenderer.ts';
	import type { TrackState } from './lineScene.ts';

	// layoutKey: 화면 크기가 바뀌어 배치를 다시 잡아야 할 때마다 늘어난다(페이지가 구간을 다시 잰 뒤)
	// cover: 표지 구간에서만 기준선 위치 · 표지 진행값(그 밖에는 null)
	type Props = {
		track: TrackState;
		layoutKey: number;
		marks: HiddenMarks;
		still: boolean;
		onscreen: boolean;
		cover: CoverLine | null;
	};

	let { track, layoutKey, marks, still, onscreen, cover }: Props = $props();

	const MILLISECONDS_PER_SECOND = 1000;

	let canvas = $state<HTMLCanvasElement>();
	let waterCanvas = $state<HTMLCanvasElement>();
	let renderer = $state<LineRenderer | null>(null);
	let unavailable = $state(false);
	let pageVisible = $state(true);
	// 첫 장면을 그린 뒤 캔버스에 data-ready="1"(화면 확인 · 측정이 렌더러 준비 전 기본 캔버스를 재지 않게 하는 표지, 동작 무관)
	let ready = $state(false);
	let sizedLayout = -1;
	let stillKey = '';

	const running = $derived(
		renderer !== null && layoutKey !== 0 && !still && pageVisible && onscreen
	);

	function stillKeyOf(state: TrackState): string {
		// 정지 그림은 비트마다(암전 구간은 꺼짐 · 가운데 · 켜짐 세 단계) 한 장
		if (state.kind === 'beat') return `beat${state.entryIndex}`;
		const phase = state.p < 0.4 ? 0 : state.p > 0.6 ? 2 : 1;
		return `gap${state.entryIndex}:${phase}`;
	}

	onMount(() => {
		if (canvas === undefined || waterCanvas === undefined) return;
		try {
			renderer = createLineRenderer(canvas, waterCanvas);
		} catch (error) {
			console.error('uncrossable line renderer setup failed', error);
			unavailable = true;
			return;
		}
		const onVisibility = (): void => {
			pageVisible = document.visibilityState === 'visible';
		};
		onVisibility();
		document.addEventListener('visibilitychange', onVisibility);
		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			renderer?.dispose();
			renderer = null;
		};
	});

	// 화면 크기: 페이지가 구간을 다시 잰 뒤(layoutKey) 캔버스와 미리 그린 것을 다시 만든다
	$effect(() => {
		if (renderer === null || layoutKey === 0 || layoutKey === sizedLayout) return;
		sizedLayout = layoutKey;
		stillKey = '';
		renderer.resize();
	});

	// 움직임: rAF 상시 루프. 멈출 때(정지 모드 · 탭 숨김 · 화면 밖)는 아래 효과가 한 장만 그린다
	$effect(() => {
		const active = renderer;
		if (!running || active === null) return;
		let frame = 0;
		let last = 0;
		const tick = (now: number): void => {
			frame = requestAnimationFrame(tick);
			active.render(track, now / MILLISECONDS_PER_SECOND, false, marks, cover);
			if (last !== 0) active.noteFrame(now - last);
			last = now;
			ready = true;
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});

	// 멈춘 동안: 정지 모드는 비트(또는 암전 단계)가 바뀔 때만, 탭 숨김 · 화면 밖은 멈춘 순간 한 장.
	// 표지 구간은 기준선이 표지 글과 함께 움직이도록 선의 화면 y(px)가 바뀔 때도 한 장 다시 그린다
	$effect(() => {
		const active = renderer;
		if (active === null || layoutKey === 0 || running) return;
		const coverKey = cover === null ? '' : String(Math.round(cover.y));
		const key = `${stillKeyOf(track)}|${coverKey}|${layoutKey}|${still}|${marks.score75}${marks.score84}${marks.score85}`;
		if (key === stillKey) return;
		stillKey = key;
		active.render(
			track,
			still ? STILL_TIME : performance.now() / MILLISECONDS_PER_SECOND,
			still,
			marks,
			cover
		);
		ready = true;
	});
</script>

<div class="stage" data-still={still} data-unavailable={unavailable}>
	<canvas
		bind:this={waterCanvas}
		class="water"
		class:hidden={unavailable}
		data-gl={renderer !== null && renderer.hasWebGl ? '1' : '0'}
	></canvas>
	<canvas
		bind:this={canvas}
		class="scene"
		class:hidden={unavailable}
		data-ready={ready ? '1' : '0'}
		data-running={running ? '1' : '0'}
	></canvas>
	{#if unavailable}
		<div class="still">
			<CoverPreview />
			<p class="notice">이 기기에서는 움직이는 장면을 볼 수 없어 그림만 보여 드립니다.</p>
		</div>
	{/if}
</div>

<style>
	.stage {
		position: absolute;
		top: 0;
		right: 0;
		left: 0;
		height: 100vh;
		height: 100svh;
		background: var(--story-bg);
	}

	canvas {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}

	/* 8장 물결(WebGL)은 장면 캔버스 아래에 깔고, 8장에서만 렌더러가 보이게 한다 */
	.water {
		visibility: hidden;
	}

	canvas.hidden {
		display: none;
	}

	/* 6편 정지 그림과 같은 자리 */
	.still {
		position: absolute;
		top: 36%;
		left: 50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		width: min(92vw, 480px);
		transform: translate(-50%, -50%);
	}

	.notice {
		margin: 0;
		color: var(--story-muted);
		font-size: 0.875rem;
		text-align: center;
	}
</style>
