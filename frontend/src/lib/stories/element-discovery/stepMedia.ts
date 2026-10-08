// 원소 발견사 단계 그림 해석(순수 함수): 코드로 그린 SVG 연출 id 와 단계 그림 정의를 화면 값으로 바꾸기.
import type { StoryImage } from '../../story/storyMedia.ts';
import type { StepMedia } from '../../story/storySteps.ts';

// 코드로 그린 연출. 화면(StepMedia.svelte)이 id 마다 컴포넌트를 고른다.
export const STORY_SVG_IDS = ['spectrum', 'eclipse', 'leadbox'] as const;
export type StorySvgId = (typeof STORY_SVG_IDS)[number];

export type ResolvedMedia = { type: 'image'; image: StoryImage } | { type: 'svg'; id: StorySvgId };

export function isStorySvgId(value: string): value is StorySvgId {
	return STORY_SVG_IDS.some((id) => id === value);
}

/** 단계 그림 정의를 화면에 쓸 값으로 바꾼다. 찾을 수 없는 id 는 null(대조 함수가 따로 불일치로 알린다). */
export function resolveMedia(
	media: StepMedia | null,
	imagesById: Map<string, StoryImage>
): ResolvedMedia | null {
	if (media === null) return null;
	if (media.type === 'svg') return isStorySvgId(media.id) ? { type: 'svg', id: media.id } : null;
	const image = imagesById.get(media.id);
	return image === undefined ? null : { type: 'image', image };
}
