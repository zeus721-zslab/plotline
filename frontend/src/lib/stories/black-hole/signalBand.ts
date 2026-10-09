// 7장 신호 띠(Canvas 2D): 계기판 바로 아래 얇은 띠에 "우리에게 도착한 깜빡임"을 심전도처럼 그린다.
// 눈금(깜빡임)은 띠 오른쪽에서 생겨 왼쪽으로 흐른다. 장면 구간 스크롤(fade 0~1)을 따라 새 눈금의 간격이 벌어지고
// 흰색 → 붉은색으로 바뀌며 흐려지다, fade 1 이면 더 생기지 않아 평평한 선이 되고 오른쪽에 "더 이상 도착하지 않음"이 뜬다.
// 띠는 장식이라 배경 캔버스(aria-hidden)에만 그리고, 뜻은 카드 문구가 전달한다.
import { paintTag, tagWidth, type Rect } from './mapPaint.ts';

// 띠 높이(CSS px). 위 줄에 글, 아래 줄에 선을 둔다.
export const SIGNAL_BAND_PX = 52;
const ARRIVED_TEXT = '우리에게 도착한 깜빡임';
const STOPPED_TEXT = '더 이상 도착하지 않음';
// 띠 안 여백 · 글 윗변 · 선 높이(띠 윗변에서 px)
const INSET_PX = 16;
const TEXT_TOP_PX = 6;
const BASELINE_PX = 40;
// 눈금 모양: 위로 솟는 높이 · 아래로 꺼지는 높이 · 반폭(px)
const SPIKE_UP_PX = 11;
const SPIKE_DOWN_PX = 4;
const SPIKE_HALF_PX = 4;
// 눈금이 띠 오른쪽 끝에서 왼쪽 끝까지 흐르는 시간(초)
const CROSS_SECONDS = 4;
// 사라지기 직전 간격(초). 여행자 쪽은 늘 1초.
const MAX_INTERVAL_SECONDS = 5;
// 사라지기 직전 눈금 밝기(처음 대비)
const LAST_ALPHA_SHARE = 0.25;
const WHITE_RGB: [number, number, number] = [255, 248, 230];
const RED_RGB: [number, number, number] = [235, 70, 60];
const PANEL_RGBA = 'rgba(3, 4, 10, 0.82)';
const BORDER_RGBA = 'rgba(28, 31, 51, 1)';
const BASELINE_RGBA = 'rgba(238, 241, 248, 0.3)';
const TEXT_ALPHA = 0.9;
// 정지 화면: 눈금 수 · 선 폭 중 눈금이 차지하는 비율 · 마지막 눈금의 fade
const STILL_TICKS = 7;
const STILL_SPAN_SHARE = 0.68;
const STILL_LAST_FADE = 0.9;

// 눈금: 생긴 뒤 지난 초 · 생길 때의 fade(간격 · 색 · 밝기를 정함)
type Tick = { age: number; fade: number };

// 화면 확인용 값: 지금 간격(초) · 지금 색 · 평평해졌는지 · 띠 위아래 y
export type SignalReading = {
	interval: number;
	rgb: [number, number, number];
	flat: boolean;
	top: number;
	bottom: number;
};

function lerp(from: number, to: number, ratio: number): number {
	return from + (to - from) * ratio;
}

function intervalAt(fade: number): number {
	return lerp(1, MAX_INTERVAL_SECONDS, fade);
}

function rgbAt(fade: number): [number, number, number] {
	return [
		Math.round(lerp(WHITE_RGB[0], RED_RGB[0], fade)),
		Math.round(lerp(WHITE_RGB[1], RED_RGB[1], fade)),
		Math.round(lerp(WHITE_RGB[2], RED_RGB[2], fade))
	];
}

function alphaAt(fade: number): number {
	return lerp(1, LAST_ALPHA_SHARE, fade);
}

export class SignalBand {
	private ticks: Tick[] = [];
	private sinceTick = 0;

	/** 7장에 들어올 때 지난 눈금을 지운다. 첫 눈금은 바로 생긴다. */
	reset(): void {
		this.ticks = [];
		this.sinceTick = Number.POSITIVE_INFINITY;
	}

