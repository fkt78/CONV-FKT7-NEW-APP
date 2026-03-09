import { Link } from 'react-router-dom'
import LegalPageLayout from '../components/LegalPageLayout'

export default function TermsOfUse() {
  return (
    <LegalPageLayout title="利用規約">
      <p>
        FKT7（以下「本アプリ」）の利用規約（以下「本規約」）は、有限会社吹田総業が作成し、セブン-イレブン 伊賀平野東町店・伊賀平野北谷店・伊賀忍者市駅南店（以下「当店」）が提供する本アプリの利用条件を定めるものです。本アプリをご利用いただくには、本規約に同意していただく必要があります。
      </p>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">第1条（適用）</h2>
        <p>
          本規約は、本アプリの利用に関する当店と会員様との間の権利義務を定めるものです。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">第2条（会員登録）</h2>
        <p>
          本アプリの利用には会員登録が必要です。登録時にご提供いただく情報は、正確かつ最新のものをご記入ください。虚偽の情報による登録は禁止いたします。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">第3条（禁止事項）</h2>
        <p>
          会員様は、以下の行為を行ってはなりません。<br />
          ・法令または公序良俗に反する行為<br />
          ・当店または第三者の権利を侵害する行為<br />
          ・本アプリの運営を妨害する行為<br />
          ・当店が定めるハウスルールに反する行為<br />
          ・その他、当店が不適切と判断する行為
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">第4条（知的財産権）</h2>
        <p>
          本アプリに含まれるコンテンツ（文章、画像、デザイン、ロゴ、プログラム等）の著作権、商標権その他の知的財産権は、当店または正当な権利者に帰属します。会員様は、当店の事前の書面による承諾なく、これらを複製、改変、転載、販売等してはなりません。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">第5条（個人情報の取り扱い）</h2>
        <p>
          会員様の個人情報の取り扱いについては、当店が定める
          <Link to="/privacy" className="text-amber-400 underline hover:text-amber-300">
            プライバシーポリシー
          </Link>
          に従います。本アプリの利用をもって、同ポリシーに同意したものとみなします。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">第6条（退会・アカウント削除）</h2>
        <p>
          会員様は、本アプリ内のチャット機能または当店所定の方法により、いつでも退会（アカウント削除）を申し出ることができます。退会後は、当店の定める期間内にアカウントおよび関連データを削除します。退会により、チャット履歴・クーポン等のサービス利用履歴にアクセスできなくなる場合があります。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">第7条（反社会的勢力の排除）</h2>
        <p>
          会員様は、暴力団、暴力団員、暴力団関係企業、総会屋、その他反社会的勢力に該当しないこと、および該当する者との関係を有しないことを表明し、保証するものとします。当店は、会員様がこれに反すると認めた場合、事前の通知なくアカウントを停止または削除することができます。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">第8条（サービスの変更・中止）</h2>
        <p>
          当店は、事前の通知なく本アプリの内容の変更、提供の一時停止、または中止を行うことがあります。これにより会員様に生じた損害について、当店は責任を負いません。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">第9条（免責）</h2>
        <p>
          本アプリの利用により生じた損害（通信障害、端末の故障、第三者サービスの障害、データの消失等による利用不能を含む）について、当店は故意または重過失がある場合を除き、責任を負いません。本アプリは現状のまま提供され、当店はその完全性、正確性、有用性等について保証しません。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">第10条（規約の変更）</h2>
        <p>
          当店は、必要に応じて本規約を変更することがあります。変更後の規約は、本アプリ上での表示をもって効力が生じるものとします。重要な変更がある場合は、本アプリ内でお知らせいたします。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">第11条（準拠法・管轄）</h2>
        <p>
          本規約は日本法に準拠し、本アプリに関する紛争については、当店の本店所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
        </p>
      </section>

      <div className="text-white/60 text-xs mt-8 space-y-1">
        <p>制定日：2025年3月</p>
        <p>改定日：2025年3月（商用利用対応のため拡充）</p>
      </div>
    </LegalPageLayout>
  )
}
