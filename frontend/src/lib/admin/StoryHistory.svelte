<script lang="ts">
	// 이야기 판 이력(최신 위). 가장 최근 판이 실패면 다시 시도, 공개됐던 판은 되돌리기(인라인 확인 1회) · 미리보기.
	// 되돌리기는 지금 공개 판과 내용이 다르거나 최신 판이 실패일 때만 보인다(restorable, 발행 버튼과 같은 규칙).
	import { formatLocalDateTime } from './format.ts';
	import type { PublicFileStatus, StoryVersion } from './stories.ts';
	import { STORY_PUBLISH_ERROR_MESSAGES, STORY_PUBLISH_STATUS_LABELS, TERMS } from './terms.ts';

	type Props = {
		versions: StoryVersion[];
		/** 공개 이야기 파일이 최신 공개 판과 맞는가(공개 판이 없으면 null) */
		publicFile: PublicFileStatus | null;
		busy: boolean;
		previewHref: (version: StoryVersion) => string | null;
		restorable: (version: StoryVersion) => boolean;
		onretry: (versionNo: number) => void;
		onrestore: (versionNo: number) => void;
	};

	let { versions, publicFile, busy, previewHref, restorable, onretry, onrestore }: Props = $props();

	let confirming = $state<number | null>(null);

	const latestNo = $derived(versions.length === 0 ? null : versions[0].version_no);
	const latestFailed = $derived(versions.length > 0 && versions[0].status === 'failed');
	// 공개 파일이 최신 공개 판과 맞으면(ok) 그 판이 "지금 공개"다(최신 판이 실패여도). 맞지 않으면 최신 판이 실패일 때는
	// 이야기 파일이 그 실패 판 내용으로 바뀌었을 수 있고(쓰기 도중 중단 포함), 최신 판이 공개 판이면 파일이 그 판과 다르다.
	const publicFileOk = $derived(publicFile === 'ok');
	const latestDoneNo = $derived.by(() => {
		const done = versions.find((version) => version.status === 'done');
		return done === undefined ? null : done.version_no;
	});

	function datasetsText(version: StoryVersion): string {
		return Object.entries(version.datasets)
			.map(([name, versionNo]) => `${name} v${versionNo}`)
			.join(' · ');
	}

	function restore(versionNo: number): void {
		confirming = null;
		onrestore(versionNo);
	}
</script>

{#if versions.length === 0}
	<p class="panel muted empty">아직 발행한 판이 없습니다</p>
{:else}
	<ol class="history">
		{#each versions as version (version.version_no)}
			{@const href = previewHref(version)}
			<li class="panel item">
				<div class="head">
					<span class="number mono">v{version.version_no}</span>
					<span
						class="chip"
						class:ok={version.status === 'done'}
						class:bad={version.status === 'failed'}
						class:warn={version.status === 'pending'}
						>{STORY_PUBLISH_STATUS_LABELS[version.status]}</span
					>
					{#if version.version_no === latestNo && latestFailed && !publicFileOk}
						<span class="chip warn">공개 이야기 파일이 이 판 내용으로 바뀌었을 수 있음</span>
					{:else if version.version_no === latestDoneNo && publicFileOk}
						<span class="chip accent">지금 공개</span>
					{:else if version.version_no === latestDoneNo && !latestFailed}
						<span class="chip warn">공개 파일이 이 판과 다름</span>
					{/if}
					{#if version.published_at !== null}
						<span class="muted small">{formatLocalDateTime(version.published_at)}</span>
					{/if}
				</div>
				<p class="title">{version.title}</p>
				<p class="muted">{version.summary}</p>
				<p class="mono small muted">{datasetsText(version)}</p>
				{#if version.publish_error !== null}
					<p class="status-bad small">{STORY_PUBLISH_ERROR_MESSAGES[version.publish_error]}</p>
				{/if}
				<div class="actions">
					{#if version.status === 'failed' && version.version_no === latestNo}
						<button
							type="button"
							class="btn small primary"
							disabled={busy}
							onclick={() => onretry(version.version_no)}>다시 시도</button
						>
					{/if}
					{#if version.status === 'done' && restorable(version)}
						{#if confirming === version.version_no}
							<span class="small"
								>v{version.version_no} 내용으로 새 판을 {TERMS.storyPublish}합니다</span
							>
							<button
								type="button"
								class="btn small primary"
								disabled={busy}
								onclick={() => restore(version.version_no)}>확인</button
							>
							<button type="button" class="btn small quiet" onclick={() => (confirming = null)}
								>취소</button
							>
						{:else}
							<button
								type="button"
								class="btn small"
								disabled={busy}
								onclick={() => (confirming = version.version_no)}>이 판으로 되돌리기</button
							>
						{/if}
					{/if}
					{#if version.status === 'done' && version.version_no !== latestDoneNo}
						{#if href !== null}
							<a class="btn small quiet" {href} target="_blank" rel="noopener"
								>이 판 {TERMS.preview}</a
							>
						{/if}
					{/if}
				</div>
			</li>
		{/each}
	</ol>
{/if}

<style>
	.history {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.item {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.number {
		font-weight: 500;
	}

	.title {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.actions:empty {
		display: none;
	}

	.empty {
		text-align: center;
	}
</style>
