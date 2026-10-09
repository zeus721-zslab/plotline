<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import RowTable, { type RowTableMode } from './RowTable.svelte';
	import type { RowCounts, StoredField } from './datasets.ts';
	import { fixRequestText } from './fixRequest.ts';
	import {
		approveKind,
		approveRows,
		fetchRows,
		rejectRow,
		ROW_VIEWS,
		setExclusion,
		type ApproveResult,
		type BulkApprovableKind,
		type DatasetRow,
		type ExclusionResult,
		type RejectResult,
		type RowView
	} from './imports.ts';
	import { COMMON_ERROR_MESSAGES, ROW_VIEW_LABELS, TERMS } from './terms.ts';

	type Props = {
		slug: string;
		title: string;
		/** 최신 구조. 값 칸 순서 · 구분 칸 표시에 쓴다. */
		fields: StoredField[] | null;
		counts: RowCounts;
		/** 붙여넣기 저장 뒤 부모가 올린다. 바뀌면 지금 탭을 다시 읽는다. */
		reloadKey: number;
		/** 승인 · 제외 · 공개 제외 뒤 탭 수를 다시 읽는다. */
		onChanged: () => Promise<void>;
	};
	let { slug, title, fields, counts, reloadKey, onChanged }: Props = $props();

	type RowsState =
		| { kind: 'loading' }
		| { kind: 'loaded'; rows: DatasetRow[]; truncated: boolean }
		| { kind: 'error'; message: string }
		| { kind: 'signed_out' };
	type ActionMessage = { kind: 'success' | 'error'; text: string } | null;
	/** 승인 · 제외 · 공개 제외 결과를 화면 문장 하나로 모은 것. */
	type ActionOutcome =
		| { kind: 'ok'; text: string }
		| Exclude<ApproveResult | RejectResult | ExclusionResult, { kind: 'ok' }>;

	const LOAD_ERROR_MESSAGES = {
		...COMMON_ERROR_MESSAGES,
		not_found: `${TERMS.dataset}이 없습니다. 목록에서 다시 고르세요.`,
		unexpected: `${TERMS.row}을 불러오지 못했습니다.`
	} as const;
	const ACTION_ERROR_MESSAGES = {
		...COMMON_ERROR_MESSAGES,
		not_found: `${TERMS.row} 또는 ${TERMS.dataset}이 없습니다. 목록을 다시 읽었습니다.`,
		not_pending: `이미 처리된 ${TERMS.row}입니다. 목록을 다시 읽었습니다.`,
		invalid_input: `${TERMS.rejectReason}를 1~500자로 적어 주세요.`,
		unexpected: '처리하지 못했습니다.'
	} as const;
	const EMPTY_TEXTS: Record<RowView, string> = {
		pending: `검토할 ${TERMS.row}이 없습니다.`,
		approved: `승인한 ${TERMS.row}이 없습니다.`,
		rejected: `제외한 ${TERMS.row}이 없습니다.`,
		superseded: `대체된 ${TERMS.row}이 없습니다.`,
		excluded: `${TERMS.exclude} 중인 ${TERMS.rowKey}이 없습니다.`
	};
	const VIEW_MODES: Record<RowView, RowTableMode> = {
		pending: 'pending',
		approved: 'approved',
		rejected: 'readonly',
		superseded: 'readonly',
		excluded: 'excluded'
	};
	const PAGE_LIMIT_TEXT = '한 번에 2,000줄까지만 불러옵니다.';

	let view = $state<RowView>('pending');
	let rowsState = $state<RowsState>({ kind: 'loading' });
	let busy = $state(false);
	let actionMessage = $state<ActionMessage>(null);
	let requestShown = $state(false);
	const selected = new SvelteSet<number>();
	// 늦게 온 응답이 최신 화면을 덮지 않게 요청마다 번호를 붙이고 마지막 요청의 응답만 반영한다.
	let rowsRequest = 0;

	const rows = $derived(rowsState.kind === 'loaded' ? rowsState.rows : []);
	const columns = $derived(valueColumns(fields, rows));
	const keyNames = $derived(
		new Set(
			(fields === null ? [] : fields).flatMap((field) =>
				field.key === true && typeof field.name === 'string' ? [field.name] : []
			)
		)
	);
	const tabCounts = $derived<Record<RowView, number>>({
		pending: counts.pending,
		approved: counts.approved,
		rejected: counts.rejected,
		superseded: counts.superseded,
		excluded: counts.excluded_keys
	});
	// 대기 탭 묶음: 오류 → 새 줄 → 바뀌는 줄 → 확인일만 갱신. 분류 없는(이 규칙 이전) 줄은 바뀌는 줄로 본다.
	const errorRows = $derived(rows.filter((row) => row.errors !== null));
	const cleanRows = $derived(rows.filter((row) => row.errors === null));
	const newRows = $derived(cleanRows.filter((row) => row.change_kind === 'new'));
	const asOfRows = $derived(cleanRows.filter((row) => row.change_kind === 'as_of_only'));
	const changedRows = $derived(
		cleanRows.filter((row) => row.change_kind !== 'new' && row.change_kind !== 'as_of_only')
	);
	const carryFailed = $derived(errorRows.filter((row) => row.change_kind === 'carried').length);
	const selectedIds = $derived(
		changedRows.filter((row) => selected.has(row.id)).map((row) => row.id)
	);
	const fixText = $derived(fixRequestText(slug, title, errorRows));

	/** 값 칸: 최신 구조 순서, 그 뒤에 옛 구조 줄에만 있는 칸을 처음 나온 순서로 붙인다. */
	function valueColumns(definition: StoredField[] | null, loaded: DatasetRow[]): string[] {
		const names = (definition === null ? [] : definition).flatMap((field) =>
			typeof field.name === 'string' ? [field.name] : []
		);
		for (const row of loaded) {
			for (const name of Object.keys(row.data)) {
				if (!names.includes(name)) names.push(name);
			}
		}
		return names;
	}

	async function loadRows(target: string, rowView: RowView) {
		const requestNo = ++rowsRequest;
		rowsState = { kind: 'loading' };
		selected.clear();
		requestShown = false;
		const result = await fetchRows(target, rowView);
		if (requestNo !== rowsRequest) return;
		if (result.kind === 'ok') {
			rowsState = { kind: 'loaded', rows: result.page.rows, truncated: result.page.truncated };
		} else if (result.kind === 'unauthorized') {
			rowsState = { kind: 'signed_out' };
		} else {
			rowsState = { kind: 'error', message: LOAD_ERROR_MESSAGES[result.kind] };
		}
	}

	function chooseView(next: RowView) {
		actionMessage = null;
		view = next;
	}

	/**
	 * 처리 공통: 잠그고 요청한 뒤, 같은 화면이면 결과 문장을 보이고 탭 수 · 목록을 다시 읽는다.
	 * 응답 전에 묶음 · 탭이 바뀌었으면 결과를 현재 화면에 쓰지 않는다(새 화면이 서버 상태를 읽는다).
	 * 성공이면 true(제외 이유 입력 줄을 닫는다).
	 */
	async function runAction(request: () => Promise<ActionOutcome>): Promise<boolean> {
		busy = true;
		actionMessage = null;
		const target = slug;
		const targetView = view;
		try {
			const outcome = await request();
			if (outcome.kind === 'unauthorized') return false;
			const sameView = target === slug && targetView === view;
			// 처리됐거나(ok) 서버 상태가 화면과 달랐으면(not_pending · not_found) 탭 수 · 목록을 다시 읽는다.
			const stale = outcome.kind === 'not_pending' || outcome.kind === 'not_found';
			if (outcome.kind === 'ok' || stale) {
				// 탭 수를 다시 읽는 동안에도 잠가 둔다(옛 수로 일괄 승인 버튼을 또 누르지 않게).
				await onChanged();
				if (sameView) void loadRows(target, targetView);
			}
			if (sameView) {
				actionMessage =
					outcome.kind === 'ok'
						? { kind: 'success', text: outcome.text }
						: { kind: 'error', text: ACTION_ERROR_MESSAGES[outcome.kind] };
			}
			return outcome.kind === 'ok';
		} finally {
			busy = false;
		}
	}

	function approvedText(result: ApproveResult): ActionOutcome {
		return result.kind === 'ok'
			? { kind: 'ok', text: `${result.approved}${TERMS.row}을 승인했습니다.` }
			: result;
	}

	function approveIds(rowIds: number[]) {
		const target = slug;
		void runAction(async () => approvedText(await approveRows(target, rowIds)));
	}

	function approveByKind(kind: BulkApprovableKind) {
		const target = slug;
		void runAction(async () => approvedText(await approveKind(target, kind)));
	}

	function reject(rowId: number, reason: string): Promise<boolean> {
		const target = slug;
		return runAction(async () => {
			const result = await rejectRow(target, rowId, reason);
			return result.kind === 'ok'
				? { kind: 'ok', text: `${TERMS.row} 하나를 제외했습니다.` }
				: result;
		});
	}

	function toggleExclusion(rowKey: string, excluded: boolean) {
		const target = slug;
		const text = excluded
			? `${TERMS.rowKey} ${rowKey}를 ${TERMS.exclude}했습니다. 다음 ${TERMS.version}에 들어가지 않습니다.`
			: `${TERMS.rowKey} ${rowKey}를 ${TERMS.restore}했습니다.`;
		void runAction(async () => {
			const result = await setExclusion(target, rowKey, excluded);
			return result.kind === 'ok' ? { kind: 'ok', text } : result;
		});
	}

	async function copyFixRequest() {
		requestShown = true;
		try {
			await navigator.clipboard.writeText(fixText);
			actionMessage = {
				kind: 'success',
				text: `수정 요청문을 복사했습니다(${errorRows.length}${TERMS.row}). Claude 에 붙여 넣으세요.`
			};
		} catch (error) {
			// 권한 거부 · 보안 연결 아님 등. 아래 펼친 글을 직접 복사할 수 있다.
			console.warn('clipboard write failed', error);
			actionMessage = {
				kind: 'error',
				text: '클립보드에 복사하지 못했습니다. 아래 요청문을 직접 복사하세요.'
			};
		}
	}

	$effect(() => {
		const target = slug;
		const rowView = view;
		// 붙여넣기 저장 뒤 다시 읽기 신호
		void reloadKey;
		untrack(() => loadRows(target, rowView));
	});
