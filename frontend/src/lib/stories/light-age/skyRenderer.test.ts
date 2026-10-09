// 끝 장 그림자 반지름 단위 테스트(node:test, 의존성 없음).
// 실행: docker compose exec frontend node --test src/lib/stories/light-age/skyRenderer.test.ts
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SCENES } from './scenes.ts';
import { endShadowRadius, shadowCoverRadius } from './skyRenderer.ts';

const VIEWPORTS = [
	{ width: 390, height: 844 },
	{ width: 1280, height: 720 }
];
const PROGRESS_STEPS = 100;

describe('endShadowRadius', () => {
	for (const { width, height } of VIEWPORTS) {
		const m87Radius = SCENES.m87.shadow * Math.min(width, height);
		const cover = shadowCoverRadius(width, height);

		test(`${width}x${height}: 진행 0 은 12장 반지름, 1 은 화면을 덮는 반지름`, () => {
			assert.equal(endShadowRadius(m87Radius, cover, 0), m87Radius);
			assert.ok(Math.abs(endShadowRadius(m87Radius, cover, 1) - cover) < 1e-9);
		});

		test(`${width}x${height}: 진행 0 → 1 동안 단조 증가`, () => {
			let previous = endShadowRadius(m87Radius, cover, 0);
			for (let step = 1; step <= PROGRESS_STEPS; step += 1) {
				const radius = endShadowRadius(m87Radius, cover, step / PROGRESS_STEPS);
				assert.ok(radius > previous, `진행 ${step / PROGRESS_STEPS}: ${radius} <= ${previous}`);
				previous = radius;
			}
		});
	}
});
