<script lang="ts" module>
	/** pending: 승인 · 제외 · approved: 공개 제외 · 복원 · excluded: 복원 · readonly: 처리 없음 */
	export type RowTableMode = 'pending' | 'approved' | 'excluded' | 'readonly';
</script>

<script lang="ts">
	import type { SvelteSet } from 'svelte/reactivity';
	import type { DatasetRow } from './imports.ts';
	import { SOURCE_KIND_LABELS, TERM_HELP, TERMS } from './terms.ts';

	type Props = {
		rows: DatasetRow[];
		/** 구조 순서의 값 칸 이름 */
		columns: string[];
		keyNames: ReadonlySet<string>;
		mode: RowTableMode;
		/** 이전값 → 새값으로 보여 줄지(바뀌는 줄 · 확인일만 갱신 줄) */
		showPrev: boolean;
		/** 고르기 칸을 둘지(바뀌는 줄). selected 는 고른 줄 id. */
		selected: SvelteSet<number> | null;
		busy: boolean;
		onApprove: (rowId: number) => void;
		/** 제외를 마쳤으면 true(이유 입력 줄을 닫는다) */
		onReject: (rowId: number, reason: string) => Promise<boolean>;
		onExclusion: (rowKey: string, excluded: boolean) => void;
	};
	let {
		rows,
		columns,
		keyNames,
		mode,
		showPrev,
		selected,
		busy,
		onApprove,
		onReject,
		onExclusion
	}: Props = $props();

	type RejectDraft = { rowId: number; reason: string };

	// 출처 · 상태 · 처리
	const FIXED_COLUMN_COUNT = 3;
	const REJECT_REASON_MAX_LENGTH = 500;

	let rejectDraft = $state<RejectDraft | null>(null);
	const columnCount = $derived(FIXED_COLUMN_COUNT + columns.length + (selected === null ? 0 : 1));
	const approvableIds = $derived(rows.filter(isApprovable).map((row) => row.id));
	const selectedCount = $derived(
		selected === null ? 0 : approvableIds.filter((id) => selected.has(id)).length
	);
	const allSelected = $derived(approvableIds.length > 0 && selectedCount === approvableIds.length);
	// 이유를 적는 사이 그 줄이 다른 처리로 대기에서 벗어나면 입력 줄을 닫은 것으로 본다.
	const activeDraftRowId = $derived.by(() => {
		if (rejectDraft === null) return null;
		const draftRowId = rejectDraft.rowId;
		return rows.some((row) => row.id === draftRowId && row.status === 'pending')
			? draftRowId
			: null;
	});

	function isApprovable(row: DatasetRow): boolean {
		return row.status === 'pending' && row.errors === null;
	}

	function errorFields(row: DatasetRow): string[] {
		if (row.errors === null) return [];
		return row.errors.flatMap((error) => (error.field === null ? [] : [error.field]));
	}

	function formatValue(value: unknown): string {
		if (value === null || value === undefined) return '';
		return typeof value === 'object' ? JSON.stringify(value) : String(value);
	}

	/** 이전 줄과 값이 다른 칸이면 이전 값을 돌려준다(같거나 이전 줄이 없으면 null). */
	function previousValue(row: DatasetRow, column: string): string | null {
		if (!showPrev || row.prev === null) return null;
		const before = formatValue(row.prev.data[column]);
		return before === formatValue(row.data[column]) ? null : before;
	}

	function previousAsOf(row: DatasetRow): string | null {
		if (!showPrev || row.prev === null || row.prev.as_of_date === row.as_of_date) return null;
		return row.prev.as_of_date === null ? '' : row.prev.as_of_date;
	}

	function sourceChanged(row: DatasetRow): boolean {
		return (
			showPrev &&
			row.prev !== null &&
			(row.prev.source_url !== row.source_url || row.prev.source_kind !== row.source_kind)
		);
	}

	function toggleRow(rowId: number) {
		if (selected === null) return;
		if (selected.has(rowId)) {
			selected.delete(rowId);
		} else {
			selected.add(rowId);
		}
	}

	function toggleAll() {
		if (selected === null) return;
		const select = !allSelected;
		for (const rowId of approvableIds) {
			if (select) {
				selected.add(rowId);
			} else {
				selected.delete(rowId);
			}
		}
	}

	async function submitReject(event: SubmitEvent) {
		event.preventDefault();
		if (rejectDraft === null || rejectDraft.reason.trim() === '') return;
		const draft = rejectDraft;
		const done = await onReject(draft.rowId, draft.reason);
		if (done && rejectDraft !== null && rejectDraft.rowId === draft.rowId) rejectDraft = null;
	}
