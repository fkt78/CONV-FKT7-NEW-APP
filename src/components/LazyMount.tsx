import { useEffect, useRef, useState, type ReactNode } from 'react'

interface LazyMountProps {
  children: ReactNode
  rootMargin?: string
  fallback?: ReactNode
}

/**
 * 子要素がビューポートに近づいたらマウントするラッパー。
 * IntersectionObserver を使用。一度マウントされたら解除しない。
 */
export default function LazyMount({
  children,
  rootMargin = '200px',
  fallback = null,
}: LazyMountProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver === 'undefined') {
      // IntersectionObserver 未対応環境では即マウント（setTimeout で非同期化）
      const id = setTimeout(() => setVisible(true), 0)
      return () => clearTimeout(id)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible, rootMargin])

  return <div ref={ref}>{visible ? children : fallback}</div>
}
