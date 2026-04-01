/* eslint-disable react-refresh/only-export-components */
import { useState, useCallback } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import LanguageSwitcher from './LanguageSwitcher'

const STORAGE_KEY = 'fkt7_rules_accepted'

export function isRulesAccepted(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

export function setRulesAccepted(): void {
  localStorage.setItem(STORAGE_KEY, 'true')
}

function BulletItem({ label, text }: { label: string; text: string }) {
  return (
    <li>
      <strong className="text-[#1d1d1f]">{label}</strong> {text}
    </li>
  )
}

export default function HouseRulesAgreement() {
  const { t } = useTranslation()
  const hr = (key: string) => t(`houseRules.${key}`)
  const [accepted, setAccepted] = useState(isRulesAccepted)

  const handleAccept = useCallback(() => {
    setRulesAccepted()
    setAccepted(true)
  }, [])

  if (accepted) return null

  return (
    <div className="fixed inset-0 z-[9999] bg-[#f5f5f7] flex flex-col overflow-hidden">
      <div className="h-px bg-gradient-to-r from-transparent via-[#0095B6]/30 to-transparent flex-shrink-0" />
      <div className="h-px bg-gradient-to-r from-transparent via-[#5BC8D7]/20 to-transparent flex-shrink-0" />

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-lg mx-auto px-5 py-6 pb-8 safe-area-top">
          <div className="flex justify-end mb-4">
            <LanguageSwitcher />
          </div>
          <div className="text-center mb-8">
            <span className="text-[#0095B6] text-4xl block mb-3" aria-hidden>♛</span>
            <h1 className="text-[#1d1d1f] font-semibold text-[22px] tracking-wide leading-tight">
              {hr('welcomeTitle')}
            </h1>
            <p className="text-[#86868b] text-[17px] tracking-wide mt-2">
              {hr('welcomeSubtitle')}
            </p>
          </div>

          <div className="space-y-6 text-[#1d1d1f] text-[17px] leading-[1.5]">
            <p>{hr('intro')}</p>

            <div className="border-l-4 border-[#0095B6] pl-4 space-y-3">
              <h2 className="text-[#1d1d1f] font-semibold text-base">{hr('s1_title')}</h2>
              <p>{hr('s1_lead')}</p>
              <ul className="list-disc list-inside space-y-1.5 text-[#86868b]">
                <BulletItem label={hr('s1_b1_label')} text={hr('s1_b1_text')} />
                <BulletItem label={hr('s1_b2_label')} text={hr('s1_b2_text')} />
                <BulletItem label={hr('s1_b3_label')} text={hr('s1_b3_text')} />
                <BulletItem label={hr('s1_b4_label')} text={hr('s1_b4_text')} />
                <BulletItem label={hr('s1_b5_label')} text={hr('s1_b5_text')} />
                <BulletItem label={hr('s1_b6_label')} text={hr('s1_b6_text')} />
              </ul>
            </div>

            <div className="border-l-4 border-[#0095B6] pl-4 space-y-3">
              <h2 className="text-[#1d1d1f] font-semibold text-base">{hr('s2_title')}</h2>
              <p>{hr('s2_lead')}</p>
              <ul className="list-disc list-inside space-y-1.5 text-[#86868b]">
                <BulletItem label={hr('s2_b1_label')} text={hr('s2_b1_text')} />
                <BulletItem label={hr('s2_b2_label')} text={hr('s2_b2_text')} />
                <BulletItem label={hr('s2_b3_label')} text={hr('s2_b3_text')} />
                <BulletItem label={hr('s2_b4_label')} text={hr('s2_b4_text')} />
                <BulletItem label={hr('s2_b5_label')} text={hr('s2_b5_text')} />
                <BulletItem label={hr('s2_b6_label')} text={hr('s2_b6_text')} />
              </ul>
            </div>

            <div className="border-l-4 border-[#0095B6] pl-4 space-y-3">
              <h2 className="text-[#1d1d1f] font-semibold text-base">{hr('s3_title')}</h2>
              <p>{hr('s3_lead')}</p>
              <ul className="list-disc list-inside space-y-1.5 text-[#86868b]">
                <BulletItem label={hr('s3_b1_label')} text={hr('s3_b1_text')} />
                <BulletItem label={hr('s3_b2_label')} text={hr('s3_b2_text')} />
              </ul>
            </div>

            <div className="border-l-4 border-[#0095B6] pl-4 space-y-3">
              <h2 className="text-[#1d1d1f] font-semibold text-base">{hr('s4_title')}</h2>
              <p>{hr('s4_lead')}</p>
              <ul className="list-disc list-inside space-y-1.5 text-[#86868b]">
                <BulletItem label={hr('s4_b1_label')} text={hr('s4_b1_text')} />
                <BulletItem label={hr('s4_b2_label')} text={hr('s4_b2_text')} />
                <BulletItem label={hr('s4_b3_label')} text={hr('s4_b3_text')} />
              </ul>
            </div>

            <div className="border-l-4 border-[#0095B6] pl-4 space-y-3">
              <h2 className="text-[#1d1d1f] font-semibold text-base">{hr('s5_title')}</h2>
              <p>{hr('s5_body')}</p>
            </div>

            <div className="bg-[#0095B6]/5 border border-[#0095B6]/20 rounded-2xl p-4">
              <p className="text-[#1d1d1f] text-[15px]">{hr('warning')}</p>
            </div>

            <p className="text-[#86868b] text-[15px] leading-relaxed">
              <Trans
                i18nKey="houseRules.footerAgreement"
                components={{
                  termsLink: (
                    <Link
                      to="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0095B6] underline hover:text-[#007A96]"
                    />
                  ),
                  privacyLink: (
                    <Link
                      to="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0095B6] underline hover:text-[#007A96]"
                    />
                  ),
                }}
              />
            </p>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-5 py-4 bg-white border-t border-[#e5e5ea] safe-area-bottom shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
        <button
          onClick={handleAccept}
          aria-label={hr('acceptAria')}
          className="w-full min-h-[48px] py-4 bg-[#0095B6] text-white font-semibold text-[17px] tracking-wide rounded-2xl hover:bg-[#007A96] active:scale-[0.98] transition shadow-sm"
        >
          {hr('accept')}
        </button>
      </div>
    </div>
  )
}
