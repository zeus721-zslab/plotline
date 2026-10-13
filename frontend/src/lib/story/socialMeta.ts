// 링크 공유 미리보기(Open Graph) 값. 홈과 각 편 라우트가 SocialMeta 로 프리렌더 HTML 에 싣는다.
// 제목 · 요약은 git 추적 로컬 사본 static/data/stories/index.json 을 빌드 때 읽는다(D-47 보완 · 결정 A).
// 운영 목록은 발행 때 백엔드가 만들므로, 운영에서 제목 · 요약을 바꾸면 다음 빌드까지 OG 는 이 사본 기준으로 남는다.
import storyIndex from '../../../static/data/stories/index.json' with { type: 'json' };
import type { RegisteredStory } from '../stories/registry.ts';

export const SITE_URL = 'https://plotline.duckdns.org';
// og 이미지는 static/og/<key>.jpg(각 편 첫 화면 촬영 1200×630). PNG 는 그림이 많은 편이 300KB 를 넘어 JPG(품질 85)로 통일했다.
export const OG_IMAGE_EXTENSION = 'jpg';

const HOME_TITLE = 'Plotline';
const HOME_DESCRIPTION = '숫자 몇 개로 읽는 긴 이야기';

export type SocialMetaKey = 'home' | RegisteredStory;

export type SocialMeta = { title: string; description: string; url: string; image: string };

function ogImageUrl(key: string): string {
	return `${SITE_URL}/og/${key}.${OG_IMAGE_EXTENSION}`;
}

export function socialMetaFor(key: SocialMetaKey): SocialMeta {
	if (key === 'home') {
		return {
			title: HOME_TITLE,
			description: HOME_DESCRIPTION,
			url: `${SITE_URL}/`,
			image: ogImageUrl('home')
		};
	}
	const entry = storyIndex.stories.find((candidate) => candidate.story === key);
	// 목록에 없는 키를 빈 값으로 넘기면 빈 미리보기가 조용히 배포되므로, 프리렌더(빌드)가 실패하도록 던진다.
	if (entry === undefined) throw new Error(`story not in index.json: ${key}`);
	// 프리렌더 출력이 stories/<key>.html(끝 슬래시 없음)이고 nginx 가 $uri.html 로 내주므로 주소도 끝 슬래시 없이 둔다.
	return {
		title: entry.title,
		description: entry.summary,
		url: `${SITE_URL}/stories/${key}`,
		image: ogImageUrl(key)
	};
}
