<script lang="ts">
	// 이야기 목록: 등록 가능한 이야기(서버 registry)마다 공개 판 · 최근 판 상태 · 새 데이터 판 여부 · 공개 파일 어긋남.
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { listStories, type StorySummary } from '#lib/admin/stories.ts';
	import {
		COMMON_ERROR_MESSAGES,
		PUBLIC_FILE_WARNINGS,
		PUBLISH_STATUS_LABELS,
		TERMS
	} from '#lib/admin/terms.ts';
	import { findStoryEntry } from '#lib/stories/registry.ts';

	type ListState =
		| { kind: 'loading' }
		| { kind: 'loaded'; stories: StorySummary[] }
		| { kind: 'error'; message: string }
		| { kind: 'signed_out' };

	const LIST_ERROR_MESSAGES = {
		...COMMON_ERROR_MESSAGES,
		unexpected: `${TERMS.story} 목록을 불러오지 못했습니다.`
	} as const;

	let list = $state<ListState>({ kind: 'loading' });

	async function loadList() {
		list = { kind: 'loading' };
		const result = await listStories();
		if (result.kind === 'ok') {
			list = { kind: 'loaded', stories: result.stories };
			return;
		}
		// 401 은 레이아웃이 로그인 화면으로 바꾼다.
		list =
			result.kind === 'unauthorized'
				? { kind: 'signed_out' }
				: { kind: 'error', message: LIST_ERROR_MESSAGES[result.kind] };
	}

	function hasNewData(story: StorySummary): boolean {
		return story.datasets.some((dataset) => dataset.newer_than_current);
	}

	onMount(() => {
		void loadList();
	});
</script>

<section class="intro">
	<h1>{TERMS.story}</h1>
	<p class="lead">
		{TERMS.story}마다 제목 · 요약과 쓸 {TERMS.dataset} 판을 고르고, {TERMS.preview}로 확인한 뒤
		{TERMS.publish}합니다. 지난 판으로 되돌릴 수 있습니다.
	</p>
</section>

{#if list.kind === 'loading'}
	<p class="muted">불러오는 중…</p>
{:else if list.kind === 'error'}
	<div class="panel notice">
		<p class="status-bad" role="alert">{list.message}</p>
		<button type="button" class="btn" onclick={loadList}>다시 시도</button>
	</div>
{:else if list.kind === 'loaded'}
	<div class="panel table-panel scroll-box">
		<table>
			<thead>
				<tr>
					<th scope="col">{TERMS.story}</th>
					<th scope="col">{TERMS.publishedVersion}</th>
					<th scope="col">최근 판 상태</th>
					<th scope="col">새 데이터 판</th>
				</tr>
			</thead>
			<tbody>
				{#each list.stories as story (story.story)}
					<tr>
						<td>
							<!-- 제목 링크가 줄 전체를 덮어 줄 어디를 눌러도 작업 페이지로 이동한다. -->
							<a class="row-link" href={resolve('/admin/stories/[story]', { story: story.story })}
								>{story.latest_done === null ? story.story : story.latest_done.title}</a
							>
							<span class="mono muted small slug">{story.story}</span>
							{#if findStoryEntry(story.story) === null}
								<span class="chip warn">문구 대조 없음 · {TERMS.preview} 없음</span>
							{/if}
							{#if story.public_file !== null && story.public_file !== 'ok'}
								<span class="chip bad">{PUBLIC_FILE_WARNINGS[story.public_file]}</span>
							{/if}
						</td>
						<td>
							{#if story.latest_done === null}
								<span class="muted">없음</span>
							{:else}
								v{story.latest_done.version_no}
							{/if}
						</td>
						<td>
							{#if story.latest_status === null}
								<span class="muted">발행 전</span>
							{:else}
								<span
									class="chip"
									class:ok={story.latest_status === 'done'}
									class:bad={story.latest_status === 'failed'}
									class:warn={story.latest_status === 'pending'}
									>v{story.latest_version_no} {PUBLISH_STATUS_LABELS[story.latest_status]}</span
								>
							{/if}
						</td>
						<td>
							{#if hasNewData(story)}
								<span class="chip accent">있음</span>
							{:else}
								<span class="muted">없음</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.intro {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 24px;
	}

	.lead {
		max-width: 64ch;
		color: var(--muted);
	}

	.notice {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}

	.table-panel {
		padding: 0;
	}

	table {
		width: 100%;
		min-width: 560px;
		border-collapse: collapse;
	}

	th {
		padding: 14px 20px;
		border-bottom: 1px solid var(--line);
		color: var(--muted);
		font-size: 13px;
		font-weight: 500;
		text-align: left;
		white-space: nowrap;
	}

	td {
		padding: 16px 20px;
		border-bottom: 1px solid var(--line);
		vertical-align: middle;
	}

	tbody tr {
		position: relative;
		transition: background-color 0.15s;
	}

	tbody tr:last-child td {
		border-bottom: none;
	}

	tbody tr:hover {
		background: var(--sunk);
	}

	.row-link {
		color: var(--ink);
		font-size: 18px;
		font-weight: 600;
		text-decoration: none;
	}

	tbody tr:hover .row-link {
		color: var(--accent);
	}

	.row-link::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	.slug {
		display: block;
		margin-top: 2px;
	}
</style>
