export interface ElectronAPI {
  openFileDialog: (title: string, properties: any, filters: any) => Promise<string | null>;
  deleteCache: () => void
  deletePrintFiles: () => void
  deletePrintFolder: () => void
  processFiles: () => void

  onLoadingStateUpdate: (callback: (isLoading: boolean, progress: number, status: string) => void) => void
  onCachingUpdate: (callback: (isSelected: boolean, path: string) => void) => void
  onPrintFilesUpdate: (callback: (isSelected: boolean, path: string) => void) => void
  onPrintFolderUpdate: (callback: (isSelected: boolean, path: string) => void) => void
  onToast: (callback: (message: string) => void) => void

  updateLoadingState: (isLoading: boolean, progress: number, status: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}