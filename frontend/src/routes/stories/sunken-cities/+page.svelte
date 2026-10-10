<script lang="ts">
	// 바다 밑의 도시들 공개 페이지. 페이지 틀은 프리렌더하고, 데이터는 클라이언트에서 발행 파일(/data/)을 읽는다.
	import SunkenCitiesPage from '#lib/stories/sunken-cities/SunkenCitiesPage.svelte';
	import {
		SUNKEN_CITIES_DATASETS,
		SUNKEN_CITIES_STORY
	} from '#lib/stories/sunken-cities/sunkenStory.ts';
	import { loadPublishedSource } from '#lib/story/storySource.ts';

	const loadSource = () => loadPublishedSource(SUNKEN_CITIES_STORY, SUNKEN_CITIES_DATASETS);
</script>

<SunkenCitiesPage {loadSource} />
