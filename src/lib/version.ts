/** アプリのセマンティックバージョン（version.json で管理） */
export const appVersion: string = import.meta.env.VITE_APP_VERSION ?? '0.0.0'

/** ビルド時のタイムスタンプ（vYYYYMMDD.HHMM 形式）※ビルドごとに一意 */
export const buildVersion: string = import.meta.env.VITE_BUILD_VERSION ?? 'dev'

/**
 * 表示用フルバージョン（セマンティック + ビルドID）
 * ビルドごとに一意になり、コードが違うのに同じバージョンとして扱う問題を防ぐ
 * 例: 1.0.4+20250309.1430
 */
export const fullVersion: string =
  import.meta.env.VITE_BUILD_VERSION && import.meta.env.VITE_BUILD_VERSION !== 'dev'
    ? `${appVersion}+${import.meta.env.VITE_BUILD_VERSION}`
    : appVersion
