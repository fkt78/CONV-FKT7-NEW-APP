import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage'
import { storage } from './firebase'

export interface UploadProgress {
  percent: number
  state: 'running' | 'paused' | 'success' | 'error'
}

export function uploadAudio(
  file: File,
  onProgress: (p: UploadProgress) => void,
): Promise<string> {
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
        const url = await getDownloadURL(task.snapshot.ref)
        resolve(url)
      },
    )
  })
}

export async function deleteAudio(audioUrl: string): Promise<void> {
  try {
    const fileRef = ref(storage, audioUrl)
    await deleteObject(fileRef)
  } catch {
    // 既に削除済み or 参照不正の場合は無視
  }
}
