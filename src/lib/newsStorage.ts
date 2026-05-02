import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'

/** ダウンロードURLからStorageパスを抽出（削除用） */
function getStoragePathFromUrl(url: string): string | null {
  try {
    const match = url.match(/\/o\/(.+?)(\?|$)/)
    if (!match) return null
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

function raceTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms)),
  ])
}

export interface UploadProgress {
  percent: number
  state: 'running' | 'paused' | 'success' | 'error'
}

const MAX_AUDIO_SIZE = 100 * 1024 * 1024 // 100MB
const MAX_IMAGE_SIZE = 15 * 1024 * 1024  // 15MB

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/**
 * 音声ファイルの正規 MIME タイプを返す。
 *
 * 優先順位:
 *   1. 拡張子が既知 → 拡張子ベースの標準型（最優先）
 *      ブラウザが返す audio/x-m4a, audio/x-wav などの非標準型を上書きするため。
 *   2. 拡張子不明 + file.type あり → 非標準型を正規化して返す
 *   3. それ以外 → audio/mpeg をデフォルト
 *
 * iOS Safari は audio/x-m4a を E4(SRC_NOT_SUPPORTED) で拒否する。
 * 必ず audio/mp4 に正規化する必要がある。
 */
function inferAudioContentType(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const extMap: Record<string, string> = {
    mp3:  'audio/mpeg',
    m4a:  'audio/mp4',
    mp4:  'audio/mp4',
    aac:  'audio/aac',
    wav:  'audio/wav',
    ogg:  'audio/ogg',
    flac: 'audio/flac',
    webm: 'audio/webm',
  }
  if (extMap[ext]) return extMap[ext]

  // 拡張子不明のとき: 非標準 MIME を正規化
  const normalizeMap: Record<string, string> = {
    'audio/x-m4a':       'audio/mp4',
    'audio/mp4a-latm':   'audio/mp4',
    'audio/x-wav':       'audio/wav',
    'audio/x-mp3':       'audio/mpeg',
    'audio/x-mpeg':      'audio/mpeg',
    'audio/x-aac':       'audio/aac',
  }
  if (file.type) return normalizeMap[file.type] ?? file.type
  return 'audio/mpeg'
}

export function uploadAudio(
  file: File,
  onProgress: (p: UploadProgress) => void,
): Promise<string> {
  if (file.size > MAX_AUDIO_SIZE) {
    return Promise.reject(new Error(`ファイルサイズは${MAX_AUDIO_SIZE / 1024 / 1024}MB以下にしてください`))
  }
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop() ?? 'mp3'
    const filename = `news_audio/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
    const storageRef = ref(storage, filename)
    const contentType = inferAudioContentType(file)
    const task = uploadBytesResumable(storageRef, file, { contentType })

    task.on(
      'state_changed',
      (snap) => {
        onProgress({
          percent: Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
          state: snap.state as UploadProgress['state'],
        })
      },
      (err) => reject(err),
      async () => {
        try {
          const url = await raceTimeout(
            getDownloadURL(task.snapshot.ref),
            30_000,
            'ダウンロードURLの取得がタイムアウトしました。再試行してください。',
          )
          onProgress({ percent: 100, state: 'success' })
          resolve(url)
        } catch (err) {
          reject(err)
        }
      },
    )
  })
}

/** お知らせ用画像（JPEG / PNG / WebP / GIF） */
export function uploadImage(
  file: File,
  onProgress: (p: UploadProgress) => void,
): Promise<string> {
  if (file.size > MAX_IMAGE_SIZE) {
    return Promise.reject(new Error(`画像は${MAX_IMAGE_SIZE / 1024 / 1024}MB以下にしてください`))
  }
  const ct = file.type || ''
  if (ct && !IMAGE_TYPES.has(ct)) {
    return Promise.reject(new Error('画像は JPEG / PNG / WebP / GIF にしてください'))
  }
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    const safeExt =
      ext && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg'
    const filename = `news_images/${Date.now()}_${Math.random().toString(36).slice(2)}.${safeExt}`
    const storageRef = ref(storage, filename)
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || 'image/jpeg',
    })

    task.on(
      'state_changed',
      (snap) => {
        onProgress({
          percent: Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
          state: snap.state as UploadProgress['state'],
        })
      },
      (err) => reject(err),
      async () => {
        try {
          const url = await raceTimeout(
            getDownloadURL(task.snapshot.ref),
            30_000,
            'ダウンロードURLの取得がタイムアウトしました。再試行してください。',
          )
          onProgress({ percent: 100, state: 'success' })
          resolve(url)
        } catch (err) {
          reject(err)
        }
      },
    )
  })
}

/** お知らせの音声・画像いずれかの Storage URL を削除 */
export async function deleteAudio(audioUrl: string): Promise<void> {
  const path = getStoragePathFromUrl(audioUrl)
  if (!path) return
  try {
    await raceTimeout(
      deleteObject(ref(storage, path)),
      15_000,
      '削除タイムアウト',
    )
  } catch {
    // 既に削除済み・参照不正・タイムアウトは無視
  }
}
