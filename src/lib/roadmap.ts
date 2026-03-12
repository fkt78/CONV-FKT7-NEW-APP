/** 実装予定項目の型 */
export interface RoadmapItem {
  category: string
  item: string
  description: string
  priority: '高' | '中' | '低'
  notes: string
}

/** 今後実装すべき項目一覧 */
export const ROADMAP_ITEMS: RoadmapItem[] = [
  // チャット機能
  { category: 'チャット機能', item: '既読表示', description: 'メッセージの既読・未読状態の表示', priority: '中', notes: '' },
  { category: 'チャット機能', item: '入力中インジケーター', description: '相手が入力中であることを表示', priority: '低', notes: '' },
  { category: 'チャット機能', item: '未読バッジ', description: '未読メッセージ数の表示', priority: '中', notes: '' },
  { category: 'チャット機能', item: 'メッセージ検索', description: '過去メッセージの検索機能', priority: '中', notes: '' },
  { category: 'チャット機能', item: '定型文・テンプレート', description: '管理者向けクイックリプライ', priority: '中', notes: '' },
  { category: 'チャット機能', item: 'メッセージ削除・編集', description: '誤送信時の編集・削除', priority: '低', notes: '' },
  // 認証・アカウント
  { category: '認証・アカウント', item: 'メール認証', description: '登録時のメールアドレス確認', priority: '中', notes: '' },
  { category: '認証・アカウント', item: 'プロフィール編集', description: '名前・アイコン・属性の変更', priority: '中', notes: '' },
  { category: '認証・アカウント', item: '2段階認証（2FA）', description: 'セキュリティ強化', priority: '低', notes: '' },
  { category: '認証・アカウント', item: '複数デバイス管理', description: 'ログイン中のセッション一覧・切断', priority: '低', notes: '' },
  // クーポン機能
  { category: 'クーポン機能', item: 'QRコード表示', description: '店舗提示用QRコード', priority: '中', notes: '' },
  { category: 'クーポン機能', item: '一括配布', description: '属性・誕生月など条件指定での一括配布', priority: '中', notes: '' },
  { category: 'クーポン機能', item: 'クーポン種別', description: '割引率・無料特典など複数タイプ', priority: '低', notes: '' },
  { category: 'クーポン機能', item: '使用条件', description: '最低購入金額などの条件表示', priority: '低', notes: '' },
  // 管理者機能
  { category: '管理者機能', item: 'ユーザー管理（詳細編集）', description: '氏名・属性・誕生月などの詳細編集', priority: '中', notes: '' },
  { category: '管理者機能', item: 'チャット検索', description: '顧客名・メールでの検索', priority: '中', notes: '' },
  { category: '管理者機能', item: '分析・レポート', description: 'クーポン利用率・チャット数・エンゲージメント', priority: '中', notes: '' },
  { category: '管理者機能', item: 'データエクスポート', description: 'チャット履歴・顧客データのCSV出力', priority: '中', notes: '' },
  { category: '管理者機能', item: '複数管理者', description: '権限レベル（スーパー管理者・一般管理者等）', priority: '低', notes: '' },
  { category: '管理者機能', item: '操作ログ', description: '管理者の操作履歴', priority: '低', notes: '' },
  // UX・UI
  { category: 'UX・UI', item: 'ダーク/ライトテーマ', description: 'テーマ切り替え', priority: '低', notes: '' },
  { category: 'UX・UI', item: 'アクセシビリティ', description: 'スクリーンリーダー対応・コントラスト改善', priority: '中', notes: '' },
  { category: 'UX・UI', item: 'オフライン対応', description: 'オフライン時の表示・再送信', priority: '中', notes: '' },
  { category: 'UX・UI', item: 'スケルトンローディング', description: '読み込み中のプレースホルダー表示', priority: '低', notes: '' },
  { category: 'UX・UI', item: 'エラーハンドリング', description: 'ネットワークエラー時の案内・リトライ', priority: '中', notes: '' },
  // ビジネス・マーケティング
  { category: 'ビジネス・マーケティング', item: '誕生日特典', description: '誕生月の自動クーポン配布', priority: '中', notes: '' },
  { category: 'ビジネス・マーケティング', item: 'スタンプカード', description: '来店回数に応じた特典', priority: '低', notes: '' },
  { category: 'ビジネス・マーケティング', item: 'アンケート・フィードバック', description: '顧客満足度の収集', priority: '低', notes: '' },
  { category: 'ビジネス・マーケティング', item: 'AI自動返信', description: 'よくある質問への自動応答（オプション）', priority: '低', notes: '' },
  { category: 'ビジネス・マーケティング', item: '多言語対応（i18n）', description: '英語など他言語対応', priority: '低', notes: '' },
  // セキュリティ・運用
  { category: 'セキュリティ・運用', item: 'レート制限', description: 'スパム防止の送信制限', priority: '中', notes: '' },
  { category: 'セキュリティ・運用', item: '不正利用検知', description: '異常な利用パターンの検知', priority: '低', notes: '' },
  { category: 'セキュリティ・運用', item: '監査ログ', description: '重要な操作の記録', priority: '低', notes: '' },
  // 技術・インフラ
  { category: '技術・インフラ', item: 'E2Eテスト', description: 'Playwright/Cypress等', priority: '中', notes: '' },
  { category: '技術・インフラ', item: 'エラートラッキング', description: 'Sentry等の導入', priority: '中', notes: '' },
  { category: '技術・インフラ', item: 'パフォーマンス監視', description: 'Core Web Vitalsの計測', priority: '低', notes: '' },
  { category: '技術・インフラ', item: 'CI/CD', description: 'GitHub Actionsによる自動ビルド・デプロイ', priority: '中', notes: '' },
]

/** CSV用にフィールドをエスケープ（カンマ・改行・ダブルクォート対応） */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** 実装予定リストをCSV形式で出力 */
export function exportRoadmapToCsv(): string {
  const header = ['カテゴリ', '項目', '説明', '優先度', '備考']
  const rows = ROADMAP_ITEMS.map((r) => [
    escapeCsvField(r.category),
    escapeCsvField(r.item),
    escapeCsvField(r.description),
    escapeCsvField(r.priority),
    escapeCsvField(r.notes),
  ].join(','))
  return '\uFEFF' + [header.join(','), ...rows].join('\r\n') // BOM for Excel UTF-8
}
