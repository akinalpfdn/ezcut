import { createHash } from 'node:crypto'
import { access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { resolveFfmpegPath } from './binaryPaths'
import { runCommand } from './process'
import { FFMPEG_ARGS } from '../../config/ffmpegArgs'
import { DENOISE_CONFIG } from '../../config/denoise'
import { allowMediaFile } from '../media/mediaProtocol'

interface DenoiseBackend {
  audioFilter(strength: number): string
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

/** Spectral noise reduction — no model required, the default. */
const afftdnBackend: DenoiseBackend = {
  audioFilter(strength) {
    const range = DENOISE_CONFIG.afftdnMaxNr - DENOISE_CONFIG.afftdnMinNr
    const nr = DENOISE_CONFIG.afftdnMinNr + clamp01(strength) * range
    return `afftdn=nr=${nr.toFixed(1)}`
  }
}

/** RNNoise — higher quality, but requires a bundled model file. */
function arnndnBackend(modelPath: string): DenoiseBackend {
  return {
    audioFilter: (strength) => `arnndn=m='${modelPath}':mix=${clamp01(strength).toFixed(2)}`
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function modelPath(): string {
  const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
  return join(base, DENOISE_CONFIG.rnnoiseModelFile)
}

/** Strategy selection: arnndn when its model is bundled, otherwise afftdn.
 * Swapping the backend never touches the renderer. */
async function selectBackend(): Promise<DenoiseBackend> {
  if (DENOISE_CONFIG.defaultBackend === 'arnndn' && (await fileExists(modelPath()))) {
    return arnndnBackend(modelPath())
  }
  return afftdnBackend
}

async function proxyDir(): Promise<string> {
  const dir = join(app.getPath('userData'), 'cache', 'denoise')
  await mkdir(dir, { recursive: true })
  return dir
}

function proxyKey(mediaPath: string, strength: number): string {
  return createHash('md5')
    .update(`${DENOISE_CONFIG.defaultBackend}|${mediaPath}|${strength.toFixed(2)}`)
    .digest('hex')
}

/** Returns a cached denoised proxy path, generating it if needed. */
export async function generateDenoiseProxy(mediaPath: string, strength: number): Promise<string> {
  const dir = await proxyDir()
  const proxyPath = join(dir, `${proxyKey(mediaPath, strength)}.${DENOISE_CONFIG.proxyExtension}`)

  if (!(await fileExists(proxyPath))) {
    const backend = await selectBackend()
    await runCommand(resolveFfmpegPath(), FFMPEG_ARGS.denoiseProxy(mediaPath, backend.audioFilter(strength), proxyPath))
  }
  allowMediaFile(proxyPath)
  return proxyPath
}
