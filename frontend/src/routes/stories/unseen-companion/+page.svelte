<script lang="ts">
	// 보이지 않는 짝 공개 페이지. 페이지 틀은 프리렌더하고, 데이터는 클라이언트에서 발행 파일(/data/)을 읽는다.
	import UnseenCompanionPage from '#lib/stories/unseen-companion/UnseenCompanionPage.svelte';
	import { UNSEEN_DATASETS, UNSEEN_STORY } from '#lib/stories/unseen-companion/unseenStory.ts';
	import { loadPublishedSource } from '#lib/story/storySource.ts';

	const loadSource = () => loadPublishedSource(UNSEEN_STORY, UNSEEN_DATASETS);
</script>

<UnseenCompanionPage {loadSource} />
