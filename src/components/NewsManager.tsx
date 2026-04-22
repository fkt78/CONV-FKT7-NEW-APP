import { useState, useEffect, useRef } from 'react'
import {
  collection,
  query,
  orderBy,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  deleteField,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import RefreshButton from './RefreshButton'
import { uploadAudio, uploadImage, deleteAudio, type UploadProgress } from '../lib/newsStorage'
import { normalizeNewsImageUrls, MAX_NEWS_IMAGES } from '../lib/newsImages'
import AudioPlayer from './AudioPlayer'
import { withTimeout } from '../lib/chatUtils'

interface NewsItem {
  id: string
  title: string
  content: string
  audioUrl: string
  imageUrls: string[]
  createdAt: Date | null
  expiresAt: Date | null
}

/** 追加予定の画像（ファイル本体 + プレビューURL をセットで管理） */
interface PendingImage {
  file: File
  previewUrl: string
}

export default function NewsManager() {
  const [newsList, setNewsList] = useState<NewsItem[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingAudioUrl, setEditingAudioUrl] = useState('')
  /** 編集開始時点の画像URL（保存後に削除分を Storage から消す用） */
  const initialImageUrlsRef = useRef<string[]>([])
  const [editingImageUrls, setEditingImageUrls] = useState<string[]>([])
  /**
   * 新規追加の画像リスト。
   * プレビューURLはここで作成・破棄する（useMemo に入れると副作用が安全に扱えないため）。
   */
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  /** アンマウント時やリセット時に全プレビューURLをまとめて revoke するための記録 */
  const pendingUrlsRef = useRef<Set<string>>(new Set())

  // フォームフィールド
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [removeAudio, setRemoveAudio] = useState(false)
  const [upload, setUpload] = useState<UploadProgress | null>(null)
  const [savingStage, setSavingStage] = useState<'uploading' | 'writing' | null>(null)
  const [saving, setSaving] = useState(false)
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsRefreshKey, setNewsRefreshKey] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  /** コンポーネントアンマウント時に残っているプレビューURLを全破棄 */
  useEffect(() => {
    return () => {
      pendingUrlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setNewsLoading(true)
    getDocs(query(collection(db, 'news'), orderBy('createdAt', 'desc')))
      .then((snap) => {
        if (cancelled) return
        setNewsList(
          snap.docs.map((d) => ({
            id: d.id,
            title: d.data().title as string,
            content: d.data().content as string,
            audioUrl: (d.data().audioUrl as string) ?? '',
            imageUrls: normalizeNewsImageUrls(d.data()),
            createdAt: (d.data().createdAt as Timestamp | null)?.toDate() ?? null,
            expiresAt: (d.data().expiresAt as Timestamp | null)?.toDate() ?? null,
          })),
        )
        setNewsLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('news フェッチエラー:', err)
        setNewsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [newsRefreshKey])

  /** プレビューURL を安全に作成して pendingImages に追加する */
  function addImageFiles(files: FileList | null) {
    if (!files?.length) return
    const usedSlots = editingImageUrls.length + pendingImages.length
    const available = MAX_NEWS_IMAGES - usedSlots
    if (available <= 0) {
      alert(`画像は最大${MAX_NEWS_IMAGES}枚までです`)
      return
    }
    const toAdd = Array.from(files).slice(0, available)
    if (toAdd.length < files.length) {
      alert(`追加できるのはあと${available}枚です（合計${MAX_NEWS_IMAGES}枚まで）`)
    }
    const newEntries: PendingImage[] = toAdd.map((file) => {
      const previewUrl = URL.createObjectURL(file)
      pendingUrlsRef.current.add(previewUrl)
      return { file, previewUrl }
    })
    setPendingImages((prev) => [...prev, ...newEntries])
  }

  /** 既存URL（編集中）を削除 */
  function removeEditingUrl(index: number) {
    setEditingImageUrls((prev) => prev.filter((_, i) => i !== index))
  }

  /** 追加予定画像を削除してプレビューURLを破棄 */
  function removePendingImage(index: number) {
    setPendingImages((prev) => {
      const entry = prev[index]
      if (entry) {
        URL.revokeObjectURL(entry.previewUrl)
        pendingUrlsRef.current.delete(entry.previewUrl)
      }
      return prev.filter((_, i) => i !== index)
    })
  }

  /** 追加予定画像を全破棄してリセット */
  function clearPendingImages() {
    pendingImages.forEach((e) => {
      URL.revokeObjectURL(e.previewUrl)
      pendingUrlsRef.current.delete(e.previewUrl)
    })
    setPendingImages([])
  }

  function resetForm() {
    setTitle('')
    setContent('')
    setExpiresAt('')
    setAudioFile(null)
    setRemoveAudio(false)
    setUpload(null)
    setSavingStage(null)
    setEditingId(null)
    setEditingAudioUrl('')
    initialImageUrlsRef.current = []
    setEditingImageUrls([])
    clearPendingImages()
    setShowForm(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  function handleEdit(item: NewsItem) {
    setTitle(item.title)
    setContent(item.content)
    setExpiresAt(item.expiresAt ? item.expiresAt.toISOString().slice(0, 16) : '')
    setAudioFile(null)
    setRemoveAudio(false)
    setUpload(null)
    setEditingId(item.id)
    setEditingAudioUrl(item.audioUrl)
    const urls = [...item.imageUrls]
    initialImageUrlsRef.current = urls
    setEditingImageUrls(urls)
    clearPendingImages()
    setShowForm(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    setUpload(null)
    setSavingStage(null)
    try {
      let audioUrl = editingId ? editingAudioUrl : ''

      const needsUpload = !!audioFile || pendingImages.length > 0
      if (needsUpload) setSavingStage('uploading')

      if (editingId && removeAudio && editingAudioUrl) {
        await deleteAudio(editingAudioUrl)
        audioUrl = ''
      }
      if (audioFile) {
        if (editingId && editingAudioUrl && !removeAudio) await deleteAudio(editingAudioUrl)
        audioUrl = await uploadAudio(audioFile, (p) => setUpload(p))
      }

      let finalUrls = [...editingImageUrls]
      for (const entry of pendingImages) {
        if (finalUrls.length >= MAX_NEWS_IMAGES) break
        finalUrls.push(await uploadImage(entry.file, (p) => setUpload(p)))
      }
      finalUrls = finalUrls.slice(0, MAX_NEWS_IMAGES)

      const toDelete = initialImageUrlsRef.current.filter((u) => !finalUrls.includes(u))
      for (const u of toDelete) await deleteAudio(u)

      const payload: Record<string, unknown> = {
        title: title.trim(),
        content: content.trim(),
        audioUrl,
        imageUrls: finalUrls,
        expiresAt: expiresAt.trim() ? Timestamp.fromDate(new Date(expiresAt.trim())) : null,
      }
      if (finalUrls.length > 0) {
        payload.imageUrl = finalUrls[0]
      } else if (editingId) {
        payload.imageUrl = deleteField()
      }

      if (expiresAt.trim()) {
        const expDate = new Date(expiresAt.trim())
        if (expDate.getTime() <= Date.now()) {
          const proceed = window.confirm(
            '設定した公開期限がすでに過去の日時です。このまま投稿するとすぐに非表示になります。\n続けて投稿しますか？',
          )
          if (!proceed) {
            setSaving(false)
            setSavingStage(null)
            return
          }
        }
      }

      setSavingStage('writing')
      const WRITE_TIMEOUT_MS = 30_000
      const WRITE_TIMEOUT_MSG = 'Firestoreへの保存がタイムアウトしました。ネットワーク状態を確認して再試行してください。'
      if (editingId) {
        await withTimeout(
          updateDoc(doc(db, 'news', editingId), payload),
          WRITE_TIMEOUT_MS,
          WRITE_TIMEOUT_MSG,
        )
      } else {
        await withTimeout(
          addDoc(collection(db, 'news'), { ...payload, createdAt: serverTimestamp() }),
          WRITE_TIMEOUT_MS,
          WRITE_TIMEOUT_MSG,
        )
      }
      setNewsRefreshKey((k) => k + 1)
      resetForm()
    } catch (err) {
      console.error('ニュース保存エラー:', err)
      const msg = err instanceof Error ? err.message : String(err)
      alert(`保存に失敗しました${msg ? `: ${msg}` : ''}`)
    } finally {
      setSaving(false)
      setUpload(null)
      setSavingStage(null)
    }
  }

  async function handleDelete(item: NewsItem) {
    if (!confirm(`「${item.title}」を削除しますか？`)) return
    if (item.audioUrl) await deleteAudio(item.audioUrl)
    for (const u of item.imageUrls) await deleteAudio(u)
    await deleteDoc(doc(db, 'news', item.id))
    setNewsRefreshKey((k) => k + 1)
  }

  function formatDate(d: Date | null) {
    if (!d) return ''
    return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  }

  const currentAudioToShow = audioFile
    ? URL.createObjectURL(audioFile)
    : !removeAudio && editingAudioUrl ? editingAudioUrl : ''

  const visibleNewsList = newsList.filter(
    (item) => !item.expiresAt || item.expiresAt.getTime() > Date.now(),
  )

  const isExpired = (item: NewsItem) =>
    !!item.expiresAt && item.expiresAt.getTime() <= Date.now()

  const totalImageCount = editingImageUrls.length + pendingImages.length
  const imageSlotLeft = MAX_NEWS_IMAGES - totalImageCount

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5ea] flex-shrink-0">
        <h3 className="text-[#86868b] text-xs font-medium tracking-wide">
          VIP NEWS ({visibleNewsList.length}件)
        </h3>
        <div className="flex items-center gap-2">
          <RefreshButton
            onRefresh={async () => setNewsRefreshKey((k) => k + 1)}
            loading={newsLoading}
          />
          <button
            onClick={() => (showForm ? resetForm() : setShowForm(true))}
            className="text-[#0095B6] text-xs font-semibold hover:text-[#007A96] transition"
          >
            {showForm ? '✕ 閉じる' : '＋ 新規投稿'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {showForm && (
          <div className="mx-4 my-3 p-4 rounded-xl bg-[#f5f5f7] border border-[#e5e5ea] space-y-3">
            {editingId && (
              <p className="text-[#0095B6] text-[10px] font-medium tracking-wide">✏️ お知らせを編集中</p>
            )}

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="タイトル（例: 新商品入荷のお知らせ）"
              className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm placeholder-[#86868b] focus:outline-none focus:border-[#0095B6]"
            />

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="本文"
              rows={3}
              className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm placeholder-[#86868b] focus:outline-none focus:border-[#0095B6] resize-none"
            />

            <div>
              <label className="text-[#86868b] text-[10px] block mb-1">音声・お知らせの公開期限（任意）</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm focus:outline-none focus:border-[#0095B6]"
              />
              <p className="text-[#86868b] text-[10px] mt-0.5">設定すると、期限を過ぎると自動で非表示になります</p>
            </div>

            {/* 画像セクション */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[#86868b] text-[10px]">
                  画像・ポスター（任意・最大{MAX_NEWS_IMAGES}枚・JPEG / PNG / WebP / GIF）
                </label>
                <span className="text-[#86868b] text-[10px]">
                  {totalImageCount} / {MAX_NEWS_IMAGES}枚
                </span>
              </div>
              <p className="text-[#86868b] text-[10px] -mt-1">
                複数枚を一度に選べます。音声と同時に添付できます。
              </p>

              {/* プレビューグリッド */}
              {totalImageCount > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {editingImageUrls.map((url, i) => (
                    <div
                      key={`existing-${i}`}
                      className="relative rounded-lg border border-[#e5e5ea] bg-white overflow-hidden"
                    >
                      <img src={url} alt="" className="w-full h-28 object-contain" />
                      <button
                        type="button"
                        onClick={() => removeEditingUrl(i)}
                        className="absolute top-1 right-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                  {pendingImages.map((entry, i) => (
                    <div
                      key={`pending-${i}`}
                      className="relative rounded-lg border border-[#0095B6]/40 bg-white overflow-hidden"
                    >
                      <img src={entry.previewUrl} alt="" className="w-full h-28 object-contain" />
                      <span className="absolute bottom-1 left-1 text-[9px] bg-[#0095B6]/90 text-white px-1.5 py-0.5 rounded">
                        未保存
                      </span>
                      <button
                        type="button"
                        onClick={() => removePendingImage(i)}
                        className="absolute top-1 right-1 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 追加ボタン（label → input 直結） */}
              {imageSlotLeft > 0 && (
                <label
                  htmlFor="news-image-input"
                  className="flex items-center justify-center gap-1.5 border border-dashed border-[#e5e5ea] rounded-lg px-3 py-3 cursor-pointer hover:border-[#0095B6]/60 hover:bg-[#f0f9fc] transition"
                >
                  <span className="text-[#0095B6] text-sm">＋</span>
                  <span className="text-[#86868b] text-xs">
                    画像を追加（あと{imageSlotLeft}枚まで選択可）
                  </span>
                </label>
              )}
              {imageSlotLeft <= 0 && (
                <p className="text-[#86868b] text-[10px] text-center py-1">
                  画像は最大{MAX_NEWS_IMAGES}枚です
                </p>
              )}
              <input
                ref={imageInputRef}
                id="news-image-input"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                style={{ display: 'none' }}
                onChange={(e) => {
                  addImageFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>

            {/* 音声セクション */}
            <div className="space-y-2">
              <label className="text-[#86868b] text-[10px] block">音声ファイル（任意）</label>

              {editingAudioUrl && !removeAudio && !audioFile && (
                <div className="space-y-1">
                  <AudioPlayer src={editingAudioUrl} title="現在の音声" />
                  <button
                    onClick={() => setRemoveAudio(true)}
                    className="text-red-500/80 text-[10px] hover:text-red-500 transition"
                  >
                    ✕ この音声を削除する
                  </button>
                </div>
              )}
              {removeAudio && (
                <p className="text-red-500/80 text-[10px]">
                  保存時に音声を削除します
                  <button
                    onClick={() => setRemoveAudio(false)}
                    className="ml-2 text-[#0095B6] hover:text-[#007A96]"
                  >
                    取り消す
                  </button>
                </p>
              )}

              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 border border-dashed border-[#e5e5ea] rounded-lg px-3 py-2.5 cursor-pointer hover:border-[#0095B6]/40 transition"
              >
                <span className="text-[#86868b] text-xs">
                  {audioFile ? audioFile.name : '音声ファイルを選択 (.mp3 / .wav / .m4a)'}
                </span>
                {audioFile && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setAudioFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    className="ml-auto text-[#86868b] hover:text-red-500 text-xs transition"
                  >
                    ✕
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.m4a,audio/*"
                className="hidden"
                onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
              />
              {audioFile && currentAudioToShow && (
                <AudioPlayer src={currentAudioToShow} title={audioFile.name} />
              )}
            </div>

            {upload && (upload.state === 'running' || upload.state === 'paused') && (
              <div className="space-y-1">
                <div className="h-1 rounded-full bg-[#e5e5ea] overflow-hidden">
                  <div
                    className="h-full bg-[#0095B6] transition-all"
                    style={{ width: `${upload.percent}%` }}
                  />
                </div>
                <p className="text-[#86868b] text-[10px]">アップロード中... {upload.percent}%</p>
              </div>
            )}
            {savingStage === 'writing' && (
              <p className="text-[#86868b] text-[10px] text-center">Firestore に保存中...</p>
            )}

            <button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              className="w-full bg-[#0095B6] text-white font-bold py-2 rounded-xl text-sm hover:bg-[#007A96] transition disabled:opacity-50"
            >
              {savingStage === 'uploading'
                ? 'アップロード中...'
                : savingStage === 'writing'
                  ? 'Firestore保存中...'
                  : saving
                    ? '保存中...'
                    : editingId
                      ? '更新する'
                      : '投稿する'}
            </button>
          </div>
        )}

        <div className="px-4 pb-4 space-y-3">
          {newsList.length === 0 && !showForm && (
            <p className="text-[#86868b] text-sm text-center py-10">お知らせはまだありません</p>
          )}
          {newsList.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl border p-3 space-y-2 ${isExpired(item) ? 'bg-[#f5f5f7]/50 border-[#e5e5ea] opacity-60' : 'bg-[#f5f5f7] border-[#e5e5ea]'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[#1d1d1f] text-sm font-bold truncate">{item.title}</p>
                    {isExpired(item) && (
                      <span className="text-[10px] bg-[#86868b]/20 text-[#86868b] px-1.5 py-0.5 rounded flex-shrink-0">
                        期限切れ
                      </span>
                    )}
                  </div>
                  <p className="text-[#86868b] text-xs mt-0.5 line-clamp-2">{item.content}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {item.imageUrls.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[#0095B6]">
                        🖼️ 画像 {item.imageUrls.length}枚
                      </span>
                    )}
                    {item.audioUrl && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[#0095B6]">
                        🎵 音声あり
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[#86868b] text-[10px]">{formatDate(item.createdAt)}</span>
                  {item.expiresAt && (
                    <span className={`text-[10px] ${isExpired(item) ? 'text-red-400' : 'text-[#FF9500]'}`}>
                      〜{formatDate(item.expiresAt)}
                    </span>
                  )}
                  <button
                    onClick={() => handleEdit(item)}
                    className="text-[10px] px-2 py-1 rounded-md bg-[#e5e5ea]/60 text-[#86868b] hover:bg-[#0095B6]/10 hover:text-[#0095B6] transition"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="text-[#86868b] hover:text-red-500 transition text-xs p-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {item.imageUrls.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {item.imageUrls.map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="w-full max-h-40 object-contain rounded-lg border border-[#e5e5ea] bg-white"
                    />
                  ))}
                </div>
              )}
              {item.audioUrl && <AudioPlayer src={item.audioUrl} title={item.title} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
