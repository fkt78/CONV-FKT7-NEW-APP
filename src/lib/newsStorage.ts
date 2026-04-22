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

export interface UploadProgress {
  percent: number
  state: 'running' | 'paused' | 'success' | 'error'
}

const MAX_AUDIO_SIZE = 100 * 1024 * 1024 // 100MB（Firebase Storage は最大 5GB まで対応）
const MAX_IMAGE_SIZE = 15 * 1024 * 1024 // 15MB

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

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
    const task = uploadBytesResumable(storageRef, file, {
      contentType: file.type || 'audio/mpeg',
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
          const url = await getDownloadURL(task.snapshot.ref)
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
          const url = await getDownloadURL(task.snapshot.ref)
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
    await deleteObject(ref(storage, path))
  } catch {
    // 既に削除済み or 参照不正の場合は無視
  }
}
