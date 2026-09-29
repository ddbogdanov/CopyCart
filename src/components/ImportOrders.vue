<template>
  <FilePick
    :title="props.title"
    :tooltip="props.titleToolTip"
    icon="pi pi-file-import"
    button-label="Choose or drop files"
    hint=".CSV"
    dialog-title="Import Orders"
    dialog-kind="import-orders"
    :dialog-properties="['openFile', 'multiSelections']"
    :dialog-filters="[{ 'name': 'Orders', 'extensions': ['csv'] }, { 'name': 'All Files', 'extensions': ['*'] }]"
    allow-drop
    drop-label="Drop files to import"
    :busy="isParsing"
    :drop-action="onDropFiles"
    :delete-button-action="onClear"
  >
    <template #header-actions>
      <Button severity="secondary" icon="pi pi-cog" v-tooltip="'Configure Import — fix renamed CSV columns.'" class="configure-import-button" @click="onConfigureImport"/>
    </template>

    <template #status>
      <div class="import-status">
        <StatusLine v-if="isParsing">
          <template #leading><i class="pi pi-spin pi-spinner" /></template>
          Parsing order files…
        </StatusLine>

        <template v-else-if="fileNames.length > 0">
          <StatusLine>
            <template #leading><i class="pi pi-check-circle" /></template>
            {{ fileNames.length }} file{{ fileNames.length === 1 ? '' : 's' }} • {{ orderCount }} order{{ orderCount === 1 ? '' : 's' }}
            <template #trailing>
              <Button icon="pi pi-times" severity="danger" variant="text" size="small" rounded
                      v-tooltip.top="'Clear imported files'" @click="onClear"/>
            </template>
          </StatusLine>

          <div class="file-list">
            <div class="file-row" v-for="(fileName, index) in fileNames" :key="props.filePaths[index]">
              <i class="pi pi-file" />
              <p v-tooltip.top="props.filePaths[index]">{{ fileName }}</p>
              <i class="pi pi-times remove-icon" role="button" tabindex="0"
                 v-tooltip.top="'Remove this file'"
                 @click.stop="onRemoveFile(index)"
                 @keydown.enter.stop="onRemoveFile(index)" />
            </div>
          </div>
        </template>

        <StatusLine v-else placeholder>No files selected</StatusLine>
      </div>
    </template>
  </FilePick>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { PropType } from 'vue'
import { ipc } from '../ipc'
import FilePick from './FilePick.vue'
import StatusLine from './StatusLine.vue'

const props = defineProps({
	title: String,
    titleToolTip: String,
    filePaths: { type: Array as PropType<string[]>, default: () => [] },
})

const emit = defineEmits(['configure-import'])

const isParsing = ref(false)
const orderCount = ref(0)

const fileNames = computed(() => props.filePaths.map((filePath) => filePath.replace(/\\/g, '/').split('/').pop() ?? ''))

onMounted(() => {
    // Only this component listens on 'import:status' — App owns the other
    // channels (the preload replaces listeners per channel).
    ipc.onImportStatus((status) => {
        isParsing.value = status.isParsing
        if (!status.isParsing && typeof status.orderCount === 'number') orderCount.value = status.orderCount
    })
})

function onDropFiles(filePaths: string[]) {
    // TODO: surface parse failures as a clean error message once CSV error
    // handling lands (unreadable files are reported by toast + console).
    ipc.cacheImportFiles(filePaths).catch((error) => console.error(error))
}

function onClear() {
    void ipc.deleteCache()
}

function onConfigureImport() {
    // App owns the dialog + persistence — this card only opens it.
    emit('configure-import')
}

function onRemoveFile(index: number) {
    const filePath = props.filePaths[index]
    if (!filePath) return
    ipc.removeImportFile(filePath).catch((error) => console.error(error))
}

</script>

<style scoped lang="scss">
.configure-import-button {
    margin-left: auto;
}

.import-status {
    width: 100%;

    display: flex;
    flex-direction: column;
    gap: 2px;

    max-height: 100%;
    min-height: 0;
    overflow: hidden;
}

.file-list {
    width: 100%;

    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;

    border-top: 1px solid var(--p-surface-700);
    padding-top: 6px;

    display: flex;
    flex-direction: column;
    gap: 2px;

    padding-right: 4px;

    &::-webkit-scrollbar {
        width: 5px;
    }

    &::-webkit-scrollbar-thumb {
        background: var(--p-surface-600);
        border-radius: 3px;
    }

    &::-webkit-scrollbar-track {
        background: transparent;
    }
}

.file-row {
    display: flex;
    align-items: center;
    gap: 6px;

    min-width: 0;

    padding: 0 4px;
    border-radius: 6px;

    transition: background-color 0.12s ease;

    &:hover {
        background-color: var(--p-surface-800);

        > i {
            color: var(--p-primary-500);
        }

        > p {
            color: var(--p-text-color);
        }
    }

    > i {
        font-size: 10px;
        color: var(--p-surface-500);
        flex-shrink: 0;

        transition: color 0.12s ease;
    }

    > p {
        margin: 0;

        font-size: 11px;
        color: var(--p-surface-400);

        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;

        transition: color 0.12s ease;
    }

    .remove-icon {
        margin-left: auto;
        flex-shrink: 0;

        padding: 2px;

        font-size: 10px;
        color: var(--p-surface-500);
        cursor: pointer;

        opacity: 0.55;
        transition: opacity 0.12s ease, color 0.12s ease;

        &:hover,
        &:focus-visible {
            opacity: 1;
            color: var(--p-red-400);
            outline: none;
        }
    }
}
</style>