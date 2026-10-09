<script lang="ts">
	import {
		previewImport,
		saveImport,
		SOURCE_TYPES,
		type ImportPreview,
		type ImportSaved,
		type PasteFailure,
		type PasteInput,
		type RowSummary,
		type SourceType
	} from './imports.ts';
	import { COMMON_ERROR_MESSAGES, SOURCE_TYPE_LABELS, TERMS } from './terms.ts';

	type Props = {
		/** null: 목록의 붙여넣기(대상은 묶음 머리로 정함) · 문자열: 작업 페이지(대상 고정) */
		slug: string | null;
		/** 저장을 마친 뒤(저장할 변화가 없었던 경우 포함). 부모가 이동하거나 목록을 다시 읽는다. */
		onSaved: (saved: ImportSaved) => void | Promise<void>;
	};
	let { slug, onSaved }: Props = $props();

	type Busy = 'none' | 'previewing' | 'saving';
	type Confirmed = { input: PasteInput; preview: ImportPreview };
	type Message =
		| { kind: 'none' }
		| { kind: 'problems'; title: string; problems: string[] }
		| { kind: 'error'; text: string }
		| { kind: 'done'; text: string };

	const FAILURE_MESSAGES: Record<
		Exclude<PasteFailure['kind'], 'unauthorized' | 'invalid_bundle' | 'invalid_fields'>,
		string
	> = {
		...COMMON_ERROR_MESSAGES,
		not_found: `${TERMS.dataset}이 없습니다. 목록에서 다시 고르세요.`,
		schema_missing: `${TERMS.structure}가 없습니다. 묶음에 "fields" 를 넣어 주세요.`,
		dataset_required: `묶음에 "dataset"(${TERMS.slug} · 제목)이 있어야 어느 ${TERMS.dataset}인지 정할 수 있습니다.`,
		dataset_mismatch: `묶음의 ${TERMS.slug}이 이 ${TERMS.dataset}과 다릅니다. 목록의 붙여넣기 칸을 쓰거나 "dataset" 을 고쳐 주세요.`,
		confirmation_required: '확인한 뒤 상태가 바뀌었습니다. 다시 확인하세요.',
		conflict: `같은 ${TERMS.slug} 또는 ${TERMS.structure} 번호가 동시에 저장되었습니다. 다시 확인하세요.`,
		invalid_input: `기본 ${TERMS.sourceUrl}는 2048자 이하의 http/https 주소여야 합니다.`,
		unexpected: '처리하지 못했습니다. 잠시 뒤 다시 시도하세요.'
	};
	const PROBLEM_TITLES = {
		invalid_bundle: '묶음 형식에 문제가 있습니다.',
		invalid_fields: `묶음의 ${TERMS.structure}에 문제가 있습니다.`
	} as const;
	const PAYLOAD_ROWS = 8;

	let payload = $state('');
	let sourceType = $state<SourceType>('claude');
	let defaultSourceUrl = $state('');
	let busy = $state<Busy>('none');
	let confirmed = $state<Confirmed | null>(null);
	let message = $state<Message>({ kind: 'none' });
	// 늦게 온 응답이 최신 상태를 덮지 않게 요청마다 번호를 붙이고 마지막 요청의 응답만 반영한다.
	let requestNo = 0;

	const locked = $derived(busy !== 'none');
	const saveLabel = $derived(confirmed === null ? '' : saveButtonText(confirmed.preview));
	const nothingToSave = $derived(confirmed !== null && !hasChanges(confirmed.preview));

	function hasChanges(preview: ImportPreview): boolean {
		const rows = preview.rows;
		return preview.schema.changed || rows.new + rows.changed + rows.as_of_only + rows.error > 0;
	}

	/** 저장 버튼 문구로 무엇을 확정하는지 밝힌다(새 묶음 · 새 구조). */
	function saveButtonText(preview: ImportPreview): string {
		if (!hasChanges(preview)) return '저장할 변화 없음';
		if (preview.target.is_new) return `새 ${TERMS.dataset} 만들고 저장`;
		if (preview.schema.changed) return `새 ${TERMS.structure}로 바꾸고 저장`;
		return '저장';
	}

	function summaryText(rows: RowSummary): string {
		return [
			`새 ${TERMS.row} ${rows.new}`,
			`바뀌는 ${TERMS.row} ${rows.changed}`,
			`확인일만 ${rows.as_of_only}`,
			`오류 ${rows.error}`,
			`변화 없음(건너뜀) ${rows.unchanged}`
		].join(' · ');
	}

	function currentInput(): PasteInput {
		const trimmedUrl = defaultSourceUrl.trim();
		return {
			slug,
			payload,
			sourceType,
			defaultSourceUrl: trimmedUrl === '' ? null : trimmedUrl
		};
	}

	function showFailure(failure: PasteFailure) {
		if (failure.kind === 'unauthorized') return;
		if (failure.kind === 'invalid_bundle' || failure.kind === 'invalid_fields') {
			message = {
				kind: 'problems',
				title: PROBLEM_TITLES[failure.kind],
				problems: failure.problems
			};
			return;
		}
		// 확인한 내용이 서버 상태와 달라졌으면 같은 확인으로 다시 저장하지 않게 확인 영역을 닫는다.
		if (failure.kind === 'confirmation_required' || failure.kind === 'conflict') confirmed = null;
		message = { kind: 'error', text: FAILURE_MESSAGES[failure.kind] };
	}

	/** 확인 뒤 입력을 바꾸면, 확인한 내용과 다른 내용을 저장하지 않게 확인 영역을 닫는다. */
	function resetConfirm() {
		confirmed = null;
		if (message.kind !== 'none') message = { kind: 'none' };
	}

	function chooseSourceType(type: SourceType) {
		sourceType = type;
		resetConfirm();
	}

	async function handlePreview(event: SubmitEvent) {
		event.preventDefault();
		const input = currentInput();
		const thisRequest = ++requestNo;
		busy = 'previewing';
		message = { kind: 'none' };
		confirmed = null;
		try {
			const result = await previewImport(input);
			// 응답 전에 다른 요청이 시작됐거나 다른 묶음으로 바뀌었으면 늦게 온 결과를 쓰지 않는다.
			if (thisRequest !== requestNo || input.slug !== slug) return;
			if (result.kind === 'ok') {
				confirmed = { input, preview: result.preview };
				return;
			}
			showFailure(result);
		} finally {
			if (thisRequest === requestNo) busy = 'none';
		}
	}

	async function handleSave() {
		if (confirmed === null) return;
		const { input, preview } = confirmed;
		const thisRequest = ++requestNo;
		busy = 'saving';
		message = { kind: 'none' };
		try {
			const result = await saveImport(input, preview.target.is_new, preview.schema.changed);
			if (thisRequest !== requestNo || input.slug !== slug) return;
			if (result.kind !== 'ok') {
				showFailure(result);
				return;
			}
			confirmed = null;
			payload = '';
			message = { kind: 'done', text: savedText(result.saved) };
			// 부모가 다시 읽는 동안에도 잠가 둔다(다시 읽기 전 상태로 또 저장하지 않게).
			await onSaved(result.saved);
		} finally {
			if (thisRequest === requestNo) busy = 'none';
		}
	}

	function savedText(saved: ImportSaved): string {
		if (!saved.saved) {
			return `저장할 변화가 없어 저장하지 않았습니다 (변화 없음 ${saved.rows.unchanged}${TERMS.row}).`;
		}
		const carried =
			saved.carry_approved + saved.carry_pending > 0
				? ` · 이월 ${saved.carry_approved} / 오류로 대기 ${saved.carry_pending}`
				: '';
		return `저장했습니다 — ${summaryText(saved.rows)}${carried}`;
	}
