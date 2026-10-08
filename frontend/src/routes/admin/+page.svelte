<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		createDataset,
		listDatasets,
		type CreateDatasetResult,
		type DatasetSummary
	} from '#lib/admin/datasets.ts';
	import { formatLocalDateTime } from '#lib/admin/format.ts';

	type ListState =
		| { kind: 'loading' }
		| { kind: 'loaded'; datasets: DatasetSummary[] }
		| { kind: 'error'; message: string }
		| { kind: 'signed_out' };

	const LIST_ERROR_MESSAGES = {
		forbidden: '허용되지 않은 접속 주소에서 보낸 요청입니다.',
		network_error: '서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요.',
		unexpected: '데이터셋 목록을 불러오지 못했습니다.'
	} as const;
	const CREATE_ERROR_MESSAGES: Record<
		Exclude<CreateDatasetResult['kind'], 'ok' | 'unauthorized'>,
		string
	> = {
		slug_taken: '이미 사용 중인 slug 입니다.',
		invalid_input: 'slug 또는 제목 형식이 올바르지 않습니다.',
		forbidden: '허용되지 않은 접속 주소에서 보낸 요청입니다.',
		network_error: '서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요.',
		unexpected: '데이터셋을 만들지 못했습니다.'
	};

	let list = $state<ListState>({ kind: 'loading' });
	let slug = $state('');
	let title = $state('');
	let submitting = $state(false);
	let createError = $state('');

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

	async function handleCreate(event: SubmitEvent) {
		event.preventDefault();
		submitting = true;
		createError = '';
		let result: CreateDatasetResult;
		try {
			result = await createDataset(slug, title);
		} finally {
			submitting = false;
		}
		if (result.kind === 'unauthorized') return;
		if (result.kind !== 'ok') {
			createError = CREATE_ERROR_MESSAGES[result.kind];
			return;
		}
		slug = '';
		title = '';
		if (list.kind === 'loaded') {
			list = { kind: 'loaded', datasets: [result.dataset, ...list.datasets] };
		} else {
			await loadList();
		}
	}

	onMount(() => {
		void loadList();
	});
</script>

<h1>데이터셋</h1>

<section>
	<h2>새 데이터셋</h2>
	<form onsubmit={handleCreate}>
		<label>
			slug
			<input bind:value={slug} name="slug" autocomplete="off" required />
		</label>
		<label>
			제목
			<input bind:value={title} name="title" autocomplete="off" required />
		</label>
		<button type="submit" disabled={submitting}>{submitting ? '만드는 중…' : '만들기'}</button>
		{#if createError}
			<p role="alert">{createError}</p>
		{/if}
	</form>
</section>

<section>
	<h2>목록</h2>
	{#if list.kind === 'loading'}
		<p>불러오는 중…</p>
	{:else if list.kind === 'error'}
		<p role="alert">{list.message}</p>
		<button type="button" onclick={loadList}>다시 시도</button>
	{:else if list.kind === 'loaded'}
		{#if list.datasets.length === 0}
			<p class="admin-muted">아직 데이터셋이 없습니다. 위 폼에서 새로 만드세요.</p>
		{:else}
			<table>
				<thead>
					<tr>
						<th scope="col">제목</th>
						<th scope="col">slug</th>
						<th scope="col">정의 버전</th>
						<th scope="col">생성 시각</th>
					</tr>
				</thead>
				<tbody>
					{#each list.datasets as dataset (dataset.slug)}
						<tr class="dataset-row">
							<td>
								<a
									class="row-link"
									href={resolve('/admin/datasets/[slug]', { slug: dataset.slug })}
								>
									{dataset.title}
								</a>
							</td>
							<td>{dataset.slug}</td>
							<td>
								{dataset.schema_version === null ? '정의 없음' : `v${dataset.schema_version}`}
							</td>
							<td>{formatLocalDateTime(dataset.created_at)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	{/if}
</section>

<style>
	/* 제목 링크가 행 전체를 덮어 행 어디를 눌러도 상세로 이동한다. */
	.dataset-row {
		position: relative;
	}

	.dataset-row:hover {
		background: #f4f7fb;
	}

	.row-link::after {
		content: '';
		position: absolute;
		inset: 0;
	}
</style>
