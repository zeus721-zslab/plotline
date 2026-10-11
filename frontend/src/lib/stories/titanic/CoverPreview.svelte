<script lang="ts">
	// 표지용 작은 그림(장식): 장면 A 하늘(별 · 수평선 · 잔잔한 바다)과 수평선 위 작은 배 불빛 띠. 읽기 보조기기에는 숨긴다.
	// 별(x, y, 반지름): 300 × 120 칸
	const STARS: Array<[number, number, number]> = [
		[24, 14, 1.4],
		[58, 32, 0.9],
		[92, 10, 1.1],
		[121, 44, 0.8],
		[146, 22, 1.8],
		[178, 12, 0.9],
		[205, 36, 1.2],
		[236, 18, 0.8],
		[262, 40, 1.5],
		[284, 12, 0.9],
		[40, 56, 0.7],
		[110, 64, 0.7],
		[170, 58, 0.9],
		[228, 62, 0.7]
	];
	// 배 불빛 띠: 수평선 위 두 줄(x 시작, 끝, y)
	const LIGHT_ROWS: Array<[number, number, number]> = [
		[188, 236, 76],
		[184, 240, 79]
	];
	const LIGHT_STEP = 3;
	const HORIZON_Y = 82;
	const LIGHTS: Array<[number, number]> = LIGHT_ROWS.flatMap(([from, to, y]) =>
		Array.from(
			{ length: Math.floor((to - from) / LIGHT_STEP) + 1 },
			(_, index): [number, number] => [from + index * LIGHT_STEP, y]
		)
	);
</script>

<svg viewBox="0 0 300 120" aria-hidden="true" focusable="false">
	<defs>
		<linearGradient id="titanic-sky" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#02040b" />
			<stop offset="0.55" stop-color="#06102a" />
			<stop offset="1" stop-color="#16244a" />
		</linearGradient>
		<linearGradient id="titanic-sea" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#0a1430" />
			<stop offset="1" stop-color="#010206" />
		</linearGradient>
	</defs>
	<rect width="300" height={HORIZON_Y} fill="url(#titanic-sky)" />
	<rect y={HORIZON_Y} width="300" height={120 - HORIZON_Y} fill="url(#titanic-sea)" />
	{#each STARS as [x, y, radius], index (index)}
		<circle cx={x} cy={y} r={radius} fill="#dfe8ff" />
		<rect
			x={x - radius * 0.4}
			y={HORIZON_Y + (HORIZON_Y - y) * 0.42 - 2}
			width={radius * 0.8}
			height="4"
			fill="#dfe8ff"
			opacity="0.25"
		/>
	{/each}
	<rect y={HORIZON_Y - 0.5} width="300" height="1" fill="#7896d2" opacity="0.35" />
	<path d="M180 82 L182 74 L244 74 L247 82 Z" fill="#03050b" />
	{#each LIGHTS as [x, y], index (index)}
		<circle cx={x} cy={y} r="0.7" fill="#ffcf86" />
		<rect x={x - 0.35} y={HORIZON_Y + 1} width="0.7" height="10" fill="#ffc882" opacity="0.3" />
	{/each}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
