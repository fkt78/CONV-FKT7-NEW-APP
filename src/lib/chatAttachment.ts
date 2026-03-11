/**
 * チャット添付ファイルのアップロード
 */
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from './firebase'

const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_FILE_TYPES = ['application/pdf']

export type AttachmentType = 'image' | 'file'

export interface AttachmentResult {
  url: string
  type: AttachmentType
  name: string
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
}

export function isImageType(mime: string): boolean {
  return ALLOWED_IMAGE_TYPES.includes(mime)
}

export function isAllowedType(mime: string): boolean {
  return isImageType(mime) || ALLOWED_FILE_TYPES.includes(mime)
}

export function validateFile(file: File): string | null {
  if (file.size > MAX_SIZE_BYTES) {
    return 'ファイルサイズは5MB以下にしてください'
  }
  if (!isAllowedType(file.type)) {
    return '画像（JPEG/PNG/GIF/WebP）またはPDFのみ対応しています'
  }
  return null
}

/**
 * チャットに添付ファイルをアップロードし、ダウンロードURLを返す
 */
export async function uploadChatAttachment(
  chatId: string,
  file: File,
): Promise<AttachmentResult> {
  const err = validateFile(file)
  if (err) throw new Error(err)

  const safeName = sanitizeFilename(file.name)
  const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}_${safeName}`
  const path = `chats/${chatId}/attachments/${fileId}`

  const storageRef = ref(storage, path)
  await uploadBytes(storageRef, file, { contentType: file.type })
  const url = await getDownloadURL(storageRef)

  return {
    url,
    type: isImageType(file.type) ? 'image' : 'file',
    name: file.name,
  }
}
