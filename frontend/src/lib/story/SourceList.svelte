<script lang="ts">
	// 스토리 출처 세 묶음: 데이터셋 출처 "제목: URL (기준 날짜)" · 직접 작성은 "직접 작성"(C3) / 화면에 쓴 문구의 출처
	// / 이미지 출처(제목 · 작가 · 연도 · 라이선스 · 출처 링크, D-32).
	// 목록이 길어 스토리 끝이 늘어지지 않도록 기본은 접어 두고 누르면 펼친다.
	import type { SourceView } from './sourceViews.ts';
	import type { CopySource } from './storyConfig.ts';
	import type { StoryImage } from './storyMedia.ts';

	type Props = {
		sources: SourceView[];
		copySources: CopySource[];
		images: StoryImage[];
		note: string;
	};

	let { sources, copySources, images, note }: Props = $props();

	let open = $state(false);
	const total = $derived(sources.length + copySources.length + images.length);
</script>

<details bind:open>
	<summary>{`출처 ${total}건 ${open ? '접기' : '보기'}`}</summary>

	<h3 class="first">데이터 출처</h3>
	<ul class="sources">
		{#each sources as source, index (index)}
			<li>
				{source.datasetTitle}:
				{#if source.kind === 'external'}
					<a href={source.url} target="_blank" rel="noopener noreferrer">{source.url}</a>
					({source.asOfDate} 기준)
				{:else}
					직접 작성
				{/if}
			</li>
		{/each}
	</ul>
	<p class="note">{note}</p>

	{#if copySources.length > 0}
		<h3>문구 출처</h3>
		<ul class="sources">
			{#each copySources as source (source.id)}
				<li>
					<a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
				</li>
			{/each}
		</ul>
	{/if}

	{#if images.length > 0}
		<h3>이미지 출처</h3>
		<ul class="sources">
			{#each images as image (image.id)}
				<li>
					{image.title} · {image.creator} · {image.date} · {image.license}
					<br />
					<a href={image.sourceUrl} target="_blank" rel="noopener noreferrer">{image.sourceName}</a>
				</li>
			{/each}
		</ul>
	{/if}
</details>

<style>
	summary {
		display: flex;
		align-items: center;
		width: fit-content;
		min-height: 44px;
		padding: 0 1.25rem;
		border: 1px solid var(--story-muted);
		border-radius: 999px;
		box-sizing: border-box;
		color: var(--story-text);
		font-weight: 600;
		list-style: none;
		cursor: pointer;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:focus-visible {
		outline: 3px solid var(--story-text);
		outline-offset: 2px;
	}

	details[open] > summary {
		margin-bottom: 2rem;
	}

	h3 {
		margin: 2rem 0 0.75rem;
		font-size: 1.0625rem;
		font-weight: 700;
	}

	h3.first {
		margin-top: 0;
	}

	.sources {
		display: grid;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
		overflow-wrap: anywhere;
	}

	a {
		display: inline-block;
		min-height: 44px;
		padding: 0.625rem 0;
		color: var(--story-text);
	}

	a:focus-visible {
		outline: 3px solid var(--story-text);
		outline-offset: 2px;
	}

	.note {
		margin: 1rem 0 0;
		color: var(--story-muted);
		font-size: 0.875rem;
	}
</style>
