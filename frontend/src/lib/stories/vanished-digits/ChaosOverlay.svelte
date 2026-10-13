<script lang="ts">
	// 사라진 세 자리 화면 글 층(시제품 #stage 의 DOM 그대로, D-46 배치 원칙): 그림 영역과 겹치지 않는 글 띠(배지 · 장 번호 · 제목 · 문장),
	// 그림 영역 위의 표지 · 끝 화면 표식(숫자 · 제목), 3-1 큰 숫자, 오른쪽 위 연도(굴림), 그림 아래 캡션.
	// 글 띠는 글 위치(text, 실제 스크롤), 표식 · 큰 숫자 · 연도는 그림 위치(picture, 완화 · 정지)를 따른다.
	// 숫자는 데이터에서 읽고(figures · years), 문구 대조가 어긋난 글 · 숫자는 숨긴다(hidden). 화면 장식이라 읽기 보조기기에는 숨기고,
	// 같은 글은 트랙 구간마다 둔 읽기용 글(.sr)이 전한다.
	import type { BigNumberMeasure, MarkMeasure } from './chaosRenderer.ts';
	import {
		bigNumberAt,
		captionAt,
		DROPPED_DIGITS,
		markAt,
		smoothstep,
		subtitleAt,
		yearAt,
		type CaptionTargets,
		type TrackPosition,
		type YearValues
	} from './chaosScene.ts';
	import { YEAR_LINE_EM, YEAR_PLACES, YEAR_SUFFIX_EM, yearStripPositions } from './chaosPaint.ts';

	type Props = {
		text: TrackPosition;
		picture: TrackPosition;
		still: boolean;
		hidden: ReadonlySet<string>;
		// 표지 · 끝 화면 · 3-1 숫자(0.506127 · 0.506). 대조가 어긋나면 null
		fullValueText: string | null;
		printedValueText: string | null;
		years: YearValues;
		captionTargets: CaptionTargets;
		title: string;
	};

	let {
		text,
		picture,
		still,
		hidden,
		fullValueText,
		printedValueText,
		years,
		captionTargets,
		title
	}: Props = $props();

	// 3-1 떨어지는 자리의 낙하 거리(em) · 기울기(도)
	const BIG_FALL_EM = 2.2;
	const BIG_TILT_DEGREES = 18;
	const BIG_FADE_POWER = 1.4;
	const STRIP_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

	let markElement = $state<HTMLElement>();
	let markNumber = $state<HTMLElement>();
	let bigRow = $state<HTMLElement>();
	let bigDigits = $state<HTMLElement[]>([]);

	// 숫자 둘이 다 있어야 표식 숫자 · 큰 숫자를 그린다(하나라도 어긋나면 숨김)
	const digits = $derived(
		fullValueText !== null && printedValueText !== null ? Array.from(fullValueText) : []
	);
	const keep = $derived(digits.length - DROPPED_DIGITS);

	const subtitle = $derived(subtitleAt(text, hidden));
	const caption = $derived(captionAt(text, hidden, captionTargets));
	const mark = $derived(markAt(picture, still));
	const big = $derived(digits.length === 0 ? null : bigNumberAt(picture));
	const year = $derived(yearAt(picture, years, hidden));
	const strips = $derived(year === null ? [] : yearStripPositions(year.value));

	function droppedOpacity(index: number, drops: number[]): string {
		const fromEnd = digits.length - 1 - index;
		return fromEnd < drops.length ? (1 - drops[fromEnd]).toFixed(3) : '1';
	}

	function markTransform(drops: number[], shrink: number): string {
		// 사라진 자리만큼 오른쪽으로 옮겨 남은 숫자가 가운데에 오게 한 뒤, 그 가운데를 향해 줄인다
		const shift = 0.5 * drops.reduce((sum, value) => sum + value, 0);
		return `scale(${(1 - shrink).toFixed(4)}) translateX(${shift.toFixed(4)}ch)`;
	}

	function bigTransform(index: number, drops: number[]): string {
		const k = index - keep;
		if (k < 0 || drops[k] <= 0) return '';
		const t = drops[k];
		const tilt = t * BIG_TILT_DEGREES * (k % 2 === 0 ? 1 : -1);
		return `translateY(${(t * t * BIG_FALL_EM).toFixed(3)}em) rotate(${tilt.toFixed(1)}deg)`;
	}

	function bigOpacity(index: number, drops: number[]): string {
		const k = index - keep;
		if (k < 0 || drops[k] <= 0) return '';
		return Math.pow(1 - drops[k], BIG_FADE_POWER).toFixed(3);
	}

	/** 표지 · 끝 화면 빛점 자리: 숫자 줄 가운데(변형 전 배치 기준, 화면 CSS px) */
	export function measureMark(): MarkMeasure | null {
		if (markElement === undefined || markNumber === undefined) return null;
		const rect = markElement.getBoundingClientRect();
		const count = Math.max(1, digits.length);
		return {
			centerX: rect.left + markNumber.offsetLeft + markNumber.offsetWidth / 2,
			centerY: rect.top + markNumber.offsetTop + markNumber.offsetHeight / 2,
			characterWidth: markNumber.offsetWidth / count,
			keep: Math.max(0, keep)
		};
	}

	/** 3-1 큰 숫자: 줄 가운데 높이 · 떨어지는 자리들의 가운데 x · 떨어지는 거리(화면 CSS px). 숫자가 없으면 null */
	export function measureBigNumber(): BigNumberMeasure | null {
		if (bigRow === undefined || digits.length === 0) return null;
		const rect = bigRow.getBoundingClientRect();
		const fontPx = parseFloat(getComputedStyle(bigRow).fontSize);
		return {
			centerY: rect.top + rect.height / 2,
			digitX: bigDigits
				.slice(keep)
				.map((digit) => rect.left + digit.offsetLeft + digit.offsetWidth / 2),
			fallCss: BIG_FALL_EM * fontPx
		};
	}
