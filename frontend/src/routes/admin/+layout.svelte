<script lang="ts">
	// 관리자 화면 전용 서체 · 토큰. 본문 서체 400·600·700 은 공개 레이아웃이 이미 불러오고, 500 과 고정폭은 여기서만 부른다.
	import '@fontsource/ibm-plex-sans-kr/500.css';
	import '@fontsource/ibm-plex-mono/400.css';
	import '@fontsource/ibm-plex-mono/500.css';
	import '#lib/admin/admin.css';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import LoginForm from '#lib/admin/LoginForm.svelte';
	import { TERMS } from '#lib/admin/terms.ts';
	import {
		fetchSession,
		logout,
		setUnauthorizedListener,
		type LogoutResult,
		type SessionResult
	} from '#lib/admin/api.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	type ViewState =
		| { kind: 'checking' }
		| { kind: 'anonymous' }
		| { kind: 'authenticated'; username: string }
		| { kind: 'error'; message: string };

	const SESSION_ERROR_MESSAGES = {
		network_error: '서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요.',
		unexpected: '로그인 상태를 확인하지 못했습니다.'
	} as const;
	const LOGOUT_ERROR_MESSAGES = {
		network_error: '서버에 연결할 수 없어 로그아웃하지 못했습니다.',
		unexpected: '로그아웃 중 알 수 없는 오류가 발생했습니다.'
	} as const;

	let view = $state<ViewState>({ kind: 'checking' });
	let loggingOut = $state(false);
	let logoutError = $state('');
	// 이야기 메뉴(/admin/stories 이하) 밖의 관리자 화면은 전부 데이터 묶음 메뉴다.
	const STORIES_ROUTE_PREFIX = '/admin/stories';
	// 미리보기는 공개 페이지와 같은 화면만 보이게 관리자 상단 바 · 틀 없이 그린다(로그인 확인은 같음).
	const PREVIEW_ROUTE_ID = '/admin/stories/[story]/preview';
	const routeId = $derived(page.route.id === null ? '' : page.route.id);
	const storiesCurrent = $derived(routeId.startsWith(STORIES_ROUTE_PREFIX));
	const datasetsCurrent = $derived(routeId.startsWith('/admin') && !storiesCurrent);
	const previewing = $derived(routeId === PREVIEW_ROUTE_ID);

	async function checkSession() {
		view = { kind: 'checking' };
		let result: SessionResult;
		try {
			result = await fetchSession();
		} catch (error) {
			// 네트워크 오류는 fetchSession 이 결과로 돌려주므로 여기 오는 것은 예상하지 못한 오류뿐이다.
			console.error('admin session check failed', error);
			view = { kind: 'error', message: SESSION_ERROR_MESSAGES.unexpected };
			return;
		}
		if (result.kind === 'network_error' || result.kind === 'unexpected') {
			view = { kind: 'error', message: SESSION_ERROR_MESSAGES[result.kind] };
			return;
		}
		view = result;
	}

	async function handleLogout() {
		loggingOut = true;
		logoutError = '';
		let result: LogoutResult;
		try {
			result = await logout();
		} finally {
			loggingOut = false;
		}
		if (result === 'success') {
			view = { kind: 'anonymous' };
			return;
		}
		logoutError = LOGOUT_ERROR_MESSAGES[result];
	}

	onMount(() => {
		// 하위 화면의 어떤 관리자 API 든 401 이면 로그인 화면으로 바꾼다. 하위 화면은 내려갔다가
		// 로그인 후 같은 URL 그대로 다시 그려진다.
		setUnauthorizedListener(() => {
			logoutError = '';
			view = { kind: 'anonymous' };
		});
		void checkSession();
		return () => setUnauthorizedListener(null);
	});
</script>

<svelte:head>
	<title>Plotline 관리자</title>
</svelte:head>

