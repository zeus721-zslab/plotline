// 구성 문구와 데이터 대조(순수 함수). 문구에 적은 연도·고대 여부·강조 칸이 데이터와 다르거나
// 출처·그림 id 가 목록에 없으면
// 불일치로 돌려준다. 화면은 불일치가 있는 단계의 문구를 보여 주지 않는다.
import type { StoryImage } from '../../story/storyMedia.ts';
import type { StoryConfig } from './config.ts';
import type { StoryElement } from './elements.ts';
import { isStorySvgId } from './stepMedia.ts';
import { highlightNumbers, isKnownAt, type StepDefinition } from './steps.ts';

// target: 단계 id
export type StoryMismatch = { target: string; message: string };

function dataYearText(element: StoryElement): string {
	return element.discovery.era === 'ancient' ? 'ancient' : String(element.discovery.year);
}

function checkStep(
	step: StepDefinition,
	byNumber: Map<number, StoryElement>,
	elements: StoryElement[],
	copySourceIds: Set<string>
): string[] {
	const problems: string[] = [];
	const find = (atomicNumber: number, role: string): StoryElement | null => {
		const element = byNumber.get(atomicNumber);
		if (element === undefined) problems.push(`${role} ${atomicNumber}: not in data`);
		return element === undefined ? null : element;
	};

	for (const check of step.checks) {
		const element = find(check.atomicNumber, 'check');
		if (element === null) continue;
		if (element.discovery.era !== 'dated' || element.discovery.year !== check.year) {
			problems.push(
				`check ${check.atomicNumber}: copy year ${check.year}, data year ${dataYearText(element)}`
			);
		}
	}
	for (const atomicNumber of step.mustBeAncient) {
		const element = find(atomicNumber, 'mustBeAncient');
		if (element !== null && element.discovery.era !== 'ancient') {
			problems.push(`mustBeAncient ${atomicNumber}: data year ${dataYearText(element)}`);
		}
	}
	// 예언 칸은 그 단계에서 아직 꺼져 있어야 하고, 나머지 강조 칸은 그 단계에 켜져 있어야 한다.
	const predicted = new Set(step.predicted);
	for (const atomicNumber of step.predicted) {
		const element = find(atomicNumber, 'predicted');
		if (element !== null && isKnownAt(element, step.until)) {
			problems.push(
				`predicted ${atomicNumber}: already known (data year ${dataYearText(element)})`
			);
		}
	}
	for (const atomicNumber of highlightNumbers(elements, step.highlight)) {
		if (predicted.has(atomicNumber)) continue;
		const element = find(atomicNumber, 'highlight');
		if (element !== null && !isKnownAt(element, step.until)) {
			problems.push(
				`highlight ${atomicNumber}: not known yet (data year ${dataYearText(element)})`
			);
		}
	}
	for (const atomicNumber of step.chips) {
		const element = find(atomicNumber, 'chips');
		if (element !== null && !isKnownAt(element, step.until)) {
			problems.push(`chips ${atomicNumber}: not known yet (data year ${dataYearText(element)})`);
		}
	}
	for (const sourceId of step.sources) {
		if (!copySourceIds.has(sourceId)) problems.push(`source ${sourceId}: not in copySources`);
	}
	return problems;
}

// 곁들임 카드의 출처·이미지와 단계 그림이 실제로 있는지 확인한다.
function checkAsideAndMedia(
	step: StepDefinition,
	copySourceIds: Set<string>,
	imageIds: Set<string>
): string[] {
	const problems: string[] = [];
	if (step.aside !== null) {
		for (const sourceId of step.aside.sources) {
			if (!copySourceIds.has(sourceId)) {
				problems.push(`aside source ${sourceId}: not in copySources`);
			}
		}
		if (step.aside.image !== null && !imageIds.has(step.aside.image)) {
			problems.push(`aside image ${step.aside.image}: not in images`);
		}
	}
	if (step.media !== null) {
		const exists =
			step.media.type === 'image' ? imageIds.has(step.media.id) : isStorySvgId(step.media.id);
		if (!exists) problems.push(`media ${step.media.type} ${step.media.id}: not found`);
	}
	return problems;
}

export function findStoryMismatches(
	elements: StoryElement[],
	config: StoryConfig,
	images: StoryImage[]
): StoryMismatch[] {
	const byNumber = new Map(elements.map((element) => [element.atomicNumber, element]));
	const copySourceIds = new Set(config.copySources.map((source) => source.id));
	const imageIds = new Set(images.map((image) => image.id));
	const mismatches: StoryMismatch[] = config.steps.flatMap((step) =>
		[
			...checkStep(step, byNumber, elements, copySourceIds),
			...checkAsideAndMedia(step, copySourceIds, imageIds)
		].map((message) => ({
			target: step.id,
			message
		}))
	);
	return mismatches;
}
