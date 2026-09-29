import type { UpdateWindowApi } from '../../shared/ipc'

declare global {
  interface Window {
    updateWindow: UpdateWindowApi
  }
}

export {}
