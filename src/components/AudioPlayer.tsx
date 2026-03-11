import { useState, useEffect, useRef } from 'react'

interface AudioPlayerProps {
  src: string
  title?: string
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || isNaN(sec)) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function AudioPlayer({ src, title }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const audio = new Audio(src)
    audio.preload = 'metadata'
    audioRef.current = audio

    const onLoaded = () => {
      setDuration(audio.duration)
      setLoading(false)
    }
    const onTime = () => setCurrentTime(audio.currentTime)
    const onEnded = () => {
      setPlaying(false)
      setCurrentTime(0)
      audio.currentTime = 0
    }
    const onError = () => {
      setError(true)
      setLoading(false)
    }

    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)

    return () => {
      audio.pause()
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
    }
  }, [src])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio || loading || error) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.play()
      setPlaying(true)
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current
    if (!audio) return
    const t = Number(e.target.value)
    audio.currentTime = t
    setCurrentTime(t)
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#f5f5f7] border border-[#e5e5ea]">
        <span className="text-[#86868b] text-xs">音声を読み込めませんでした</span>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-[#f5f5f7] border border-[#e5e5ea] px-4 py-3 space-y-2">
      {title && (
        <p className="text-[#007AFF] text-[10px] font-medium tracking-widest truncate">
          ♪ {title}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          disabled={loading}
          className="w-9 h-9 rounded-full bg-[#007AFF] flex items-center justify-center flex-shrink-0 shadow-sm hover:bg-[#0051D5] transition disabled:opacity-40 disabled:cursor-wait"
          aria-label={playing ? '一時停止' : '再生'}
        >
          {loading ? (
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

        {/* プログレス & タイム */}
        <div className="flex-1 space-y-1.5">
          {/* シークバー */}
          <div className="relative h-1.5 rounded-full bg-[#e5e5ea] group">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[#007AFF] pointer-events-none transition-all"
              style={{ width: `${progress}%` }}
            />
            {/* スライダー */}
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              disabled={loading || duration === 0}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
              aria-label="シーク"
            />
            {/* サムネイル */}
            {duration > 0 && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#007AFF] shadow-sm pointer-events-none transition-all"
                style={{ left: `calc(${progress}% - 6px)` }}
              />
            )}
          </div>

          {/* 時間表示 */}
          <div className="flex items-center justify-between">
            <span className="text-[#86868b] text-[10px] tabular-nums">
              {formatTime(currentTime)}
            </span>
            <span className="text-[#86868b]/80 text-[10px] tabular-nums">
              {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
