<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PasteBox from '#lib/admin/PasteBox.svelte';
	import { listDatasets, type DatasetSummary } from '#lib/admin/datasets.ts';
	import type { ImportSaved } from '#lib/admin/imports.ts';
	import { COMMON_ERROR_MESSAGES, TERM_HELP, TERMS } from '#lib/admin/terms.ts';

	type ListState =
		| { kind: 'loading' }
		| { kind: 'loaded'; datasets: DatasetSummary[] }
		| { kind: 'error'; message: string }
		| { kind: 'signed_out' };

	const LIST_ERROR_MESSAGES = {
		...COMMON_ERROR_MESSAGES,
		unexpected: `${TERMS.dataset} 목록을 불러오지 못했습니다.`
	} as const;

	let list = $state<ListState>({ kind: 'loading' });

	async function loadList() {
		list = { kind: 'loading' };
		const result = await listDatasets();
		if (result.kind === 'ok') {
			list = { kind: 'loaded', datasets: result.datasets };
			return;
		}
		// 401 은 레이아웃이 로그인 화면으로 바꾼다.
		list =
			result.kind === 'unauthorized'
				? { kind: 'signed_out' }
				: { kind: 'error', message: LIST_ERROR_MESSAGES[result.kind] };
	}

	/** 저장했으면 그 묶음의 작업 페이지로 간다. 저장할 변화가 없었으면 머문다(결과 문장은 붙여넣기 칸이 보인다). */
	async function handleSaved(saved: ImportSaved) {
		if (!saved.saved) return;
		await goto(resolve('/admin/datasets/[slug]', { slug: saved.slug }));
	}

	onMount(() => {
		void loadList();
	});
</script>

<section class="intro">
	<h1>{TERMS.dataset}</h1>
	<p class="lead">
		{TERM_HELP.dataset}입니다. Claude 결과 묶음을 붙여 넣으면 같은 {TERMS.slug}의 {TERMS.dataset}에
		들어가고, 없으면 새로 만듭니다.
	</p>
</section>

<PasteBox slug={null} onSaved={handleSaved} />

<section class="list" aria-labelledby="list-title">
	<div class="list-head">
		<h2 id="list-title">목록</h2>
		{#if list.kind === 'loaded'}
			<span class="muted count">{list.datasets.length}개</span>
		{/if}
	</div>
	{#if list.kind === 'loading'}
		<p class="muted">불러오는 중…</p>
	{:else if list.kind === 'error'}
		<div class="panel notice">
			<p class="status-bad" role="alert">{list.message}</p>
			<button type="button" class="btn" onclick={loadList}>다시 시도</button>
		</div>
	{:else if list.kind === 'loaded'}
		{#if list.datasets.length === 0}
			<p class="panel empty muted">Claude 결과 묶음을 붙여넣으면 데이터 묶음이 생깁니다</p>
		{:else}
			<div class="panel table-panel scroll-box">
				<table>
					<thead>
						<tr>
							<th scope="col">제목</th>
							<th scope="col">{TERMS.slug}</th>
							<th scope="col">{TERMS.publishedVersion}</th>
							<th scope="col">검토할 {TERMS.row}</th>
							<th scope="col">공개 안 된 변경</th>
						</tr>
					</thead>
					<tbody>
						{#each list.datasets as dataset (dataset.slug)}
							<tr>
								<td>
									<!-- 제목 링크가 줄 전체를 덮어 줄 어디를 눌러도 작업 페이지로 이동한다. -->
									<a
										class="row-link"
										href={resolve('/admin/datasets/[slug]', { slug: dataset.slug })}
										>{dataset.title}</a
									>
								</td>
								<td class="mono">{dataset.slug}</td>
								<td>
									{#if dataset.latest_published_version_no === null}
										<span class="muted">없음</span>
									{:else}
										v{dataset.latest_published_version_no}
									{/if}
								</td>
								<td>
									{#if dataset.pending_count > 0}
										<span class="chip warn">{dataset.pending_count.toLocaleString()}</span>
									{:else}
										<span class="muted">0</span>
									{/if}
								</td>
								<td>
									{#if dataset.has_unpublished_changes}
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
	{/if}
</section>

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

	.list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-top: 32px;
	}

	.list-head {
		display: flex;
		align-items: baseline;
		gap: 10px;
	}

	.count {
		font-size: 14px;
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

	table {
		width: 100%;
		min-width: 640px;
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
</style>
