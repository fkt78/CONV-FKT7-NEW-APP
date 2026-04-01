import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import LanguageSwitcher from '../components/LanguageSwitcher'

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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [deviceTab, setDeviceTab] = useState<DeviceTab>('iphone')
  const [browserTab, setBrowserTab] = useState<BrowserTab>('safari')

  return (
    <div className="min-h-dvh bg-[#f5f5f7] flex flex-col">
      <div className="h-px bg-gradient-to-r from-transparent via-[#0095B6]/30 to-transparent flex-shrink-0" />
      <div className="h-px bg-gradient-to-r from-transparent via-[#5BC8D7]/20 to-transparent flex-shrink-0" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-5 py-6 pb-10">
          <div className="flex items-center justify-between mb-6 gap-2">
            <button
              onClick={() => navigate(-1)}
              className="text-[#0095B6] text-[15px] hover:text-[#007A96] transition flex items-center gap-1"
            >
              {t('install.back')}
            </button>
            <LanguageSwitcher className="flex-shrink-0" />
          </div>

          <div className="text-center mb-6">
            <span className="text-4xl block mb-3">📱</span>
            <h1 className="text-[#1d1d1f] font-semibold text-xl tracking-wide">
              {t('install.title')}
            </h1>
            <p className="text-[#86868b] text-[15px] mt-2 leading-relaxed">
              {t('install.subtitle')}
              <br />
              {t('install.subtitle2')}
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
              {t('install.iphoneIpad')}
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
              {t('install.android')}
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
                {t('install.safari')}
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
                {t('install.chrome')}
              </button>
            </div>
          )}

          <div className="rounded-xl bg-white border border-[#e5e5ea] p-5 space-y-6 shadow-sm">
            {deviceTab === 'iphone' && browserTab === 'safari' && (
              <>
                <div className="flex items-center gap-2 pb-2 border-b border-[#e5e5ea]">
                  <span className="text-2xl">🧭</span>
                  <h2 className="text-[#1d1d1f] font-semibold text-[16px]">
                    {t('install.iphoneSafariTitle')}
                  </h2>
                </div>
                <p className="text-[#1d1d1f] text-[15px] leading-relaxed">
                  {t('install.iphoneSafariIntro')}
                </p>
                <ol className="space-y-5">
                  <StepItem
                    num={1}
                    title={
                      <>
                        <span className="text-2xl align-middle mr-1">📤</span>
                        {t('install.step1SafariTitle')}
                      </>
                    }
                    detail={t('install.step1SafariDetail')}
                  />
                  <StepItem
                    num={2}
                    title={
                      <>
                        <span className="text-2xl align-middle mr-1">➕</span>
                        {t('install.step2Title')}
                      </>
                    }
                    detail={t('install.step2SafariDetail')}
                  />
                  <StepItem
                    num={3}
                    title={t('install.step3Title')}
                    detail={t('install.step3Detail')}
                  />
                </ol>
              </>
            )}

            {deviceTab === 'iphone' && browserTab === 'chrome' && (
              <>
                <div className="flex items-center gap-2 pb-2 border-b border-[#e5e5ea]">
                  <span className="text-2xl">🌐</span>
                  <h2 className="text-[#1d1d1f] font-semibold text-[16px]">
                    {t('install.iphoneChromeTitle')}
                  </h2>
                </div>
                <p className="text-[#1d1d1f] text-[15px] leading-relaxed">
                  {t('install.iphoneChromeIntro')}
                </p>
                <ol className="space-y-5">
                  <StepItem
                    num={1}
                    title={
                      <>
                        <span className="text-2xl align-middle mr-1">📤</span>
                        {t('install.step1ChromeTitle')}
                      </>
                    }
                    detail={t('install.step1ChromeDetail')}
                  />
                  <StepItem
                    num={2}
                    title={
                      <>
                        <span className="text-2xl align-middle mr-1">➕</span>
                        {t('install.step2Title')}
                      </>
                    }
                    detail={t('install.step2ChromeDetail')}
                  />
                </ol>
              </>
            )}

            {deviceTab === 'android' && (
              <>
                <div className="flex items-center gap-2 pb-2 border-b border-[#e5e5ea]">
                  <span className="text-2xl">🤖</span>
                  <h2 className="text-[#1d1d1f] font-semibold text-[16px]">
                    {t('install.androidChromeTitle')}
                  </h2>
                </div>
                <p className="text-[#1d1d1f] text-[15px] leading-relaxed">
                  {t('install.androidChromeIntro')}
                </p>
                <ol className="space-y-5">
                  <StepItem
                    num={1}
                    title={
                      <>
                        <span className="text-2xl align-middle mr-1">︙</span>
                        {t('install.androidStep1Title')}
                      </>
                    }
                    detail={t('install.androidStep1Detail')}
                  />
                  <StepItem
                    num={2}
                    title={
                      <>
                        <span className="text-2xl align-middle mr-1">📲</span>
                        {t('install.androidStep2Title')}
                      </>
                    }
                    detail={t('install.androidStep2Detail')}
                  />
                </ol>
              </>
            )}
          </div>

          <p className="text-[#86868b] text-[14px] mt-6 text-center leading-relaxed">
            {t('install.footer')}
            <br />
            {t('install.footer2')}
          </p>

          <div className="mt-8 p-4 rounded-2xl bg-[#0095B6]/5 border border-[#0095B6]/20">
            <h3 className="text-[#1d1d1f] font-semibold text-[15px] mb-2 flex items-center gap-2">
              <span>💬</span>
              {t('install.lineTitle')}
            </h3>
            <p className="text-[#86868b] text-[14px] leading-relaxed mb-3">
              {t('install.lineIntro')}
            </p>
            <ul className="text-[#1d1d1f] text-[14px] space-y-2 list-disc list-inside">
              <li>{t('install.lineLi1')}</li>
              <li>{t('install.lineLi2')}</li>
              <li>{t('install.lineLi3')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
