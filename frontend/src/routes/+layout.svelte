<script lang="ts">
	// 공개 화면 서체(자체 호스팅). 화면에서 쓰는 굵기만 불러 전송량을 줄인다.
	import '@fontsource/ibm-plex-sans-kr/400.css';
	import '@fontsource/ibm-plex-sans-kr/600.css';
	import '@fontsource/ibm-plex-sans-kr/700.css';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
