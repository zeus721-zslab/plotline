<script lang="ts">
	// 넘을 수 없는 선 공개 페이지. 페이지 틀은 프리렌더하고, 데이터는 클라이언트에서 발행 파일(/data/)을 읽는다.
	import UncrossableLinePage from '#lib/stories/uncrossable-line/UncrossableLinePage.svelte';
	import { LINE_DATASETS, LINE_STORY } from '#lib/stories/uncrossable-line/lineStory.ts';
	import SocialMeta from '#lib/story/SocialMeta.svelte';
	import { loadPublishedSource } from '#lib/story/storySource.ts';

	const loadSource = () => loadPublishedSource(LINE_STORY, LINE_DATASETS);
</script>

<SocialMeta story="uncrossable-line" />
<UncrossableLinePage {loadSource} />
