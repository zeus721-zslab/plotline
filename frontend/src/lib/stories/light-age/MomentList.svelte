<script lang="ts">
	// 그때 지구 줄: 사건 문장(earth_moments.event)과 때. 대조를 통과하지 못한 줄은 부르는 쪽이 빼고 넘긴다.
	import { momentTimeText } from './lightTime.ts';
	import type { EarthMoment } from './skyData.ts';

	type Props = { moments: EarthMoment[] };

	let { moments }: Props = $props();
</script>

{#if moments.length > 0}
	<ul class="moments">
		{#each moments as moment (moment.id)}
			<li>
				<span class="label">
					{moment.momentKind === '빛이 닿을 때' ? '빛이 닿을 때' : '그때 지구'} · {momentTimeText(
						moment
					)}
				</span>
				<span class="event">{moment.event}</span>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.moments {
		display: grid;
		gap: 0.75rem;
		margin: 1rem 0 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		gap: 0.125rem;
		padding-left: 0.75rem;
		border-left: 2px solid var(--story-cell-on);
	}

	.label {
		color: var(--story-cell-on);
		font-size: 0.875rem;
		font-weight: 700;
	}
</style>
