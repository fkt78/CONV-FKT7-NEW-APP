/** アプリのセマンティックバージョン（version.json で管理） */
export const appVersion: string = import.meta.env.VITE_APP_VERSION ?? '0.0.0'

/** ビルド時のタイムスタンプ（vYYYYMMDD.HHMM 形式）※キャッシュ確認用 */
export const buildVersion: string = import.meta.env.VITE_BUILD_VERSION ?? 'dev'
