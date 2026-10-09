// 발행 계약 형식 판정(published.ts) 단위 테스트(node:test, 의존성 없음).
// question 은 D-35 로 삭제했지만, 운영 발행 볼륨의 옛 파일에는 남아 있을 수 있다.
// 판별 함수가 모르는 키를 거부하지 않고 통과시켜야 운영 호환이 유지된다.
// 실행: docker compose exec frontend node --test "src/**/*.test.ts"
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isPublishedStory, isStoryIndex } from './published.ts';

describe('옛 question 필드가 있는 발행 파일도 통과', () => {
	test('isPublishedStory — question 이 남은 스토리 파일', () => {
		const legacyStory = {
			story: 'element-discovery',
			title: '원소는 언제 발견됐을까',
			question: '원소 118개는 언제 발견됐을까',
			published_at: '2026-10-08T17:17:08Z',
			datasets: {
				elements_ko: { version: 1, path: '/data/datasets/elements_ko/v1.json' }
			}
		};
		assert.ok(isPublishedStory(legacyStory));
	});

	test('isStoryIndex — question 이 남은 목록 항목', () => {
		const legacyIndex = {
			stories: [
				{
					story: 'element-discovery',
					title: '원소는 언제 발견됐을까',
					question: '원소 118개는 언제 발견됐을까',
					summary: '고대부터 오늘까지, 주기율표가 채워진 순서를 따라갑니다.',
					published_at: '2026-10-08T17:17:08Z'
				}
			]
		};
		assert.ok(isStoryIndex(legacyIndex));
	});
});
