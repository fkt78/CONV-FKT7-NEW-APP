import { buildVersion } from '../lib/version'

/** 画面右下に小さく表示するバージョン番号（危機管理・キャッシュ確認用） */
export default function VersionBadge() {
  return (
    <div
      className="fixed z-[10000] text-[10px] text-white/25 font-mono select-none pointer-events-none bottom-[max(0.5rem,env(safe-area-inset-bottom))] right-[max(0.5rem,env(safe-area-inset-right))]"
      aria-hidden
    >
      {buildVersion}
    </div>
  )
}
