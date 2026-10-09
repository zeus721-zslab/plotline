<script lang="ts">
	// 이야기 작업 페이지(D-37): 제목 · 요약 → 묶음별 판 선택 → 문구 대조(경고만) → 미리보기 → 발행 → 판 이력.
	// 공개 이야기 파일이 최신 공개 판과 어긋나면 경고와 공개 파일 다시 쓰기(인라인 확인 1회)를 보인다.
	import { onMount, untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import StoryHistory from '#lib/admin/StoryHistory.svelte';
	import { previewSearch } from '#lib/admin/storyPreview.ts';
	import {
		fetchDatasetContent,
		fetchStory,
		publishStory,
		restoreStory,
		retryStory,
		rewriteStory,
		sameAsPublished,
		type StoryBlockedReason,
		type StoryDetail,
		type StoryPublishResult,
		type StoryRewriteResult,
		type StoryVersion
	} from '#lib/admin/stories.ts';
	import {
		COMMON_ERROR_MESSAGES,
		DATASET_CONTENT_PROBLEM_MESSAGES,
		PUBLIC_FILE_WARNINGS,
		STORY_PUBLISH_ERROR_MESSAGES,
		STORY_RESULT_UNKNOWN_MESSAGE,
		TERMS
	} from '#lib/admin/terms.ts';
	import { findStoryEntry, StoryCheckError, type StoryEntry } from '#lib/stories/registry.ts';

	type DetailState =
		| { kind: 'loading' }
		| { kind: 'loaded'; detail: StoryDetail }
		| { kind: 'not_found' }
		| { kind: 'error'; message: string }
		| { kind: 'signed_out' };
	type CheckState =
		| { kind: 'idle' }
		| { kind: 'checking' }
		| { kind: 'done'; targets: string[] }
		| { kind: 'unavailable'; reason: string | null };
	type Notice = { tone: 'ok' | 'bad'; text: string };

	const TITLE_MAX_LENGTH = 60;
	const SUMMARY_MAX_LENGTH = 200;
	const DETAIL_ERROR_MESSAGES = {
		...COMMON_ERROR_MESSAGES,
		unexpected: `${TERMS.story}를 불러오지 못했습니다.`
	} as const;
	const BLOCKED_MESSAGES: Record<StoryBlockedReason, string> = {
		unchanged: '지금 공개된 판과 제목 · 요약 · 데이터 판이 같아 발행하지 않았습니다.',
		incomplete: '끝나지 않은 발행이 있습니다. 다시 불러온 뒤 시도하세요.',
		datasets_mismatch: `이 ${TERMS.story}가 쓰는 ${TERMS.dataset}과 고른 묶음이 다릅니다.`,
		dataset_version_not_done: '확정되지 않은 데이터 판이 있습니다.',
		dataset_file_missing: `데이터 판 파일이 없습니다. ${TERMS.dataset}에서 다시 시도로 복구하세요.`,
		not_retryable: '가장 최근의 실패한 판만 다시 시도할 수 있습니다.',
		not_restorable: '지금 공개된 판이 아닌, 공개됐던 판으로만 되돌릴 수 있습니다.',
		not_rewritable: '가장 최근 판이 공개된 판일 때만 공개 파일을 다시 쓸 수 있습니다.',
		conflict: '다른 처리와 겹쳤습니다. 다시 불러온 뒤 시도하세요.'
	};

	const story = $derived(page.params.story === undefined ? '' : page.params.story);
	const entry = $derived<StoryEntry | null>(findStoryEntry(story));

	let view = $state<DetailState>({ kind: 'loading' });
	let title = $state('');
	let summary = $state('');
	let selection = $state<Record<string, number | null>>({});
	let check = $state<CheckState>({ kind: 'idle' });
	let busy = $state(false);
	let notice = $state<Notice | null>(null);
	let confirmingRewrite = $state(false);
	// 늦게 온 대조 응답이 새 선택의 결과를 덮지 않게 요청마다 번호를 붙인다.
	let checkRequest = 0;

	const detail = $derived(view.kind === 'loaded' ? view.detail : null);
	const latestDone = $derived(detail === null ? null : detail.latest_done);
	const chosen = $derived.by((): Record<string, number> | null => {
		if (detail === null) return null;
		const result: Record<string, number> = {};
		for (const dataset of detail.datasets) {
			const versionNo = selection[dataset.name];
			if (versionNo === undefined || versionNo === null) return null;
			result[dataset.name] = versionNo;
		}
		return result;
	});
	const chosenKey = $derived(chosen === null ? '' : JSON.stringify(chosen));
	const trimmedTitle = $derived(title.trim());
	const trimmedSummary = $derived(summary.trim());
	const formReady = $derived(
		chosen !== null &&
			trimmedTitle.length > 0 &&
			trimmedTitle.length <= TITLE_MAX_LENGTH &&
			trimmedSummary.length > 0 &&
			trimmedSummary.length <= SUMMARY_MAX_LENGTH
	);
	const unchanged = $derived(
		detail !== null &&
			chosen !== null &&
			sameAsPublished(detail, { title: trimmedTitle, summary: trimmedSummary, datasets: chosen })
	);
	const publicFileWarning = $derived(
		detail === null || detail.public_file === null || detail.public_file === 'ok'
			? null
			: PUBLIC_FILE_WARNINGS[detail.public_file]
	);
	// 다시 쓰기는 최신 판이 공개된 판일 때만 된다(실패 판이면 다시 시도 · 새 발행으로 맞춘다).
	const rewritable = $derived(detail !== null && detail.latest_status === 'done');
	const previewHrefNow = $derived(
		formReady && chosen !== null
			? previewHref({ title: trimmedTitle, summary: trimmedSummary, datasets: chosen })
			: null
	);

	function restorable(version: StoryVersion): boolean {
		return detail !== null && !sameAsPublished(detail, version);
	}

	function previewHref(query: {
		title: string;
		summary: string;
		datasets: Record<string, number>;
	}): string | null {
		if (entry === null) return null;
		return `${resolve('/admin/stories/[story]/preview', { story })}${previewSearch(query)}`;
	}

	function versionPreviewHref(version: StoryVersion): string | null {
		return previewHref({
			title: version.title,
			summary: version.summary,
			datasets: version.datasets
		});
	}

	/** 처음 불러올 때만 입력을 채운다(최신 공개 판 값, 처음이면 비움 · 판은 각 묶음의 최신 공개 판). */
	async function load(fillForm: boolean): Promise<void> {
		if (fillForm) view = { kind: 'loading' };
		const result = await fetchStory(story);
		if (result.kind === 'ok') {
			view = { kind: 'loaded', detail: result.story };
			if (fillForm) fill(result.story);
			return;
		}
		if (result.kind === 'not_found') view = { kind: 'not_found' };
		else if (result.kind === 'unauthorized') view = { kind: 'signed_out' };
		else view = { kind: 'error', message: DETAIL_ERROR_MESSAGES[result.kind] };
	}

	function fill(loaded: StoryDetail): void {
		title = loaded.latest_done === null ? '' : loaded.latest_done.title;
		summary = loaded.latest_done === null ? '' : loaded.latest_done.summary;
		const next: Record<string, number | null> = {};
		for (const dataset of loaded.datasets) {
			const newest = dataset.done_versions[0];
			next[dataset.name] = newest === undefined ? null : newest.version_no;
		}
		selection = next;
	}

	async function runCheck(storyEntry: StoryEntry, versions: Record<string, number>): Promise<void> {
		checkRequest += 1;
		const request = checkRequest;
		check = { kind: 'checking' };
		const names = Object.keys(versions);
		let results: Awaited<ReturnType<typeof fetchDatasetContent>>[];
		try {
			results = await Promise.all(names.map((name) => fetchDatasetContent(name, versions[name])));
		} catch (error) {
			// 네트워크 오류는 결과로 돌아오므로 여기 오는 것은 예상하지 못한 오류뿐이다. 대조는 경고라 발행을 막지 않는다.
			console.warn('story check request failed', error);
			if (request === checkRequest) check = { kind: 'unavailable', reason: null };
			return;
		}
		if (request !== checkRequest) return;
		const contents: Record<string, unknown> = {};
		for (const [position, result] of results.entries()) {
			if (result.kind !== 'ok') {
				console.warn('story check content unavailable', names[position], result.kind);
				check = {
					kind: 'unavailable',
					reason:
						result.kind === 'problem'
							? `${names[position]} v${versions[names[position]]}: ${DATASET_CONTENT_PROBLEM_MESSAGES[result.problem]}`
							: null
				};
				return;
			}
			contents[names[position]] = result.content;
		}
		try {
			const targets = storyEntry.checkHidden(contents, new Date());
			check = { kind: 'done', targets: [...targets].sort() };
		} catch (error) {
			// 데이터 형식 문제(StoryCheckError)든 대조 코드의 예상 밖 오류든 "대조하지 못함"으로 알리고 발행은 막지 않는다.
			console.warn(
				error instanceof StoryCheckError ? 'story check failed' : 'story check crashed',
				error
			);
			check = { kind: 'unavailable', reason: null };
		}
	}

	$effect(() => {
		// 선택 값이 바뀔 때만 다시 대조한다(chosenKey 로 따라감). 발행 뒤 다시 불러와 객체만 새로 생긴 경우는 대조하지 않는다.
		const key = chosenKey;
		const versions = untrack(() => chosen);
		if (entry === null || key === '' || versions === null) {
			// 진행 중인 대조 응답이 늦게 와도 덮어쓰지 않게 번호를 올린다.
			checkRequest += 1;
			check = { kind: 'idle' };
			return;
		}
		void runCheck(entry, versions);
	});

	function describeBlocked(reason: StoryBlockedReason, problems: string[]): Notice {
		return {
			tone: 'bad',
			text:
				problems.length === 0
					? BLOCKED_MESSAGES[reason]
					: `${BLOCKED_MESSAGES[reason]} (${problems.join(', ')})`
		};
	}

	function describeFailure(
		kind: 'unauthorized' | 'forbidden' | 'network_error' | 'unexpected'
	): Notice {
		if (kind === 'unauthorized') return { tone: 'bad', text: '로그인이 필요합니다.' };
		// 500 · 네트워크 오류 · 읽을 수 없는 응답은 서버에서 파일이 바뀌었는지 알 수 없다(상세는 act 가 다시 읽는다).
		if (kind === 'network_error' || kind === 'unexpected') {
			return { tone: 'bad', text: STORY_RESULT_UNKNOWN_MESSAGE };
		}
		return { tone: 'bad', text: DETAIL_ERROR_MESSAGES[kind] };
	}

	function describe(result: StoryPublishResult): Notice {
		switch (result.kind) {
			case 'ok':
				return result.outcome.status === 'done'
					? { tone: 'ok', text: `v${result.outcome.version_no} 을 ${TERMS.storyPublish}했습니다.` }
					: {
							tone: 'bad',
							text:
								result.outcome.publish_error === null
									? `v${result.outcome.version_no} ${TERMS.storyPublish}이 끝나지 않았습니다.`
									: `v${result.outcome.version_no} 실패: ${STORY_PUBLISH_ERROR_MESSAGES[result.outcome.publish_error]}`
						};
			case 'blocked':
				return describeBlocked(result.reason, result.problems);
			case 'not_found':
				return { tone: 'bad', text: '없는 이야기 또는 판입니다. 다시 불러오세요.' };
			default:
				return describeFailure(result.kind);
		}
	}

	function describeRewrite(result: StoryRewriteResult): Notice {
		switch (result.kind) {
			case 'ok':
				return result.outcome.write_error === null
					? {
							tone: 'ok',
							text: `공개 파일을 v${result.outcome.version_no} 내용으로 다시 썼습니다.`
						}
					: {
							tone: 'bad',
							text: `공개 파일을 다시 쓰지 못했습니다(판은 그대로): ${STORY_PUBLISH_ERROR_MESSAGES[result.outcome.write_error]}`
						};
			case 'blocked':
				return describeBlocked(result.reason, result.problems);
			case 'not_found':
				return { tone: 'bad', text: '없는 이야기입니다. 다시 불러오세요.' };
			default:
				return describeFailure(result.kind);
		}
	}

	async function act<T>(
		run: () => Promise<T>,
		describeResult: (result: T) => Notice
	): Promise<void> {
		busy = true;
		notice = null;
		try {
			notice = describeResult(await run());
		} finally {
			busy = false;
			// 실패해도 서버 상태가 바뀌었을 수 있어 다시 읽는다.
			void load(false);
		}
	}

	function handlePublish(): void {
		if (chosen === null) return;
		const datasets = chosen;
		void act(() => publishStory(story, trimmedTitle, trimmedSummary, datasets), describe);
	}

	function handleRetry(versionNo: number): void {
		void act(() => retryStory(story, versionNo), describe);
	}

	function handleRestore(versionNo: number): void {
		void act(() => restoreStory(story, versionNo), describe);
	}

	function handleRewrite(): void {
		confirmingRewrite = false;
		void act(() => rewriteStory(story), describeRewrite);
	}

	onMount(() => {
		void load(true);
	});
</script>

<nav class="crumbs small">
	<a href={resolve('/admin/stories')}>{TERMS.story}</a>
	<span class="muted">/</span>
	<span class="mono">{story}</span>
</nav>

{#if view.kind === 'loading'}
	<p class="muted">불러오는 중…</p>
{:else if view.kind === 'not_found'}
	<div class="panel notice">
		<p class="status-bad" role="alert">등록할 수 없는 {TERMS.story}입니다.</p>
		<a class="btn" href={resolve('/admin/stories')}>{TERMS.story} 목록으로</a>
	</div>
{:else if view.kind === 'error'}
	<div class="panel notice">
		<p class="status-bad" role="alert">{view.message}</p>
		<button type="button" class="btn" onclick={() => load(true)}>다시 시도</button>
	</div>
{:else if view.kind === 'loaded'}
	{@const loaded = view.detail}
	<h1>{latestDone === null ? story : latestDone.title}</h1>
	{#if entry === null}
		<p class="alert warn-box" role="status">
			이 {TERMS.story}는 화면 코드에 문구 대조 · 페이지가 없습니다. 문구 대조 없음 · {TERMS.preview} 없음
		</p>
	{/if}
	{#if publicFileWarning !== null}
		<div class="alert warn-box public-file" role="status">
			<p>
				{publicFileWarning}.
				{rewritable
					? `지금 공개 판(v${latestDone === null ? '' : latestDone.version_no}) 내용으로 다시 쓸 수 있습니다.`
					: '가장 최근 판이 실패라 판 이력에서 다시 시도하거나 새로 발행해 맞추세요.'}
			</p>
			{#if rewritable}
				<div class="rewrite-actions">
					{#if confirmingRewrite}
						<span class="small">이야기 파일 · 목록을 지금 공개 판 내용으로 다시 씁니다</span>
						<button type="button" class="btn small primary" disabled={busy} onclick={handleRewrite}
							>확인</button
						>
						<button
							type="button"
							class="btn small quiet"
							onclick={() => (confirmingRewrite = false)}>취소</button
						>
					{:else}
						<button
							type="button"
							class="btn small"
							disabled={busy}
							onclick={() => (confirmingRewrite = true)}>공개 파일 다시 쓰기</button
						>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	<section class="panel block" aria-labelledby="info-title">
		<h2 id="info-title">제목 · 요약</h2>
		<label class="label">
			<span>제목 <span class="muted small">{trimmedTitle.length}/{TITLE_MAX_LENGTH}</span></span>
			<input class="field" type="text" maxlength={TITLE_MAX_LENGTH} bind:value={title} />
		</label>
		<label class="label">
			<span>요약 <span class="muted small">{trimmedSummary.length}/{SUMMARY_MAX_LENGTH}</span></span
			>
			<textarea class="field" rows="2" maxlength={SUMMARY_MAX_LENGTH} bind:value={summary}
			></textarea>
		</label>
	</section>

	<section class="panel block" aria-labelledby="datasets-title">
		<h2 id="datasets-title">{TERMS.dataset} 판</h2>
		{#each loaded.datasets as dataset (dataset.name)}
			<label class="label">
				<span class="mono">{dataset.name}</span>
				{#if dataset.done_versions.length === 0}
					<span class="status-bad small"
						>확정된 판이 없습니다. {TERMS.dataset}에서 먼저 판을 확정하세요</span
					>
				{:else}
					<select class="field" bind:value={selection[dataset.name]}>
						{#each dataset.done_versions as version (version.version_no)}
							<option value={version.version_no}>
								v{version.version_no}{version.version_no === dataset.done_versions[0].version_no
									? ' · 최신'
									: ''}{version.version_no === dataset.current_version
									? ' · 지금 공개'
									: ''}{version.file_present ? '' : ' · 파일 없음'}
							</option>
						{/each}
					</select>
				{/if}
			</label>
		{/each}
	</section>

	<section class="panel block" aria-labelledby="check-title" aria-live="polite">
		<h2 id="check-title">문구 대조</h2>
		{#if entry === null}
			<p class="muted">문구 대조 없음</p>
		{:else if check.kind === 'idle'}
			<p class="muted">판을 모두 고르면 대조합니다</p>
		{:else if check.kind === 'checking'}
			<p class="muted">대조하는 중…</p>
		{:else if check.kind === 'unavailable'}
			<p class="status-bad">
				대조하지 못함{check.reason === null ? '' : ` — ${check.reason}`} — 발행은 할 수 있습니다
			</p>
		{:else if check.targets.length === 0}
			<p class="status-ok">숨겨질 문구 0건</p>
		{:else}
			<p class="status-bad">
				숨겨질 문구 {check.targets.length}건 — 발행하면 이 문구는 화면에서 숨겨집니다
			</p>
			<ul class="targets mono small">
				{#each check.targets as target (target)}
					<li>{target}</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="actions-row">
		{#if previewHrefNow === null}
			<button type="button" class="btn" disabled>{TERMS.preview}</button>
		{:else}
			<a class="btn" href={previewHrefNow} target="_blank" rel="noopener">{TERMS.preview}</a>
		{/if}
		<button
			type="button"
			class="btn primary"
			disabled={busy || !formReady || unchanged}
			onclick={handlePublish}>{busy ? `${TERMS.storyPublish} 중…` : TERMS.storyPublish}</button
		>
		{#if unchanged}
			<span class="muted small">지금 공개된 판과 같습니다</span>
		{/if}
	</section>
	{#if notice !== null}
		<p class={notice.tone === 'ok' ? 'status-ok' : 'status-bad'} role="status">{notice.text}</p>
	{/if}

	<section class="history-block" aria-labelledby="history-title">
		<h2 id="history-title">판 이력</h2>
		<StoryHistory
			versions={loaded.versions}
			publicFile={loaded.public_file}
			{busy}
			previewHref={versionPreviewHref}
			{restorable}
			onretry={handleRetry}
			onrestore={handleRestore}
		/>
	</section>
{/if}

<style>
	.crumbs {
		display: flex;
		gap: 8px;
		margin-bottom: 12px;
	}

	h1 {
		margin-bottom: 20px;
		overflow-wrap: anywhere;
	}

	.notice {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}

	.warn-box {
		margin-bottom: 16px;
		background: var(--warn-soft);
		color: var(--warn);
	}

	.public-file {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.rewrite-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.block {
		display: flex;
		flex-direction: column;
		gap: 14px;
		margin-bottom: 16px;
	}

	.block .field {
		width: 100%;
	}

	.targets {
		margin: 0;
		padding-left: 18px;
	}

	.actions-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px;
		margin: 8px 0 12px;
	}

	.history-block {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 32px;
	}
</style>
