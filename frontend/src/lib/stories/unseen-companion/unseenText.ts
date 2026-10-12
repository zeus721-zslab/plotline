// 보이지 않는 짝 글 등장 방식(순수 함수, 시제품 setText 의 style 계산 그대로): 장마다 7종 중 하나.
// 글은 DOM 이고, 비트 · 진행 값만으로 style 이 정해진다. 비활성 글은 opacity 0 만 남겨(시제품 resetText) 되감아도 같은 style 이 나온다.
import { clamp, lerp, linear, phase, TAU } from './unseenScene.ts';

export type TextStyle = 'rise' | 'ripple' | 'pen' | 'whiteFocus' | 'squeeze' | 'shake' | 'arc';

const TEXT_STYLE_BY_CHAPTER: Record<number, TextStyle> = {
	1: 'rise',
	2: 'ripple',
	3: 'pen',
	4: 'whiteFocus',
	5: 'squeeze',
	6: 'shake',
	7: 'arc',
	8: 'rise'
};
// 글자마다 움직이는 방식(글자를 span 으로 나눈다)
const PER_CHAR_STYLES: TextStyle[] = ['ripple', 'pen', 'squeeze', 'arc'];
const SHAKE_COUNT = 4;

export function textStyleOf(chapter: number): TextStyle {
	return TEXT_STYLE_BY_CHAPTER[chapter];
}

export function splitsChars(style: TextStyle, reduceMotion: boolean): boolean {
	return !reduceMotion && PER_CHAR_STYLES.includes(style);
}

/** 줄 안 조각: 공백은 그대로, 낱말은 글자 목록(줄 바꿈은 낱말 사이에서만) */
export type LinePart = { kind: 'space'; text: string } | { kind: 'word'; chars: CharSlot[] };
// line: 줄 번호 · inLine: 줄 안 글자 순번 · fromCenter: 줄 가운데에서 떨어진 글자 수 · index: 비트 전체 글자 순번
export type CharSlot = {
	text: string;
	line: number;
	inLine: number;
	fromCenter: number;
	index: number;
};

/** 시제품 splitChars: 줄마다 공백 기준으로 낱말을 나누고 글자에 순번을 단다 */
export function splitLines(lines: string[]): { parts: LinePart[][]; count: number } {
	let index = 0;
	const parts = lines.map((text, line) => {
		const words: LinePart[] = [];
		const lineChars: CharSlot[] = [];
		for (const part of text.split(/(\s+)/)) {
			if (part === '') continue;
			if (/^\s+$/.test(part)) {
				words.push({ kind: 'space', text: part });
				continue;
			}
			const chars: CharSlot[] = [];
			for (const character of part) {
				const slot: CharSlot = { text: character, line, inLine: 0, fromCenter: 0, index };
				index += 1;
				chars.push(slot);
				lineChars.push(slot);
			}
			words.push({ kind: 'word', chars });
		}
		lineChars.forEach((slot, i) => {
			slot.inLine = i;
			slot.fromCenter = i - (lineChars.length - 1) / 2;
		});
		return words;
	});
	return { parts, count: index };
}

export type TextFrame = { box: string; chars: string[] };

const HIDDEN: TextFrame = { box: 'opacity: 0', chars: [] };

function css(entries: [string, string][]): string {
	return entries.map(([name, value]) => `${name}: ${value}`).join('; ');
}

/**
 * 비트 글 상자 · 글자 style. active 가 아니면 opacity 0 만.
 * first: 첫 비트(들어오는 동안 이미 보임) · last: 끝 비트(나가지 않음) · chars: splitLines 결과 글자(나누지 않으면 빈 목록)
 */
