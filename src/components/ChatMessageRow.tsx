import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTime, formatDateDivider } from '../lib/formatTime'
import { highlightMatch, isSafeUrl } from '../lib/chatUtils'
import type { AttachmentType } from '../lib/chatAttachment'

export interface ChatMessage {
  id: string
  senderId: string
  text: string
  createdAt: Date | null
  readAt: Date | null
  attachmentUrl?: string
  attachmentType?: AttachmentType
  attachmentName?: string
}

export interface ChatMessageRowProps {
  msg: ChatMessage
  showDivider: boolean
  isOwn: boolean
  isRead: boolean
  searchQuery: string
  isEditing: boolean
  editingText: string
  menuOpen: boolean
  canEdit: boolean
  setMessageNodeRef: (id: string, el: HTMLDivElement | null) => void
  onEditingTextChange: (v: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onMenuButtonClick: (id: string) => void
  onCloseMenuOverlay: () => void
  onEdit: (msg: ChatMessage) => void
  onDelete: (msg: ChatMessage) => void
}

const ChatMessageRow = memo(function ChatMessageRow({
  msg,
  showDivider,
  isOwn,
  isRead,
  searchQuery,
  isEditing,
  editingText,
  menuOpen,
  canEdit,
  setMessageNodeRef,
  onEditingTextChange,
  onSaveEdit,
  onCancelEdit,
  onMenuButtonClick,
  onCloseMenuOverlay,
  onEdit,
  onDelete,
}: ChatMessageRowProps) {
  const { t } = useTranslation()
  const trimmedSearch = searchQuery.trim()

  return (
    <div
      ref={(el) => {
        setMessageNodeRef(msg.id, el)
      }}
    >
      {showDivider && (
        <div className="flex items-center justify-center my-4">
          <div className="flex-1 border-t border-[#e5e5ea]" />
          <span className="px-3 text-[13px] text-[#86868b]">{formatDateDivider(msg.createdAt)}</span>
          <div className="flex-1 border-t border-[#e5e5ea]" />
        </div>
      )}

      <div className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
        {!isOwn && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0095B6] to-[#5BC8D7] flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-white text-xs font-semibold">♛</span>
          </div>
        )}

        <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col group/message`}>
          {!isOwn && (
            <span className="text-[13px] text-[#0095B6] mb-0.5 ml-1 font-medium">{t('home.manager')}</span>
          )}
          <div className="flex items-end gap-1">
            <div
              className={`px-4 py-2.5 rounded-2xl text-[17px] leading-relaxed ${
                isOwn
                  ? 'bg-[#0095B6] text-white rounded-br-sm shadow-sm'
                  : 'bg-white text-[#1d1d1f] border border-[#e5e5ea] rounded-bl-sm shadow-[0_1px_4px_rgba(0,0,0,0.04)]'
              }`}
            >
              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={editingText}
                    onChange={(e) => onEditingTextChange(e.target.value)}
                    className="w-full min-h-[60px] bg-transparent border-none outline-none resize-none text-inherit placeholder-white/70"
                    placeholder={t('home.placeholderEdit')}
                    autoFocus
                    rows={2}
                    name="vip-chat-edit-body"
                    autoComplete="off"
                    data-form-type="other"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={onCancelEdit}
                      className="text-sm px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30"
                    >
                      {t('home.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={onSaveEdit}
                      disabled={!editingText.trim()}
                      className="text-sm px-3 py-1 rounded-lg bg-white/30 hover:bg-white/40 disabled:opacity-50"
                    >
                      {t('home.save')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {msg.attachmentUrl && isSafeUrl(msg.attachmentUrl) && (
                    <div className="mb-2">
                      {msg.attachmentType === 'image' ? (
                        <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="block">
                          <img
                            src={msg.attachmentUrl}
                            alt={msg.attachmentName ?? t('home.imageAlt')}
                            className="max-w-[200px] max-h-[200px] rounded-lg object-cover"
                          />
                        </a>
                      ) : (
                        <a
                          href={msg.attachmentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`text-sm underline ${isOwn ? 'text-white/90' : 'text-[#0095B6]'}`}
                        >
                          📎{' '}
                          {trimmedSearch && msg.attachmentName
                            ? highlightMatch(msg.attachmentName, searchQuery)
                            : (msg.attachmentName ?? t('home.fileFallback'))}
                        </a>
                      )}
                    </div>
                  )}
                  {msg.text && (
                    <span className="whitespace-pre-wrap">
                      {trimmedSearch ? highlightMatch(msg.text, searchQuery) : msg.text}
                    </span>
                  )}
                </>
              )}
            </div>
            {isOwn && canEdit && !isEditing && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => onMenuButtonClick(msg.id)}
                  aria-label={t('home.messageMenuAria')}
                  className="p-1.5 rounded-lg hover:bg-black/10 text-white/80 hover:text-white"
                >
                  ⋮
                </button>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" aria-hidden onClick={onCloseMenuOverlay} />
                    <div className="absolute right-0 top-full mt-1 py-1 bg-white rounded-lg shadow-lg border border-[#e5e5ea] z-20 min-w-[100px]">
                      <button
                        type="button"
                        onClick={() => onEdit(msg)}
                        className="w-full text-left px-3 py-2 text-sm text-[#1d1d1f] hover:bg-[#f5f5f7]"
                      >
                        {t('home.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(msg)}
                        className="w-full text-left px-3 py-2 text-sm text-[#FF3B30] hover:bg-[#f5f5f7]"
                      >
                        {t('home.delete')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <span className={`text-[13px] text-[#86868b] mt-0.5 ${isOwn ? 'mr-1' : 'ml-1'}`}>
            {formatTime(msg.createdAt)}
            {isOwn && (
              <span className="ml-1 text-[11px] opacity-80">
                {isRead ? t('home.read') : t('home.unread')}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  )
})

export default ChatMessageRow
