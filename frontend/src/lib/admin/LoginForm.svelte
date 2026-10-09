<script lang="ts">
	import { login, type LoginResult } from './api.ts';

	type Props = { onSuccess: () => void };
	let { onSuccess }: Props = $props();

	const FAILURE_MESSAGES: Record<Exclude<LoginResult, 'success'>, string> = {
		invalid_credentials: '아이디 또는 비밀번호가 올바르지 않습니다.',
		disabled: '관리자 로그인이 비활성 상태입니다. 서버 설정을 확인하세요.',
		forbidden: '허용되지 않은 접속 주소에서 보낸 요청입니다.',
		busy: '로그인 요청이 몰려 있습니다. 잠시 후 다시 시도하세요.',
		network_error: '서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요.',
		unexpected: '로그인 중 알 수 없는 오류가 발생했습니다.'
	};

	let username = $state('');
	let password = $state('');
	let submitting = $state(false);
	let errorMessage = $state('');

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		submitting = true;
		errorMessage = '';
		let result: LoginResult;
		try {
			result = await login(username, password);
		} finally {
			submitting = false;
		}
		if (result === 'success') {
			password = '';
			onSuccess();
			return;
		}
		errorMessage = FAILURE_MESSAGES[result];
	}
</script>

<form class="login" onsubmit={handleSubmit}>
	<label class="label">
		아이디
		<input class="field" bind:value={username} name="username" autocomplete="username" required />
	</label>
	<label class="label">
		비밀번호
		<input
			class="field"
			bind:value={password}
			name="password"
			type="password"
			autocomplete="current-password"
			required
		/>
	</label>
	<button type="submit" class="btn primary" disabled={submitting}
		>{submitting ? '로그인 중…' : '로그인'}</button
	>
	{#if errorMessage}
		<p class="alert" role="alert">{errorMessage}</p>
	{/if}
</form>

<style>
	.login {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
</style>