</script>

<section class="rows" aria-labelledby="rows-title">
	<header class="rows-head">
		<h2 id="rows-title">{TERMS.row} 검토</h2>
		<p class="muted desc">
			오류 없는 {TERMS.row}만 승인할 수 있습니다. 같은 {TERMS.rowKey}의 새 {TERMS.row}을 승인하면
			이전 승인 {TERMS.row}은 {TERMS.superseded}으로 바뀝니다. {TERMS.exclude}는 {TERMS.row}을 남겨
			두고
			{TERMS.version}에서만 뺍니다.
		</p>
	</header>

	<div class="tabs" role="group" aria-label="{TERMS.row} 상태">
		{#each ROW_VIEWS as tab (tab)}
			<button
				type="button"
				aria-pressed={view === tab}
				disabled={busy}
				onclick={() => chooseView(tab)}
			>
				{ROW_VIEW_LABELS[tab]}
				<span class="badge">{tabCounts[tab].toLocaleString()}</span>
			</button>
		{/each}
	</div>

	<p role="status" class="action-status">
		{#if actionMessage !== null}
			<span
				class:status-ok={actionMessage.kind === 'success'}
				class:status-bad={actionMessage.kind === 'error'}>{actionMessage.text}</span
			>
		{/if}
	</p>

	{#if rowsState.kind === 'loading'}
		<p class="muted">{TERMS.row}을 불러오는 중…</p>
	{:else if rowsState.kind === 'error'}
		<div class="panel notice">
			<p class="status-bad" role="alert">{rowsState.message}</p>
			<button type="button" class="btn small" onclick={() => loadRows(slug, view)}>다시 시도</button
			>
		</div>
	{:else if rowsState.kind === 'loaded'}
		{#if rows.length === 0}
			<p class="panel empty muted">{EMPTY_TEXTS[view]}</p>
		{:else if view === 'pending'}
			{#if errorRows.length > 0}
				<section class="group" aria-label="오류">
					<div class="group-head">
						<h3>
							오류 {errorRows.length}{carryFailed > 0 ? ` (이월 실패 ${carryFailed})` : ''}
						</h3>
						<button type="button" class="btn small" disabled={busy} onclick={copyFixRequest}
							>수정 요청문 복사</button
						>
					</div>
					<p class="muted small-text">
						고친 {TERMS.row}을 다시 붙여 넣으면 같은 {TERMS.rowKey}의 이 {TERMS.row}은 {TERMS.superseded}으로
						바뀝니다. {TERMS.rowKey} 값이 없는 {TERMS.row}은 {TERMS.reject}하세요.
					</p>
					{#if requestShown}
						<pre class="request settle" aria-label="수정 요청문">{fixText}</pre>
					{/if}
					<div class="panel table-panel scroll-box">
						<RowTable
							rows={errorRows}
							{columns}
							{keyNames}
							mode="pending"
							showPrev={false}
							selected={null}
							{busy}
							onApprove={(rowId) => approveIds([rowId])}
							onReject={reject}
							onExclusion={toggleExclusion}
						/>
					</div>
				</section>
			{/if}
			{#if newRows.length > 0}
				<section class="group" aria-label="새 {TERMS.row}">
					<div class="group-head">
						<h3>새 {TERMS.row} {newRows.length}</h3>
						<button
							type="button"
							class="btn small primary"
							disabled={busy || counts.pending_new === 0}
							onclick={() => approveByKind('new')}
							>새 {TERMS.row} {counts.pending_new}개 승인</button
						>
					</div>
					<div class="panel table-panel scroll-box">
						<RowTable
							rows={newRows}
							{columns}
							{keyNames}
							mode="pending"
							showPrev={false}
							selected={null}
							{busy}
							onApprove={(rowId) => approveIds([rowId])}
							onReject={reject}
							onExclusion={toggleExclusion}
						/>
					</div>
				</section>
			{/if}
			{#if changedRows.length > 0}
				<section class="group" aria-label="바뀌는 {TERMS.row}">
					<div class="group-head">
						<h3>바뀌는 {TERMS.row} {changedRows.length}</h3>
						<button
							type="button"
							class="btn small primary"
							disabled={busy || selectedIds.length === 0}
							onclick={() => approveIds([...selectedIds])}
							>고른 {TERMS.row} 승인{selectedIds.length > 0
								? ` (${selectedIds.length})`
								: ''}</button
						>
					</div>
					<p class="muted small-text">이전 값 → 새 값. 확인한 {TERMS.row}을 골라 승인하세요.</p>
					<div class="panel table-panel scroll-box">
						<RowTable
							rows={changedRows}
							{columns}
							{keyNames}
							mode="pending"
							showPrev={true}
							{selected}
							{busy}
							onApprove={(rowId) => approveIds([rowId])}
							onReject={reject}
							onExclusion={toggleExclusion}
						/>
					</div>
				</section>
			{/if}
			{#if asOfRows.length > 0}
				<section class="group" aria-label="확인일만 갱신">
					<div class="group-head">
						<h3>확인일만 갱신 {asOfRows.length}</h3>
						<button
							type="button"
							class="btn small primary"
							disabled={busy || counts.pending_as_of_only === 0}
							onclick={() => approveByKind('as_of_only')}>{counts.pending_as_of_only}개 승인</button
						>
					</div>
					<p class="muted small-text">
						값 · 출처는 같고 {TERMS.asOfDate}만 바뀐 {TERMS.row}입니다.
					</p>
					<div class="panel table-panel scroll-box">
						<RowTable
							rows={asOfRows}
							{columns}
							{keyNames}
							mode="pending"
							showPrev={true}
							selected={null}
							{busy}
							onApprove={(rowId) => approveIds([rowId])}
							onReject={reject}
							onExclusion={toggleExclusion}
						/>
					</div>
				</section>
			{/if}
		{:else}
			<div class="panel table-panel scroll-box">
				<RowTable
					{rows}
					{columns}
					{keyNames}
					mode={VIEW_MODES[view]}
					showPrev={false}
					selected={null}
					{busy}
					onApprove={(rowId) => approveIds([rowId])}
					onReject={reject}
					onExclusion={toggleExclusion}
				/>
			</div>
		{/if}
		{#if rowsState.truncated}
			<p class="footnote">
				{rows.length.toLocaleString()}{TERMS.row}만 보여 줍니다. {PAGE_LIMIT_TEXT}
			</p>
		{/if}
	{/if}
</section>

<style>
	.rows {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.rows-head {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.desc {
		max-width: 72ch;
		font-size: 14px;
	}

	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		width: fit-content;
		max-width: 100%;
		padding: 3px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--sunk);
	}

	.tabs button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 34px;
		padding: 0 12px;
		border: none;
		border-radius: 9px;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
	}

	.tabs button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--ink);
		box-shadow: 0 1px 3px rgb(16 19 26 / 0.12);
	}

	.tabs button:disabled {
		cursor: not-allowed;
	}

	.badge {
		display: inline-grid;
		place-items: center;
		min-width: 22px;
		height: 22px;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--line);
		color: var(--ink);
		font-size: 13px;
	}

	.tabs button[aria-pressed='true'] .badge {
		background: var(--accent);
		color: var(--on-accent);
	}

	.action-status {
		min-height: 22px;
		font-size: 14px;
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.group + .group {
		margin-top: 12px;
	}

	.group-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 12px;
	}

	.small-text {
		font-size: 14px;
	}

	.request {
		max-height: 280px;
		margin: 0;
		padding: 14px 16px;
		overflow: auto;
		border-radius: 10px;
		background: var(--sunk);
		font-family: var(--font-mono);
		font-size: 13px;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.notice {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}

	.empty {
		text-align: center;
	}

	.table-panel {
		padding: 0;
	}

	.footnote {
		color: var(--muted);
		font-size: 13px;
	}
</style>
