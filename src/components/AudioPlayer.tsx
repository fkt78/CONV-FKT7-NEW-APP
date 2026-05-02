import { useState, useEffect, useRef } from 'react'

interface AudioPlayerProps {
  src: string
  title?: string
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || isNaN(sec) || sec <= 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * iOS Safari 対策まとめ:
 *   1. fetch() で音声を Blob としてダウンロードし blob: URL に変換する。
 *      → <audio src> が cross-origin になる問題 / media-src CSP の Safari バグを回避。
 *      → connect-src で https://*.googleapis.com が許可されているので fetch() は通る。
 *      → blob: URL は media-src blob: で明示許可されている。
 *   2. <audio> を実際に DOM に接続した JSX 要素として配置する（new Audio() 廃止）。
 *   3. togglePlay() では audio.play() の前に await を入れず、ユーザージェスチャー
 *      の連鎖を維持する。blob URL なら play() 時にネットワーク待ちが不要。
 */
export default function AudioPlayer({ src, title }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)

  // blob URL state（iOS 対策の核心）
  const [blobSrc, setBlobSrc] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  // 再生状態
  const [playing, setPlaying]       = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]     = useState(0)

  // UI 状態
  const [fetchLoading, setFetchLoading] = useState(false)
  const [playLoading, setPlayLoading]   = useState(false)
  const [errorCode, setErrorCode]       = useState<number | null>(null)

  /* src が変わるたびに fetch() でブロブ取得 */
  useEffect(() => {
    let cancelled = false

    // 前回の blob URL を破棄
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setBlobSrc(null)
    setErrorCode(null)
    setPlaying(false)
    setPlayLoading(false)
    setCurrentTime(0)
    setDuration(0)

    if (!src) return

    setFetchLoading(true)
    fetch(src)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.blob()
      })
      .then(blob => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url
        setBlobSrc(url)
        setFetchLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.error('[AudioPlayer] fetch failed:', err, src)
        setFetchLoading(false)
        // fetch 失敗時はフォールバックとして直接 URL を試みる
        setBlobSrc(src)
      })

    return () => {
      cancelled = true
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [src])

  /* 他アプリへ切り替え・タブ非表示時は再生停止 */
  useEffect(() => {
    const pause = () => {
      audioRef.current?.pause()
      setPlaying(false)
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') pause() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', pause)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', pause)
    }
  }, [])

  function handleLoadedMetadata() {
    const a = audioRef.current
    if (a) setDuration(a.duration)
  }

  function handleTimeUpdate() {
    const a = audioRef.current
    if (a) setCurrentTime(a.currentTime)
  }

  function handleEnded() {
    const a = audioRef.current
    if (!a) return
    setPlaying(false)
    setCurrentTime(0)
    a.currentTime = 0
  }

  function handleMediaError() {
    const a = audioRef.current
    // code: 1=ABORTED 2=NETWORK 3=DECODE 4=SRC_NOT_SUPPORTED
    const code = a?.error?.code ?? -1
    const msg  = a?.error?.message ?? ''
    console.error('[AudioPlayer] media error', { code, msg, src })
    setErrorCode(code)
    setPlayLoading(false)
    setPlaying(false)
  }

  async function togglePlay() {
    const a = audioRef.current
    if (!a || fetchLoading) return
    if (playing) {
      a.pause()
      setPlaying(false)
      return
    }
    try {
      setPlayLoading(true)
      setErrorCode(null)
      // blob URL が既にメモリにあるため、ここで await するのは play() のみ。
      // ネットワーク待ちなし → iOS のユーザージェスチャー要件を満たす。
      await a.play()
      setPlaying(true)
      setPlayLoading(false)
    } catch (err) {
      const code = audioRef.current?.error?.code ?? -1
      console.error('[AudioPlayer] play() rejected:', err, 'code:', code)
      setErrorCode(code)
      setPlayLoading(false)
      setPlaying(false)
    }
  }

  function handleRetry() {
    setErrorCode(null)
    setPlaying(false)
    setPlayLoading(false)
    setCurrentTime(0)
    setDuration(0)
    const a = audioRef.current
    if (a) a.load()
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const a = audioRef.current
    if (!a) return
    const t = Number(e.target.value)
    a.currentTime = t
    setCurrentTime(t)
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const hasError = errorCode !== null
  const isLoading = fetchLoading || playLoading

  return (
    <div className="rounded-xl bg-[#f5f5f7] border border-[#e5e5ea] px-4 py-3 space-y-2">
      {/* DOM に直接置く <audio> 要素。src は blob: URL */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={blobSrc ?? undefined}
        preload="auto"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onError={handleMediaError}
        style={{ display: 'none' }}
      />

      {title && (
        <p className="text-[#0095B6] text-[10px] font-medium tracking-widest truncate">
          ♪ {title}
        </p>
      )}

      {hasError ? (
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="text-[#86868b] text-xs flex-1">
              音声を読み込めませんでした
              {errorCode !== -1 && (
                <span className="ml-1 opacity-60">(E{errorCode})</span>
              )}
            </span>
            <button
              onClick={handleRetry}
              className="text-[#0095B6] text-[12px] font-medium underline flex-shrink-0"
            >
              再試行
            </button>
          </div>
          {/* フォールバック: Safari で直接開く */}
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0095B6] text-[11px] underline"
          >
            ブラウザで開く
          </a>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            disabled={isLoading}
            className="w-9 h-9 rounded-full bg-[#0095B6] flex items-center justify-center flex-shrink-0 shadow-sm hover:bg-[#007A96] transition disabled:opacity-40 disabled:cursor-wait"
            aria-label={playing ? '一時停止' : '再生'}
          >
            {isLoading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : playing ? (
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white translate-x-px">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
            )}
          </button>

          <div className="flex-1 space-y-1.5">
            <div className="relative h-1.5 rounded-full bg-[#e5e5ea] group">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[#0095B6] pointer-events-none transition-all"
                style={{ width: `${progress}%` }}
              />
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                disabled={isLoading || duration === 0}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
                aria-label="シーク"
              />
              {duration > 0 && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#0095B6] shadow-sm pointer-events-none transition-all"
                  style={{ left: `calc(${progress}% - 6px)` }}
                />
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[#86868b] text-[10px] tabular-nums">
                {formatTime(currentTime)}
              </span>
              <span className="text-[#86868b]/80 text-[10px] tabular-nums">
                {duration > 0 ? formatTime(duration) : fetchLoading ? '読込中…' : '--:--'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
