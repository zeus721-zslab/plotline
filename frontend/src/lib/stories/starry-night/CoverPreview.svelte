<script lang="ts">
	// 표지용 작은 그림(장식): 액자 속 밤하늘 — 소용돌이 · 별 · 초승달 · 사이프러스 윤곽. 읽기 보조기기에는 숨긴다.
	// 별(x, y, 반지름): 그림 속 자리를 300 × 120 칸에 줄여 옮김
	const STARS: Array<[number, number, number]> = [
		[46, 22, 5],
		[86, 34, 4],
		[150, 22, 5],
		[178, 40, 4],
		[106, 70, 7],
		[60, 72, 4]
	];
	// 소용돌이 고리(가운데 x, y, 반지름)
	const SWIRLS: Array<[number, number, number]> = [
		[150, 58, 18],
		[150, 58, 10],
		[204, 74, 11]
	];
</script>

<svg viewBox="0 0 300 120" aria-hidden="true" focusable="false">
	<defs>
		<linearGradient id="starry-sky" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#1b3a8c" />
			<stop offset="1" stop-color="#0b1a44" />
		</linearGradient>
		<radialGradient id="starry-glow">
			<stop offset="0" stop-color="#fff3c4" />
			<stop offset="0.45" stop-color="#f2cf63" stop-opacity="0.8" />
			<stop offset="1" stop-color="#f2cf63" stop-opacity="0" />
		</radialGradient>
	</defs>
	<rect width="300" height="120" fill="#2b1d0e" />
	<rect x="6" y="6" width="288" height="108" fill="url(#starry-sky)" />
	<path
		d="M6 88 Q 70 64 130 86 T 230 70 T 294 64"
		fill="none"
		stroke="#9fc3e8"
		stroke-width="3"
		stroke-opacity="0.6"
	/>
	{#each SWIRLS as [x, y, radius], index (index)}
		<path
			d={`M ${x - radius} ${y} A ${radius} ${radius} 0 1 1 ${x} ${y + radius}`}
			fill="none"
			stroke="#c9dcf2"
			stroke-width="2.5"
			stroke-opacity="0.75"
			stroke-linecap="round"
		/>
	{/each}
	{#each STARS as [x, y, radius], index (index)}
		<circle cx={x} cy={y} r={radius * 2.2} fill="url(#starry-glow)" />
	{/each}
	<circle cx="262" cy="26" r="15" fill="url(#starry-glow)" />
	<path d="M262 14 a12 12 0 1 0 10 18 a9 9 0 1 1 -10 -18 z" fill="#f2b632" />
	<path d="M6 114 L6 100 Q 150 90 294 96 L294 114 Z" fill="#14244a" />
	<path
		d="M58 114 C 52 90 62 70 60 50 C 64 30 66 18 70 10 C 74 26 74 44 80 60 C 84 78 90 96 92 114 Z"
		fill="#0d120c"
	/>
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
