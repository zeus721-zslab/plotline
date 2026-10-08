import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// 스토리 페이지는 프리렌더, /admin 이하는 SPA fallback(200.html)으로 처리
			adapter: adapter({ fallback: '200.html' })
		})
	],
	server: {
		host: '0.0.0.0',
		port: 5173,
		strictPort: true,
		// Docker Desktop(Windows) 바인드 마운트는 파일 변경 이벤트가 전달되지 않아 폴링 사용
		watch: { usePolling: process.env.DEV_WATCH_POLLING === '1' },
		proxy: {
			'/api': {
				target: process.env.API_PROXY_TARGET ?? 'http://localhost:8000',
				changeOrigin: true
			}
		}
	}
});
