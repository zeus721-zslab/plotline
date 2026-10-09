<script lang="ts">
	// 이야기 미리보기(D-37): 쿼리의 제목 · 요약 · 묶음 판으로 관리자 판 내용 API 를 읽어, 공개 페이지와 같은 컴포넌트를 그린다.
	// 관리자 레이아웃이 로그인을 확인한 뒤에만 그려지고(상단 바 없이), 판 내용 API 도 관리자 인증이 필요하다.
	import { onMount, type Component } from 'svelte';
	import { page } from '$app/state';
	import { parsePreviewQuery, type PreviewQuery } from '#lib/admin/storyPreview.ts';
	import { fetchDatasetContent } from '#lib/admin/stories.ts';
	import {
		COMMON_ERROR_MESSAGES,
		DATASET_CONTENT_PROBLEM_MESSAGES,
		TERMS
	} from '#lib/admin/terms.ts';
	import ElementDiscoveryPage from '#lib/stories/element-discovery/ElementDiscoveryPage.svelte';
	import { ELEMENT_DISCOVERY_STORY } from '#lib/stories/element-discovery/elementDiscovery.ts';
	import LightAgePage from '#lib/stories/light-age/LightAgePage.svelte';
	import { LIGHT_AGE_STORY } from '#lib/stories/light-age/lightAge.ts';
	import { findStoryEntry, type RegisteredStory } from '#lib/stories/registry.ts';
	import type { LoadResult } from '#lib/story/fetchPublished.ts';
	import { isPublishedDataset, type PublishedDataset } from '#lib/story/published.ts';
	import type { LoadStorySource } from '#lib/story/storySource.ts';

	type StoryPage = Component<{ loadSource: LoadStorySource }>;
	type PreviewState =
		| { kind: 'loading' }
		| { kind: 'invalid'; message: string }
		| { kind: 'signed_out' }
		| {
				kind: 'ready';
				query: PreviewQuery;
				datasets: Record<string, PublishedDataset>;
				Page: StoryPage;
		  };

	// 프론트 registry 의 이야기마다 페이지 컴포넌트가 있어야 타입 검사를 통과한다.
	const PAGES: Record<RegisteredStory, StoryPage> = {
		[ELEMENT_DISCOVERY_STORY]: ElementDiscoveryPage,
		[LIGHT_AGE_STORY]: LightAgePage
	};
	const FORMAT_FAILURE: LoadResult<PublishedDataset> = { kind: 'error', reason: 'format' };

	let view = $state<PreviewState>({ kind: 'loading' });

	function pageOf(story: string): StoryPage | null {
		const found = Object.entries(PAGES).find(([name]) => name === story);
		return found === undefined ? null : found[1];
	}

	function versionsText(datasets: Record<string, number>): string {
		return Object.entries(datasets)
			.map(([name, versionNo]) => `${name} v${versionNo}`)
			.join(' · ');
	}

	async function load(): Promise<void> {
		const story = page.params.story === undefined ? '' : page.params.story;
		const entry = findStoryEntry(story);
		const Page = pageOf(story);
		if (entry === null || Page === null) {
			view = { kind: 'invalid', message: `${TERMS.preview}가 없는 ${TERMS.story}입니다.` };
			return;
		}
		const query = parsePreviewQuery(page.url.searchParams, entry.datasetNames);
		if (query === null) {
			view = {
				kind: 'invalid',
				message: '주소의 제목 · 요약 · 데이터 판 번호가 이 이야기와 맞지 않습니다.'
			};
			return;
		}
		const names = Object.keys(query.datasets);
		const results = await Promise.all(
			names.map((name) => fetchDatasetContent(name, query.datasets[name]))
		);
		const datasets: Record<string, PublishedDataset> = {};
		for (const [position, result] of results.entries()) {
			const label = `${names[position]} v${query.datasets[names[position]]}`;
			if (result.kind === 'unauthorized') {
				// 레이아웃이 로그인 화면으로 바꾼다.
				view = { kind: 'signed_out' };
				return;
			}
			if (result.kind === 'problem') {
				view = {
					kind: 'invalid',
					message: `${label}: ${DATASET_CONTENT_PROBLEM_MESSAGES[result.problem]}`
				};
				return;
			}
			if (result.kind !== 'ok') {
				view = {
					kind: 'invalid',
					message:
						result.kind === 'unexpected'
							? `${label} 내용을 불러오지 못했습니다.`
							: COMMON_ERROR_MESSAGES[result.kind]
				};
				return;
			}
			if (!isPublishedDataset(result.content)) {
				console.warn('preview dataset shape mismatch', label);
				view = { kind: 'invalid', message: `${label} 내용이 판 파일 형식이 아닙니다.` };
				return;
			}
			datasets[names[position]] = result.content;
		}
		view = { kind: 'ready', query, datasets, Page };
	}

	function sourceOf(
		query: PreviewQuery,
		datasets: Record<string, PublishedDataset>
	): LoadStorySource {
		// 미리보기에는 목록이 없으므로 다음 이야기 링크는 숨긴다.
		return () =>
			Promise.resolve({
				kind: 'ok',
				data: {
					title: query.title,
					summary: query.summary,
					next: null,
					loadDataset: (name) => {
						const dataset = datasets[name];
						return Promise.resolve(
							dataset === undefined ? FORMAT_FAILURE : { kind: 'ok', data: dataset }
						);
					}
				}
			});
	}

	onMount(() => {
		void load();
	});
</script>

{#if view.kind === 'ready'}
	<div class="story-preview">
		<p class="preview-band" role="status">
			{TERMS.preview} — 아직 공개되지 않음 · {view.query.title} · {versionsText(
				view.query.datasets
			)}
		</p>
		<view.Page loadSource={sourceOf(view.query, view.datasets)} />
	</div>
{:else}
	<div class="admin">
		<main class="preview-status">
			{#if view.kind === 'loading'}
				<p class="muted">{TERMS.preview}를 준비하는 중…</p>
			{:else if view.kind === 'invalid'}
				<div class="panel">
					<p class="status-bad" role="alert">{view.message}</p>
				</div>
			{/if}
		</main>
	</div>
{/if}

<style>
	/* 띠 높이만큼 페이지를 내리고, 이야기의 고정 · 붙박이 영역(2편 계기판 · 1편 시그니처 장면)도 띠 아래로 내린다.
	   이야기 컴포넌트의 클래스 선택자(.gauge · .graphic)보다 우선하도록 요소 이름을 붙인다. */
	.story-preview {
		--preview-band-height: 36px;
		padding-top: var(--preview-band-height);
	}

	.story-preview :global(div.gauge),
	.story-preview :global(div.graphic) {
		top: var(--preview-band-height);
	}

	/* 넓은 화면의 1편 장면은 화면 높이(100vh)를 다 쓰므로 띠만큼 줄여 아래가 잘리지 않게 한다(SignatureScene 960px 기준과 같음). */
	@media (min-width: 960px) {
		.story-preview :global(div.graphic) {
			height: calc(100vh - var(--preview-band-height));
		}
	}

	.preview-band {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 10;
		height: var(--preview-band-height);
		margin: 0;
		padding: 0 12px;
		overflow: hidden;
		background: #3346d3;
		color: #ffffff;
		font-size: 14px;
		font-weight: 600;
		line-height: var(--preview-band-height);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.preview-status {
		display: grid;
		place-items: center;
		min-height: 100vh;
		padding: 32px 16px;
	}
</style>
