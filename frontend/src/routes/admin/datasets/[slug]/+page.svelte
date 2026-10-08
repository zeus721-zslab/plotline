<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import SchemaEditor from '#lib/admin/SchemaEditor.svelte';
	import { fetchDataset, type DatasetDetail, type SchemaVersion } from '#lib/admin/datasets.ts';
	import { formatLocalDateTime } from '#lib/admin/format.ts';

	type DetailState =
		| { kind: 'loading' }
		| { kind: 'loaded'; dataset: DatasetDetail }
		| { kind: 'not_found' }
		| { kind: 'error'; message: string }
		| { kind: 'signed_out' };

	const LOAD_ERROR_MESSAGES = {
		forbidden: '허용되지 않은 접속 주소에서 보낸 요청입니다.',
		network_error: '서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요.',
		unexpected: '데이터셋을 불러오지 못했습니다.'
	} as const;

	let detail = $state<DetailState>({ kind: 'loading' });
	const slug = $derived(page.params.slug ?? '');

	async function load(target: string) {
		detail = { kind: 'loading' };
		const result = await fetchDataset(target);
		// 응답 전에 다른 데이터셋으로 이동했으면 늦게 온 응답으로 현재 화면을 덮지 않는다.
		if (target !== slug) return;
		if (result.kind === 'ok') {
			detail = { kind: 'loaded', dataset: result.dataset };
		} else if (result.kind === 'not_found') {
			detail = { kind: 'not_found' };
		} else if (result.kind === 'unauthorized') {
			// 401 은 레이아웃이 로그인 화면으로 바꾼다.
			detail = { kind: 'signed_out' };
		} else {
			detail = { kind: 'error', message: LOAD_ERROR_MESSAGES[result.kind] };
		}
	}

	function handleSaved(schema: SchemaVersion) {
		if (detail.kind === 'loaded') {
			detail = { kind: 'loaded', dataset: { ...detail.dataset, schema } };
		}
	}

	$effect(() => {
		void load(slug);
	});
</script>

{#if detail.kind === 'loading'}
	<p>불러오는 중…</p>
{:else if detail.kind === 'not_found'}
	<h1>없는 데이터셋</h1>
	<p>slug '{slug}' 인 데이터셋이 없습니다.</p>
	<p><a href={resolve('/admin')}>데이터셋 목록으로</a></p>
{:else if detail.kind === 'error'}
	<p role="alert">{detail.message}</p>
	<button type="button" onclick={() => load(slug)}>다시 시도</button>
{:else if detail.kind === 'loaded'}
	<h1>{detail.dataset.title}</h1>
	<p class="admin-muted">
		slug: {detail.dataset.slug} · 현재 정의:
		{detail.dataset.schema === null
			? '정의 없음'
			: `v${detail.dataset.schema.version} (${formatLocalDateTime(detail.dataset.schema.created_at)})`}
	</p>
	<!-- 편집 폼은 불러온 정의로 한 번만 시작한다. 저장 성공 후 현재 버전 표시만 갱신하고 폼 내용은 유지한다. -->
	{#key detail.dataset.slug}
		<SchemaEditor
			slug={detail.dataset.slug}
			initialSchema={detail.dataset.schema}
			onSaved={handleSaved}
		/>
	{/key}
{/if}
