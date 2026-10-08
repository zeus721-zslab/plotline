// 관리자 인증 API 호출. 세션은 HttpOnly 쿠키라 스크립트에서 읽지 않고, 같은 출처 요청에만 실어 보낸다.

const ADMIN_API_BASE = '/api/admin';
const REQUEST_CREDENTIALS: RequestCredentials = 'same-origin';

export type LoginResult =
	| 'success'
	| 'invalid_credentials'
	| 'disabled'
	| 'forbidden'
	| 'busy'
	| 'network_error'
	| 'unexpected';

export type SessionResult =
	| { kind: 'authenticated'; username: string }
	| { kind: 'anonymous' }
	| { kind: 'network_error' }
	| { kind: 'unexpected' };

export type LogoutResult = 'success' | 'network_error' | 'unexpected';

const LOGIN_PATH = '/login';

// 세션 만료 등으로 관리자 API 가 401 을 돌려주면 화면 전체를 로그인으로 바꾸기 위한 알림(관리자 레이아웃이 등록).
// 로그인 요청의 401 은 아이디·비밀번호 오류라 알리지 않는다.
let unauthorizedListener: (() => void) | null = null;

export function setUnauthorizedListener(listener: (() => void) | null): void {
	unauthorizedListener = listener;
}

// fetch 는 서버 응답이 없을 때(연결 실패·오프라인)만 TypeError 로 reject 한다.
function isNetworkError(error: unknown): boolean {
	return error instanceof TypeError;
}

export async function request(path: string, init: RequestInit = {}): Promise<Response | null> {
	let response: Response;
	try {
		response = await fetch(`${ADMIN_API_BASE}${path}`, {
			...init,
			credentials: REQUEST_CREDENTIALS
		});
	} catch (error) {
		if (isNetworkError(error)) {
			console.warn('admin api network error', error);
			return null;
		}
		throw error;
	}
	if (response.status === 401 && path !== LOGIN_PATH && unauthorizedListener !== null) {
		unauthorizedListener();
	}
	return response;
}

export type JsonBody = { kind: 'json'; body: unknown } | { kind: 'invalid_json' };

export async function readJson(response: Response): Promise<JsonBody> {
	try {
		return { kind: 'json', body: await response.json() };
	} catch (error) {
		if (error instanceof SyntaxError) {
			console.warn('admin api returned invalid json', error);
			return { kind: 'invalid_json' };
		}
		throw error;
	}
}

function isMeBody(body: unknown): body is { username: string } {
	return (
		typeof body === 'object' &&
		body !== null &&
		'username' in body &&
		typeof body.username === 'string'
	);
}

export async function fetchSession(): Promise<SessionResult> {
	const response = await request('/me');
	if (response === null) return { kind: 'network_error' };
	if (response.status === 401) return { kind: 'anonymous' };
	if (!response.ok) return { kind: 'unexpected' };
	let body: unknown;
	try {
		body = await response.json();
	} catch (error) {
		if (error instanceof SyntaxError) {
			console.warn('admin api returned invalid json', error);
			return { kind: 'unexpected' };
		}
		throw error;
	}
	return isMeBody(body)
		? { kind: 'authenticated', username: body.username }
		: { kind: 'unexpected' };
}

export async function login(username: string, password: string): Promise<LoginResult> {
	const response = await request(LOGIN_PATH, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ username, password })
	});
	if (response === null) return 'network_error';
	switch (response.status) {
		case 204:
			return 'success';
		case 401:
			return 'invalid_credentials';
		case 403:
			return 'forbidden';
		case 429:
			return 'busy';
		case 503:
			return 'disabled';
		default:
			return 'unexpected';
	}
}

export async function logout(): Promise<LogoutResult> {
	const response = await request('/logout', { method: 'POST' });
	if (response === null) return 'network_error';
	// 401 은 세션이 이미 만료된 경우라 로그아웃된 상태와 같다.
	if (response.status === 204 || response.status === 401) return 'success';
	return 'unexpected';
}
