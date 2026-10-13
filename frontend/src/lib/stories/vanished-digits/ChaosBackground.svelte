<script lang="ts">
	// 사라진 세 자리 배경: Canvas 2D 한 장(chaosRenderer.ts). 시작 계산(chaosWorld.ts)은 여기서 만들 때 한다:
	// 첫 화면 계산은 동기, 무거운 셋은 첫 그림 뒤 유휴 시간에 나눠 미리 계산한다(D-47 D9 · STEP 144).
	// rAF 루프는 그림만 늦게 따라오는 완화 스크롤(시제품 smoothY)로 그린다. 다음 경우에는 멈추고 한 장만 그린다:
	// 탭 숨김 · 이야기 구간이 화면 밖 · 정지 모드(동작 줄이기 또는 저사양 — 구간마다 정지 그림).
	// 2D 캔버스를 만들 수 없으면 표지 정지 그림과 안내 한 줄을 둔다(글은 그대로 읽힌다).
	import { onMount } from 'svelte';
	import { resolveIndex, type TrackLayout } from '#lib/story/beatTrack.ts';
	import type { SceneFigures } from './chaosPaint.ts';
	import { createChaosRenderer, type ChaosRenderer, type OverlayMeasure } from './chaosRenderer.ts';
	import { entryOf, smoothScroll, stillPosition, type TrackPosition } from './chaosScene.ts';
	import { createWorld, type ChaosWorld, type PrewarmName } from './chaosWorld.ts';
	import CoverPreview from './CoverPreview.svelte';

	// layoutKey: 트랙 배치를 다시 잡을 때마다 늘어난다(0 이면 아직 배치 전)
	// text: 실제 스크롤 위치의 트랙 위치(글 기준). onpicture: 그림이 쓰는 위치(완화 · 정지)를 페이지 표식에 알린다
	type Props = {
		layout: TrackLayout | null;
		layoutKey: number;
		trackTop: number;
		text: TrackPosition;
		still: boolean;
		onscreen: boolean;
		figures: SceneFigures;
		measure: OverlayMeasure;
		onpicture: (position: TrackPosition) => void;
	};

	let { layout, layoutKey, trackTop, text, still, onscreen, figures, measure, onpicture }: Props =
		$props();

	const MILLISECONDS_PER_SECOND = 1000;
	// 첫 프레임의 경과 시간(ms, 시제품 tick 기본값)
	const FIRST_FRAME_MS = 16;

	let canvas = $state<HTMLCanvasElement>();
	let renderer = $state<ChaosRenderer | null>(null);
	let unavailable = $state(false);
	let pageVisible = $state(true);
	// 첫 그림을 그린 뒤 data-ready="1"(화면 확인 · 측정이 렌더러 준비 전 기본 캔버스를 재지 않게 하는 표지, 동작 무관)
	let ready = $state(false);
	// 유휴 시간에 미리 계산을 마친 것(data-prewarmed, 확인용 표지)
	let prewarmed = $state<PrewarmName[]>([]);
	let stopPrewarm: (() => void) | null = null;
	let worldRef: ChaosWorld | null = null;
	let sizedLayout = 0;
	let stillKey = '';
	let clockStart = 0;

	const running = $derived(
		renderer !== null && layout !== null && layoutKey !== 0 && !still && pageVisible && onscreen
	);

	function seconds(): number {
		return (performance.now() - clockStart) / MILLISECONDS_PER_SECOND;
	}

	function drawn(): void {
		if (ready) return;
		ready = true;
		const world = worldRef;
		if (world === null) return;
		stopPrewarm = world.prewarm((name) => {
			prewarmed = [...prewarmed, name];
		});
	}

	onMount(() => {
		if (canvas === undefined) return;
		clockStart = performance.now();
		try {
			worldRef = createWorld();
			renderer = createChaosRenderer(canvas, worldRef, figures, measure);
		} catch (error) {
			console.error('vanished digits renderer setup failed', error);
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
			if (stopPrewarm !== null) stopPrewarm();
			if (renderer !== null) renderer.dispose();
			renderer = null;
		};
	});

	// 화면 크기: 페이지가 트랙을 다시 잰 뒤(layoutKey) 캔버스 버퍼와 장면 배율을 다시 잡는다
	$effect(() => {
		if (renderer === null || layoutKey === 0 || layoutKey === sizedLayout) return;
		sizedLayout = layoutKey;
		stillKey = '';
		renderer.resize();
	});

	// 움직임: rAF 루프. 글은 실제 스크롤, 그림은 완화 스크롤 위치를 따른다
	$effect(() => {
		const active = renderer;
		const currentLayout = layout;
		const top = trackTop;
		if (!running || active === null || currentLayout === null) return;
		let frame = 0;
		let last = 0;
		let smoothY = window.scrollY;
		const tick = (now: number): void => {
			frame = requestAnimationFrame(tick);
			const elapsed = last === 0 ? FIRST_FRAME_MS : now - last;
			last = now;
			smoothY = smoothScroll(smoothY, window.scrollY, elapsed, window.innerHeight);
			const picture = resolveIndex(smoothY - top, currentLayout);
			active.render(picture, seconds(), true);
			onpicture(picture);
			drawn();
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});

	// 멈춘 동안: 정지 모드는 구간이 바뀔 때만(구간마다 정지 그림 한 장), 탭 숨김 · 화면 밖은 글 위치가 바뀔 때 한 장
	$effect(() => {
		const active = renderer;
		if (unavailable) {
			onpicture(still ? stillPosition(text) : text);
			return;
		}
		if (active === null || layout === null || layoutKey === 0 || running) return;
		const picture = still ? stillPosition(text) : text;
		const key = still
			? `${picture.index}|${entryOf(picture).kind === 'chapter' ? 0 : picture.p}|${layoutKey}`
			: `${picture.index}|${picture.p}|${layoutKey}`;
		if (key === stillKey) return;
		stillKey = key;
		active.render(picture, still ? 0 : seconds(), !still);
		onpicture(picture);
		drawn();
	});
</script>

<div class="stage" data-still={still} data-unavailable={unavailable}>
	<canvas
		bind:this={canvas}
		class:hidden={unavailable}
		data-ready={ready ? '1' : '0'}
		data-running={running ? '1' : '0'}
		data-prewarmed={prewarmed.join(' ')}
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
		inset: 0;
		background: var(--story-bg);
	}

	/* 휴대폰 · 태블릿: 그림은 위쪽 0~62%(글 띠와 겹치지 않는다). 빛 먼지가 그림 영역 끝에서 칼로 자른 듯 끊기지 않게 가장자리만 옅게 */
	canvas {
		position: absolute;
		top: 0;
		left: 0;
		display: block;
		width: 100%;
		height: 62%;
		-webkit-mask-image: linear-gradient(to bottom, #000 94%, transparent);
		mask-image: linear-gradient(to bottom, #000 94%, transparent);
	}

	canvas.hidden {
		display: none;
	}

	.still {
		position: absolute;
		top: 31%;
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

	/* PC: 그림은 오른쪽 넓게(글은 왼쪽 열) */
	@media (min-width: 1024px) {
		canvas {
			left: 36%;
			width: 64%;
			height: 100%;
			-webkit-mask-image: linear-gradient(to right, transparent, #000 6%);
			mask-image: linear-gradient(to right, transparent, #000 6%);
		}

		.still {
			top: 50%;
			left: 68%;
			width: min(56vw, 480px);
		}
	}
</style>
