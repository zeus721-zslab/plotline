<script lang="ts">
	// 공개 데이터 로딩 중·실패 표시. 실패하면 다시 시도 버튼을 준다.
	type Props = { status: 'loading' | 'error'; onretry: () => void };

	let { status, onretry }: Props = $props();
</script>

{#if status === 'loading'}
	<p class="load-status" role="status">불러오는 중…</p>
{:else}
	<div class="load-status" role="alert">
		<p>데이터를 불러오지 못했습니다.</p>
		<button type="button" onclick={onretry}>다시 시도</button>
	</div>
{/if}

<style>
	.load-status {
		margin: 0;
		padding: 2rem 0;
		text-align: center;
	}

	.load-status p {
		margin: 0 0 1rem;
	}

	button {
		min-width: 44px;
		min-height: 44px;
		padding: 0 1.25rem;
		border: 1px solid currentColor;
		border-radius: 999px;
		background: transparent;
		color: inherit;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	button:focus-visible {
		outline: 3px solid currentColor;
		outline-offset: 2px;
	}
</style>
