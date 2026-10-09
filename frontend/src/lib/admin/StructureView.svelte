<script lang="ts">
	import type { SchemaVersion, StoredField } from './datasets.ts';
	import { isFieldType } from './fieldRows.ts';
	import { constraintText, examplePublished, exampleRow } from './structurePreview.ts';
	import { FIELD_TYPE_LABELS, JSON_NOTE, TERM_HELP, TERMS } from './terms.ts';

	// 읽기 전용 보기. 구조는 붙여넣기 묶음의 "fields" 로만 바꾼다(D-28, 직접 수정 진입점 없음).
	type Props = {
		slug: string;
		schema: SchemaVersion | null;
	};
	let { slug, schema }: Props = $props();

	const JSON_INDENT = 2;

	const rowExample = $derived(
		schema === null ? '' : JSON.stringify(exampleRow(schema.fields), null, JSON_INDENT)
	);
	const publishedExample = $derived(
		schema === null ? '' : JSON.stringify(examplePublished(slug, schema.fields), null, JSON_INDENT)
	);

	function nameOf(field: StoredField): string {
		return typeof field.name === 'string' ? field.name : '';
	}

	function typeLabel(field: StoredField): string {
		return isFieldType(field.type) ? FIELD_TYPE_LABELS[field.type] : String(field.type);
	}

	function requiredText(field: StoredField): string {
		if (field.required === true) return TERMS.required;
		return field.required_if === undefined ? '' : '조건부 필수';
	}
</script>

<section class="structure">
	<header class="stage-head">
		<div>
			<h2>{TERMS.structure}</h2>
			<p class="muted desc">
				한 줄(JSON 객체 하나)에 들어갈 key 와 value 규칙입니다. 바꾸려면 "fields" 를 넣은 묶음을
				붙여 넣으세요. {JSON_NOTE}
			</p>
		</div>
		{#if schema !== null}
			<span class="chip quiet">v{schema.version}</span>
		{/if}
	</header>

	{#if schema === null}
		<p class="panel">
			아직 {TERMS.structure}가 없습니다. "fields" 가 든 묶음을 붙여 넣으면 함께 저장됩니다.
		</p>
	{:else}
		<div class="panel table-panel scroll-box">
			<table>
				<thead>
					<tr>
						<th scope="col">{TERMS.key}<span class="help">{TERM_HELP.key}</span></th>
						<th scope="col">{TERMS.label}<span class="help">{TERM_HELP.label}</span></th>
						<th scope="col">{TERMS.valueType}<span class="help">{TERM_HELP.valueType}</span></th>
						<th scope="col">{TERMS.required}<span class="help">{TERM_HELP.required}</span></th>
						<th scope="col" class="wide"
							>{TERMS.rowKey}<span class="help">{TERM_HELP.rowKey}</span></th
						>
						<th scope="col">{TERMS.constraints}<span class="help">{TERM_HELP.constraints}</span></th
						>
					</tr>
				</thead>
				<tbody>
					{#each schema.fields as field, index (index)}
						{@const constraints = constraintText(field)}
						<tr>
							<td class="mono key-name">{nameOf(field)}</td>
							<td>{typeof field.label === 'string' ? field.label : ''}</td>
							<td>{typeLabel(field)}</td>
							<td>{requiredText(field)}</td>
							<td>{field.key === true ? TERMS.rowKey : ''}</td>
							<td class:muted={constraints === ''}>{constraints === '' ? '없음' : constraints}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<details class="panel preview" open>
			<summary>이 구조로 만들어지는 데이터</summary>
			<div class="preview-columns">
				<section class="preview-column" aria-labelledby="row-example-title">
					<h3 id="row-example-title">한 줄 (JSON 객체)</h3>
					<pre class="code"><code>{rowExample}</code></pre>
				</section>
				<section class="preview-column" aria-labelledby="published-example-title">
					<h3 id="published-example-title">발행되는 파일 모양</h3>
					<pre class="code"><code>{publishedExample}</code></pre>
				</section>
			</div>
			<p class="muted note">
				발행하면 이 모양의 파일이 이야기 화면으로 전달됩니다. 이야기 화면은 rows 의 값을 읽어
				그립니다.
			</p>
		</details>
	{/if}
</section>

<style>
	.structure {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.stage-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 24px;
	}

	.desc {
		max-width: 64ch;
		margin-top: 6px;
	}

	.table-panel {
		padding: 0;
	}

	table {
		width: 100%;
		min-width: 860px;
		border-collapse: collapse;
	}

	th {
		padding: 14px 16px;
		border-bottom: 1px solid var(--line);
		font-size: 14px;
		font-weight: 600;
		text-align: left;
		vertical-align: top;
	}

	th.wide {
		min-width: 220px;
	}

	.help {
		display: block;
		margin-top: 4px;
		color: var(--muted);
		font-size: 13px;
		font-weight: 400;
	}

	td {
		padding: 12px 16px;
		border-bottom: 1px solid var(--line);
		vertical-align: top;
	}

	tbody tr:last-child td {
		border-bottom: none;
	}

	th:first-child,
	td:first-child {
		padding-left: 22px;
	}

	.key-name {
		font-weight: 500;
	}

	.preview {
		display: flex;
		flex-direction: column;
	}

	summary {
		font-size: 17px;
		font-weight: 600;
		cursor: pointer;
	}

	.preview-columns {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
		margin-top: 16px;
	}

	.preview-column {
		display: flex;
		flex: 1 1 360px;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}

	.preview-column h3 {
		font-size: 15px;
	}

	.code {
		max-height: 420px;
		margin: 0;
		padding: 14px 16px;
		overflow: auto;
		border-radius: 10px;
		background: var(--sunk);
		color: var(--ink);
		font-family: var(--font-mono);
		font-size: 13px;
		line-height: 1.5;
	}

	.note {
		margin-top: 14px;
		font-size: 14px;
	}

	@media (max-width: 640px) {
		.stage-head {
			flex-direction: column;
		}
	}
</style>
