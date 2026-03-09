import { useNavigate } from 'react-router-dom'

interface LegalPageLayoutProps {
  title: string
  children: React.ReactNode
}

export default function LegalPageLayout({ title, children }: LegalPageLayoutProps) {
  const navigate = useNavigate()

  return (
    <div className="h-dvh bg-[#0a0a0f] flex flex-col overflow-hidden">
      <div className="h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent flex-shrink-0" />
      <div className="h-px bg-gradient-to-r from-transparent via-amber-400/30 to-transparent flex-shrink-0" />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-lg mx-auto px-5 py-6 pb-10">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate(-1)}
              className="text-amber-400/80 text-[15px] hover:text-amber-400 transition"
            >
              ← 戻る
            </button>
          </div>

          <h1 className="text-amber-400 font-bold text-xl mb-6">{title}</h1>

          <div className="text-white/90 text-[14px] leading-relaxed space-y-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
