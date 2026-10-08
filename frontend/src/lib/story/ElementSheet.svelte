<script lang="ts">
	// 원소 상세(아래에서 올라오는 dialog). Esc·바깥 누름·닫기 버튼으로 닫히고, 닫히면 onclose 로 알린다.
	import { discoveryLabel, type SourceView, type StoryElement } from './elements.ts';

	type Props = { element: StoryElement | null; onclose: () => void };

	let { element, onclose }: Props = $props();

	let dialog: HTMLDialogElement;

	$effect(() => {
		if (element !== null && !dialog.open) dialog.showModal();
		if (element === null && dialog.open) dialog.close();
	});

	// 바깥(배경) 누름: 클릭 대상이 내용 상자가 아니라 dialog 자신일 때만 닫는다.
	function handleClick(event: MouseEvent): void {
		if (event.target === dialog) dialog.close();
	}

	function sourceHost(source: SourceView): string {
		if (source.kind === 'self') return '직접 작성';
		try {
			return new URL(source.url).hostname;
		} catch (error) {
			// 주소 형식이 깨졌어도 원문을 보여 주면 출처는 확인할 수 있다.
			if (error instanceof TypeError) {
				console.warn('source url is not parseable', source.url);
				return source.url;
			}
			throw error;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="sheet"
	aria-labelledby="element-sheet-title"
	{onclose}
	onclick={handleClick}
>
	{#if element !== null}
		<div class="content">
			<div class="heading">
				<span class="symbol" aria-hidden="true">{element.symbol}</span>
				<h2 id="element-sheet-title">{element.name}</h2>
			</div>
			<dl class="facts">
				<div>
					<dt>원소 기호</dt>
					<dd>{element.symbol}</dd>
				</div>
				<div>
					<dt>원자 번호</dt>
					<dd>{element.atomicNumber}</dd>
				</div>
				<div>
					<dt>발견</dt>
					<dd>{discoveryLabel(element.discovery)}</dd>
				</div>
			</dl>
			<ul class="sources">
				{#each [{ role: '이름 출처', source: element.nameSource }, { role: '발견 연도 출처', source: element.discoverySource }] as line (line.role)}
					<li>
						{line.role}: {line.source.datasetTitle} ·
						{#if line.source.kind === 'external'}
							<a href={line.source.url} target="_blank" rel="noopener noreferrer"
								>{sourceHost(line.source)}</a
							>
							({line.source.asOfDate} 기준)
						{:else}
							직접 작성
						{/if}
					</li>
				{/each}
			</ul>
			<button type="button" class="close" onclick={() => dialog.close()}>닫기</button>
		</div>
	{/if}
</dialog>

<style>
	.sheet {
		position: fixed;
		inset: auto 0 0 0;
		width: 100%;
		max-width: 560px;
		max-height: 85svh;
		margin: 0 auto;
		padding: 0;
		border: 0;
		border-radius: 16px 16px 0 0;
		background: var(--story-bg);
		color: var(--story-text);
		font: inherit;
	}

	.sheet[open] {
		animation: sheet-up 220ms ease-out;
	}

	.sheet::backdrop {
		background: rgb(0 0 0 / 0.55);
	}

	.content {
		padding: 1.5rem 1.25rem calc(1.25rem + env(safe-area-inset-bottom));
		border-top: 3px solid var(--story-cell-on);
		border-radius: inherit;
	}

	.heading {
		display: flex;
		align-items: center;
		gap: 0.875rem;
	}

	.symbol {
		display: grid;
		place-items: center;
		width: 3.5rem;
		height: 3.5rem;
		border-radius: 6px;
		background: var(--story-cell-on);
		color: var(--story-bg);
		font-size: 1.5rem;
		font-weight: 700;
	}

	h2 {
		margin: 0;
		font-size: 1.75rem;
		font-weight: 700;
	}

	.facts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
		margin: 1.25rem 0;
	}

	dt {
		color: var(--story-muted);
		font-size: 0.8125rem;
	}

	dd {
		margin: 0.125rem 0 0;
		font-size: 1.125rem;
		font-weight: 600;
	}

	.sources {
		display: grid;
		gap: 0.375rem;
		margin: 0 0 1.25rem;
		padding: 0;
		list-style: none;
		color: var(--story-muted);
		font-size: 0.875rem;
		overflow-wrap: anywhere;
	}

	a {
		display: inline-block;
		min-height: 44px;
		padding: 0.75rem 0;
		color: var(--story-text);
	}

	.close {
		width: 100%;
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

	@keyframes sheet-up {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet[open] {
			animation: none;
		}
	}
</style>
