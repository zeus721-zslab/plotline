<script lang="ts">
	// 표지용 작은 그림(장식): 수면 아래 바닥의 고리 도시 윤곽과 질문 목록 줄. 읽기 보조기기에는 숨긴다.
	// 고리: 바깥 → 안(청동 · 주석 · 오레이칼코스 색)
	const RINGS: Array<[number, string]> = [
		[70, '#cd965a'],
		[50, '#bec8d2'],
		[30, '#eb6e50']
	];
	// 질문 목록 줄: 위 줄들은 답이 채워진 길이, 마지막 줄은 빈 칸(점선)
	const LINES = [64, 52, 70, 46];
</script>

<svg viewBox="0 0 300 120" aria-hidden="true" focusable="false">
	<defs>
		<linearGradient id="sunken-water" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#14606c" />
			<stop offset="1" stop-color="#03141c" />
		</linearGradient>
	</defs>
	<rect width="300" height="120" fill="url(#sunken-water)" />
	<path
		d="M0 8 Q 25 4 50 8 T 100 8 T 150 8 T 200 8 T 250 8 T 300 8"
		fill="none"
		stroke="#c8f5f0"
		stroke-opacity="0.6"
	/>
	{#each RINGS as [radius, color], index (index)}
		<ellipse
			cx="190"
			cy="96"
			rx={radius}
			ry={radius * 0.28}
			fill="none"
			stroke={color}
			stroke-opacity="0.85"
		/>
	{/each}
	{#each LINES as length, index (index)}
		<circle cx="20" cy={28 + index * 16} r="2.5" fill="#7fe0d0" />
		<line
			x1="28"
			y1={28 + index * 16}
			x2={28 + length}
			y2={28 + index * 16}
			stroke="#9fc0c0"
			stroke-width="3"
			stroke-linecap="round"
		/>
	{/each}
	<rect
		x="28"
		y={28 + LINES.length * 16 - 5}
		width="40"
		height="10"
		rx="3"
		fill="none"
		stroke="#9fc0c0"
		stroke-dasharray="3 2"
	/>
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