</script>

<section class="panel paste" aria-labelledby="paste-title">
	<form class="paste-form" onsubmit={handlePreview}>
		<div class="paste-head">
			<h2 id="paste-title">붙여넣기</h2>
			<p class="muted desc">
				{slug === null
					? `Claude 가 만든 묶음을 붙여 넣고 확인하세요. 묶음의 "dataset" 으로 ${TERMS.dataset}을 찾거나 새로 만듭니다.`
					: `이 ${TERMS.dataset}에 넣을 묶음을 붙여 넣고 확인하세요. "fields" 를 빼면 지금 ${TERMS.structure}를 씁니다.`}
			</p>
		</div>
		<label class="label">
			<span class="visually-hidden">묶음 JSON</span>
			<textarea
				class="field mono payload"
				bind:value={payload}
				oninput={resetConfirm}
				rows={PAYLOAD_ROWS}
				spellcheck="false"
				placeholder={'{"dataset": {"slug": "…", "title": "…"}, "fields": [...], "rows": [...]}'}
				disabled={locked}
				required></textarea>
		</label>
		<details class="more">
			<summary>자세히</summary>
			<div class="more-body">
				<div class="segment" role="group" aria-label="들어온 경로">
					{#each SOURCE_TYPES as type (type)}
						<button
							type="button"
							aria-pressed={sourceType === type}
							onclick={() => chooseSourceType(type)}
							disabled={locked}>{SOURCE_TYPE_LABELS[type]}</button
						>
					{/each}
				</div>
				<label class="label url">
					기본 {TERMS.sourceUrl} (선택)
					<input
						class="field"
						bind:value={defaultSourceUrl}
						oninput={resetConfirm}
						type="url"
						autocomplete="off"
						placeholder="https://"
						disabled={locked}
					/>
				</label>
				<p class="muted small-text">
					{sourceType === 'claude'
						? 'Claude 결과는 외부 자료만 받습니다. 줄마다 출처 링크와 확인한 날이 있어야 승인할 수 있습니다.'
						: '출처 링크가 없는 외부 자료 줄에는 기본 출처 링크를 씁니다.'}
				</p>
			</div>
		</details>
		<div class="actions">
			<span class="muted size">{payload.length.toLocaleString()}자</span>
			<button type="submit" class="btn" disabled={locked || payload.trim() === ''}>
				{busy === 'previewing' ? '확인 중…' : '확인'}
			</button>
		</div>
	</form>

	{#if confirmed !== null}
		{@const preview = confirmed.preview}
		<div class="confirm settle" role="region" aria-label="저장 전 확인">
			<dl class="facts">
				<div>
					<dt>대상</dt>
					<dd>
						<strong>{preview.target.title}</strong>
						<span class="muted">{TERMS.slug} <span class="mono">{preview.target.slug}</span></span>
						{#if preview.target.is_new}
							<p class="warn-line">
								새 {TERMS.dataset}을 만듭니다. {TERMS.slug}
								<span class="mono">{preview.target.slug}</span> 은 나중에 바꿀 수 없습니다.
							</p>
						{/if}
						{#if preview.target.title_differs}
							<p class="muted small-text">
								묶음의 제목 "{preview.target.bundle_title}" 은 지금 제목과 다릅니다. 제목은 바꾸지
								않습니다.
							</p>
						{/if}
					</dd>
				</div>
				<div>
					<dt>{TERMS.structure}</dt>
					<dd>
						{#if !preview.schema.changed}
							<span>변화 없음 (v{preview.schema.current_version})</span>
						{:else}
							<p class="warn-line">
								{preview.schema.current_version === null
									? `새 ${TERMS.structure}를 저장합니다.`
									: `${TERMS.structure}가 바뀝니다 (v${preview.schema.current_version} → v${preview.schema.current_version + 1}).`}
							</p>
							<ul class="diff">
								{#if preview.schema.added.length > 0}
									<li>추가 <span class="mono">{preview.schema.added.join(', ')}</span></li>
								{/if}
								{#if preview.schema.removed.length > 0}
									<li>삭제 <span class="mono">{preview.schema.removed.join(', ')}</span></li>
								{/if}
								{#if preview.schema.modified.length > 0}
									<li>속성 변경 <span class="mono">{preview.schema.modified.join(', ')}</span></li>
								{/if}
							</ul>
							{#if preview.schema.carry_approved + preview.schema.carry_pending > 0}
								<p class="small-text">
									기존 승인 {preview.schema.carry_approved +
										preview.schema.carry_pending}{TERMS.row}: 이월 {preview.schema.carry_approved} / 오류로
									대기 {preview.schema.carry_pending}
								</p>
							{/if}
							{#if preview.schema.carry_retry_approved + preview.schema.carry_retry_pending > 0}
								<p class="small-text">
									이월 실패였던 {TERMS.row}
									{preview.schema.carry_retry_approved + preview.schema.carry_retry_pending}개 다시
									이월: 승인 {preview.schema.carry_retry_approved} / 오류로 대기 {preview.schema
										.carry_retry_pending}
								</p>
							{/if}
							{#if preview.schema.old_pending_superseded > 0}
								<p class="small-text">
									옛 구조의 대기 줄 {preview.schema.old_pending_superseded}개는 대체됨으로
									바뀝니다(고친 줄은 다시 붙여넣기)
								</p>
							{/if}
						{/if}
					</dd>
				</div>
				<div>
					<dt>{TERMS.row}</dt>
					<dd class="chips">
						<span class="chip accent">새 {TERMS.row} {preview.rows.new}</span>
						<span class="chip accent">바뀌는 {TERMS.row} {preview.rows.changed}</span>
						<span class="chip accent">확인일만 {preview.rows.as_of_only}</span>
						<span class="chip warn">오류 {preview.rows.error}</span>
						<span class="chip quiet">변화 없음(건너뜀) {preview.rows.unchanged}</span>
						<span class="muted small-text">합계 {preview.rows.total}</span>
					</dd>
				</div>
			</dl>
			<div class="confirm-actions">
				<button type="button" class="btn quiet" onclick={resetConfirm} disabled={locked}
					>취소</button
				>
				<button
					type="button"
					class="btn primary"
					onclick={handleSave}
					disabled={locked || nothingToSave}
				>
					{busy === 'saving' ? '저장 중…' : saveLabel}
				</button>
			</div>
		</div>
	{/if}

	{#if message.kind === 'problems'}
		<div class="alert settle" role="alert">
			<p>{message.title}</p>
			<ul>
				{#each message.problems as problem, index (index)}
					<li>{problem}</li>
				{/each}
			</ul>
		</div>
	{:else if message.kind === 'error'}
		<p class="alert settle" role="alert">{message.text}</p>
	{:else if message.kind === 'done'}
		<p class="done settle" role="status">{message.text}</p>
	{/if}
</section>

<style>
	.paste {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.paste-form {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.paste-head {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.desc {
		max-width: 72ch;
		font-size: 14px;
	}

	.payload {
		width: 100%;
		font-size: 13px;
		line-height: 1.5;
	}

	.more summary {
		color: var(--muted);
		font-size: 14px;
		cursor: pointer;
	}

	.more-body {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 12px 16px;
		margin-top: 12px;
	}

	.more-body .url {
		flex: 1 1 260px;
	}

	.more-body p {
		flex-basis: 100%;
	}

	.segment {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 2px;
		padding: 3px;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--sunk);
	}

	.segment button {
		height: 34px;
		padding: 0 14px;
		border: none;
		border-radius: 9px;
		background: transparent;
		color: var(--muted);
		font: inherit;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color 0.15s,
			color 0.15s;
	}

	.segment button[aria-pressed='true'] {
		background: var(--surface);
		color: var(--ink);
		box-shadow: 0 1px 3px rgb(16 19 26 / 0.12);
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 12px;
	}

	.size {
		font-size: 13px;
	}

	.small-text {
		font-size: 14px;
	}

	.confirm {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 18px;
		border: 1px solid var(--accent);
		border-radius: 12px;
		background: var(--accent-soft);
	}

	.facts {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 0;
	}

	.facts > div {
		display: grid;
		grid-template-columns: 72px minmax(0, 1fr);
		gap: 12px;
	}

	.facts dt {
		color: var(--muted);
		font-size: 14px;
		font-weight: 500;
	}

	.facts dd {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.facts dd.chips {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
	}

	.warn-line {
		color: var(--warn);
		font-weight: 500;
	}

	.diff {
		margin: 0;
		padding-left: 18px;
		font-size: 14px;
	}

	.confirm-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 8px;
	}

	.done {
		padding: 12px 16px;
		border-radius: 10px;
		background: var(--ok-soft);
		color: var(--ok);
		font-size: 14px;
	}

	@media (max-width: 640px) {
		.facts > div {
			grid-template-columns: minmax(0, 1fr);
			gap: 4px;
		}
	}
</style>
