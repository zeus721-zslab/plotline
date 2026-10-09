<script lang="ts">
	// 빛의 나이 공개 페이지. 페이지 틀은 프리렌더하고, 데이터는 클라이언트에서 발행 파일(/data/)을 읽는다.
	import LightAgePage from '#lib/stories/light-age/LightAgePage.svelte';
	import { LIGHT_AGE_DATASETS, LIGHT_AGE_STORY } from '#lib/stories/light-age/lightAge.ts';
	import { loadPublishedSource } from '#lib/story/storySource.ts';

	const loadSource = () => loadPublishedSource(LIGHT_AGE_STORY, LIGHT_AGE_DATASETS);
</script>

<LightAgePage {loadSource} />
