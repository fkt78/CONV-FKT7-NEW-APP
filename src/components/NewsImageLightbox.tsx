import { useEffect, useCallback } from 'react'

interface Props {
  imageUrl: string | null
  alt: string
  closeLabel: string
  onClose: () => void
}

export default function NewsImageLightbox({ imageUrl, alt, closeLabel, onClose }: Props) {
  const handleClose = useCallback(() => {
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!imageUrl) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [imageUrl])

  useEffect(() => {
    if (!imageUrl) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [imageUrl, handleClose])

  if (!imageUrl) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/88 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={closeLabel}
      onClick={handleClose}
    >
      <button
        type="button"
        onClick={handleClose}
        className="absolute top-[max(12px,env(safe-area-inset-top))] right-[max(12px,env(safe-area-inset-right))] min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-white/15 text-white text-2xl leading-none hover:bg-white/25 transition"
        aria-label={closeLabel}
      >
        ×
      </button>
      <img
        src={imageUrl}
        alt={alt}
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}
