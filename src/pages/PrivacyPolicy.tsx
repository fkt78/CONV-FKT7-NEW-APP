import LegalPageLayout from '../components/LegalPageLayout'

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="プライバシーポリシー">
      <p>
        FKT7（以下「本アプリ」）は、有限会社吹田総業が作成し、セブン-イレブン 伊賀平野東町店・伊賀平野北谷店・伊賀忍者市駅南店（以下「当店」）のVIP会員様向けに提供するサービスです。本プライバシーポリシーでは、本アプリにおける個人情報の取り扱いについて定めます。
      </p>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">1. 収集する情報</h2>
        <p>
          本アプリでは、以下の情報を収集することがあります。<br />
          ・氏名、メールアドレス、生年月、属性（性別等）<br />
          ・アプリの利用状況（チャット内容、クーポン利用履歴等）<br />
          ・端末情報（ブラウザ種類、OS等）
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">2. 利用目的</h2>
        <p>
          収集した情報は、以下の目的で利用します。<br />
          ・会員認証およびアカウント管理<br />
          ・チャット・クーポン・お知らせ等のサービス提供<br />
          ・お問い合わせへの対応<br />
          ・サービスの改善・開発
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">3. 第三者提供</h2>
        <p>
          お客様の個人情報を、法令に基づく場合を除き、ご本人の同意なく第三者に提供することはありません。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">4. 第三者サービスの利用</h2>
        <p>
          本アプリは、認証・データベース・ストレージ等の機能提供のため、Googleが提供するFirebase（Firebase Authentication、Cloud Firestore、Cloud Storage等）を利用しています。お客様の情報の一部は、これらのサービスにより処理される場合があります。
        </p>
        <p className="mt-2">
          FirebaseおよびGoogleのプライバシーに関する詳細は、以下のリンクをご参照ください。<br />
          ・
          <a
            href="https://firebase.google.com/support/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 underline hover:text-amber-300"
          >
            Firebase プライバシーとセキュリティ
          </a>
          <br />
          ・
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 underline hover:text-amber-300"
          >
            Google プライバシーポリシー
          </a>
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">5. Cookie・ローカルストレージ</h2>
        <p>
          本アプリでは、以下の目的でCookieおよびローカルストレージ（ブラウザの保存領域）を利用することがあります。
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>ログイン状態の維持（認証トークンの保存）</li>
          <li>アプリの動作に必要な設定の保存</li>
          <li>オフライン時の利用体験の向上（PWA機能）</li>
        </ul>
        <p className="mt-2">
          これらは本アプリの提供に必要な範囲で使用し、第三者による広告配信等には利用しません。ブラウザの設定により無効化することも可能ですが、その場合、一部機能が正常に動作しないことがあります。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">6. データの保存期間</h2>
        <p>
          お客様の情報は、以下の方針に基づき保存します。<br />
          ・アカウント情報：退会または削除のご請求まで保存し、その後は合理的な期間内に削除します。<br />
          ・チャット履歴・クーポン利用履歴：サービス提供に必要な期間、および法令で定められた保存期間に応じて保存します。<br />
          ・当店は、保存期間経過後またはご請求に基づき、速やかにデータを削除します。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">7. お客様の権利（開示・訂正・削除等）</h2>
        <p>
          お客様は、当店が保有するご自身の個人情報について、開示、訂正、削除、利用停止等を請求する権利を有します。これらのご請求は、本アプリ内のチャット機能よりお申し付けください。ご本人確認のうえ、法令に従って対応いたします。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">8. プッシュ通知</h2>
        <p>
          本アプリでプッシュ通知機能を提供する場合、新着メッセージやお知らせ等の通知をお送りすることがあります。通知の受信は、端末の設定または本アプリ内の設定により、いつでも停止することができます。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">9. 安全管理</h2>
        <p>
          個人情報の漏洩、滅失、毀損の防止のため、適切な安全管理措置を講じます。また、Firebase等の第三者サービスにおいても、各事業者が定めるセキュリティ基準に従ってデータが取り扱われます。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">10. お問い合わせ</h2>
        <p>
          個人情報の取り扱いに関するお問い合わせは、本アプリ内のチャット機能よりご連絡ください。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">11. 改定</h2>
        <p>
          本プライバシーポリシーは、法令の変更やサービス内容の変更に伴い、必要に応じて改定することがあります。改定後のポリシーは、本アプリ上での表示をもって効力が生じるものとします。重要な変更がある場合は、本アプリ内でお知らせいたします。
        </p>
      </section>

      <div className="text-white/60 text-xs mt-8 space-y-1">
        <p>制定日：2025年3月</p>
        <p>改定日：2025年3月（商用利用対応のため拡充）</p>
      </div>
    </LegalPageLayout>
  )
}
