<script lang="ts">
	// 표지용 작은 그림(장식): 블랙홀 단면 동심원 지도와 위로 올라가는 깜빡임 빛. 읽기 보조기기에는 숨긴다.
	// 위치는 고정 값이라 그릴 때마다 같은 그림이 나온다.
	const STARS: Array<[number, number]> = [
		[14, 20],
		[48, 96],
		[86, 30],
		[226, 18],
		[262, 90],
		[290, 44],
		[30, 64],
		[248, 60]
	];
	// 바깥 → 안: 안정 궤도(청록) · 광자구(금빛) · 작용권(보라) · 지평선(붉은 테두리)
	const RINGS: Array<[number, string]> = [
		[46, '#46d2c8'],
		[24, '#ffc85a'],
		[19, '#a06ef0'],
		[15, '#eb463c']
	];
	const PULSES: Array<[number, number]> = [
		[42, 0.9],
		[26, 0.6],
		[10, 0.3]
	];
</script>

<svg viewBox="0 0 300 120" aria-hidden="true" focusable="false">
	{#each STARS as [x, y], index (index)}
		<circle cx={x} cy={y} r="1.2" fill="var(--story-text)" opacity="0.7" />
	{/each}
	<circle cx="150" cy="64" r="15" fill="#3c080a" />
	{#each RINGS as [radius, color], index (index)}
		<circle cx="150" cy="64" r={radius} fill="none" stroke={color} stroke-opacity="0.8" />
	{/each}
	<circle cx="150" cy="64" r="1.5" fill="#fff" />
	<circle cx="184" cy="56" r="2.5" fill="#fff" />
	{#each PULSES as [y, opacity], index (index)}
		<circle cx="184" cy={y} r="2" fill="var(--story-cell-on)" {opacity} />
	{/each}
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
