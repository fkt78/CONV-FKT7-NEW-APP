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
  type Timestamp,
} from 'firebase/firestore'
import { ref, deleteObject } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { uploadAudio, type UploadProgress } from '../lib/newsStorage'
import AudioPlayer from './AudioPlayer'

interface NewsItem {
  id: string
  title: string
  content: string
  audioUrl: string
  createdAt: Date | null
}

export default function NewsManager() {
  const [newsList, setNewsList] = useState<NewsItem[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingAudioUrl, setEditingAudioUrl] = useState<string>('')

  // フォームフィールド
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
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
          })),
        )
      },
      (err) => console.error('news購読エラー:', err),
    )
  }, [])

  function resetForm() {
    setTitle('')
    setContent('')
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
        try { await deleteObject(ref(storage, editingAudioUrl)) } catch { /* 無視 */ }
        audioUrl = ''
      }

      // 新音声アップロード
      if (audioFile) {
        if (editingId && editingAudioUrl && !removeAudio) {
          try { await deleteObject(ref(storage, editingAudioUrl)) } catch { /* 無視 */ }
        }
        audioUrl = await uploadAudio(audioFile, (p) => setUpload(p))
      }

      const payload = {
        title: title.trim(),
        content: content.trim(),
        audioUrl,
      }

      if (editingId) {
        await updateDoc(doc(db, 'news', editingId), payload)
      } else {
        await addDoc(collection(db, 'news'), { ...payload, createdAt: serverTimestamp() })
      }
      resetForm()
    } catch (err) {
      console.error('ニュース保存エラー:', err)
      alert('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item: NewsItem) {
    if (!confirm(`「${item.title}」を削除しますか？`)) return
    if (item.audioUrl) {
      try { await deleteObject(ref(storage, item.audioUrl)) } catch { /* 無視 */ }
    }
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
    <div className="flex flex-col h-full">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
        <h3 className="text-white/60 text-xs font-medium tracking-wide">
          VIP NEWS ({newsList.length}件)
        </h3>
        <button
          onClick={() => showForm ? resetForm() : setShowForm(true)}
          className="text-amber-400 text-xs font-semibold hover:text-amber-300 transition"
        >
          {showForm ? '✕ 閉じる' : '＋ 新規投稿'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 投稿/編集フォーム */}
        {showForm && (
          <div className="mx-4 my-3 p-4 rounded-xl bg-[#16213e] border border-amber-400/20 space-y-3">
            {editingId && (
              <p className="text-amber-400/70 text-[10px] font-medium tracking-wide">✏️ お知らせを編集中</p>
            )}

            {/* タイトル */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="タイトル（例: 新商品入荷のお知らせ）"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-amber-400/40"
            />

            {/* 本文 */}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="本文"
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-amber-400/40 resize-none"
            />

            {/* 音声ファイル */}
            <div className="space-y-2">
              <label className="text-white/40 text-[10px] block">音声ファイル（任意）</label>

              {/* 既存音声プレビュー */}
              {editingAudioUrl && !removeAudio && !audioFile && (
                <div className="space-y-1">
                  <AudioPlayer src={editingAudioUrl} title="現在の音声" />
                  <button
                    onClick={() => setRemoveAudio(true)}
                    className="text-red-400/60 text-[10px] hover:text-red-400 transition"
                  >
                    ✕ この音声を削除する
                  </button>
                </div>
              )}
              {removeAudio && (
                <p className="text-red-400/60 text-[10px]">
                  保存時に音声を削除します
                  <button onClick={() => setRemoveAudio(false)} className="ml-2 text-white/40 hover:text-white/60">
                    取り消す
                  </button>
                </p>
              )}

              {/* ファイル選択 */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 border border-dashed border-white/10 rounded-lg px-3 py-2.5 cursor-pointer hover:border-amber-400/30 transition"
              >
                <span className="text-white/30 text-xs">
                  {audioFile ? audioFile.name : '音声ファイルを選択 (.mp3 / .wav / .m4a)'}
                </span>
                {audioFile && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setAudioFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}
                    className="ml-auto text-white/20 hover:text-red-400 text-xs transition"
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

              {/* 選択後プレビュー */}
              {audioFile && currentAudioToShow && (
                <AudioPlayer src={currentAudioToShow} title={audioFile.name} />
              )}

              {/* アップロード進捗 */}
              {upload && upload.state === 'running' && (
                <div className="space-y-1">
                  <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-yellow-500 transition-all"
                      style={{ width: `${upload.percent}%` }}
                    />
                  </div>
                  <p className="text-white/30 text-[10px]">アップロード中... {upload.percent}%</p>
                </div>
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              className="w-full bg-amber-400 text-black font-bold py-2 rounded-lg text-sm hover:bg-amber-300 transition disabled:opacity-50"
            >
              {saving ? '保存中...' : editingId ? '更新する' : '投稿する'}
            </button>
          </div>
        )}

        {/* ニュース一覧 */}
        <div className="px-4 pb-4 space-y-3">
          {newsList.length === 0 && !showForm && (
            <p className="text-white/20 text-sm text-center py-10">お知らせはまだありません</p>
          )}
          {newsList.map((item) => (
            <div key={item.id} className="rounded-xl bg-[#16213e] border border-white/5 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-bold truncate">{item.title}</p>
                  <p className="text-white/40 text-xs mt-0.5 line-clamp-2">{item.content}</p>
                  {item.audioUrl && (
                    <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-amber-400/60">
                      🎵 音声あり
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-white/20 text-[10px]">{formatDate(item.createdAt)}</span>
                  <button
                    onClick={() => handleEdit(item)}
                    className="text-[10px] px-2 py-1 rounded-md bg-white/5 text-white/40 hover:bg-amber-400/10 hover:text-amber-400 transition"
                  >✏️</button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="text-white/20 hover:text-red-400 transition text-xs p-1"
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
