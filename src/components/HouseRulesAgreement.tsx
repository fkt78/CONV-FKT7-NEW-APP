import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'

const STORAGE_KEY = 'fkt7_rules_accepted'

export function isRulesAccepted(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

export function setRulesAccepted(): void {
  localStorage.setItem(STORAGE_KEY, 'true')
}

export default function HouseRulesAgreement() {
  const [accepted, setAccepted] = useState(isRulesAccepted)

  const handleAccept = useCallback(() => {
    setRulesAccepted()
    setAccepted(true)
  }, [])

  if (accepted) return null

  return (
    <div className="fixed inset-0 z-[9999] bg-[#f5f5f7] flex flex-col overflow-hidden">
      <div className="h-px bg-gradient-to-r from-transparent via-[#007AFF]/30 to-transparent flex-shrink-0" />
      <div className="h-px bg-gradient-to-r from-transparent via-[#5AC8FA]/20 to-transparent flex-shrink-0" />

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-lg mx-auto px-5 py-6 pb-8 safe-area-top">
          <div className="text-center mb-8">
            <span className="text-[#007AFF] text-4xl block mb-3" aria-hidden>♛</span>
            <h1 className="text-[#1d1d1f] font-semibold text-[22px] tracking-wide leading-tight">
              FKT7へようこそ
            </h1>
            <p className="text-[#86868b] text-[17px] tracking-wide mt-2">
              －特別な空間へご案内いたします－
            </p>
          </div>

          <div className="space-y-6 text-[#1d1d1f] text-[17px] leading-[1.5]">
            <p>
              いつもセブン-イレブン（伊賀平野東町店・伊賀平野北谷店・伊賀忍者市駅南店）をご愛顧いただき、誠にありがとうございます。
              本アプリは、上記3店舗をご利用いただく特別なお客様（VIP）だけに向けた、完全クローズドな専用プラットフォームです。皆様に最高の体験と、公平でスムーズなサービスをご提供するため、ご入室にあたり以下の「紳士協定（ハウスルール）」へのご理解をお願い申し上げます。
            </p>

            <div className="border-l-4 border-[#007AFF] pl-4 space-y-3">
              <h2 className="text-[#1d1d1f] font-semibold text-base">1. 希少商品の「特別なご案内」とご予約について</h2>
              <p>
                当店に入荷する数量限定の特殊な商品につきましては、FKT7メンバーの皆様を最優先といたします。
              </p>
              <ul className="list-disc list-inside space-y-1.5 text-[#86868b]">
                <li><strong className="text-[#1d1d1f]">ご予約の配分について：</strong> より多くのお客様に公平に喜んでいただけるよう、ご予約の割り当ては「当店の裁量」にて調整させていただく場合がございます。</li>
                <li><strong className="text-[#1d1d1f]">商品のお渡しについて：</strong> 極めて特殊な商品ゆえに、予期せぬ未入荷等のトラブルにより、万が一お渡しが叶わない可能性もございます。誠意をもって対応いたしますが、あらかじめ特別な商品である性質をご理解ください。</li>
              </ul>
            </div>

            <div className="border-l-4 border-[#007AFF] pl-4 space-y-3">
              <h2 className="text-[#1d1d1f] font-semibold text-base">2. 徹底した「秘密厳守」と「アプリ内完結」のお願い</h2>
              <p>
                FKT7は、お客様と店舗スタッフの「信義」によって成り立つシークレットな空間です。
              </p>
              <ul className="list-disc list-inside space-y-1.5 text-[#86868b]">
                <li><strong className="text-[#1d1d1f]">お問い合わせ窓口の限定：</strong> 特殊な商品に関する店舗へのお電話でのご確認や、店頭スタッフへの直接のお問い合わせは固くお断りいたします。情報の機密性を守るため、やり取りはすべて【本アプリ内のみ】とさせていただきます。</li>
                <li><strong className="text-[#1d1d1f]">お受け取りについて：</strong> 商品お渡しのご案内（お約束）をさせていただいた当日、もしくは翌日〜翌々日までにはお受け取りをお願いいたします。ご都合が悪い場合は、アプリより明確なご来店予定日をお知らせください。</li>
                <li><strong className="text-[#1d1d1f]">ご返信について：</strong> 本アプリは店舗スタッフが直接対応しております。専属のオペレーターではないため、ご連絡にお時間をいただく場合がございます。温かいご配慮をお願いいたします。</li>
              </ul>
            </div>

            <div className="border-l-4 border-[#007AFF] pl-4 space-y-3">
              <h2 className="text-[#1d1d1f] font-semibold text-base">3. FKT7のフル活用とサポート</h2>
              <p>
                本アプリはご予約ツールにとどまらず、限定クーポンや特別なご案内を随時お届けしていく予定です。ぜひ日常的にご活用ください。（※アプリ自体の操作方法等でご不明な点がございましたら、店頭スタッフまでお尋ねください）
              </p>
            </div>

            <div className="bg-[#007AFF]/5 border border-[#007AFF]/20 rounded-2xl p-4">
              <p className="text-[#1d1d1f] text-[15px]">
                万が一、上記のお約束や信頼関係を損なう行為が見受けられた場合、誠に勝手ながら事前の予告なくアプリの利用を停止させていただく場合がございます。
              </p>
            </div>

            <p className="text-[#86868b] text-[15px] leading-relaxed">
              本アプリのご利用には、
              <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-[#007AFF] underline hover:text-[#0051D5]">
                利用規約
              </Link>
              および
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#007AFF] underline hover:text-[#0051D5]">
                プライバシーポリシー
              </Link>
              への同意が必要です。下のボタンを押すことで、上記ハウスルールならびに利用規約・プライバシーポリシーに同意したものとみなします。
            </p>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-5 py-4 bg-white border-t border-[#e5e5ea] safe-area-bottom shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
        <button
          onClick={handleAccept}
          aria-label="同意してFKT7へ入場する"
          className="w-full min-h-[48px] py-4 bg-[#007AFF] text-white font-semibold text-[17px] tracking-wide rounded-2xl hover:bg-[#0051D5] active:scale-[0.98] transition shadow-sm"
        >
          同意してFKT7へ入場する
        </button>
      </div>
    </div>
  )
}
