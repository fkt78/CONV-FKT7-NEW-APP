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
      <span className="flex-shrink-0 w-12 h-12 rounded-xl bg-amber-400/25 text-amber-400 flex items-center justify-center text-xl font-black border-2 border-amber-400/40">
        {num}
      </span>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-white font-bold text-[15px] leading-snug mb-1">{title}</p>
        <p className="text-white/85 text-[14px] leading-relaxed">{detail}</p>
      </div>
    </li>
  )
}

export default function InstallGuide() {
  const navigate = useNavigate()
  const [deviceTab, setDeviceTab] = useState<DeviceTab>('iphone')
  const [browserTab, setBrowserTab] = useState<BrowserTab>('safari')

  return (
    <div className="min-h-dvh bg-[#0a0a0f] flex flex-col">
      {/* 上部ボーダー */}
      <div className="h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent flex-shrink-0" />
      <div className="h-px bg-gradient-to-r from-transparent via-amber-400/30 to-transparent flex-shrink-0" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-5 py-6 pb-10">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => navigate(-1)}
              className="text-amber-400/80 text-[15px] hover:text-amber-400 transition flex items-center gap-1"
            >
              ← 戻る
            </button>
          </div>

          {/* タイトル */}
          <div className="text-center mb-6">
            <span className="text-4xl block mb-3">📱</span>
            <h1 className="text-amber-400 font-bold text-xl tracking-wide">
              ホーム画面に追加
            </h1>
            <p className="text-white/75 text-[15px] mt-2 leading-relaxed">
              FKT7をアプリのように使うには
              <br />
              ホーム画面に追加してください
            </p>
          </div>

          {/* 機種タブ（1段目） */}
          <div className="flex rounded-xl bg-white/[0.06] p-1 mb-4">
            <button
              onClick={() => {
                setDeviceTab('iphone')
                setBrowserTab('safari')
              }}
              className={`flex-1 py-3 rounded-lg text-[15px] font-semibold transition flex items-center justify-center gap-2 ${
                deviceTab === 'iphone'
                  ? 'bg-amber-400/20 text-amber-400 border border-amber-400/40'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              <span className="text-xl">🍎</span>
              iPhone・iPad
            </button>
            <button
              onClick={() => setDeviceTab('android')}
              className={`flex-1 py-3 rounded-lg text-[15px] font-semibold transition flex items-center justify-center gap-2 ${
                deviceTab === 'android'
                  ? 'bg-amber-400/20 text-amber-400 border border-amber-400/40'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              <span className="text-xl">🤖</span>
              Android
            </button>
          </div>

          {/* ブラウザタブ（iPhone時のみ） */}
          {deviceTab === 'iphone' && (
            <div className="flex rounded-lg bg-white/[0.04] p-1 mb-5">
              <button
                onClick={() => setBrowserTab('safari')}
                className={`flex-1 py-2.5 rounded-md text-[14px] font-semibold transition flex items-center justify-center gap-1.5 ${
                  browserTab === 'safari'
                    ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30'
                    : 'text-white/50 hover:text-white/70'
                }`}
              >
                <span className="text-base">🧭</span>
                Safari
              </button>
              <button
                onClick={() => setBrowserTab('chrome')}
                className={`flex-1 py-2.5 rounded-md text-[14px] font-semibold transition flex items-center justify-center gap-1.5 ${
                  browserTab === 'chrome'
                    ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30'
                    : 'text-white/50 hover:text-white/70'
                }`}
              >
                <span className="text-base">🌐</span>
                Chrome
              </button>
            </div>
          )}

          {/* 説明エリア（高コントラスト） */}
          <div className="rounded-xl bg-[#1a1a2e] border-2 border-amber-400/20 p-5 space-y-6">
            {deviceTab === 'iphone' && browserTab === 'safari' && (
              <>
                <div className="flex items-center gap-2 pb-2 border-b border-amber-400/20">
                  <span className="text-2xl">🧭</span>
                  <h2 className="text-amber-400 font-bold text-[16px]">
                    iPhone・iPad（Safari）
                  </h2>
                </div>
                <p className="text-white/90 text-[15px] leading-relaxed">
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
                <div className="flex items-center gap-2 pb-2 border-b border-amber-400/20">
                  <span className="text-2xl">🌐</span>
                  <h2 className="text-amber-400 font-bold text-[16px]">
                    iPhone・iPad（Google Chrome）
                  </h2>
                </div>
                <p className="text-white/90 text-[15px] leading-relaxed">
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
                <div className="flex items-center gap-2 pb-2 border-b border-amber-400/20">
                  <span className="text-2xl">🤖</span>
                  <h2 className="text-amber-400 font-bold text-[16px]">
                    Android（Google Chrome）
                  </h2>
                </div>
                <p className="text-white/90 text-[15px] leading-relaxed">
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

          {/* 補足 */}
          <p className="text-white/65 text-[14px] mt-6 text-center leading-relaxed">
            追加後はホーム画面にFKT7のアイコンが表示されます。
            <br />
            アプリのようにサクサク使えます ♛
          </p>
        </div>
      </div>
    </div>
  )
}
