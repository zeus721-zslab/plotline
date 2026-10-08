// 서버 시각(UTC, ISO 8601 + Z)을 브라우저 지역 시간으로 표시한다. 저장 기준(UTC)과 표시 기준(지역)을 여기서만 바꾼다.

const LOCAL_DATE_TIME = new Intl.DateTimeFormat(undefined, {
	dateStyle: 'medium',
	timeStyle: 'short'
});

export function formatLocalDateTime(isoUtc: string): string {
	const date = new Date(isoUtc);
	return Number.isNaN(date.getTime()) ? isoUtc : LOCAL_DATE_TIME.format(date);
}
