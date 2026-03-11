import { useEffect } from 'react'

const CREDITS = [
  {
    name: 'VOICEVOX:四国めたん / 九州そら / ずんだもん',
    url: 'https://zunko.jp/con_ongen_kiyaku.html',
  },
  {
    name: 'VOICEVOX:春日部つむぎ',
    url: 'https://tsumugi-official.studio.site/rule',
  },
  {
    name: 'VOICEVOX:雨晴はう',
    url: 'https://amehau.com/?page_id=225',
  },
  {
    name: 'VOICEVOX:波音リツ',
    url: 'http://canon-voice.com/kiyaku.html',
  },
  {
    name: 'VOICEVOX:玄野武宏 / 白上虎太郎 / 青山龍星',
    url: 'https://www.virvoxproject.com/voicevoxの利用規約',
  },
  {
    name: 'VOICEVOX:冥鳴ひまり',
    url: 'https://meimeihimari.wixsite.com/himari/terms-of-use',
  },
  {
    name: 'VOICEVOX:もち子(cv 明日葉よもぎ)',
    url: 'https://vtubermochio.wixsite.com/mochizora/利用規約',
  },
  {
    name: 'VOICEVOX:剣崎雌雄',
    url: 'https://frontier.creatia.cc/fanclubs/413/posts/4507',
  },
] as const

interface VoiceCreditsPopupProps {
  open: boolean
  onClose: () => void
}

export default function VoiceCreditsPopup({ open, onClose }: VoiceCreditsPopupProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      aria-modal
      aria-labelledby="voice-credits-title"
    >
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col bg-white border border-[#e5e5ea] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-px bg-gradient-to-r from-transparent via-[#007AFF]/30 to-transparent flex-shrink-0" />
        <div className="h-px bg-gradient-to-r from-transparent via-[#5AC8FA]/20 to-transparent flex-shrink-0" />

        <div className="px-5 py-4 border-b border-[#e5e5ea] flex-shrink-0">
          <h2
            id="voice-credits-title"
            className="text-[#1d1d1f] font-semibold text-lg tracking-wide"
          >
            音声クレジット（ライセンス情報）
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
          <p className="text-[#1d1d1f] text-[14px] leading-relaxed">
            本アプリ内の音声ガイダンスは、無料の音声合成ソフト「VOICEVOX」および以下の音声ライブラリを使用して生成されています。
          </p>
          <ul className="space-y-4">
            {CREDITS.map((item, i) => (
              <li key={i} className="border-l-4 border-[#007AFF] pl-4">
                <p className="text-[#1d1d1f] font-medium text-[14px] mb-1">{item.name}</p>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#007AFF] text-[13px] hover:text-[#0051D5] hover:underline transition"
                >
                  規約 →
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-5 py-4 border-t border-[#e5e5ea] flex-shrink-0 safe-area-bottom">
          <button
            onClick={onClose}
            className="w-full py-3 bg-[#007AFF] text-white font-semibold text-base rounded-2xl hover:bg-[#0051D5] transition active:scale-[0.98]"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}
