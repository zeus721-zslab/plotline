<script lang="ts">
	// 마지막 2시간 40분 공개 페이지. 페이지 틀은 프리렌더하고, 데이터는 클라이언트에서 발행 파일(/data/)을 읽는다.
	import TitanicPage from '#lib/stories/titanic/TitanicPage.svelte';
	import { TITANIC_DATASETS, TITANIC_STORY } from '#lib/stories/titanic/titanicStory.ts';
	import { loadPublishedSource } from '#lib/story/storySource.ts';

	const loadSource = () => loadPublishedSource(TITANIC_STORY, TITANIC_DATASETS);
</script>

<TitanicPage {loadSource} />
