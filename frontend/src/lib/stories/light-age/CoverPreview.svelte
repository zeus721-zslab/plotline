<script lang="ts">
	// 표지용 작은 그림(장식): 아래로 흐르는 빛줄기와 별, 끝의 검은 그림자. 읽기 보조기기에는 숨긴다.
	// 위치는 고정 값이라 그릴 때마다 같은 그림이 나온다.
	const STREAKS: Array<[number, number, number]> = [
		[22, 8, 46],
		[58, 30, 40],
		[96, 4, 58],
		[140, 40, 36],
		[188, 12, 50],
		[236, 34, 44],
		[274, 6, 54]
	];
	const STARS: Array<[number, number]> = [
		[14, 70],
		[44, 96],
		[80, 62],
		[120, 104],
		[160, 78],
		[204, 100],
		[252, 70],
		[290, 98],
		[70, 18],
		[170, 26],
		[262, 22]
	];
</script>

<svg viewBox="0 0 300 120" aria-hidden="true" focusable="false">
	<defs>
		<linearGradient id="light-age-streak" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="var(--story-cell-on)" stop-opacity="0" />
			<stop offset="1" stop-color="var(--story-cell-on)" stop-opacity="0.9" />
		</linearGradient>
	</defs>
	{#each STREAKS as [x, y, length], index (index)}
		<rect {x} {y} width="1.6" height={length} fill="url(#light-age-streak)" />
	{/each}
	{#each STARS as [x, y], index (index)}
		<circle cx={x} cy={y} r="1.2" fill="var(--story-text)" opacity="0.7" />
	{/each}
	<circle cx="150" cy="60" r="15" fill="none" stroke="var(--story-cell-on)" stroke-opacity="0.5" />
	<circle cx="150" cy="60" r="13" fill="#000" />
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
