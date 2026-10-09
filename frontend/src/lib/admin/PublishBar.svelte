<script lang="ts">
	import { untrack } from 'svelte';
	import { formatLocalDateTime } from './format.ts';
	import {
		abandonVersion,
		fetchNextVersion,
		fetchVersionHistory,
		publishDataset,
		retryPublish,
		type NextVersion,
		type BlockedReason,
		type PublishOutcome,
		type PublishResult,
		type PublishStatus,
		type StoryUse,
		type VersionHistory
	} from './publish.ts';
	import {
		COMMON_ERROR_MESSAGES,
		PUBLISH_ERROR_MESSAGES,
		PUBLISH_FILE_WARNINGS,
		PUBLISH_STATUS_LABELS,
		TERM_HELP,
		TERMS
	} from './terms.ts';

	// 작업 페이지 ③ 발행 바(D-29 · D-30): 공개본 대비 변화 수 · [발행] · 결과(경로 · 쓰는 이야기) · 판 이력과 다시 시도 · 폐기.

	type Props = {
		slug: string;
		/** 부모가 묶음 상세를 다시 읽을 때마다 바뀐다(승인 · 제외 · 붙여넣기 뒤). 바뀌면 수 · 이력을 다시 읽는다. */
		reloadKey: unknown;
		/** 발행 · 다시 시도 뒤 묶음 상세(공개 판 · 공개 안 된 변경)를 다시 읽는다. */
		onPublished: () => Promise<void>;
	};
	let { slug, reloadKey, onPublished }: Props = $props();

	type LoadState =
		| { kind: 'loading' }
		| { kind: 'loaded'; next: NextVersion; history: VersionHistory }
		| { kind: 'error'; message: string }
		| { kind: 'signed_out' };
	type Message = { kind: 'success' | 'error'; text: string } | null;

	const LOAD_ERROR_MESSAGES = {
		...COMMON_ERROR_MESSAGES,
		not_found: `${TERMS.dataset}이 없습니다. 목록에서 다시 고르세요.`,
		unexpected: `${TERMS.publish} 정보를 불러오지 못했습니다.`
	} as const;
	const ACTION_ERROR_MESSAGES = {
		...COMMON_ERROR_MESSAGES,
		not_found: `${TERMS.dataset} 또는 판이 없습니다. 다시 읽었습니다.`,
		unexpected: `${TERMS.publish}하지 못했습니다.`
	} as const;
	const BLOCKED_MESSAGES: Record<BlockedReason, string> = {
		empty: '공개할 승인 줄이 없습니다. 이야기에서 이 데이터를 내리려면 이야기 파일을 고칩니다',
		unchanged: `지난 공개 판과 줄 구성이 같아 ${TERMS.publish}할 것이 없습니다.`,
		incomplete: `끝나지 않은 ${TERMS.publish}이 있습니다. 아래 이력에서 다시 시도하거나 폐기하세요.`,
		content_invalid:
			'공개 형식과 맞지 않는 값이 있어 발행하지 않았습니다. 승인한 줄의 값을 고친 뒤 다시 발행하세요.',
		file_missing:
			'공개 파일이 없어 다시 쓰려 했지만 쓰지 못했습니다. 저장 공간 · 권한을 확인하세요.',
		content_changed: '처음 만든 내용과 달라져 공개 파일을 다시 쓰지 않았습니다.',
		not_abandonable: '이미 공개되었거나 폐기된 판입니다. 다시 읽었습니다.',
		abandoned: '폐기한 판은 다시 시도할 수 없습니다. 다시 읽었습니다.',
		conflict: '다른 처리와 겹쳤습니다. 다시 읽었으니 확인 후 다시 누르세요.'
	};
	const INCOMPLETE_STATUSES: readonly PublishStatus[] = ['pending', 'failed'];
	const COPY_RESET_MILLISECONDS = 2000;

	let load = $state<LoadState>({ kind: 'loading' });
	let busy = $state(false);
	let message = $state<Message>(null);
	let outcome = $state<PublishOutcome | null>(null);
	let copied = $state(false);
	// 폐기 확인 중인 판 번호(확인 1회). null 이면 확인 중 아님.
	let confirmingAbandon = $state<number | null>(null);
	// 늦게 온 응답이 최신 화면을 덮지 않게 요청마다 번호를 붙이고 마지막 요청의 응답만 반영한다.
	let loadRequest = 0;

	const history = $derived(load.kind === 'loaded' ? load.history : null);
	const next = $derived(load.kind === 'loaded' ? load.next : null);
	const incomplete = $derived(
		history === null
			? false
			: history.versions.some((version) => INCOMPLETE_STATUSES.includes(version.status))
	);
	const latestDone = $derived(
		history === null
			? null
			: history.versions.reduce<number | null>(
					(highest, version) =>
						version.status === 'done' && (highest === null || version.version_no > highest)
							? version.version_no
							: highest,
					null
				)
	);
	const blockedReason = $derived(publishBlockedReason(next, incomplete));
	const stories = $derived<StoryUse[]>(history === null ? [] : history.used_by);
	const skippedStoryFiles = $derived(history === null ? 0 : history.skipped_story_files);
	const skippedReferences = $derived(history === null ? 0 : history.skipped_references);

	function publishBlockedReason(
		preview: NextVersion | null,
		hasIncomplete: boolean
	): string | null {
		if (preview === null) return null;
		if (hasIncomplete) return BLOCKED_MESSAGES.incomplete;
		if (preview.row_count === 0) return BLOCKED_MESSAGES.empty;
		if (preview.unchanged) return BLOCKED_MESSAGES.unchanged;
		return null;
	}

	async function reload(target: string) {
		const requestNo = ++loadRequest;
		const [nextResult, historyResult] = await Promise.all([
			fetchNextVersion(target),
			fetchVersionHistory(target)
		]);
		if (requestNo !== loadRequest || target !== slug) return;
		if (nextResult.kind === 'ok' && historyResult.kind === 'ok') {
			load = { kind: 'loaded', next: nextResult.next, history: historyResult.history };
			return;
		}
		const failed = nextResult.kind === 'ok' ? historyResult : nextResult;
		if (failed.kind === 'ok') return;
		load =
			failed.kind === 'unauthorized'
				? { kind: 'signed_out' }
				: { kind: 'error', message: LOAD_ERROR_MESSAGES[failed.kind] };
	}

	/** 누른 단추. 결과가 abandoned 일 때 폐기를 누른 것인지, 발행 · 다시 시도 중 다른 곳에서 폐기된 것인지 가른다. */
	type Action = 'write' | 'abandon';

	function describeResult(result: PublishResult, action: Action): Message {
		if (result.kind === 'ok') {
			const { status, version_no: versionNo, publish_error: errorCode } = result.outcome;
			if (status === 'done')
				return { kind: 'success', text: `v${versionNo} 을 ${TERMS.publish}했습니다.` };
			if (status === 'abandoned')
				return action === 'abandon'
					? { kind: 'success', text: `v${versionNo} 을 폐기했습니다.` }
					: { kind: 'error', text: `v${versionNo} 은 그 사이 다른 곳에서 폐기되었습니다.` };
			return {
				kind: 'error',
				text: `v${versionNo} 공개 파일을 쓰지 못했습니다. ${errorCode === null ? '이력에서 다시 시도하세요.' : PUBLISH_ERROR_MESSAGES[errorCode]}`
			};
		}
		if (result.kind === 'blocked') return { kind: 'error', text: BLOCKED_MESSAGES[result.reason] };
		// 401 은 관리자 레이아웃이 로그인 화면으로 바꾼다.
		if (result.kind === 'unauthorized') return null;
		return { kind: 'error', text: ACTION_ERROR_MESSAGES[result.kind] };
	}

	async function run(request: () => Promise<PublishResult>, action: Action = 'write') {
		busy = true;
		message = null;
		outcome = null;
		copied = false;
		confirmingAbandon = null;
		try {
			const result = await request();
			outcome = result.kind === 'ok' ? result.outcome : null;
			message = describeResult(result, action);
			await onPublished();
			await reload(slug);
		} finally {
			busy = false;
		}
	}

	async function copyPath(path: string) {
		try {
			await navigator.clipboard.writeText(path);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, COPY_RESET_MILLISECONDS);
		} catch (error) {
			// 권한 거부 · 보안 연결 아님 등. 경로는 화면에 보이므로 직접 복사할 수 있다.
			console.warn('clipboard write failed', error);
			message = { kind: 'error', text: '클립보드에 복사하지 못했습니다. 경로를 직접 복사하세요.' };
		}
	}

	$effect(() => {
		const target = slug;
		// 부모의 다시 읽기 신호에 반응한다(값 자체는 쓰지 않음).
		void reloadKey;
		untrack(() => reload(target));
	});
