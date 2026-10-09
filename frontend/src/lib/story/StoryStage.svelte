<script lang="ts">
	// 배경 무대: 스토리별 배경(캔버스 등)을 화면 전체에 고정해 깔고, 본문은 그 위로 지나가게 한다.
	// 배경은 장식이라 읽기 보조기기에 숨기고 누름을 받지 않는다.
	import type { Snippet } from 'svelte';

	type Props = { background: Snippet; children: Snippet };

	let { background, children }: Props = $props();
</script>

<div class="backdrop" aria-hidden="true">{@render background()}</div>
<div class="content">{@render children()}</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 0;
		pointer-events: none;
	}

	.content {
		position: relative;
		z-index: 1;
	}
</style>
