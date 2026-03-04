/** ビルド時に vite.config.ts で注入されるバージョン（vYYYYMMDD.HHMM 形式） */
export const buildVersion: string = import.meta.env.VITE_BUILD_VERSION ?? 'dev'
