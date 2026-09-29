<template>
	<Dialog :visible="props.visible"
			modal
			dismissableMask
			header="Configure Import"
			:style="{ width: '26rem' }"
			class="csv-columns-dialog"
			@update:visible="onVisibleChange"
	>
		<p class="dialog-hint">The importer reads these columns from your order exports — if a column gets renamed, update its header here.</p>

		<div class="column-fields">
			<div class="column-field" v-for="field in FIELDS" :key="field.key">
				<div class="field-heading">
					<label :for="`csv-column-${field.key}`" class="field-label">{{ field.label }}</label>

					<i v-if="isCustom(field.key)"
						class="pi pi-undo restore-default"
						role="button"
						tabindex="0"
						v-tooltip.top="'Restore default'"
						@click="restoreDefault(field.key)"
						@keydown.enter="restoreDefault(field.key)" />
				</div>

				<p class="field-help">{{ field.help }}</p>

				<InputText :id="`csv-column-${field.key}`"
						v-model="draft[field.key]"
						size="small"
						class="field-input"
						:placeholder="DEFAULT_COLUMNS[field.key]" />

				<p v-if="duplicateNotices[field.key]" class="duplicate-notice">
					<i class="pi pi-exclamation-circle" /> {{ duplicateNotices[field.key] }}
				</p>
			</div>
		</div>

		<template #footer>
			<div class="dialog-footer">
				<Button label="Reset all to defaults" severity="secondary" variant="text" size="small" @click="resetAll" />

				<div class="footer-actions">
					<Button label="Cancel" severity="secondary" variant="text" size="small" @click="close" />
					<Button label="Save" size="small" @click="save" />
				</div>
			</div>
		</template>
	</Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CsvColumns } from '../../shared/ipc'

/** The fixed fields the importer reads — only the header name is editable. */
const FIELDS: ReadonlyArray<{ key: keyof CsvColumns; label: string; help: string }> = [
	{ key: 'orderName', label: 'Order name', help: 'Used in copy file names' },
	{ key: 'sku', label: 'SKU', help: 'Matches print files to order lines' },
	{ key: 'quantity', label: 'Quantity', help: 'How many copies are made' },
	{ key: 'billingName', label: 'Billing name', help: 'Shown in file names' },
	{ key: 'paidDate', label: 'Paid date', help: 'Shown in file names' },
	{ key: 'paymentMethod', label: 'Payment method', help: 'Shown in file names' }
]

/** Mirrors DEFAULT_CSV_COLUMNS in SettingsService — placeholder + restore target. */
const DEFAULT_COLUMNS: CsvColumns = {
	orderName: 'Name',
	sku: 'Lineitem sku',
	quantity: 'Lineitem quantity',
	billingName: 'Billing Name',
	paidDate: 'Paid at',
	paymentMethod: 'Payment Method'
}

const props = defineProps<{ visible: boolean; columns: CsvColumns }>()
const emit = defineEmits<{ 'update:visible': [visible: boolean]; 'save': [columns: CsvColumns] }>()

/** Local draft — discarded on Cancel/✕/Esc/overlay; re-snapshotted on open. */
const draft = ref<CsvColumns>({ ...DEFAULT_COLUMNS })

watch(() => props.visible, (visible) => {
	if (visible) draft.value = { ...props.columns }
}, { immediate: true })

/** True when the field holds a custom header (non-blank and different). */
function isCustom(key: keyof CsvColumns): boolean {
	const value = (draft.value[key] ?? '').trim()
	return value !== '' && value !== DEFAULT_COLUMNS[key]
}

function restoreDefault(key: keyof CsvColumns) {
	draft.value[key] = DEFAULT_COLUMNS[key]
}

function resetAll() {
	draft.value = { ...DEFAULT_COLUMNS }
}

/** "Also used for SKU" hints — a duplicate mapping is allowed but flagged. */
const duplicateNotices = computed<Partial<Record<keyof CsvColumns, string>>>(() => {
	const labelsByHeader = new Map<string, string[]>()
	for (const field of FIELDS) {
		const header = ((draft.value[field.key] ?? '').trim() || DEFAULT_COLUMNS[field.key]).toLowerCase()
		labelsByHeader.set(header, [...(labelsByHeader.get(header) ?? []), field.label])
	}

	const notices: Partial<Record<keyof CsvColumns, string>> = {}
	for (const field of FIELDS) {
		const header = ((draft.value[field.key] ?? '').trim() || DEFAULT_COLUMNS[field.key]).toLowerCase()
		const others = (labelsByHeader.get(header) ?? []).filter((label) => label !== field.label)
		if (others.length > 0) notices[field.key] = `Also used for ${others.join(', ')}`
	}
	return notices
})

function save() {
	// Trim + blank → default (also enforced in SettingsService).
	const edited: CsvColumns = {
		orderName: (draft.value.orderName ?? '').trim() || DEFAULT_COLUMNS.orderName,
		sku: (draft.value.sku ?? '').trim() || DEFAULT_COLUMNS.sku,
		quantity: (draft.value.quantity ?? '').trim() || DEFAULT_COLUMNS.quantity,
		billingName: (draft.value.billingName ?? '').trim() || DEFAULT_COLUMNS.billingName,
		paidDate: (draft.value.paidDate ?? '').trim() || DEFAULT_COLUMNS.paidDate,
		paymentMethod: (draft.value.paymentMethod ?? '').trim() || DEFAULT_COLUMNS.paymentMethod
	}
	emit('save', edited)
}

function close() {
	emit('update:visible', false)
}

function onVisibleChange(visible: boolean) {
	// ✕ / Esc / overlay clicks = Cancel.
	emit('update:visible', visible)
}
</script>

<style scoped lang="scss">
.dialog-hint {
	margin: 0 0 14px;

	font-size: 12px;
	line-height: 1.45;
	color: var(--p-surface-400);
}

.column-fields {
	display: flex;
	flex-direction: column;
	gap: 14px;

	padding: 2px 0;
}

.column-field {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.field-heading {
	display: flex;
	align-items: center;
	gap: 6px;
}

.field-label {
	font-size: 13px;
	font-weight: 500;
	color: var(--p-text-color);
}

.field-help {
	margin: 0;

	font-size: 11px;
	color: var(--p-surface-400);
}

.field-input {
	width: 100%;
}

.restore-default {
	margin-left: auto;
	padding: 2px;

	font-size: 11px;
	color: var(--p-surface-500);
	cursor: pointer;

	transition: color 0.12s ease;

	&:hover,
	&:focus-visible {
		color: var(--p-primary-500);
		outline: none;
	}
}

.duplicate-notice {
	display: flex;
	align-items: center;
	gap: 4px;

	margin: 0;

	font-size: 11px;
	color: var(--p-amber-400);

	> i {
		font-size: 11px;
	}
}

/* Cushion on the footer itself so it shows at every scroll position; `:global`
   is required (dialog roots carry no scope id). */
:global(.csv-columns-dialog .p-dialog-footer) {
	margin-top: 20px;
}

.dialog-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;

	width: 100%;
}

.footer-actions {
	display: flex;
	gap: 6px;
}
</style>