</script>

<div
	class="overlay"
	aria-hidden="true"
	data-picture={picture.index}
	data-picture-p={picture.p.toFixed(4)}
>
	<div class="bignum" style:opacity={big === null ? '0' : big.appear.toFixed(3)}>
		<div class="bignum-row" bind:this={bigRow}>
			{#each digits as digit, index (index)}
				<span
					bind:this={bigDigits[index]}
					style:transform={big === null ? '' : bigTransform(index, big.drops)}
					style:opacity={big === null ? '' : bigOpacity(index, big.drops)}>{digit}</span
				>
			{/each}
		</div>
	</div>

	<div
		class="mark"
		bind:this={markElement}
		style:opacity={mark === null ? '0' : mark.alpha.toFixed(3)}
	>
		<div
			class="mark-number"
			bind:this={markNumber}
			style:transform={mark === null ? '' : markTransform(mark.drops, mark.shrink)}
			style:opacity={mark === null ? '' : (1 - smoothstep(0.55, 1, mark.shrink)).toFixed(3)}
		>
			{#each digits as digit, index (index)}
				<span style:opacity={mark === null ? '' : droppedOpacity(index, mark.drops)}>{digit}</span>
			{/each}
		</div>
		<p class="mark-title" style:opacity={mark === null ? '0' : mark.title.toFixed(3)}>{title}</p>
	</div>

	<div class="year" style:opacity={year === null ? '0' : year.alpha.toFixed(3)}>
		<span class="year-number" style:opacity={year === null ? '' : (1 - year.word).toFixed(3)}>
			{#each strips as position, place (place)}
				<span class="digit">
					<span
						class="strip"
						style:transform="translateY({(-position * YEAR_LINE_EM).toFixed(4)}em)"
					>
						{#each STRIP_DIGITS as value, cell (cell)}<span>{value}</span>{/each}
					</span>
				</span>
			{/each}
			{#if strips.length === YEAR_PLACES}
				<span
					class="year-suffix"
					style:max-width="{year === null ? 0 : (year.suffix * YEAR_SUFFIX_EM).toFixed(3)}em"
					style:opacity={year === null ? '0' : year.suffix.toFixed(3)}>년대</span
				>
			{/if}
		</span>
		<span class="year-word" style:opacity={year === null ? '0' : year.word.toFixed(3)}>오늘</span>
	</div>

	<div class="caption">{caption}</div>

	<div class="band">
		{#key subtitle.key}
			<div class="sub" class:enter={!still && subtitle.key !== 'none'}>
				{#if subtitle.kicker !== ''}<p class="kicker">{subtitle.kicker}</p>{/if}
				{#if subtitle.heading !== ''}<p class="heading">{subtitle.heading}</p>{/if}
				{#if subtitle.text !== ''}<p class="subtext">{subtitle.text}</p>{/if}
			</div>
		{/key}
	</div>
</div>

<style>
	/* 화면에 고정한 글 층. 그림(캔버스)은 배경 층(ChaosBackground)에 같은 비율로 놓인다 */
	.overlay {
		--gutter: 24px;
		--band: rgba(255, 255, 255, 0.022);
		position: fixed;
		inset: 0;
		z-index: 2;
		pointer-events: none;
	}

	/* 휴대폰 · 태블릿: 그림은 위쪽 0~62%, 글은 64~92% 띠. 둘은 겹치지 않는다 */
	.band {
		position: absolute;
		left: 0;
		right: 0;
		top: 64%;
		height: 28%;
		box-sizing: border-box;
		padding: 0 var(--gutter);
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--band);
	}

	.sub {
		width: fit-content;
		max-width: 100%;
	}

	.subtext {
		margin: 0;
		font-size: 18px;
		line-height: 1.72;
		letter-spacing: -0.01em;
		word-break: keep-all;
		overflow-wrap: anywhere;
		color: var(--story-text);
	}

	.sub.enter {
		animation: sub-in 420ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
	}

	@keyframes sub-in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	/* 글 띠 위 작은 글씨(배지 · 장 번호)와 큰 제목(장 제목) */
	.kicker {
		margin: 0 0 6px;
		font-size: 12px;
		line-height: 1.4;
		letter-spacing: 0.08em;
		color: var(--story-imagined);
	}

	.heading {
		margin: 0 0 10px;
		font-size: 26px;
		line-height: 1.35;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: var(--story-text);
		word-break: keep-all;
	}

	/* 연도: 그림 영역 오른쪽 위 구석. 자리마다 0~9 띠가 굴러 숫자가 바뀐다 */
	.year {
		position: absolute;
		top: 12px;
		right: 16px;
		font-size: 15px;
		line-height: 1.2;
		font-weight: 500;
		letter-spacing: 0.03em;
		color: #cdb88e;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.year-number {
		display: inline-flex;
		align-items: flex-start;
	}

	.digit {
		display: inline-block;
		height: 1.2em;
		overflow: hidden;
	}

	.strip {
		display: block;
	}

	.strip span {
		display: block;
		height: 1.2em;
	}

	.year-suffix {
		display: inline-block;
		overflow: hidden;
		white-space: nowrap;
		vertical-align: top;
	}

	.year-word {
		position: absolute;
		right: 0;
		top: 0;
	}

	/* 캡션: 그림 영역 바로 아래(글 띠 위) 작은 글씨 */
	.caption {
		position: absolute;
		left: var(--gutter);
		right: var(--gutter);
		top: 62%;
		height: 2%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		line-height: 1;
		color: var(--story-muted);
		white-space: nowrap;
	}

	/* 3-1 큰 숫자 */
	.bignum {
		position: absolute;
		left: 0;
		top: 0;
		width: 100%;
		height: 62%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 58px;
		line-height: 1;
		font-weight: 300;
		letter-spacing: 0.02em;
		color: #f3ecdf;
		font-variant-numeric: tabular-nums;
	}

	.bignum-row {
		position: relative;
	}

	.bignum-row span {
		display: inline-block;
	}

	/* 표지 · 끝 화면 표식: 숫자와 제목(같은 자리 · 같은 글꼴로 짝을 이룬다). 휴대폰은 그림 영역(위 62%) 가운데, PC 는 화면 가운데 */
	.mark {
		position: absolute;
		left: 0;
		top: 0;
		width: 100%;
		height: 62%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.mark-number {
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: 50px;
		line-height: 1;
		font-weight: 300;
		color: #f3ecdf;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.mark-number span {
		display: inline-block;
	}

	.mark-title {
		margin: 34px 0 0;
		font-size: 26px;
		line-height: 1.3;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: #f3ecdf;
		white-space: nowrap;
	}

	/* PC: 글은 왼쪽 열, 그림은 오른쪽 넓게 */
	@media (min-width: 1024px) {
		.band {
			left: 6%;
			right: auto;
			width: 27%;
			top: 0;
			height: 100%;
			padding: 0;
			justify-content: flex-start;
			background: none;
		}

		.subtext {
			font-size: 22px;
			line-height: 1.75;
		}

		.heading {
			font-size: 34px;
		}

		.year {
			top: 4vh;
			right: 3%;
			font-size: 17px;
		}

		.caption {
			left: 40%;
			right: 3%;
			top: auto;
			bottom: 2.5%;
			height: auto;
			justify-content: flex-end;
			font-size: 12px;
		}

		.bignum {
			left: 36%;
			width: 64%;
			height: 100%;
			font-size: 104px;
		}

		.mark {
			height: 100%;
		}

		.mark-number {
			font-size: 84px;
		}

		.mark-title {
			margin-top: 48px;
			font-size: 38px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sub.enter {
			animation: none;
		}
	}
</style>