	/** emitting 이면(7장) 지금 fade 의 간격마다 눈금을 하나씩 만든다. fade 1 이면 더 만들지 않는다. */
	step(seconds: number, fade: number, emitting: boolean): void {
		this.ticks = this.ticks
			.map((tick) => ({ ...tick, age: tick.age + seconds }))
			.filter((tick) => tick.age < CROSS_SECONDS);
		if (!emitting || fade >= 1) return;
		this.sinceTick += seconds;
		if (this.sinceTick >= intervalAt(fade)) {
			this.sinceTick = 0;
			this.ticks.push({ age: 0, fade });
		}
	}

	/** 띠 한 장. still 이면 간격이 벌어지며 붉어지다 평평해진 전체 모양을 그린다. */
	paint(
		context: CanvasRenderingContext2D,
		band: Rect,
		alpha: number,
		fade: number,
		still: boolean
	): SignalReading {
		const flat = still || fade >= 1;
		const reading: SignalReading = {
			interval: Math.round(intervalAt(fade) * 100) / 100,
			rgb: rgbAt(fade),
			flat,
			top: band.y,
			bottom: band.y + band.height
		};
		if (alpha < 0.01) return reading;
		const left = band.x + INSET_PX;
		const right = band.x + band.width - INSET_PX;
		const baseY = band.y + BASELINE_PX;
		context.save();
		context.globalAlpha = alpha;
		context.fillStyle = PANEL_RGBA;
		context.fillRect(band.x, band.y, band.width, band.height);
		context.fillStyle = BORDER_RGBA;
		context.fillRect(band.x, band.y + band.height - 1, band.width, 1);
		context.strokeStyle = BASELINE_RGBA;
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(left, baseY + 0.5);
		context.lineTo(right, baseY + 0.5);
		context.stroke();
		const ticks = still ? this.stillTicks(left, right) : this.movingTicks(left, right);
		for (const tick of ticks) paintSpike(context, tick.x, baseY, tick.fade);
		context.restore();
		paintTag(context, ARRIVED_TEXT, left, band.y + TEXT_TOP_PX, TEXT_ALPHA * alpha);
		if (flat) {
			const stoppedX = right - tagWidth(context, STOPPED_TEXT);
			paintTag(context, STOPPED_TEXT, stoppedX, band.y + TEXT_TOP_PX, TEXT_ALPHA * alpha);
		}
		return reading;
	}

	private movingTicks(left: number, right: number): { x: number; fade: number }[] {
		return this.ticks.map((tick) => ({
			x: right - (tick.age / CROSS_SECONDS) * (right - left),
			fade: tick.fade
		}));
	}

	/** 정지 화면 눈금: 왼쪽(먼저 도착)부터 간격이 벌어지게 놓고, 선 오른쪽 나머지는 평평하게 둔다. */
	private stillTicks(left: number, right: number): { x: number; fade: number }[] {
		const fades = Array.from(
			{ length: STILL_TICKS },
			(_, index) => (index / (STILL_TICKS - 1)) * STILL_LAST_FADE
		);
		const gaps = fades.slice(0, -1).map(intervalAt);
		const total = gaps.reduce((sum, gap) => sum + gap, 0);
		const span = (right - left - SPIKE_HALF_PX * 2) * STILL_SPAN_SHARE;
		let x = left + SPIKE_HALF_PX;
		return fades.map((fade, index) => {
			const at = x;
			if (index < gaps.length) x += (gaps[index] / total) * span;
			return { x: at, fade };
		});
	}
}

/** 눈금 하나: 선에서 위로 솟았다 아래로 살짝 꺼진 뒤 돌아오는 꺾은선 */
function paintSpike(
	context: CanvasRenderingContext2D,
	x: number,
	baseY: number,
	fade: number
): void {
	const [red, green, blue] = rgbAt(fade);
	context.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${alphaAt(fade)})`;
	context.lineWidth = 2;
	context.lineJoin = 'round';
	context.beginPath();
	context.moveTo(x - SPIKE_HALF_PX, baseY);
	context.lineTo(x, baseY - SPIKE_UP_PX);
	context.lineTo(x + SPIKE_HALF_PX, baseY + SPIKE_DOWN_PX);
	context.lineTo(x + SPIKE_HALF_PX * 2, baseY);
	context.stroke();
}
