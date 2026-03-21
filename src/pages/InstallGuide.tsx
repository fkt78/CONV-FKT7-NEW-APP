import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

type DeviceTab = 'iphone' | 'android'
type BrowserTab = 'safari' | 'chrome'

function StepItem({
  num,
  title,
  detail,
}: {
  num: number
  title: React.ReactNode
  detail: string
}) {
  return (
    <li className="flex gap-4 items-start">
      <span className="flex-shrink-0 w-12 h-12 rounded-xl bg-[#0095B6]/15 text-[#0095B6] flex items-center justify-center text-xl font-black border-2 border-[#0095B6]/30">
        {num}
      </span>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-[#1d1d1f] font-bold text-[15px] leading-snug mb-1">{title}</p>
        <p className="text-[#86868b] text-[14px] leading-relaxed">{detail}</p>
      </div>
    </li>
  )
}

export default function InstallGuide() {
  const navigate = useNavigate()
  const [deviceTab, setDeviceTab] = useState<DeviceTab>('iphone')
  const [browserTab, setBrowserTab] = useState<BrowserTab>('safari')

  return (
    <div className="min-h-dvh bg-[#f5f5f7] flex flex-col">
      <div className="h-px bg-gradient-to-r from-transparent via-[#0095B6]/30 to-transparent flex-shrink-0" />
      <div className="h-px bg-gradient-to-r from-transparent via-[#5BC8D7]/20 to-transparent flex-shrink-0" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-5 py-6 pb-10">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate(-1)}
              className="text-[#0095B6] text-[15px] hover:text-[#007A96] transition flex items-center gap-1"
            >
              ← 戻る
            </button>
          </div>

          <div className="text-center mb-6">
            <span className="text-4xl block mb-3">📱</span>
            <h1 className="text-[#1d1d1f] font-semibold text-xl tracking-wide">
              ホーム画面に追加
            </h1>
            <p className="text-[#86868b] text-[15px] mt-2 leading-relaxed">
              FKT7をアプリのように使うには
              <br />
              ホーム画面に追加してください
            </p>
          </div>

          <div className="flex rounded-xl bg-[#e5e5ea]/60 p-1 mb-4">
            <button
              onClick={() => {
                setDeviceTab('iphone')
                setBrowserTab('safari')
              }}
              className={`flex-1 py-3 rounded-lg text-[15px] font-semibold transition flex items-center justify-center gap-2 ${
                deviceTab === 'iphone'
                  ? 'bg-white text-[#0095B6] shadow-sm'
                  : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              <span className="text-xl">🍎</span>
              iPhone・iPad
            </button>
            <button
              onClick={() => setDeviceTab('android')}
              className={`flex-1 py-3 rounded-lg text-[15px] font-semibold transition flex items-center justify-center gap-2 ${
                deviceTab === 'android'
                  ? 'bg-white text-[#0095B6] shadow-sm'
                  : 'text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              <span className="text-xl">🤖</span>
              Android
            </button>
          </div>

          {deviceTab === 'iphone' && (
            <div className="flex rounded-lg bg-[#e5e5ea]/40 p-1 mb-5">
              <button
                onClick={() => setBrowserTab('safari')}
                className={`flex-1 py-2.5 rounded-md text-[14px] font-semibold transition flex items-center justify-center gap-1.5 ${
                  browserTab === 'safari'
                    ? 'bg-white text-[#0095B6] shadow-sm'
                    : 'text-[#86868b] hover:text-[#1d1d1f]'
                }`}
              >
                <span className="text-base">🧭</span>
                Safari
              </button>
              <button
                onClick={() => setBrowserTab('chrome')}
                className={`flex-1 py-2.5 rounded-md text-[14px] font-semibold transition flex items-center justify-center gap-1.5 ${
                  browserTab === 'chrome'
                    ? 'bg-white text-[#0095B6] shadow-sm'
                    : 'text-[#86868b] hover:text-[#1d1d1f]'
                }`}
              >
                <span className="text-base">🌐</span>
                Chrome
              </button>
            </div>
          )}

          <div className="rounded-xl bg-white border border-[#e5e5ea] p-5 space-y-6 shadow-sm">
            {deviceTab === 'iphone' && browserTab === 'safari' && (
              <>
                <div className="flex items-center gap-2 pb-2 border-b border-[#e5e5ea]">
                  <span className="text-2xl">🧭</span>
                  <h2 className="text-[#1d1d1f] font-semibold text-[16px]">
                    iPhone・iPad（Safari）
                  </h2>
                </div>
                <p className="text-[#1d1d1f] text-[15px] leading-relaxed">
                  Safariでこのページを開いた状態で、以下の手順で追加できます。
                </p>
                <ol className="space-y-5">
                  <StepItem
                    num={1}
                    title={
                      <>
                        <span className="text-2xl align-middle mr-1">📤</span>
                        画面下の「共有ボタン」をタップ
                      </>
                    }
                    detail="画面下部中央付近にある、四角から矢印が出ているアイコン（共有ボタン）をタップします。"
                  />
                  <StepItem
                    num={2}
                    title={
                      <>
                        <span className="text-2xl align-middle mr-1">➕</span>
                        「ホーム画面に追加」を選択
                      </>
                    }
                    detail="表示されたメニューの中から「ホーム画面に追加」を探してタップします。"
                  />
                  <StepItem
                    num={3}
                    title="右上の「追加」をタップ"
                    detail="画面右上の「追加」ボタンをタップして完了です。"
                  />
                </ol>
              </>
            )}

            {deviceTab === 'iphone' && browserTab === 'chrome' && (
              <>
                <div className="flex items-center gap-2 pb-2 border-b border-[#e5e5ea]">
                  <span className="text-2xl">🌐</span>
                  <h2 className="text-[#1d1d1f] font-semibold text-[16px]">
                    iPhone・iPad（Google Chrome）
                  </h2>
                </div>
                <p className="text-[#1d1d1f] text-[15px] leading-relaxed">
                  Chromeでこのページを開いた状態で、以下の手順で追加できます。
                </p>
                <ol className="space-y-5">
                  <StepItem
                    num={1}
                    title={
                      <>
                        <span className="text-2xl align-middle mr-1">📤</span>
                        アドレスバー横の「共有ボタン」をタップ
                      </>
                    }
                    detail="画面下部のアドレスバー（URLが表示されている部分）の横にある、共有アイコンをタップします。"
                  />
                  <StepItem
                    num={2}
                    title={
                      <>
                        <span className="text-2xl align-middle mr-1">➕</span>
                        「ホーム画面に追加」を選択
                      </>
                    }
                    detail="メニューをスクロールして「ホーム画面に追加」を探し、タップします。"
                  />
                </ol>
              </>
            )}

            {deviceTab === 'android' && (
              <>
                <div className="flex items-center gap-2 pb-2 border-b border-[#e5e5ea]">
                  <span className="text-2xl">🤖</span>
                  <h2 className="text-[#1d1d1f] font-semibold text-[16px]">
                    Android（Google Chrome）
                  </h2>
                </div>
                <p className="text-[#1d1d1f] text-[15px] leading-relaxed">
                  Chromeでこのページを開いた状態で、以下の手順で追加できます。
                </p>
                <ol className="space-y-5">
                  <StepItem
                    num={1}
                    title={
                      <>
                        <span className="text-2xl align-middle mr-1">︙</span>
                        画面右上の「メニュー」をタップ
                      </>
                    }
                    detail="画面右上にある、縦に並んだ3つの点「︙」（メニューアイコン）をタップします。"
                  />
                  <StepItem
                    num={2}
                    title={
                      <>
                        <span className="text-2xl align-middle mr-1">📲</span>
                        「アプリをインストール」または「ホーム画面に追加」を選択
                      </>
                    }
                    detail="表示されたメニューから「アプリをインストール」または「ホーム画面に追加」をタップします。機種やChromeのバージョンにより表示が異なる場合があります。"
                  />
                </ol>
              </>
            )}
          </div>

          <p className="text-[#86868b] text-[14px] mt-6 text-center leading-relaxed">
            追加後はホーム画面にFKT7のアイコンが表示されます。
            <br />
            アプリのようにサクサク使えます ♛
          </p>

          {/* LINEでリンクが開けない場合の案内 */}
          <div className="mt-8 p-4 rounded-2xl bg-[#0095B6]/5 border border-[#0095B6]/20">
            <h3 className="text-[#1d1d1f] font-semibold text-[15px] mb-2 flex items-center gap-2">
              <span>💬</span>
              LINEでリンクが開けない場合
            </h3>
            <p className="text-[#86868b] text-[14px] leading-relaxed mb-3">
              LINEのアプリ内ブラウザでは開けない場合があります。以下の方法をお試しください。
            </p>
            <ul className="text-[#1d1d1f] text-[14px] space-y-2 list-disc list-inside">
              <li>リンクを長押しで「ブラウザで開く」を選択</li>
              <li>LINE設定 → LINE Labs → 「リンクをデフォルトのブラウザで開く」をON</li>
              <li>URLをコピーしてSafariやChromeに貼り付けて開く</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
