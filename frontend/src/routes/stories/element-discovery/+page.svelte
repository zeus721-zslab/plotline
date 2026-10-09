<script lang="ts">
	// 원소 발견사 공개 페이지. 페이지 틀은 프리렌더하고, 데이터는 클라이언트에서 발행 파일(/data/)을 읽는다.
	import ElementDiscoveryPage from '#lib/stories/element-discovery/ElementDiscoveryPage.svelte';
	import {
		ELEMENT_DISCOVERY_DATASETS,
		ELEMENT_DISCOVERY_STORY
	} from '#lib/stories/element-discovery/elementDiscovery.ts';
	import { loadPublishedSource } from '#lib/story/storySource.ts';

	const loadSource = () => loadPublishedSource(ELEMENT_DISCOVERY_STORY, ELEMENT_DISCOVERY_DATASETS);
</script>

<ElementDiscoveryPage {loadSource} />
