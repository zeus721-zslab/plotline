<script lang="ts">
	// 주기율표 칸 배치와 켜짐 상태만 그린다. 칸을 누르면 onselect 로 알리고 상세 표시는 부모가 맡는다.
	import { discoveryLabel, type StoryElement } from './elements.ts';
	import { CELL_GAP_PX, GRID_COLUMNS, GRID_ROWS, periodicPosition } from './periodicTable.ts';

	type Props = {
		label: string;
		elements: StoryElement[];
		litNumbers: Set<number>;
		// 원자 번호 → 켜지는 지연(ms). 없으면 지연 없이 켜진다.
		delays?: Map<number, number>;
		// 강조 칸. 비어 있지 않으면 강조 밖의 켜진 칸은 한 단계 어둡게 그린다.
		highlightNumbers?: Set<number>;
		// 아직 꺼진 예언 칸("?" 표시·깜박임)
		predictedNumbers?: Set<number>;
		// 부모가 확대해 보여 주는 배율. 화면에 보이는 칸 크기로 기호 표시 여부를 정한다.
		visualScale?: number;
		onselect: (element: StoryElement, trigger: HTMLButtonElement) => void;
	};

	let {
		label,
		elements,
		litNumbers,
		delays = new Map(),
		highlightNumbers = new Set(),
		predictedNumbers = new Set(),
		visualScale = 1,
		onselect
	}: Props = $props();

	// 칸 폭이 이보다 좁으면 기호를 읽을 수 없어 색만 보인다.
	const MIN_SYMBOL_CELL_PX = 24;

	let gridWidth = $state(0);
	const cellSize = $derived(
		Math.max(0, (gridWidth - CELL_GAP_PX * (GRID_COLUMNS - 1)) / GRID_COLUMNS)
	);
	const showSymbols = $derived(cellSize * visualScale >= MIN_SYMBOL_CELL_PX);
	const hasHighlight = $derived(highlightNumbers.size > 0);

	const placed = $derived(
		elements.flatMap((element) => {
			const position = periodicPosition(element.atomicNumber);
			return position === null ? [] : [{ element, position }];
		})
	);

	function cellLabel(element: StoryElement): string {
		return `원자 번호 ${element.atomicNumber}, ${element.name}, ${discoveryLabel(element.discovery)}`;
	}
</script>

<div
	class="grid"
	role="group"
	aria-label={label}
	bind:clientWidth={gridWidth}
	style:--columns={GRID_COLUMNS}
	style:--rows={GRID_ROWS}
	style:--cell="{cellSize}px"
	style:--gap="{CELL_GAP_PX}px"
>
	{#each placed as { element, position } (element.atomicNumber)}
		{@const lit = litNumbers.has(element.atomicNumber)}
		{@const highlighted = highlightNumbers.has(element.atomicNumber)}
		{@const predicted = !lit && predictedNumbers.has(element.atomicNumber)}
		<button
			type="button"
			class="cell"
			class:lit
			class:highlight={lit && highlighted}
			class:dim={lit && hasHighlight && !highlighted}
			class:predicted
			style:grid-row={position.row}
			style:grid-column={position.column}
			style:--delay="{delays.get(element.atomicNumber) ?? 0}ms"
			aria-label={cellLabel(element)}
			onclick={(event) => onselect(element, event.currentTarget)}
		>
			{#if predicted}
				<span class="mark" aria-hidden="true">?</span>
			{:else if showSymbols}
				<span aria-hidden="true">{element.symbol}</span>
			{/if}
		</button>
	{/each}
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(var(--columns), 1fr);
		grid-template-rows: repeat(var(--rows), var(--cell));
		gap: var(--gap);
		width: 100%;
	}

	.cell {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 0;
		padding: 0;
		border: 0;
		border-radius: 2px;
		background: var(--story-cell-off);
		color: var(--story-muted);
		font: inherit;
		font-size: calc(var(--cell) * 0.42);
		font-weight: 600;
		line-height: 1;
		cursor: pointer;
		/* 꺼질 때는 지연 없이, 켜질 때만 --delay 만큼 늦춘다. */
		transition: background-color 160ms ease-out;
	}

	.cell.lit {
		background: var(--story-cell-on);
		color: var(--story-bg);
		transition: background-color 320ms ease-out var(--delay);
	}

	.cell.dim {
		background: var(--story-cell-dim);
	}

	.cell.highlight {
		position: relative;
		background: var(--story-cell-bright);
		box-shadow: 0 0 0 2px var(--story-text);
	}

	.cell.predicted {
		color: var(--story-cell-on);
		animation: predicted-blink 1.6s ease-in-out infinite;
	}

	.mark {
		font-size: calc(var(--cell) * 0.7);
	}

	@keyframes predicted-blink {
		50% {
			opacity: 0.35;
		}
	}

	.cell:focus-visible {
		position: relative;
		z-index: 1;
		outline: 2px solid var(--story-text);
		outline-offset: 1px;
	}

	@media (prefers-reduced-motion: reduce) {
		.cell,
		.cell.lit {
			transition: none;
		}

		.cell.predicted {
			animation: none;
		}
	}
</style>