</script>

<section class="panel publish" aria-labelledby="publish-title">
	<div class="head">
		<h2 id="publish-title">③ {TERMS.publish}</h2>
		<p class="muted small">{TERM_HELP.publish}</p>
	</div>

	{#if load.kind === 'loading'}
		<p class="muted">불러오는 중…</p>
	{:else if load.kind === 'error'}
		<p class="status-bad" role="alert">{load.message}</p>
		<button type="button" class="btn small" onclick={() => reload(slug)}>다시 시도</button>
	{:else if load.kind === 'loaded'}
		{@const preview = load.next}
		<div class="bar">
			<p class="counts">
				<span
					>다음 판 <strong>v{preview.next_version_no}</strong> · {preview.row_count.toLocaleString()}{TERMS.row}</span
				>
				<span class="muted">
					{latestDone === null ? '처음 공개' : `v${latestDone} 대비`}
					· 추가 {(preview.added - preview.replaced).toLocaleString()} · 바뀜 {preview.replaced.toLocaleString()}
					· 빠짐 {preview.removed.toLocaleString()}
				</span>
			</p>
			<button
				type="button"
				class="btn primary"
				disabled={busy || blockedReason !== null}
				onclick={() => run(() => publishDataset(slug))}
				>{busy ? `${TERMS.publish} 중…` : TERMS.publish}</button
			>
		</div>
		{#if blockedReason !== null}
			<p class="muted small">{blockedReason}</p>
		{/if}

		{#if message !== null}
			<p class={message.kind === 'success' ? 'status-ok' : 'status-bad'} role="status">
				{message.text}
			</p>
		{/if}
		{#if outcome !== null && outcome.status === 'done'}
			<div class="result settle">
				<span class="mono path">{outcome.path}</span>
				<button
					type="button"
					class="btn small"
					onclick={() => outcome !== null && copyPath(outcome.path)}
					>{copied ? '복사함' : '경로 복사'}</button
				>
			</div>
		{/if}

		<div class="stories">
			<h3>이 {TERMS.dataset}을 쓰는 {TERMS.story}</h3>
			{#if stories.length === 0}
				<p class="muted small">쓰는 {TERMS.story}가 없습니다.</p>
			{:else}
				<ul>
					{#each stories as use, index (`${use.story}:${index}`)}
						<li>
							<span>{use.title}</span>
							<span class="mono muted">v{use.version}</span>
							{#if use.version_status !== 'done'}
								<span class="small warn-text"
									>{PUBLISH_FILE_WARNINGS.storyOnUnpublished(use.version)}</span
								>
							{:else if latestDone !== null && use.version < latestDone}
								<span class="small warn-text"
									>{TERMS.story} 파일을 v{latestDone} 으로 바꿔야 화면에 반영됩니다</span
								>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if skippedStoryFiles > 0}
				<p class="muted small">
					읽지 못한 {TERMS.story} 파일 {skippedStoryFiles}개는 건너뛰었습니다.
				</p>
			{/if}
			{#if skippedReferences > 0}
				<p class="muted small">
					판 번호가 맞지 않는 {TERMS.story} 항목 {skippedReferences}개는 건너뛰었습니다.
				</p>
			{/if}
		</div>

		<div class="history">
			<h3>판 이력</h3>
			{#if load.history.versions.length === 0}
				<p class="muted small">아직 {TERMS.publish}한 판이 없습니다.</p>
			{:else}
				<ul>
					{#each load.history.versions as version (version.version_no)}
						<li>
							<span class="mono">v{version.version_no}</span>
							<span
								class="chip"
								class:ok={version.status === 'done'}
								class:warn={version.status === 'pending'}
								class:bad={version.status === 'failed'}
								class:quiet={version.status === 'abandoned'}
								>{PUBLISH_STATUS_LABELS[version.status]}</span
							>
							<span class="muted">{version.row_count.toLocaleString()}{TERMS.row}</span>
							<span class="muted small"
								>{formatLocalDateTime(
									version.published_at === null ? version.created_at : version.published_at
								)}</span
							>
							{#if version.status === 'failed' && version.publish_error !== null}
								<span class="small reason">{PUBLISH_ERROR_MESSAGES[version.publish_error]}</span>
							{/if}
							{#if version.status === 'abandoned' && version.file_present}
								<span class="small warn-text">{PUBLISH_FILE_WARNINGS.abandonedFilePresent}</span>
							{/if}
							{#if version.status === 'done' && !version.file_present}
								<div class="actions">
									<span class="small warn-text">{PUBLISH_FILE_WARNINGS.doneFileMissing}</span>
									<button
										type="button"
										class="btn small"
										disabled={busy}
										onclick={() => run(() => retryPublish(slug, version.version_no))}
										>다시 시도</button
									>
								</div>
							{/if}
							{#if INCOMPLETE_STATUSES.includes(version.status)}
								<div class="actions">
									<button
										type="button"
										class="btn small"
										disabled={busy}
										onclick={() => run(() => retryPublish(slug, version.version_no))}
										>다시 시도</button
									>
									<span class="muted small">발행했을 때의 줄로 공개됩니다</span>
									{#if confirmingAbandon === version.version_no}
										<span class="small warn-text">이 판 번호는 다시 쓰지 않습니다</span>
										<button
											type="button"
											class="btn small"
											disabled={busy}
											onclick={() => run(() => abandonVersion(slug, version.version_no), 'abandon')}
											>폐기 확인</button
										>
										<button
											type="button"
											class="btn small"
											disabled={busy}
											onclick={() => (confirmingAbandon = null)}>취소</button
										>
									{:else}
										<button
											type="button"
											class="btn small"
											disabled={busy}
											onclick={() => (confirmingAbandon = version.version_no)}>폐기</button
										>
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>

<style>
	.publish {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.head {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 16px;
		border-radius: 10px;
		background: var(--sunk);
	}

	.counts {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.result {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.path {
		overflow-wrap: anywhere;
	}

	.stories,
	.history {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	ul {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.warn-text {
		color: var(--warn);
	}

	.reason {
		color: var(--bad);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
</style>
