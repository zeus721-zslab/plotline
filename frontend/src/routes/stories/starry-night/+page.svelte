<script lang="ts">
	// 그가 실패작이라 부른 밤 공개 페이지. 페이지 틀은 프리렌더하고, 데이터는 클라이언트에서 발행 파일(/data/)을 읽는다.
	import StarryNightPage from '#lib/stories/starry-night/StarryNightPage.svelte';
	import {
		STARRY_NIGHT_DATASETS,
		STARRY_NIGHT_STORY
	} from '#lib/stories/starry-night/starryStory.ts';
	import { loadPublishedSource } from '#lib/story/storySource.ts';

	const loadSource = () => loadPublishedSource(STARRY_NIGHT_STORY, STARRY_NIGHT_DATASETS);
</script>

<StarryNightPage {loadSource} />
