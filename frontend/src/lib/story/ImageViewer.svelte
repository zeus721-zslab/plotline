<script lang="ts">
	// 그림 크게 보기(dialog): 960 이미지 · 전체 크레디트 · 출처 링크. Esc·바깥 누름·닫기 버튼으로 닫히고 onclose 로 알린다.
	import type { StoryImage } from './storyMedia.ts';

	type Props = { image: StoryImage; open: boolean; onclose: () => void };

	let { image, open, onclose }: Props = $props();

	let dialog: HTMLDialogElement;

	$effect(() => {
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	// 바깥(배경) 누름: 클릭 대상이 내용 상자가 아니라 dialog 자신일 때만 닫는다.
	function handleClick(event: MouseEvent): void {
		if (event.target === dialog) dialog.close();
	}
</script>

<dialog
	bind:this={dialog}
	class="viewer"
	aria-label={`그림 크게 보기: ${image.title}`}
	{onclose}
	onclick={handleClick}
>
	{#if open}
		<div class="content">
			<img
				src={image.files.large}
				alt={image.alt}
				width={image.width}
				height={image.height}
				decoding="async"
			/>
			<dl class="credit">
				<div>
					<dt>제목</dt>
					<dd>{image.title}</dd>
				</div>
				<div>
					<dt>작가</dt>
					<dd>{image.creator}</dd>
				</div>
				<div>
					<dt>연도</dt>
					<dd>{image.date}</dd>
				</div>
				{#if image.holder !== null}
					<div>
						<dt>소장</dt>
						<dd>{image.holder}</dd>
					</div>
				{/if}
				<div>
					<dt>라이선스</dt>
					<dd>{image.license}</dd>
				</div>
			</dl>
			<a href={image.sourceUrl} target="_blank" rel="noopener noreferrer"
				>{image.sourceName}에서 보기</a
			>
			<button type="button" class="close" onclick={() => dialog.close()}>닫기</button>
		</div>
	{/if}
</dialog>

<style>
	.viewer {
		width: min(100% - 2rem, 720px);
		max-height: 92svh;
		padding: 0;
		border: 0;
		border-radius: 12px;
		background: var(--story-bg);
		color: var(--story-text);
		font: inherit;
	}

	.viewer::backdrop {
		background: rgb(0 0 0 / 0.75);
	}

	.content {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
	}

	img {
		display: block;
		width: 100%;
		height: auto;
		max-height: 62svh;
		object-fit: contain;
	}

	.credit {
		display: grid;
		gap: 0.25rem;
		margin: 0;
		font-size: 0.875rem;
		overflow-wrap: anywhere;
	}

	.credit div {
		display: flex;
		gap: 0.75rem;
	}

	dt {
		flex: none;
		width: 4.5rem;
		color: var(--story-muted);
	}

	dd {
		margin: 0;
	}

	a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--story-text);
	}

	.close {
		min-height: 44px;
		border: 1px solid var(--story-muted);
		border-radius: 999px;
		background: transparent;
		color: var(--story-text);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}

	a:focus-visible,
	.close:focus-visible {
		outline: 3px solid var(--story-text);
		outline-offset: 2px;
	}
</style>
