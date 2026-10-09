<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import PasteBox from '#lib/admin/PasteBox.svelte';
	import PublishBar from '#lib/admin/PublishBar.svelte';
	import RowsPanel from '#lib/admin/RowsPanel.svelte';
	import StructureView from '#lib/admin/StructureView.svelte';
	import { fetchDataset, type DatasetDetail } from '#lib/admin/datasets.ts';
	import { formatLocalDateTime } from '#lib/admin/format.ts';
	import { COMMON_ERROR_MESSAGES, TERMS } from '#lib/admin/terms.ts';

	// 데이터 묶음 작업 페이지(D-28 · D-29): 위 → 아래로 ① 붙여넣기 ② 줄 검토, 접는 칸 "구조 보기", 맨 아래 ③ 발행 바.

	type DetailState =
		| { kind: 'loading' }
		| { kind: 'loaded'; dataset: DatasetDetail }
		| { kind: 'not_found' }
		| { kind: 'error'; message: string }
		| { kind: 'signed_out' };

	const LOAD_ERROR_MESSAGES = {
		...COMMON_ERROR_MESSAGES,
		unexpected: `${TERMS.dataset}을 불러오지 못했습니다.`
	} as const;

	let detail = $state<DetailState>({ kind: 'loading' });
	// 붙여넣기 저장 뒤 줄 목록을 다시 읽게 하는 신호
	let rowsReloadKey = $state(0);
	const slug = $derived(page.params.slug === undefined ? '' : page.params.slug);
	// 늦게 온 응답이 최신 상태를 덮지 않게 요청마다 번호를 붙이고 마지막 요청의 응답만 반영한다.
	let loadRequest = 0;

	/** quiet: 이미 보이는 화면을 유지한 채 탭 수 · 구조만 다시 읽는다(저장 · 승인 · 제외 뒤). */
	async function load(target: string, quiet: boolean) {
		const requestNo = ++loadRequest;
		if (!quiet) detail = { kind: 'loading' };
		const result = await fetchDataset(target);
		// 응답 전에 다른 묶음으로 이동했거나 더 새 요청이 있으면 늦게 온 응답으로 화면을 덮지 않는다.
		if (requestNo !== loadRequest || target !== slug) return;
		if (result.kind === 'ok') {
			detail = { kind: 'loaded', dataset: result.dataset };
		} else if (result.kind === 'not_found') {
			detail = { kind: 'not_found' };
		} else if (result.kind === 'unauthorized') {
			// 401 은 관리자 레이아웃이 로그인 화면으로 바꾼다.
			detail = { kind: 'signed_out' };
		} else if (quiet && detail.kind === 'loaded') {
			// 수만 다시 읽다가 실패했다. 보던 화면은 그대로 두고 다음 처리 때 다시 읽는다.
			console.warn('dataset refresh failed', result.kind);
		} else {
			detail = { kind: 'error', message: LOAD_ERROR_MESSAGES[result.kind] };
		}
	}

	function refresh(): Promise<void> {
		return load(slug, true);
	}

	async function handlePasteSaved() {
		await refresh();
		rowsReloadKey += 1;
	}

	$effect(() => {
		const target = slug;
		untrack(() => load(target, false));
	});
</script>

{#if detail.kind === 'loading'}
	<p class="muted">불러오는 중…</p>
{:else if detail.kind === 'not_found'}
	<div class="panel missing">
		<h1>없는 {TERMS.dataset}</h1>
		<p>{TERMS.slug} <span class="mono">{slug}</span> 인 {TERMS.dataset}이 없습니다.</p>
		<p><a href={resolve('/admin')}>{TERMS.dataset} 목록으로</a></p>
	</div>
{:else if detail.kind === 'error'}
	<div class="panel missing">
		<p class="status-bad" role="alert">{detail.message}</p>
		<button type="button" class="btn" onclick={() => load(slug, false)}>다시 시도</button>
	</div>
{:else if detail.kind === 'loaded'}
	{@const dataset = detail.dataset}
	<header class="head">
		<p class="crumb">
			<a href={resolve('/admin')}>{TERMS.dataset}</a>
			<span aria-hidden="true">/</span>
			<span>{dataset.title}</span>
		</p>
		<h1>{dataset.title}</h1>
		<p class="meta">
			<span>{TERMS.slug} <span class="mono">{dataset.slug}</span></span>
			<span aria-hidden="true">·</span>
			<span
				>{TERMS.structure}
				{dataset.schema === null ? '없음' : `v${dataset.schema.version}`}</span
			>
			<span aria-hidden="true">·</span>
			<span
				>최신 {TERMS.version}
				{dataset.latest_version_no === null ? '없음' : `v${dataset.latest_version_no}`}</span
			>
			<span aria-hidden="true">·</span>
			<span>{formatLocalDateTime(dataset.created_at)}에 만듦</span>
		</p>
	</header>
	{#key dataset.slug}
		<div class="work">
			<PasteBox slug={dataset.slug} onSaved={handlePasteSaved} />
			<RowsPanel
				slug={dataset.slug}
				title={dataset.title}
				fields={dataset.schema === null ? null : dataset.schema.fields}
				counts={dataset.counts}
				reloadKey={rowsReloadKey}
				onChanged={refresh}
			/>
			<details class="panel structure">
				<summary>{TERMS.structure} 보기</summary>
				<div class="structure-body">
					<StructureView slug={dataset.slug} schema={dataset.schema} />
				</div>
			</details>
			<!-- 상세를 다시 읽을 때마다 dataset 객체가 바뀌어 발행 바가 수 · 이력을 다시 읽는다. -->
			<PublishBar slug={dataset.slug} reloadKey={dataset} onPublished={refresh} />
		</div>
	{/key}
{/if}

<style>
	.head {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 28px;
	}

	.crumb {
		display: flex;
		gap: 8px;
		font-size: 14px;
		color: var(--muted);
	}

	.crumb a {
		color: var(--muted);
	}

	.crumb a:hover {
		color: var(--accent);
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		color: var(--muted);
		font-size: 14px;
	}

	.work {
		display: flex;
		flex-direction: column;
		gap: 32px;
	}

	.structure summary {
		font-size: 17px;
		font-weight: 600;
		cursor: pointer;
	}

	.structure-body {
		margin-top: 20px;
	}

	.missing {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
	}
</style>
