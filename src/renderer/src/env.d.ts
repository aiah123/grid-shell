import type { GridShellApi } from '../../shared/api'

declare global {
  interface Window {
    gridShell: GridShellApi
  }
}