export function textFrame(
	style: TextStyle,
	p: number,
	options: {
		active: boolean;
		first: boolean;
		last: boolean;
		reduceMotion: boolean;
		chars: CharSlot[];
	}
): TextFrame {
	if (!options.active) return HIDDEN;
	const { first, last, chars } = options;
	const leave = last ? 1 : 1 - phase(p, 0.9, 1);
	if (options.reduceMotion) {
		return {
			box: css([['opacity', String(Math.min(first ? 1 : phase(p, 0, 0.1), leave))]]),
			chars: []
		};
	}
	const count = chars.length;
	switch (style) {
		case 'rise': {
			// 아래에서 떠오르며 페이드
			const enter = first ? 1 : phase(p, 0, 0.14);
			return {
				box: css([
					['opacity', String(Math.min(enter, leave))],
					['transform', `translateY(${(16 * (1 - enter)).toFixed(2)}px)`]
				]),
				chars: []
			};
		}
		case 'ripple': {
			// 글자 줄이 잔물결처럼 흔들리며 나타났다 멈춤
			const enter = linear(p, 0, 0.24);
			const amplitude = 7 * Math.pow(1 - enter, 1.4);
			return {
				box: css([['opacity', String(Math.min(phase(p, 0, 0.06), leave))]]),
				chars: chars.map((item) => {
					const y = amplitude * Math.sin(item.inLine * 0.55 + item.line * 1.3 - enter * 16);
					return css([
						['transform', `translateY(${y.toFixed(2)}px)`],
						['opacity', String(clamp(enter * 3 - item.inLine / Math.max(1, count), 0, 1))]
					]);
				})
			};
		}
		case 'pen': {
			// 펜으로 쓰듯 한 글자씩
			const shown = linear(p, 0.03, 0.42) * count;
			return {
				box: css([['opacity', String(Math.min(phase(p, 0, 0.04), leave))]]),
				chars: chars.map((_, i) => {
					const k = clamp(shown - i, 0, 1);
					return css([
						['opacity', String(k)],
						['transform', `translateY(${(1.5 * (1 - k)).toFixed(2)}px)`]
					]);
				})
			};
		}
		case 'whiteFocus': {
			// 하얀 번짐 속에서 선명해짐
			const enter = phase(p, 0, 0.28);
			const entries: [string, string][] = [
				['opacity', String(Math.min(phase(p, 0, 0.06), leave))],
				[
					'filter',
					enter >= 1
						? 'none'
						: `blur(${(6 * (1 - enter)).toFixed(2)}px) brightness(${(1 + 0.8 * (1 - enter)).toFixed(2)})`
				]
			];
			if (enter < 1) {
				entries.push([
					'text-shadow',
					`0 0 ${(16 * (1 - enter)).toFixed(1)}px rgba(255, 255, 255, ${(0.95 * (1 - enter)).toFixed(2)})`
				]);
				entries.push(['color', 'rgb(255, 255, 255)']);
			}
			return { box: css(entries), chars: [] };
		}
		case 'squeeze': {
			// 넓은 자간에서 꽉 조여지며 자리 잡음(줄 가운데 쪽으로)
			const enter = phase(p, 0, 0.26);
			return {
				box: css([['opacity', String(Math.min(phase(p, 0, 0.06), leave))]]),
				chars: chars.map((item) =>
					css([
						['transform', `translateX(${(item.fromCenter * 7 * (1 - enter)).toFixed(2)}px)`],
						['opacity', String(lerp(0.35, 1, enter))]
					])
				)
			};
		}
		case 'shake': {
			// 좌우로 4번 미세하게 오가다 멈춤
			const k = linear(p, 0, 0.3);
			const x = 5 * Math.sin(k * SHAKE_COUNT * TAU) * (1 - k);
			return {
				box: css([
					['opacity', String(Math.min(phase(p, 0, 0.06), leave))],
					['transform', `translateX(${x.toFixed(2)}px)`]
				]),
				chars: []
			};
		}
		case 'arc': {
			// 원호를 따라 돌아 들어옴(글자마다 조금씩 늦게)
			return {
				box: css([['opacity', String(Math.min(phase(p, 0, 0.04), leave))]]),
				chars: chars.map((_, i) => {
					const start = 0.02 + (0.2 * i) / Math.max(1, count);
					const k = phase(p, start, start + 0.12);
					return css([
						['transform', `rotate(${(-38 * (1 - k)).toFixed(2)}deg)`],
						['opacity', String(k)]
					]);
				})
			};
		}
	}
}
