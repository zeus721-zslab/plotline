<script lang="ts">
	// 상단 계기판: "도거랜드 · 바다에 잠긴 지 약 7,000년" 같은 장 한 줄.
	// 휴대폰 폭에서는 장소 이름과 나머지를 두 줄로 나눠 48px 띠 안에 다 보이게 한다.
	import GaugeBar from '#lib/story/GaugeBar.svelte';

	type Props = {
		// 첫 조각은 장소 이름. 계기판 글이 없는 장(8장)이나 대조에 걸린 장은 빈 목록.
		parts: string[];
	};

	let { parts }: Props = $props();
</script>

<GaugeBar>
	<p class="line">
		{#if parts.length > 0}
			<span class="name">{parts[0]}</span>
			{#if parts.length > 1}
				<span class="separator" aria-hidden="true">·</span>
				<span class="rest">{parts.slice(1).join(' · ')}</span>
			{/if}
		{/if}
	</p>
</GaugeBar>

<style>
	.line {
		width: 100%;
		max-width: 1200px;
		margin: 0;
		overflow: hidden;
		color: var(--story-text);
		font-size: 0.9375rem;
		font-variant-numeric: tabular-nums;
		text-align: center;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.name {
		color: var(--story-cell-on);
		font-weight: 700;
	}

	.separator {
		margin: 0 0.375rem;
		color: var(--story-muted);
	}

	@media (max-width: 599px) {
		.line {
			font-size: 0.8125rem;
			line-height: 1.3;
			text-align: left;
		}

		.name,
		.rest {
			display: block;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.separator {
			display: none;
		}
	}
</style>
