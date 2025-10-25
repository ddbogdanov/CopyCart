export interface ElectronAPI {
  openFileDialog: (title: string, properties: any, filters: any) => Promise<string | null>;
  deleteCache: () => void
  deletePrintFiles: () => void
  deletePrintFolder: () => void
  processFiles: () => void
  minimize: () => void
  toggleMaximize: () => void
  exit: () => void
  saveSettings: (settings: any) => Promise<boolean>
  openDevTools: () => void
  connectShopify: (shopDomain: string) => void
  fetchOrders: () => void

  onLoadingStateUpdate: (callback: (isLoading: boolean, progress: number, status: string) => void) => void
  onToast: (callback: (message: string) => void) => void
  onWindowMaximizeUpdate: (callback: (maximized: boolean) => void) => void
  onSettingsSaved: (callback: (saved: boolean) => void) => void
  onSettingsUpdate: (callback: (settings: any) => void) => void

  updateLoadingState: (isLoading: boolean, progress: number, status: string) => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}