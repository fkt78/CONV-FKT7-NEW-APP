import { Link } from 'react-router-dom'
import LegalPageLayout from '../components/LegalPageLayout'

/**
 * 広告・アフィリエイト掲載時の表示方針・利用者向け説明。
 * 特定事業者名に依存しない一般的な表記とする。
 */
export default function AdvertisingNotice() {
  return (
    <LegalPageLayout title="広告・宣伝・アフィリエイトに関する表記">
      <p>
        FKT7（以下「本アプリ」）は、有限会社吹田総業が作成し、セブン-イレブン 伊賀平野東町店・伊賀平野北谷店・伊賀忍者市駅南店（以下「当店」）が提供するサービスです。
        本ページでは、本アプリ上における広告・宣伝・成果報酬型の紹介（アフィリエイト等）の掲載に関する方針を定めます。
      </p>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">1. 掲載の種類</h2>
        <p>
          当店は、本アプリの運営に必要な範囲で、次のいずれか又は複数を掲載することがあります。
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>当店又は第三者の商品・サービスに関するバナー・テキスト広告</li>
          <li>第三者のサービス・商品を紹介するリンク（成果報酬型の広告・いわゆるアフィリエイトリンクを含む）</li>
          <li>上記に付随する表示（ローテーション表示、キャンペーン等の案内を含む）</li>
        </ul>
        <p className="mt-2">
          掲載する提携先・内容・掲載期間・位置は、当店の判断により変更・終了することがあります。
        </p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">2. 表示の方針</h2>
        <p>
          当店は、景品表示法・ステマ規制等の法令に関するガイドラインに留意し、広告・宣伝であることが誤認されないよう、必要に応じて「広告」「PR」「アフィリエイト」等の表示を行います。
          各提携プログラムの利用規約がある場合は、当該規約に従います。
        </p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">3. 第三者提供サービス・外部サイトへの遷移</h2>
        <p>
          本アプリに掲載されるリンクのうち、当店以外の第三者が提供する商品・サービスについては、当該第三者が販売主体となります。
          会員様と当該第三者との間で行われる契約・決済・返品・キャンセル・サポート等については、当該第三者の定めに従い、当店は当該第三者のサービス内容・取引に関して責任を負いません（当店が商品・サービスを直接提供する場合を除きます）。
        </p>
        <p className="mt-2">
          外部サイトに遷移した後の個人情報の取り扱いは、当該サイトの事業者が定めるプライバシーポリシー等に従います。
        </p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">4. 本アプリに関する規約</h2>
        <p>
          本アプリの利用条件については
          <Link to="/terms" className="text-[#0095B6] underline hover:text-[#007A96]">
            利用規約
          </Link>
          、個人情報の取り扱いについては
          <Link to="/privacy" className="text-[#0095B6] underline hover:text-[#007A96]">
            プライバシーポリシー
          </Link>
          をご確認ください。
        </p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">5. 本表記の変更</h2>
        <p>
          本表記は、法令の変更やサービス内容の変更に伴い、必要に応じて改定することがあります。改定後の内容は、本アプリ上での表示をもって効力が生じるものとします。重要な変更がある場合は、本アプリ内でお知らせいたします。
        </p>
      </section>

      <div className="text-[#86868b] text-xs mt-8 space-y-1">
        <p>制定日：2026年3月</p>
      </div>
    </LegalPageLayout>
  )
}
