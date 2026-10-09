<script lang="ts">
	// 사건의 지평선 너머 공개 페이지. 페이지 틀은 프리렌더하고, 데이터는 클라이언트에서 발행 파일(/data/)을 읽는다.
	import BlackHolePage from '#lib/stories/black-hole/BlackHolePage.svelte';
	import { BLACK_HOLE_DATASETS, BLACK_HOLE_STORY } from '#lib/stories/black-hole/blackHoleStory.ts';
	import { loadPublishedSource } from '#lib/story/storySource.ts';

	const loadSource = () => loadPublishedSource(BLACK_HOLE_STORY, BLACK_HOLE_DATASETS);
</script>

<BlackHolePage {loadSource} />
