<script lang="ts">
	// 사라진 세 자리 공개 페이지. 페이지 틀은 프리렌더하고, 데이터는 클라이언트에서 발행 파일(/data/)을 읽는다.
	import VanishedDigitsPage from '#lib/stories/vanished-digits/VanishedDigitsPage.svelte';
	import { CHAOS_DATASETS, CHAOS_STORY } from '#lib/stories/vanished-digits/chaosStory.ts';
	import SocialMeta from '#lib/story/SocialMeta.svelte';
	import { loadPublishedSource } from '#lib/story/storySource.ts';

	const loadSource = () => loadPublishedSource(CHAOS_STORY, CHAOS_DATASETS);
</script>

<SocialMeta story="vanished-digits" />
<VanishedDigitsPage {loadSource} />
