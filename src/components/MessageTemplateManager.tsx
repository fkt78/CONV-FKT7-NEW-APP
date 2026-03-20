import { useState, useEffect } from 'react'
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
import { db } from '../lib/firebase'

export interface MessageTemplate {
  id: string
  title: string
  content: string
  category: string
  order: number
  createdAt: Date | null
}

export default function MessageTemplateManager() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'messageTemplates'), orderBy('createdAt', 'desc')),
      (snap) => {
        setTemplates(
          snap.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              title: (data.title as string) ?? '',
              content: (data.content as string) ?? '',
              category: (data.category as string) ?? '',
              order: (data.order as number) ?? 0,
              createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? null,
            }
          }),
        )
      },
      (err) => console.error('messageTemplates購読エラー:', err),
    )
  }, [])

  function resetForm() {
    setTitle('')
    setContent('')
    setCategory('')
    setEditingId(null)
    setShowForm(false)
  }

  function handleEdit(item: MessageTemplate) {
    setTitle(item.title)
    setContent(item.content)
    setCategory(item.category)
    setEditingId(item.id)
    setShowForm(true)
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        category: category.trim(),
      }

      if (editingId) {
        await updateDoc(doc(db, 'messageTemplates', editingId), payload)
      } else {
        await addDoc(collection(db, 'messageTemplates'), {
          ...payload,
          createdAt: serverTimestamp(),
        })
      }
      resetForm()
    } catch (err) {
      console.error('テンプレート保存エラー:', err)
      alert(`保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item: MessageTemplate) {
    if (!confirm(`「${item.title}」を削除しますか？`)) return
    await deleteDoc(doc(db, 'messageTemplates', item.id))
  }

  const categories = [...new Set(templates.map((t) => t.category).filter(Boolean))].sort()

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5ea] flex-shrink-0">
        <h3 className="text-[#86868b] text-xs font-medium tracking-wide">
          メッセージテンプレート ({templates.length}件)
        </h3>
        <button
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
          className="text-[#007AFF] text-xs font-semibold hover:text-[#0051D5] transition"
        >
          {showForm ? '✕ 閉じる' : '＋ 新規作成'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {showForm && (
          <div className="mx-4 my-3 p-4 rounded-xl bg-[#f5f5f7] border border-[#e5e5ea] space-y-3">
            {editingId && (
              <p className="text-[#007AFF] text-[10px] font-medium tracking-wide">✏️ テンプレートを編集中</p>
            )}

            <div>
              <label className="text-[#86868b] text-[10px] block mb-1">タイトル（一覧で表示される名前）</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: お問い合わせありがとうございます"
                className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm placeholder-[#86868b] focus:outline-none focus:border-[#007AFF]"
              />
            </div>

            <div>
              <label className="text-[#86868b] text-[10px] block mb-1">カテゴリ（任意・例: 挨拶, 返品対応）</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="例: 挨拶"
                list="category-list"
                className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm placeholder-[#86868b] focus:outline-none focus:border-[#007AFF]"
              />
              <datalist id="category-list">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="text-[#86868b] text-[10px] block mb-1">本文（チャットに挿入される内容）</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="お問い合わせいただきありがとうございます。&#10;担当者が確認の上、ご連絡いたします。"
                rows={5}
                className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm placeholder-[#86868b] focus:outline-none focus:border-[#007AFF] resize-none"
              />
            </div>

            <button
              onClick={handleSave}
              disabled={!title.trim() || !content.trim() || saving}
              className="w-full bg-[#007AFF] text-white font-bold py-2 rounded-xl text-sm hover:bg-[#0051D5] transition disabled:opacity-50"
            >
              {saving ? '保存中...' : editingId ? '更新する' : '作成する'}
            </button>
          </div>
        )}

        <div className="px-4 pb-4 space-y-3">
          {templates.length === 0 && !showForm && (
            <div className="text-center py-12">
              <p className="text-[#86868b] text-sm mb-2">テンプレートはまだありません</p>
              <p className="text-[#86868b] text-xs">
                よく使う返信文を登録しておくと、チャット送信時にワンタップで挿入できます
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 text-[#007AFF] text-sm font-medium hover:text-[#0051D5]"
              >
                ＋ 最初のテンプレートを作成
              </button>
            </div>
          )}
          {templates.map((item) => (
            <div key={item.id} className="rounded-xl bg-[#f5f5f7] border border-[#e5e5ea] p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {item.category && (
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-[#e5e5ea] text-[#86868b] mb-1">
                      {item.category}
                    </span>
                  )}
                  <p className="text-[#1d1d1f] text-sm font-bold truncate">{item.title}</p>
                  <p className="text-[#86868b] text-xs mt-0.5 line-clamp-3 whitespace-pre-wrap">{item.content}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleEdit(item)}
                    className="text-[10px] px-2 py-1 rounded-md bg-[#e5e5ea]/60 text-[#86868b] hover:bg-[#007AFF]/10 hover:text-[#007AFF] transition"
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
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
