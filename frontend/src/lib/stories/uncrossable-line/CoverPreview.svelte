<script lang="ts">
	// 표지용 작은 그림(장식): 1장 구도 정지 그림 — 어둠 속 원자에서 정반대로 뻗은 두 빛(초록빛 노랑 · 보라), 양 끝의 창살 문,
	// 화면을 가로지르는 붉은 선. 읽기 보조기기에는 숨긴다. 색은 시제품 장면 1 값(COLOR_A · COLOR_B · RED)
	// 창살 문 결(x 오프셋): 지름 22 칸 안의 평행선
	const GRATES = [-8, -4, 0, 4, 8];
</script>

<svg viewBox="0 0 300 120" aria-hidden="true" focusable="false">
	<defs>
		<radialGradient id="line-haze" cx="0.5" cy="0.44" r="0.7">
			<stop offset="0" stop-color="#2e2016" />
			<stop offset="0.5" stop-color="#18110c" />
			<stop offset="1" stop-color="#0a0807" />
		</radialGradient>
		<radialGradient id="line-glow-a">
			<stop offset="0" stop-color="#ffffff" />
			<stop offset="0.25" stop-color="#cdff8c" stop-opacity="0.8" />
			<stop offset="1" stop-color="#cdff8c" stop-opacity="0" />
		</radialGradient>
		<radialGradient id="line-glow-b">
			<stop offset="0" stop-color="#ffffff" />
			<stop offset="0.25" stop-color="#ac8aff" stop-opacity="0.8" />
			<stop offset="1" stop-color="#ac8aff" stop-opacity="0" />
		</radialGradient>
		<linearGradient id="line-ribbon-a" x1="1" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#cdff8c" stop-opacity="0" />
			<stop offset="1" stop-color="#cdff8c" stop-opacity="0.9" />
		</linearGradient>
		<linearGradient id="line-ribbon-b" x1="0" y1="1" x2="1" y2="0">
			<stop offset="0" stop-color="#ac8aff" stop-opacity="0" />
			<stop offset="1" stop-color="#ac8aff" stop-opacity="0.9" />
		</linearGradient>
	</defs>
	<rect width="300" height="120" fill="url(#line-haze)" />
	<line x1="0" y1="62" x2="300" y2="62" stroke="#ff2c1e" stroke-opacity="0.18" stroke-width="7" />
	<line x1="0" y1="62" x2="300" y2="62" stroke="#ffdad0" stroke-width="1" />
	<line x1="150" y1="53" x2="87" y2="69" stroke="url(#line-ribbon-a)" stroke-width="2" />
	<line x1="150" y1="53" x2="213" y2="37" stroke="url(#line-ribbon-b)" stroke-width="2" />
	{#each [{ x: 18, y: 86 }, { x: 282, y: 20 }] as gate, index (index)}
		<g transform="translate({gate.x} {gate.y}) rotate(18)">
			<circle r="11" fill="none" stroke="#dcecff" stroke-opacity="0.85" stroke-width="1.2" />
			{#each GRATES as offset (offset)}
				<line
					x1={offset}
					y1={-Math.sqrt(110 - offset * offset)}
					x2={offset}
					y2={Math.sqrt(110 - offset * offset)}
					stroke="#e1eeff"
					stroke-opacity={offset === 0 ? 0.95 : 0.55}
					stroke-width="0.6"
				/>
			{/each}
		</g>
	{/each}
	<circle cx="87" cy="69" r="14" fill="url(#line-glow-a)" />
	<circle cx="213" cy="37" r="14" fill="url(#line-glow-b)" />
	<circle cx="150" cy="53" r="2" fill="#ffecd6" />
</svg>

<style>
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
</style>
