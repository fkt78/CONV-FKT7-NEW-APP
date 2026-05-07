/**
 * 店舗求人 LP（GitHub Pages 等）の公開 URL。
 * 未設定のときは求人バナーをカルーセルに含めません（無効リンク防止）。
 */
export function getJobRecruitmentSiteUrl(): string {
  const v = import.meta.env.VITE_JOB_RECRUITMENT_SITE_URL?.trim()
  return v && v.length > 0 ? v : ''
}
