<script lang="ts">
	// 숫자 세어 올라가기: play 가 켜지면 from 에서 value 까지 0.6초 동안 센다. 동작 줄이기면 바로 최종 값.
	import { prefersReducedMotion } from 'svelte/motion';

	type Props = { value: number; from?: number; play: boolean };

	let { value, from = 0, play }: Props = $props();

	const DURATION_MS = 600;

	let shown = $state(0);

	$effect(() => {
		if (!play || prefersReducedMotion.current || from === value) {
			shown = value;
			return;
		}
		const start = performance.now();
		let frame = 0;
		const tick = (now: number): void => {
			const progress = Math.min(1, (now - start) / DURATION_MS);
			shown = Math.round(from + (value - from) * progress);
			if (progress < 1) frame = requestAnimationFrame(tick);
		};
		shown = from;
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	});
</script>

<!-- 세는 중간 값은 읽기 보조기기에 숨기고 최종 값만 읽힌다. -->
<span aria-hidden="true">{shown}</span><span class="visually-hidden">{value}</span>

<style>
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
