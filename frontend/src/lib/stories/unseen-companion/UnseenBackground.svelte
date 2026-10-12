<script lang="ts">
	// 보이지 않는 짝 배경: 화면 전체 Canvas 2D(unseenRenderer.ts). 그림용 정적 JSON 을 읽은 뒤(onMount 뒤 fetch) 그린다.
	// 그리기는 진행 값(frame)이 바뀔 때만 한다(시간 의존 없음). 동작 줄이기면 5편처럼 정지 그림: 언덕 장면(1-1) 한 장만 그리고 스크롤에 따라 바꾸지 않는다.
	// 2D 캔버스가 없거나 정적 JSON 을 읽지 못하면 5편처럼 정지 그림(표지 그림)과 안내 한 줄을 둔다.
	import { onMount, untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import CoverPreview from './CoverPreview.svelte';
	import {
		createUnseenRenderer,
		WIDE_QUERY,
		type HiddenMarks,
		type TextBox,
		type UnseenRenderer
	} from './unseenRenderer.ts';
	import type { BeatProgress } from './unseenScene.ts';
	import { parseStaticData, STATIC_FILES, type StaticData } from './unseenStatic.ts';

	// layoutKey: 화면 크기가 바뀌어 배치를 다시 잡아야 할 때마다 늘어난다(페이지가 비트 위치를 다시 잰 뒤)
	type Props = {
		frame: BeatProgress;
		layoutKey: number;
		hidden: HiddenMarks;
		textBoxes: () => TextBox[];
	};

	let { frame, layoutKey, hidden, textBoxes }: Props = $props();

	// 동작 줄이기의 정지 그림: 1장 첫 비트 처음(언덕 · 망원경 · 시리우스)
	const STILL_FRAME: BeatProgress = { index: 0, p: 0 };

	let canvas = $state<HTMLCanvasElement>();
	let renderer = $state<UnseenRenderer | null>(null);
	let unavailable = $state(false);
	// 첫 장면을 그린 뒤 캔버스에 data-ready="1"(화면 확인 · 측정이 렌더러 준비 전 기본 캔버스를 재지 않게 하는 표지, 동작 무관)
	let ready = $state(false);
	let drawnLayout = -1;

	async function fetchJson(path: string): Promise<unknown> {
		const response = await fetch(path);
		if (!response.ok) throw new Error(`unseen data ${path}: ${response.status}`);
		return response.json();
	}

	async function loadStatic(): Promise<StaticData | null> {
		const [sirius, peg] = await Promise.all([
			fetchJson(STATIC_FILES.sirius),
			fetchJson(STATIC_FILES.peg)
		]);
		return parseStaticData(sirius, peg);
	}

	function start(element: HTMLCanvasElement): () => void {
		let disposed = false;
		const media = window.matchMedia(WIDE_QUERY);
		loadStatic()
			.then((data) => {
				if (disposed) return;
				if (data === null) {
					console.error('unseen companion static data has an unexpected shape');
					unavailable = true;
					return;
				}
				try {
					renderer = createUnseenRenderer(element, data, hidden, () => media.matches);
				} catch (error) {
					console.error('unseen renderer setup failed', error);
					unavailable = true;
				}
			})
			.catch((error: unknown) => {
				console.error('unseen companion static data failed to load', error);
				unavailable = true;
			});
		return () => {
			disposed = true;
			renderer = null;
		};
	}

	onMount(() => {
		if (canvas === undefined) return;
		return start(canvas);
	});

	$effect(() => {
		// layoutKey 0: 페이지가 아직 글 상자 · 비트 위치를 재지 않음
		if (renderer === null || layoutKey === 0) return;
		const still = prefersReducedMotion.current;
		const current = still ? STILL_FRAME : frame;
		if (layoutKey !== drawnLayout) {
			drawnLayout = layoutKey;
			const boxes = untrack(textBoxes);
			renderer.resize(boxes);
		}
		renderer.render(current);
		ready = true;
	});
</script>

<div class="stage" data-still={prefersReducedMotion.current} data-unavailable={unavailable}>
	<canvas bind:this={canvas} class:hidden={unavailable} data-ready={ready ? '1' : '0'}></canvas>
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
		display: block;
		width: 100%;
		height: 100%;
	}

	canvas.hidden {
		display: none;
	}

	/* 5편 정지 그림과 같은 자리: 휴대폰은 화면 위 36%, PC(가로 1024px 이상)는 그림 영역 쪽 */
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

	@media (min-width: 1024px) and (orientation: landscape) {
		.still {
			top: 50%;
			left: 68%;
			width: min(52vw, 640px);
		}
	}
</style>
