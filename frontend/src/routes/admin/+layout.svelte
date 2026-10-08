<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import LoginForm from '#lib/admin/LoginForm.svelte';
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

<div class="admin">
	{#if view.kind === 'checking'}
		<main>
			<p>로그인 상태를 확인하는 중…</p>
		</main>
	{:else if view.kind === 'error'}
		<main>
			<p role="alert">{view.message}</p>
			<button type="button" onclick={checkSession}>다시 시도</button>
		</main>
	{:else if view.kind === 'anonymous'}
		<main>
			<h1>관리자 로그인</h1>
			<LoginForm onSuccess={checkSession} />
		</main>
	{:else}
		<header class="admin-bar">
			<strong>Plotline 관리자</strong>
			<nav>
				<a href={resolve('/admin')}>데이터셋</a>
			</nav>
			<span class="admin-user">{view.username}</span>
			<button type="button" onclick={handleLogout} disabled={loggingOut}>
				{loggingOut ? '로그아웃 중…' : '로그아웃'}
			</button>
		</header>
		{#if logoutError}
			<p role="alert" class="admin-bar-alert">{logoutError}</p>
		{/if}
		<main>
			{@render children()}
		</main>
	{/if}
</div>

<style>
	/* 관리자 화면 전용 최소 스타일. 모두 .admin 아래로 한정해 공개 페이지에 영향을 주지 않는다. */
	.admin {
		--admin-border: #c8ccd2;
		--admin-muted: #5b6270;
		--admin-accent: #1f5fbf;
		--admin-error: #b42318;
		--admin-success: #1a7f37;
		font-family: system-ui, sans-serif;
		line-height: 1.5;
		color: #1d2330;
	}

	.admin main {
		max-width: 64rem;
		margin: 0 auto;
		padding: 1rem;
	}

	.admin-bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--admin-border);
	}

	.admin-bar nav {
		flex: 1;
	}

	.admin-user {
		color: var(--admin-muted);
	}

	.admin-bar-alert {
		margin: 0.5rem 1rem;
	}

	.admin :global(a) {
		color: var(--admin-accent);
	}

	.admin :global(input),
	.admin :global(select),
	.admin :global(textarea),
	.admin :global(button) {
		font: inherit;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--admin-border);
		border-radius: 4px;
		box-sizing: border-box;
	}

	.admin :global(button) {
		background: #f4f5f7;
		cursor: pointer;
	}

	.admin :global(button:disabled) {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.admin :global(table) {
		width: 100%;
		border-collapse: collapse;
	}

	.admin :global(th),
	.admin :global(td) {
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--admin-border);
		text-align: left;
		vertical-align: top;
	}

	.admin :global([role='alert']) {
		color: var(--admin-error);
	}

	.admin :global(.admin-success) {
		color: var(--admin-success);
	}

	.admin :global(.admin-muted) {
		color: var(--admin-muted);
	}

	.admin :global(form label) {
		display: inline-flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-right: 0.75rem;
	}

	.admin :global(form label.admin-check) {
		flex-direction: row;
		align-items: center;
		margin-right: 0;
	}
</style>