</script>

<table>
	<thead>
		<tr>
			{#if selected !== null}
				<th scope="col" class="select">
					<input
						type="checkbox"
						checked={allSelected}
						indeterminate={selectedCount > 0 && !allSelected}
						disabled={busy || approvableIds.length === 0}
						onchange={toggleAll}
						aria-label="승인할 수 있는 {TERMS.row} 모두 고르기"
					/>
				</th>
			{/if}
			{#each columns as column (column)}
				<th scope="col" class="mono">{column}</th>
			{/each}
			<th scope="col">출처</th>
			<th scope="col">상태</th>
			<th scope="col">처리</th>
		</tr>
	</thead>
	<tbody>
		{#each rows as row (row.id)}
			{@const fieldsWithError = errorFields(row)}
			{@const approvable = isApprovable(row)}
			{@const asOfBefore = previousAsOf(row)}
			<tr class:selected={selected !== null && selected.has(row.id)}>
				{#if selected !== null}
					<td class="select">
						<input
							type="checkbox"
							checked={selected.has(row.id)}
							disabled={busy || !approvable}
							onchange={() => toggleRow(row.id)}
							aria-label="{TERMS.row} {row.row_key === null ? `#${row.id}` : row.row_key} 고르기"
						/>
					</td>
				{/if}
				{#each columns as column (column)}
					{@const before = previousValue(row, column)}
					<td class:key={keyNames.has(column)} class:wavy={fieldsWithError.includes(column)}>
						{#if before !== null}
							<span class="before">{before === '' ? '(빈 값)' : before}</span>
							<span class="arrow" aria-hidden="true">→</span>
							<span class="after">{formatValue(row.data[column]) || '(빈 값)'}</span>
						{:else}
							{formatValue(row.data[column])}
						{/if}
					</td>
				{/each}
				<td class="source" class:changed-cell={sourceChanged(row)}>
					{#if row.source_kind === 'self'}
						<span>{SOURCE_KIND_LABELS.self}</span>
					{:else if row.source_url !== null}
						<a
							class="source-link"
							href={row.source_url}
							target="_blank"
							rel="noopener noreferrer"
							title={row.source_url}>{row.source_url}</a
						>
					{:else}
						<span class="no-url">{TERMS.sourceUrl} 없음</span>
					{/if}
					{#if asOfBefore !== null}
						<span class="as-of">
							{TERMS.asOfDate}
							<span class="before">{asOfBefore === '' ? '(없음)' : asOfBefore}</span>
							→ <span class="after">{row.as_of_date === null ? '(없음)' : row.as_of_date}</span>
						</span>
					{:else if row.as_of_date !== null}
						<span class="as-of">{TERMS.asOfDate} {row.as_of_date}</span>
					{/if}
				</td>
				<td>
					{#if row.status === 'approved'}
						{#if row.excluded}
							<span class="chip warn">{TERMS.exclude}</span>
						{:else}
							<span class="chip ok">{TERMS.approve}</span>
						{/if}
					{:else if row.status === 'rejected'}
						<span class="chip bad">{TERMS.reject}</span>
					{:else if row.status === 'superseded'}
						<span class="chip quiet">{TERMS.superseded}</span>
					{:else if row.errors !== null}
						<span class="chip warn"
							>{row.change_kind === 'carried' ? '이월 실패 · ' : ''}오류 {row.errors.length}건</span
						>
					{:else}
						<span class="chip quiet">승인 대기</span>
					{/if}
				</td>
				<td>
					{#if mode === 'pending' && row.status === 'pending'}
						<span class="actions">
							<button
								type="button"
								class="btn small"
								disabled={busy || !approvable}
								onclick={() => onApprove(row.id)}>{TERMS.approve}</button
							>
							<button
								type="button"
								class="btn small quiet"
								disabled={busy || activeDraftRowId !== null}
								onclick={() => (rejectDraft = { rowId: row.id, reason: '' })}>{TERMS.reject}</button
							>
						</span>
					{:else if (mode === 'approved' || mode === 'excluded') && row.row_key !== null}
						{@const rowKey = row.row_key}
						<button
							type="button"
							class="btn small quiet"
							disabled={busy}
							title={TERM_HELP.exclude}
							onclick={() => onExclusion(rowKey, !row.excluded)}
							>{row.excluded ? TERMS.restore : TERMS.exclude}</button
						>
					{/if}
				</td>
			</tr>
			{#if row.errors !== null}
				<tr class="sub">
					<td colspan={columnCount}>
						<ul class="errors">
							{#each row.errors as error, index (index)}
								<li>{error.field === null ? '' : `${error.field}: `}{error.message}</li>
							{/each}
						</ul>
					</td>
				</tr>
			{/if}
			{#if row.status === 'rejected' && row.reject_reason !== null}
				<tr class="sub">
					<td colspan={columnCount} class="reject-reason"
						>{TERMS.rejectReason}: {row.reject_reason}</td
					>
				</tr>
			{/if}
			{#if rejectDraft !== null && activeDraftRowId === row.id}
				<tr class="sub reject-row">
					<td colspan={columnCount}>
						<form class="reject-form settle" onsubmit={submitReject}>
							<label class="label grow">
								{TERMS.rejectReason} (필수)
								<textarea
									class="field"
									bind:value={rejectDraft.reason}
									rows="2"
									maxlength={REJECT_REASON_MAX_LENGTH}
									required></textarea>
							</label>
							<span class="reject-actions">
								<button
									type="button"
									class="btn small quiet"
									disabled={busy}
									onclick={() => (rejectDraft = null)}>취소</button
								>
								<button
									type="submit"
									class="btn small danger"
									disabled={busy || rejectDraft.reason.trim() === ''}
								>
									{busy ? '처리 중…' : TERMS.reject}
								</button>
							</span>
						</form>
					</td>
				</tr>
			{/if}
		{/each}
	</tbody>
</table>

<style>
	table {
		width: 100%;
		border-collapse: collapse;
	}

	th {
		padding: 12px 14px;
		border-bottom: 1px solid var(--line);
		color: var(--muted);
		font-size: 13px;
		font-weight: 500;
		text-align: left;
		white-space: nowrap;
	}

	td {
		padding: 12px 14px;
		border-bottom: 1px solid var(--line);
		vertical-align: middle;
	}

	th:first-child,
	td:first-child {
		padding-left: 20px;
	}

	.select {
		width: 48px;
	}

	tr.selected td {
		background: var(--accent-soft);
	}

	/* 줄 아래 줄(오류 · 제외 이유 · 이유 입력)이 있으면 위 줄과 한 덩어리로 보이게 위 줄의 아래 선을 지운다. */
	tr:has(+ tr.sub) td {
		border-bottom-color: transparent;
	}

	tr.sub td {
		padding-top: 0;
	}

	.key {
		font-weight: 600;
	}

	.wavy {
		text-decoration: underline wavy var(--warn);
		text-decoration-thickness: 1px;
		text-underline-offset: 4px;
	}

	.before {
		color: var(--muted);
		text-decoration: line-through;
	}

	.arrow {
		margin: 0 4px;
		color: var(--muted);
	}

	.after {
		padding: 1px 4px;
		border-radius: 4px;
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}

	.changed-cell .source-link {
		padding: 1px 4px;
		border-radius: 4px;
		background: var(--accent-soft);
	}

	.source {
		max-width: 260px;
	}

	.source-link {
		display: block;
		max-width: 240px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 14px;
	}

	.as-of {
		display: block;
		color: var(--muted);
		font-size: 13px;
	}

	.no-url {
		color: var(--warn);
		font-size: 14px;
	}

	.actions {
		display: inline-flex;
		gap: 4px;
	}

	.errors {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--warn);
		font-size: 14px;
	}

	.reject-reason {
		color: var(--bad);
		font-size: 14px;
	}

	.reject-row td {
		background: var(--bad-soft);
		padding-top: 12px;
	}

	.reject-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 12px;
	}

	.reject-form .grow {
		flex: 1 1 280px;
		color: var(--ink);
	}

	.reject-actions {
		display: inline-flex;
		gap: 6px;
	}
</style>
