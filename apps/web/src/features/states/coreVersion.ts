import { EJS_DATA_PATH } from '../emulator/emulatorjs'

/**
 * Save states are only portable between identical core builds. We tag every state with
 * the EmulatorJS release and the PPSSPP core build timestamp from the shipped report.
 */
export function composeCoreVersion(ejsVersion: string, coreBuildStart: string): string {
  return `emulatorjs-${ejsVersion}/ppsspp-${coreBuildStart}`
}

let cached: Promise<string> | null = null

export function getCoreVersion(): Promise<string> {
  if (!cached) {
    cached = (async () => {
      let build = 'unknown'
      try {
        const res = await fetch(`${EJS_DATA_PATH}cores/reports/ppsspp.json`)
        const json = (await res.json()) as { buildStart?: string }
        if (json.buildStart) build = json.buildStart
      } catch {
        /* keep unknown */
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ejs = (window as any).EJS_emulator?.ejs_version ?? '4.2.3'
      return composeCoreVersion(String(ejs), build)
    })()
  }
  return cached
}
