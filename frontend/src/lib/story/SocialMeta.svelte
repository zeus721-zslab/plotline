<script lang="ts">
	// 링크 공유 미리보기 태그 6종(Open Graph · X 카드). <title> 은 각 편이 실행 중에 정하므로 두지 않는다.
	import { socialMetaFor, type SocialMetaKey } from './socialMeta.ts';

	type Props = { story: SocialMetaKey };

	let { story }: Props = $props();

	const meta = $derived(socialMetaFor(story));
</script>

<svelte:head>
	<meta property="og:title" content={meta.title} />
	<meta property="og:description" content={meta.description} />
	<meta property="og:image" content={meta.image} />
	<meta property="og:url" content={meta.url} />
	<meta property="og:type" content={story === 'home' ? 'website' : 'article'} />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>
