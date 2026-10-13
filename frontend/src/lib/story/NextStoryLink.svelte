<script lang="ts">
	// 다음 이야기 링크(D-47 D1): 목록(index.json)에서 이 이야기 다음 항목. 없으면(마지막 이야기 · 관리자 미리보기) 그리지 않는다.
	// 감싸는 절(출처 · 맺음)은 편이 둔다. 색은 테마 변수(--story-text)를 읽는다.
	import type { NextStory } from './storySource.ts';

	type Props = { next: NextStory | null };

	let { next }: Props = $props();
</script>

{#if next !== null}
	<a class="next" href="/stories/{next.story}">
		다음 이야기: {next.title}
	</a>
{/if}

<style>
	.next {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin-top: 2rem;
		color: var(--story-text);
		font-weight: 700;
	}

	.next:focus-visible {
		outline: 3px solid var(--story-text);
		outline-offset: 2px;
	}
</style>
