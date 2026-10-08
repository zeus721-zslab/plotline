<script lang="ts">
	import { onMount } from 'svelte';
	import LoginForm from '#lib/admin/LoginForm.svelte';
	import { fetchSession, logout, type LogoutResult, type SessionResult } from '#lib/admin/api.ts';

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
		void checkSession();
	});
</script>

<svelte:head>
	<title>Plotline 관리자</title>
</svelte:head>

<main>
	{#if view.kind === 'checking'}
		<p>로그인 상태를 확인하는 중…</p>
	{:else if view.kind === 'error'}
		<p role="alert">{view.message}</p>
		<button type="button" onclick={checkSession}>다시 시도</button>
	{:else if view.kind === 'anonymous'}
		<h1>관리자 로그인</h1>
		<LoginForm onSuccess={checkSession} />
	{:else}
		<h1>Plotline 관리자</h1>
		<button type="button" onclick={handleLogout} disabled={loggingOut}>
			{loggingOut ? '로그아웃 중…' : '로그아웃'}
		</button>
		{#if logoutError}
			<p role="alert">{logoutError}</p>
		{/if}
	{/if}
</main>
