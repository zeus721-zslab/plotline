<script lang="ts">
	// 표지용 작은 주기율표(장식). 칸 위치만 그리고 읽기 보조기기에는 숨긴다.
	import {
		GRID_COLUMNS,
		GRID_ROWS,
		LAST_ATOMIC_NUMBER,
		periodicPosition,
		type GridPosition
	} from './periodicTable.ts';

	const positions: GridPosition[] = Array.from({ length: LAST_ATOMIC_NUMBER }, (_, index) =>
		periodicPosition(index + 1)
	).filter((position): position is GridPosition => position !== null);
</script>

<div
	class="preview"
	aria-hidden="true"
	style:--columns={GRID_COLUMNS}
	style:--rows={GRID_ROWS}
	style:aspect-ratio="{GRID_COLUMNS} / {GRID_ROWS}"
>
	{#each positions as position, index (index)}
		<span style:grid-row={position.row} style:grid-column={position.column}></span>
	{/each}
</div>

<style>
	.preview {
		display: grid;
		grid-template-columns: repeat(var(--columns), 1fr);
		/* 줄 높이를 균등하게 나눠 빈 줄(7주기와 란타넘족 사이)도 한 줄 높이를 갖게 한다. */
		grid-template-rows: repeat(var(--rows), 1fr);
		gap: 2px;
		width: 100%;
	}

	span {
		border-radius: 1px;
		background: var(--story-cell-on);
	}
</style>
