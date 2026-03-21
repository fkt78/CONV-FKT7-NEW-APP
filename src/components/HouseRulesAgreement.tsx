/* eslint-disable react-refresh/only-export-components */
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
      <div className="h-px bg-gradient-to-r from-transparent via-[#0095B6]/30 to-transparent flex-shrink-0" />
      <div className="h-px bg-gradient-to-r from-transparent via-[#5BC8D7]/20 to-transparent flex-shrink-0" />

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-lg mx-auto px-5 py-6 pb-8 safe-area-top">
          <div className="text-center mb-8">
            <span className="text-[#0095B6] text-4xl block mb-3" aria-hidden>♛</span>
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

            <div className="border-l-4 border-[#0095B6] pl-4 space-y-3">
              <h2 className="text-[#1d1d1f] font-semibold text-base">1. 希少商品の「特別なご案内」とご予約について</h2>
              <p>
                当店に入荷する数量限定の特殊な商品につきましては、FKT7メンバーの皆様を最優先といたします。
              </p>
              <ul className="list-disc list-inside space-y-1.5 text-[#86868b]">
                <li><strong className="text-[#1d1d1f]">ご予約の配分について：</strong> より多くのお客様に公平に喜んでいただけるよう、ご予約の割り当ては「当店の裁量」にて調整させていただく場合がございます。</li>
                <li><strong className="text-[#1d1d1f]">商品のお渡しについて：</strong> 極めて特殊な商品ゆえに、予期せぬ未入荷等のトラブルにより、万が一お渡しが叶わない可能性もございます。誠意をもって対応いたしますが、あらかじめ特別な商品である性質をご理解ください。</li>
                <li><strong className="text-[#1d1d1f]">トレーディングカード・くじ・抽選賞品等の取り扱い：</strong> トレーディングカード、抽選やくじ形式のキャラクター賞品等、当店にて多くご予約をいただく商品につきましては、メーカー様等の情報が公表されていても、セブン-イレブンとして当店でお取り扱いできるかどうかは、発売前まで必ずしも分からないことがございます。一般に他小売等で発売される場合でも、当店でお取り扱いするかどうかは別途決まることがあります。あらかじめご了承ください。</li>
                <li><strong className="text-[#1d1d1f]">発売前のお問い合わせについて：</strong> 当店・セブン-イレブンが販売を管理するオリジナル商品等につきましては、発売日以前であってもご案内できる範囲でお答えいたします。他メーカー等の商品で、当店・セブン-イレブン全体の取り扱いが確定していないものにつきましては、発売日以前の商品に関するお問い合わせには、お答えしかねる場合がございます。取り扱いの有無・詳細につきましては、発売日当日をもってご案内させていただく場合がございます。また当店はメーカーではございませんため、発売前日時や価格・仕様等、確実なご回答をお約束しかねる場合もございます。ご案内できる範囲で誠意をもってお答えいたしますので、ご理解とご了承をお願い申し上げます。</li>
                <li><strong className="text-[#1d1d1f]">ご予約のキャンセル・変更について：</strong> ご予約のキャンセルや内容の変更は、本アプリ内のチャット等にてお申し出ください。無連絡のキャンセルやお約束の不履行が繰り返し見受けられる場合、今後のご予約の優先や本アプリのご利用に影響する場合がございます。</li>
                <li><strong className="text-[#1d1d1f]">年齢制限商品について：</strong> お酒・たばこ等、法令により年齢制限のある商品をご案内する際は、店頭にてご本人確認をさせていただきます。あらかじめご了承ください。</li>
              </ul>
            </div>

            <div className="border-l-4 border-[#0095B6] pl-4 space-y-3">
              <h2 className="text-[#1d1d1f] font-semibold text-base">2. 徹底した「秘密厳守」と「アプリ内完結」のお願い</h2>
              <p>
                FKT7は、お客様と店舗スタッフの「信義」によって成り立つシークレットな空間です。
              </p>
              <ul className="list-disc list-inside space-y-1.5 text-[#86868b]">
                <li><strong className="text-[#1d1d1f]">お問い合わせ窓口の限定：</strong> 特殊な商品に関する店舗へのお電話でのご確認や、店頭スタッフへの直接のお問い合わせは固くお断りいたします。情報の機密性を守るため、やり取りはすべて【本アプリ内のみ】とさせていただきます。</li>
                <li><strong className="text-[#1d1d1f]">SNS・第三者への言及：</strong> 本アプリ内でお知らせいたしました内容や限定情報を、SNSや口コミサイト等へ公開したり、第三者へ開示したりしないようお願いいたします。ご家族・友人等からお問い合わせがありましても、内容は伏せてお答えいただくなど、皆様の特別な空間を守るご協力をお願い申し上げます。</li>
                <li><strong className="text-[#1d1d1f]">お受け取りについて：</strong> 商品お渡しのご案内（お約束）をさせていただいた当日、もしくは翌日〜翌々日までにはお受け取りをお願いいたします。ご都合が悪い場合は、アプリより明確なご来店予定日をお知らせください。</li>
                <li><strong className="text-[#1d1d1f]">お受け取り時の本人確認：</strong> 商品のお渡しの際、本人確認をさせていただく場合がございます。本人確認のできる書類をお忘れなきようお願いいたします。</li>
                <li><strong className="text-[#1d1d1f]">ご返信について：</strong> 本アプリは店舗スタッフが直接対応しております。専属のオペレーターではないため、ご連絡にお時間をいただく場合がございます。温かいご配慮をお願いいたします。</li>
                <li><strong className="text-[#1d1d1f]">チャットのご利用について：</strong> 本アプリのチャットは、店舗スタッフと円滑にご連絡するための窓口です。誹謗中傷・迷惑行為、業務を著しく妨げる行為はお控えください。温かいご協力をお願いいたします。</li>
              </ul>
            </div>

            <div className="border-l-4 border-[#0095B6] pl-4 space-y-3">
              <h2 className="text-[#1d1d1f] font-semibold text-base">3. アカウントの取り扱い</h2>
              <p>
                本アプリは、ご本人様のみのご利用を前提としております。
              </p>
              <ul className="list-disc list-inside space-y-1.5 text-[#86868b]">
                <li><strong className="text-[#1d1d1f]">ログイン情報の管理：</strong> ログインに用いる情報・パスワード等は、ご本人様のみで管理し、第三者への共有や譲渡はお控えください。</li>
                <li><strong className="text-[#1d1d1f]">複数アカウントについて：</strong> 同一人物による複数アカウントの作成・利用はお控えください。</li>
              </ul>
            </div>

            <div className="border-l-4 border-[#0095B6] pl-4 space-y-3">
              <h2 className="text-[#1d1d1f] font-semibold text-base">4. FKT7のフル活用とサポート</h2>
              <p>
                本アプリはご予約ツールにとどまらず、限定クーポンや特別なご案内を随時お届けしていく予定です。ぜひ日常的にご活用ください。
              </p>
              <ul className="list-disc list-inside space-y-1.5 text-[#86868b]">
                <li><strong className="text-[#1d1d1f]">クーポン・特典について：</strong> 有効期限・利用条件が定められる場合がございます。アプリ上の表示に従い、ご利用ください。</li>
                <li><strong className="text-[#1d1d1f]">転売について：</strong> 転売を目的とした取得や利用はお控えください。</li>
                <li><strong className="text-[#1d1d1f]">操作方法について：</strong> アプリ自体の操作方法等でご不明な点がございましたら、店頭スタッフまでお尋ねください。</li>
              </ul>
            </div>

            <div className="border-l-4 border-[#0095B6] pl-4 space-y-3">
              <h2 className="text-[#1d1d1f] font-semibold text-base">5. ハウスルールの改定について</h2>
              <p>
                運営上、本ハウスルールを改定する場合がございます。改定後は本アプリ上でお知らせいたします。お知らせ後のご利用につきましては、改定後の内容にご同意いただいたものとみなします。
              </p>
            </div>

            <div className="bg-[#0095B6]/5 border border-[#0095B6]/20 rounded-2xl p-4">
              <p className="text-[#1d1d1f] text-[15px]">
                万が一、上記のお約束や信頼関係を損なう行為が見受けられた場合、誠に勝手ながら事前の予告なくアプリの利用を停止させていただく場合がございます。
              </p>
            </div>

            <p className="text-[#86868b] text-[15px] leading-relaxed">
              本アプリのご利用には、
              <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-[#0095B6] underline hover:text-[#007A96]">
                利用規約
              </Link>
              および
              <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#0095B6] underline hover:text-[#007A96]">
                プライバシーポリシー
              </Link>
              への同意が必要です。下のボタンを押すことで、上記ハウスルール（今後改定された場合は改定後の内容を含みます）ならびに利用規約・プライバシーポリシーに同意したものとみなします。
            </p>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-5 py-4 bg-white border-t border-[#e5e5ea] safe-area-bottom shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
        <button
          onClick={handleAccept}
          aria-label="同意してFKT7へ入場する"
          className="w-full min-h-[48px] py-4 bg-[#0095B6] text-white font-semibold text-[17px] tracking-wide rounded-2xl hover:bg-[#007A96] active:scale-[0.98] transition shadow-sm"
        >
          同意してFKT7へ入場する
        </button>
      </div>
    </div>
  )
}