{#if view.kind === 'authenticated' && previewing}
	{@render children()}
{:else}
	<div class="admin">
		{#if view.kind === 'checking'}
			<main class="center">
				<p class="muted">로그인 상태를 확인하는 중…</p>
			</main>
		{:else if view.kind === 'error'}
			<main class="center">
				<div class="panel gate">
					<p class="status-bad" role="alert">{view.message}</p>
					<button type="button" class="btn" onclick={checkSession}>다시 시도</button>
				</div>
			</main>
		{:else if view.kind === 'anonymous'}
			<main class="center">
				<div class="panel gate">
					<h1 class="gate-title">관리자 로그인</h1>
					<LoginForm onSuccess={checkSession} />
				</div>
			</main>
		{:else}
			<header class="bar">
				<div class="bar-inner">
					<a class="brand" href={resolve('/admin')}>
						<svg class="logo" viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
							<rect width="28" height="28" rx="7" fill="var(--ink)" />
							<polyline
								points="6,19 11,13 15,16 21,8"
								fill="none"
								stroke="var(--accent)"
								stroke-width="2.2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
							<circle cx="21" cy="8" r="2.6" fill="var(--accent)" />
						</svg>
						<span class="brand-name">Plotline</span>
						<span class="brand-role">관리자</span>
					</a>
					<nav aria-label="관리자 메뉴">
						<a
							class="menu"
							href={resolve('/admin')}
							aria-current={datasetsCurrent ? 'page' : undefined}>{TERMS.dataset}</a
						>
						<a
							class="menu"
							href={resolve('/admin/stories')}
							aria-current={storiesCurrent ? 'page' : undefined}>{TERMS.story}</a
						>
					</nav>
					<span class="user">{view.username}</span>
					<button
						type="button"
						class="btn quiet small"
						onclick={handleLogout}
						disabled={loggingOut}
					>
						{loggingOut ? '로그아웃 중…' : '로그아웃'}
					</button>
				</div>
			</header>
			{#if logoutError}
				<p role="alert" class="alert bar-alert">{logoutError}</p>
			{/if}
			<main class="content">
				{@render children()}
			</main>
		{/if}
	</div>
{/if}

<style>
	/* 브라우저 기본 body 여백과 흰 바탕이 관리자 화면 가장자리에 보이지 않게 한다. 색은 admin.css 의 --ground 와 같다
	   (토큰은 .admin 안에서만 정의되어 body 에서는 읽을 수 없다). */
	:global(body:has(.admin)) {
		margin: 0;
		background: #eff1f4;
	}

	@media (prefers-color-scheme: dark) {
		:global(body:has(.admin)) {
			background: #10131a;
		}
	}

	.bar {
		background: var(--surface);
		border-bottom: 1px solid var(--line);
	}

	.bar-inner {
		display: flex;
		align-items: center;
		gap: 24px;
		max-width: 1200px;
		height: 60px;
		margin: 0 auto;
		padding: 0 32px;
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: var(--ink);
		text-decoration: none;
	}

	.logo {
		flex: none;
	}

	.brand-name {
		font-size: 17px;
		font-weight: 700;
	}

	.brand-role {
		font-size: 14px;
		color: var(--muted);
	}

	nav {
		flex: 1;
	}

	.menu {
		display: inline-flex;
		align-items: center;
		height: 36px;
		padding: 0 12px;
		border-radius: 8px;
		color: var(--muted);
		font-weight: 500;
		text-decoration: none;
	}

	.menu:hover,
	.menu[aria-current='page'] {
		background: var(--sunk);
		color: var(--ink);
	}

	.user {
		font-size: 14px;
		color: var(--muted);
	}

	.bar-alert {
		max-width: 1200px;
		margin: 16px auto 0;
	}

	.content {
		max-width: 1200px;
		margin: 0 auto;
		padding: 36px 32px 96px;
	}

	.center {
		display: grid;
		place-items: center;
		min-height: 100vh;
		padding: 32px 16px;
	}

	.gate {
		display: flex;
		flex-direction: column;
		gap: 20px;
		width: min(100%, 400px);
	}

	.gate-title {
		font-size: 22px;
	}

	@media (max-width: 640px) {
		.bar-inner {
			gap: 12px;
			padding: 0 16px;
		}

		.brand-role {
			display: none;
		}

		.content {
			padding: 24px 16px 96px;
		}
	}
</style>
