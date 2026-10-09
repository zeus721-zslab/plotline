<script lang="ts">
	// 이야기 상단 계기판 틀: 화면 위에 고정된 48px 띠 하나. 안의 글은 이야기마다 다르다(2편 · 3편).
	import type { Snippet } from 'svelte';

	type Props = { children: Snippet };

	let { children }: Props = $props();
</script>

<div class="gauge">{@render children()}</div>

<style>
	.gauge {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 2;
		display: flex;
		align-items: center;
		justify-content: center;
		/* 휴대폰 높이(844px)의 6% 안팎. 고정 영역은 이 띠뿐이다. */
		height: 48px;
		padding: 0 1rem;
		box-sizing: border-box;
		background: color-mix(in srgb, var(--story-bg) 82%, transparent);
		border-bottom: 1px solid var(--story-cell-off);
	}
</style>
