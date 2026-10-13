<script lang="ts">
	// 표지용 작은 그림(장식): 표지 장면의 정지 그림(동작 줄이기 그림과 같은 구성) — 흑연 바탕에 찍힌 값 0.506, 사라진 세 자리 자리에서
	// 금빛 · 흰빛 두 실이 나와 갈라진다. 두 실 모양은 4-4 짝 계산의 벌어짐(chaosCompute coverSpread)을 그대로 쓴다. 제목은 두지 않는다.
	// 홈에서는 이야기 데이터를 읽지 않으므로 숫자는 계산이 쓰는 값(TRUNCATED_VALUE)에서 만든다. 읽기 보조기기에는 숨긴다.
	import {
		computeMain,
		computePair,
		coverSpread,
		PAIR_STEPS,
		TRUNCATED_VALUE
	} from './chaosCompute.ts';

	const VIEW_WIDTH = 300;
	const VIEW_HEIGHT = 120;
	// 숫자 오른쪽 끝(실이 나오는 자리) · 실 길이 · 벌어짐 폭(표지 그림의 휴대폰 비율 300 : 30 그대로)
	const ORIGIN_X = 124;
	const ORIGIN_Y = 60;
	const THREAD_LENGTH = 160;
	const THREAD_AMPLITUDE = THREAD_LENGTH / 10;
	const THREAD_STRIDE = 3; // 걸음
	const NUMBER_TEXT = String(TRUNCATED_VALUE);

	function threadPath(spread: Float32Array, side: number): string {
		const parts: string[] = [];
		for (let step = 0; step <= PAIR_STEPS; step += THREAD_STRIDE) {
			const x = ORIGIN_X + (step / PAIR_STEPS) * THREAD_LENGTH;
			const y = ORIGIN_Y + (side * THREAD_AMPLITUDE * spread[step]) / 2;
			parts.push(`${parts.length === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(2)}`);
		}
		return parts.join(' ');
	}

	const spread = coverSpread(computePair(computeMain()));
	const goldPath = threadPath(spread, -1);
	const whitePath = threadPath(spread, 1);
</script>

<svg viewBox="0 0 {VIEW_WIDTH} {VIEW_HEIGHT}" aria-hidden="true" focusable="false">
	<defs>
		<radialGradient id="digits-haze" cx="0.42" cy="0.5" r="0.75">
			<stop offset="0" stop-color="#1c1a16" />
			<stop offset="0.55" stop-color="#121214" />
			<stop offset="1" stop-color="#0a0b0d" />
		</radialGradient>
	</defs>
	<rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#digits-haze)" />
	<text
		x={ORIGIN_X - 8}
		y={ORIGIN_Y}
		text-anchor="end"
		dominant-baseline="central"
		font-family="ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
		font-size="30"
		font-weight="300"
		fill="#f3ecdf">{NUMBER_TEXT}</text
	>
	<g fill="none" stroke-linecap="round" stroke-linejoin="round">
		<path d={goldPath} stroke="#f0be69" stroke-opacity="0.08" stroke-width="6" />
		<path d={whitePath} stroke="#fff8ec" stroke-opacity="0.08" stroke-width="6" />
		<path d={goldPath} stroke="#f0be69" stroke-opacity="0.8" stroke-width="1.2" />
		<path d={whitePath} stroke="#fff8ec" stroke-opacity="0.85" stroke-width="1.2" />
	</g>
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
