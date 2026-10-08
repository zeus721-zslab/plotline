<script lang="ts">
	// 스토리 출처 두 묶음: 데이터셋 출처 "제목: URL (기준 날짜)" · 직접 작성은 "직접 작성"(C3) / 화면에 쓴 문구의 출처.
	import type { SourceView } from './elements.ts';
	import type { CopySource } from './storyConfig.ts';

	type Props = { sources: SourceView[]; copySources: CopySource[]; note: string };

	let { sources, copySources, note }: Props = $props();
</script>

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

<style>
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
