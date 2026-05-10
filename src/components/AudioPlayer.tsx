import { useState, useEffect, useRef } from 'react'

interface AudioPlayerProps {
  src: string
  title?: string
}

/**
 * Firebase Storage が返す / ブラウザが設定した非標準 MIME を
 * iOS Safari が受け付ける標準 MIME に正規化する。
 *
 * 拡張子で**上書き**せず、
 *   1. レスポンス／blob の Content-Type を最優先（非標準なら正規化）
 *   2. 空のときだけ拡張子から推測
 *   3. それでも不明なら `audio/mpeg` をフォールバック
 * の順で扱う。拡張子と中身が食い違っているファイルでも、サーバが返す
 * 正しい Content-Type を尊重して E4 を起こしにくくする。
 */
function normalizeMime(type: string, url: string): string {
  const normalizeMap: Record<string, string> = {
    'audio/x-m4a':       'audio/mp4',
    'audio/mp4a-latm':   'audio/mp4',
    'audio/x-wav':       'audio/wav',
    'audio/x-mp3':       'audio/mpeg',
    'audio/x-mpeg':      'audio/mpeg',
    'audio/x-aac':       'audio/aac',
  }
  const lower = (type || '').toLowerCase()
  if (lower && lower !== 'application/octet-stream') {
    return normalizeMap[lower] ?? lower
  }

  const decoded = decodeURIComponent(url.split('?')[0])
  const ext = decoded.split('.').pop()?.toLowerCase() ?? ''
  const extMap: Record<string, string> = {
    mp3:  'audio/mpeg',
    m4a:  'audio/mp4',
    mp4:  'audio/mp4',
    aac:  'audio/aac',
    wav:  'audio/wav',
    ogg:  'audio/ogg',
    flac: 'audio/flac',
    webm: 'audio/webm',
  }
  return extMap[ext] ?? 'audio/mpeg'
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || isNaN(sec) || sec <= 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * 再生戦略:
 *   1. まず `<audio src={src}>` で直接再生する。
 *      Firebase Storage は CORS / Range リクエスト対応済みなので、
 *      Safari が Content-Type と中身を見て柔軟に再生してくれる。
 *      → 「ブラウザで開いて再生できるものはアプリでも再生できる」を実現。
 *   2. それで MEDIA_ERR_SRC_NOT_SUPPORTED など再生不可だった場合のみ、
 *      fetch → Blob → 正規化 MIME → blob: URL のフォールバックに切替。
 *   3. blob でも失敗したらエラー UI でブラウザ直接再生を案内する。
 */

type Mode = 'direct' | 'blob'

export default function AudioPlayer({ src, title }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)

  const [mode, setMode] = useState<Mode>('direct')
  const [resolvedSrc, setResolvedSrc] = useState<string>('')
  const [blobMime, setBlobMime] = useState<string>('')
  const blobUrlRef = useRef<string | null>(null)

  const [playing, setPlaying]       = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]     = useState(0)

  const [fetchLoading, setFetchLoading] = useState(false)
  const [playLoading, setPlayLoading]   = useState(false)
  const [errorCode, setErrorCode]       = useState<number | null>(null)

  /* src が変わったらまず直接再生にリセット */
  useEffect(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setMode('direct')
    setResolvedSrc(src)
    setBlobMime('')
    setErrorCode(null)
    setPlaying(false)
    setPlayLoading(false)
    setCurrentTime(0)
    setDuration(0)
    setFetchLoading(false)

    return () => {
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

  /** direct → blob フォールバックを試みる。すでに blob 失敗なら確定エラー。 */
  async function fallbackToBlob(originalCode: number) {
    if (mode !== 'direct') {
      setErrorCode(originalCode)
      setPlayLoading(false)
      setPlaying(false)
      return
    }
    console.warn('[AudioPlayer] direct play failed, falling back to blob', { src, originalCode })
    setFetchLoading(true)
    try {
      const res = await fetch(src)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = await res.blob()
      const mime = normalizeMime(raw.type, src)
      const blob = mime !== raw.type ? new Blob([raw], { type: mime }) : raw
      const url = URL.createObjectURL(blob)
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = url
      setBlobMime(mime)
      setResolvedSrc(url)
      setMode('blob')
      setErrorCode(null)
      setFetchLoading(false)
    } catch (err) {
      console.error('[AudioPlayer] blob fallback failed:', err)
      setFetchLoading(false)
      setErrorCode(originalCode)
      setPlayLoading(false)
      setPlaying(false)
    }
  }

  function handleMediaError() {
    const a = audioRef.current
    // code: 1=ABORTED 2=NETWORK 3=DECODE 4=SRC_NOT_SUPPORTED
    const code = a?.error?.code ?? -1
    const msg  = a?.error?.message ?? ''
    console.error('[AudioPlayer] media error', { mode, code, msg, src })
    void fallbackToBlob(code)
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
      await a.play()
      setPlaying(true)
      setPlayLoading(false)
    } catch (err) {
      const code = audioRef.current?.error?.code ?? -1
      console.error('[AudioPlayer] play() rejected:', err, 'code:', code)
      if (mode === 'direct') {
        await fallbackToBlob(code)
        try {
          await audioRef.current?.play()
          setPlaying(true)
          setPlayLoading(false)
          return
        } catch (e2) {
          console.error('[AudioPlayer] play after blob fallback rejected:', e2)
        }
      }
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
    if (mode === 'blob') {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
      setBlobMime('')
      setMode('direct')
      setResolvedSrc(src)
    } else {
      const a = audioRef.current
      if (a) a.load()
    }
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
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={resolvedSrc || undefined}
        preload="metadata"
        playsInline
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
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <span className="text-[#86868b] text-xs flex-1 leading-relaxed">
              {errorCode === 4
                ? 'この端末ではこの音声形式を再生できませんでした'
                : '音声を読み込めませんでした'}
              {errorCode !== -1 && (
                <span className="ml-1 opacity-60">
                  (E{errorCode}{blobMime ? ` · ${blobMime}` : ''})
                </span>
              )}
            </span>
            <button
              onClick={handleRetry}
              className="text-[#0095B6] text-[12px] font-medium underline flex-shrink-0"
            >
              再試行
            </button>
          </div>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#0095B6] text-white text-[12px] font-medium hover:bg-[#007A96] transition no-underline"
          >
            ▶ ブラウザで開いて再生
          </a>
          {errorCode === 4 && (
            <p className="text-[#86868b] text-[11px] leading-relaxed">
              ファイルが MP3 / AAC 形式の M4A / WAV であるかご確認のうえ、再アップロードしてください。
            </p>
          )}
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
