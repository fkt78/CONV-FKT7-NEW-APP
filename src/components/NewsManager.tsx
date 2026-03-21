import { useState, useEffect, useRef } from 'react'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { uploadAudio, deleteAudio, type UploadProgress } from '../lib/newsStorage'
import AudioPlayer from './AudioPlayer'

interface NewsItem {
  id: string
  title: string
  content: string
  audioUrl: string
  createdAt: Date | null
  expiresAt: Date | null
}

export default function NewsManager() {
  const [newsList, setNewsList] = useState<NewsItem[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingAudioUrl, setEditingAudioUrl] = useState<string>('')

  // フォームフィールド
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [removeAudio, setRemoveAudio] = useState(false)
  const [upload, setUpload] = useState<UploadProgress | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'news'), orderBy('createdAt', 'desc')),
      (snap) => {
        setNewsList(
          snap.docs.map((d) => ({
            id: d.id,
            title: d.data().title as string,
            content: d.data().content as string,
            audioUrl: (d.data().audioUrl as string) ?? '',
            createdAt: (d.data().createdAt as Timestamp | null)?.toDate() ?? null,
            expiresAt: (d.data().expiresAt as Timestamp | null)?.toDate() ?? null,
          })),
        )
      },
      (err) => console.error('news購読エラー:', err),
    )
  }, [])

  function resetForm() {
    setTitle('')
    setContent('')
    setExpiresAt('')
    setAudioFile(null)
    setRemoveAudio(false)
    setUpload(null)
    setEditingId(null)
    setEditingAudioUrl('')
    setShowForm(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
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
    setShowForm(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      let audioUrl = editingId ? editingAudioUrl : ''

      // 旧音声削除
      if (editingId && removeAudio && editingAudioUrl) {
        await deleteAudio(editingAudioUrl)
        audioUrl = ''
      }

      // 新音声アップロード
      if (audioFile) {
        if (editingId && editingAudioUrl && !removeAudio) {
          await deleteAudio(editingAudioUrl)
        }
        audioUrl = await uploadAudio(audioFile, (p) => setUpload(p))
      }

      const payload = {
        title: title.trim(),
        content: content.trim(),
        audioUrl,
        expiresAt: expiresAt.trim()
          ? Timestamp.fromDate(new Date(expiresAt.trim()))
          : null,
      }

      if (editingId) {
        await updateDoc(doc(db, 'news', editingId), payload)
      } else {
        await addDoc(collection(db, 'news'), { ...payload, createdAt: serverTimestamp() })
      }
      resetForm()
    } catch (err) {
      console.error('ニュース保存エラー:', err)
      const msg = err instanceof Error ? err.message : String(err)
      alert(`保存に失敗しました${msg ? `: ${msg}` : ''}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item: NewsItem) {
    if (!confirm(`「${item.title}」を削除しますか？`)) return
    if (item.audioUrl) await deleteAudio(item.audioUrl)
    await deleteDoc(doc(db, 'news', item.id))
  }

  function formatDate(d: Date | null) {
    if (!d) return ''
    return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  }

  const currentAudioToShow = audioFile
    ? URL.createObjectURL(audioFile)
    : (!removeAudio && editingAudioUrl) ? editingAudioUrl : ''

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5ea] flex-shrink-0">
        <h3 className="text-[#86868b] text-xs font-medium tracking-wide">
          VIP NEWS ({newsList.length}件)
        </h3>
        <button
          onClick={() => showForm ? resetForm() : setShowForm(true)}
          className="text-[#0095B6] text-xs font-semibold hover:text-[#007A96] transition"
        >
          {showForm ? '✕ 閉じる' : '＋ 新規投稿'}
        </button>
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
                  <button onClick={() => setRemoveAudio(false)} className="ml-2 text-[#0095B6] hover:text-[#007A96]">
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
                    onClick={(e) => { e.stopPropagation(); setAudioFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="ml-auto text-[#86868b] hover:text-red-500 text-xs transition"
                  >✕</button>
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

              {upload && upload.state === 'running' && (
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
            </div>

            <button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              className="w-full bg-[#0095B6] text-white font-bold py-2 rounded-xl text-sm hover:bg-[#007A96] transition disabled:opacity-50"
            >
              {saving ? '保存中...' : editingId ? '更新する' : '投稿する'}
            </button>
          </div>
        )}

        <div className="px-4 pb-4 space-y-3">
          {newsList.length === 0 && !showForm && (
            <p className="text-[#86868b] text-sm text-center py-10">お知らせはまだありません</p>
          )}
          {newsList.map((item) => (
            <div key={item.id} className="rounded-xl bg-[#f5f5f7] border border-[#e5e5ea] p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[#1d1d1f] text-sm font-bold truncate">{item.title}</p>
                  <p className="text-[#86868b] text-xs mt-0.5 line-clamp-2">{item.content}</p>
                  {item.audioUrl && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-[#0095B6]">
                      🎵 音声あり
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[#86868b] text-[10px]">{formatDate(item.createdAt)}</span>
                  {item.expiresAt && (
                    <span className="text-[#FF9500] text-[10px]">〜{formatDate(item.expiresAt)}</span>
                  )}
                  <button
                    onClick={() => handleEdit(item)}
                    className="text-[10px] px-2 py-1 rounded-md bg-[#e5e5ea]/60 text-[#86868b] hover:bg-[#0095B6]/10 hover:text-[#0095B6] transition"
                  >✏️</button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="text-[#86868b] hover:text-red-500 transition text-xs p-1"
                  >✕</button>
                </div>
              </div>
              {item.audioUrl && (
                <AudioPlayer src={item.audioUrl} title={item.title} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
