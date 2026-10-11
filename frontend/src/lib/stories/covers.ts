// 첫 화면 표지의 스토리별 선택(테마 클래스 · 미리보기 그림). 공통 표지 카드는 스토리 전용 부품을 직접 부르지 않고 여기서 받는다.
import type { Component } from 'svelte';
import BlackHolePreview from './black-hole/CoverPreview.svelte';
import './black-hole/theme.css';
import PeriodicPreview from './element-discovery/PeriodicPreview.svelte';
import './element-discovery/theme.css';
import LightAgePreview from './light-age/CoverPreview.svelte';
import './light-age/theme.css';
import StarryNightPreview from './starry-night/CoverPreview.svelte';
import './starry-night/theme.css';
import SunkenCitiesPreview from './sunken-cities/CoverPreview.svelte';
import './sunken-cities/theme.css';
import TitanicPreview from './titanic/CoverPreview.svelte';
import './titanic/theme.css';

export type StoryCover = { themeClass: string; preview: Component | null };

const COVERS: Record<string, StoryCover> = {
	'element-discovery': { themeClass: 'story-theme', preview: PeriodicPreview },
	'light-age': { themeClass: 'light-age-theme', preview: LightAgePreview },
	'black-hole': { themeClass: 'black-hole-theme', preview: BlackHolePreview },
	'sunken-cities': { themeClass: 'sunken-cities-theme', preview: SunkenCitiesPreview },
	'starry-night': { themeClass: 'starry-night-theme', preview: StarryNightPreview },
	titanic: { themeClass: 'titanic-theme', preview: TitanicPreview }
};

// 목록에 새 스토리가 먼저 올라와도 표지는 그려지도록 1편 테마 · 그림 없음으로 둔다.
const FALLBACK_COVER: StoryCover = { themeClass: 'story-theme', preview: null };

export function storyCover(story: string): StoryCover {
	return story in COVERS ? COVERS[story] : FALLBACK_COVER;
}
