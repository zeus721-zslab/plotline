<script lang="ts">
	// 9장 분기(이야기 작성 규칙: 누름으로 고르는 상호작용, 이번 합의분 1곳). 누르면 작은 블랙홀 화면과 문구, 다시 누르면 M87 로 돌아간다.
	import { BRANCH_BUTTON } from './chapters.ts';

	type Props = { open: boolean; text: string };

	let { open = $bindable(), text }: Props = $props();
</script>

<div class="branch">
	<button type="button" aria-pressed={open} onclick={() => (open = !open)}>
		<span class="mark" aria-hidden="true">{open ? '●' : '○'}</span>
		{BRANCH_BUTTON}
	</button>
	<div aria-live="polite">
		{#if open}
			<p class="text">{text}</p>
		{/if}
	</div>
</div>

<style>
	.branch {
		margin: 1rem 0 0;
	}

	button {
		display: inline-flex;
		gap: 0.5rem;
		align-items: center;
		min-height: 48px;
		padding: 0 1rem;
		border: 1px solid var(--story-cell-on);
		border-radius: 999px;
		background: transparent;
		color: var(--story-text);
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	button[aria-pressed='true'] {
		background: color-mix(in srgb, var(--story-cell-on) 18%, transparent);
	}

	button:focus-visible {
		outline: 3px solid var(--story-text);
		outline-offset: 2px;
	}

	.mark {
		color: var(--story-cell-on);
	}

	.text {
		margin: 0.75rem 0 0;
	}
</style>
