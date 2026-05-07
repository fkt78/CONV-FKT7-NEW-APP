/** 本番の自社求人 LP（ Firebase Hosting ）。環境変数未設定時のフォールバック。 */
const DEFAULT_JOB_RECRUITMENT_SITE_URL = 'https://conv-fkt7-new-app-job.web.app/'

/**
 * 店舗求人 LP の公開 URL。
 * `VITE_JOB_RECRUITMENT_SITE_URL` があれば優先し、なければ上記デフォルトを返す。
 */
export function getJobRecruitmentSiteUrl(): string {
  const v = import.meta.env.VITE_JOB_RECRUITMENT_SITE_URL?.trim()
  if (v && v.length > 0) return v.replace(/\/?$/, '/')
  return DEFAULT_JOB_RECRUITMENT_SITE_URL
}
