<script lang="ts">
	// 표지용 작은 그림(장식): 언덕 장면 정지 그림 — 밤하늘 · 은하수 · 가장 밝은 시리우스 · 언덕 위 사람과 망원경. 읽기 보조기기에는 숨긴다.
	// 별(x, y, 반지름): 300 × 120 칸에 흩어 둔 바탕 별
	const STARS: Array<[number, number, number]> = [
		[22, 14, 0.9],
		[48, 40, 0.7],
		[70, 18, 1],
		[96, 58, 0.6],
		[132, 12, 0.8],
		[160, 30, 0.7],
		[188, 16, 1.1],
		[214, 46, 0.6],
		[236, 22, 0.8],
		[262, 54, 0.7],
		[284, 12, 0.9],
		[30, 70, 0.6],
		[150, 62, 0.6],
		[248, 76, 0.6]
	];
</script>

<svg viewBox="0 0 300 120" aria-hidden="true" focusable="false">
	<defs>
		<linearGradient id="unseen-sky" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#02030a" />
			<stop offset="0.6" stop-color="#070b22" />
			<stop offset="1" stop-color="#2a2650" />
		</linearGradient>
		<linearGradient id="unseen-milky" x1="1" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#b4aee6" stop-opacity="0.05" />
			<stop offset="0.6" stop-color="#d6cdf0" stop-opacity="0.22" />
			<stop offset="1" stop-color="#f0dcc8" stop-opacity="0.3" />
		</linearGradient>
		<radialGradient id="unseen-sirius">
			<stop offset="0" stop-color="#ffffff" />
			<stop offset="0.3" stop-color="#d7e4ff" stop-opacity="0.8" />
			<stop offset="1" stop-color="#d7e4ff" stop-opacity="0" />
		</radialGradient>
	</defs>
	<rect width="300" height="120" fill="url(#unseen-sky)" />
	<path
		d="M300 -4 C 230 30 170 60 40 110 L 90 120 C 190 80 250 50 300 26 Z"
		fill="url(#unseen-milky)"
	/>
	{#each STARS as [x, y, radius], index (index)}
		<circle cx={x} cy={y} r={radius} fill="#dfe7ff" opacity="0.8" />
	{/each}
	<circle cx="114" cy="44" r="14" fill="url(#unseen-sirius)" />
	<circle cx="114" cy="44" r="1.8" fill="#ffffff" />
	<path
		d="M0 120 L0 104 C 90 102 150 92 200 92 C 250 92 285 98 300 102 L300 120 Z"
		fill="#05061a"
	/>
	<g fill="#020309" stroke="rgba(175,170,235,0.6)" stroke-width="0.6">
		<path d="M196 92 L 186 72 L 191 71 L 200 91 Z" />
		<path d="M186 66 L 160 54 L 162 49 L 188 61 Z" />
		<ellipse cx="208" cy="80" rx="7" ry="7" />
		<path d="M202 92 Q 201 86 204 84 L 212 84 Q 215 86 214 92 Z" />
	</g>
	<circle cx="218" cy="88" r="1" fill="#ff6a5a" />
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
