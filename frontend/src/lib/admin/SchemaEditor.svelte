<script lang="ts">
	import { saveSchema, type SaveSchemaResult, type SchemaVersion } from './datasets.ts';
	import {
		FIELD_TYPES,
		KEY_DISALLOWED_TYPES,
		TYPE_OPTION_ATTRIBUTES,
		emptyRow,
		fieldToRow,
		isFieldType,
		rowToField,
		withType,
		type EditorRow,
		type OptionAttribute
	} from './fieldRows.ts';

	type Props = {
		slug: string;
		initialSchema: SchemaVersion | null;
		onSaved: (schema: SchemaVersion) => void;
	};
	let { slug, initialSchema, onSaved }: Props = $props();

	type SaveMessage =
		| { kind: 'none' }
		| { kind: 'saved'; version: number }
		| { kind: 'problems'; problems: string[] }
		| { kind: 'error'; message: string };

	const SAVE_ERROR_MESSAGES: Record<
		Exclude<SaveSchemaResult['kind'], 'ok' | 'invalid_fields' | 'unauthorized'>,
		string
	> = {
		unchanged: '변경된 내용이 없습니다',
		not_found: '데이터셋이 없습니다. 목록에서 다시 선택하세요.',
		invalid_input: '필드는 1개 이상 100개 이하로 저장할 수 있습니다.',
		version_conflict: '다른 저장과 버전이 겹쳤습니다. 새로 고친 뒤 다시 저장하세요.',
		forbidden: '허용되지 않은 접속 주소에서 보낸 요청입니다.',
		network_error: '서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요.',
		unexpected: '정의를 저장하지 못했습니다.'
	};

	function initialRows(): EditorRow[] {
		// 정의가 없으면 빈 행 1개로 시작하고, 있으면 최신 정의를 불러와 편집한다.
		return initialSchema === null ? [emptyRow()] : initialSchema.fields.map(fieldToRow);
	}

	let rows = $state<EditorRow[]>(initialRows());
	let saving = $state(false);
	let message = $state<SaveMessage>({ kind: 'none' });

	function hasOption(row: EditorRow, attribute: OptionAttribute): boolean {
		return TYPE_OPTION_ATTRIBUTES[row.type].includes(attribute);
	}

	function addRow() {
		rows = [...rows, emptyRow()];
	}

	function removeRow(index: number) {
		rows = rows.filter((_, position) => position !== index);
	}

	function moveRow(index: number, offset: -1 | 1) {
		const target = index + offset;
		if (target < 0 || target >= rows.length) return;
		const reordered = [...rows];
		[reordered[index], reordered[target]] = [reordered[target], reordered[index]];
		rows = reordered;
	}

	function changeType(index: number, event: Event & { currentTarget: HTMLSelectElement }) {
		const type = event.currentTarget.value;
		if (!isFieldType(type)) return;
		rows[index] = withType(rows[index], type);
	}

	async function handleSave(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		message = { kind: 'none' };
		let result: SaveSchemaResult;
		try {
			result = await saveSchema(slug, rows.map(rowToField));
		} finally {
			saving = false;
		}
		if (result.kind === 'unauthorized') return;
		if (result.kind === 'ok') {
			message = { kind: 'saved', version: result.schema.version };
			onSaved(result.schema);
			return;
		}
		if (result.kind === 'invalid_fields') {
			message = { kind: 'problems', problems: result.problems };
			return;
		}
		message = { kind: 'error', message: SAVE_ERROR_MESSAGES[result.kind] };
	}
</script>

<form onsubmit={handleSave}>
	<h2>필드 정의</h2>
	<p class="admin-muted">행 순서가 key 조합 순서입니다. 규칙 검사는 저장할 때 서버가 합니다.</p>
	<table class="field-table">
		<thead>
			<tr>
				<th scope="col">순서</th>
				<th scope="col">name</th>
				<th scope="col">label</th>
				<th scope="col">type</th>
				<th scope="col">필수 · key</th>
				<th scope="col">옵션</th>
				<th scope="col"><span class="visually-hidden">삭제</span></th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row, index (row.id)}
				<tr>
					<td class="order">
						<button
							type="button"
							onclick={() => moveRow(index, -1)}
							disabled={index === 0}
							aria-label="위로">↑</button
						>
						<button
							type="button"
							onclick={() => moveRow(index, 1)}
							disabled={index === rows.length - 1}
							aria-label="아래로">↓</button
						>
					</td>
					<td>
						<input bind:value={row.name} aria-label="name" autocomplete="off" />
					</td>
					<td>
						<input bind:value={row.label} aria-label="label(선택)" autocomplete="off" />
					</td>
					<td>
						<select
							value={row.type}
							onchange={(event) => changeType(index, event)}
							aria-label="type"
						>
							{#each FIELD_TYPES as fieldType (fieldType)}
								<option value={fieldType}>{fieldType}</option>
							{/each}
						</select>
					</td>
					<td class="flags">
						<label class="admin-check">
							<input type="checkbox" bind:checked={row.required} />
							필수
						</label>
						<label class="admin-check">
							<input
								type="checkbox"
								bind:checked={row.key}
								disabled={KEY_DISALLOWED_TYPES.has(row.type)}
							/>
							key
						</label>
					</td>
					<td class="options">
						{#if hasOption(row, 'min')}
							<label>min <input bind:value={row.min} inputmode="decimal" /></label>
						{/if}
						{#if hasOption(row, 'max')}
							<label>max <input bind:value={row.max} inputmode="decimal" /></label>
						{/if}
						{#if hasOption(row, 'unit')}
							<label>unit <input bind:value={row.unit} /></label>
						{/if}
						{#if hasOption(row, 'max_length')}
							<label>max_length <input bind:value={row.maxLength} inputmode="numeric" /></label>
						{/if}
						{#if hasOption(row, 'options')}
							<label>
								options(한 줄에 1개)
								<textarea bind:value={row.options} rows="3"></textarea>
							</label>
						{/if}
					</td>
					<td>
						<button type="button" onclick={() => removeRow(index)}>삭제</button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p>
		<button type="button" onclick={addRow}>행 추가</button>
		<button type="submit" disabled={saving}>{saving ? '저장 중…' : '정의 저장(새 버전)'}</button>
	</p>
	{#if message.kind === 'saved'}
		<p class="admin-success" role="status">정의 v{message.version} 저장됨</p>
	{:else if message.kind === 'problems'}
		<div role="alert">
			<p>정의에 문제가 있습니다.</p>
			<ul>
				{#each message.problems as problem, problemIndex (problemIndex)}
					<li>{problem}</li>
				{/each}
			</ul>
		</div>
	{:else if message.kind === 'error'}
		<p role="alert">{message.message}</p>
	{/if}
</form>

<style>
	.field-table input:not([type='checkbox']) {
		width: 100%;
		min-width: 6rem;
	}

	.order {
		white-space: nowrap;
	}

	.flags,
	.options {
		white-space: nowrap;
	}

	.options label {
		margin-bottom: 0.25rem;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
