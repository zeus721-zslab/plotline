<script lang="ts">
	// 단계 그림 1장: 휴대폰 크기 이미지와 한 줄 크레디트. 누르면 크게 보기(ImageViewer)를 열고, 닫히면 누른 버튼으로 포커스를 돌린다.
	import ImageViewer from './ImageViewer.svelte';
	import {
		creditLine,
		requiresFullCredit,
		LARGE_IMAGE_WIDTH_PX,
		SMALL_IMAGE_WIDTH_PX,
		type StoryImage
	} from './storyMedia.ts';

	type Props = { image: StoryImage };

	let { image }: Props = $props();

	// 휴대폰은 화면 폭, PC 는 단계 카드 폭(약 450px)에 맞는 파일을 고르게 한다.
	const SIZES = '(min-width: 960px) 450px, 100vw';

	const srcset = $derived(
		`${image.files.small} ${SMALL_IMAGE_WIDTH_PX}w, ${image.files.large} ${LARGE_IMAGE_WIDTH_PX}w`
	);

	let open = $state(false);
	let trigger: HTMLButtonElement;

	function close(): void {
		open = false;
		trigger.focus();
	}
</script>

<figure class="figure">
	<button
		bind:this={trigger}
		type="button"
		class="open"
		aria-haspopup="dialog"
		onclick={() => (open = true)}
	>
		<img
			class:portrait={image.portrait}
			src={image.files.small}
			{srcset}
			sizes={SIZES}
			alt={image.alt}
			width={image.width}
			height={image.height}
			loading="lazy"
			decoding="async"
		/>
		<span class="credit">
			<span class="credit-text" class:full={requiresFullCredit(image)}>{creditLine(image)}</span>
			<span class="hint">크게 보기</span>
		</span>
	</button>
</figure>

<ImageViewer {image} {open} onclose={close} />

<style>
	.figure {
		margin: 0;
	}

	.open {
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: zoom-in;
	}

	.open:focus-visible {
		outline: 3px solid var(--story-text);
		outline-offset: 2px;
	}

	img {
		display: block;
		width: 100%;
		height: auto;
		max-height: 30svh;
		border-radius: 8px;
		object-fit: cover;
		object-position: center;
	}

	/* 초상은 얼굴이 잘리지 않게 위쪽을 기준으로 자른다. */
	img.portrait {
		object-position: top;
	}

	/* 퍼블릭 도메인 · CC0 크레디트는 한 줄로 두고, 넘치면 말줄임(전체는 크게 보기와 출처 절에 있다). */
	.credit {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 44px;
		color: var(--story-muted);
		font-size: 0.8125rem;
		line-height: 1.4;
	}

	.credit-text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* CC BY 4.0 은 저작자 표시가 이용 조건이라 잘라 보이지 않고 줄바꿈해 전부 보인다(D-32). */
	.credit-text.full {
		overflow: visible;
		overflow-wrap: anywhere;
		white-space: normal;
	}

	.hint {
		flex: none;
		margin-left: auto;
		color: var(--story-text);
		text-decoration: underline;
	}

	@media (min-width: 960px) {
		img {
			max-height: none;
		}
	}
</style>
