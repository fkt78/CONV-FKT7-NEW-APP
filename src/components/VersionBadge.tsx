import { appVersion } from '../lib/version'

/** 画面右下に表示するバージョン番号（危機管理・キャッシュ確認用）※視認性を重視 */
export default function VersionBadge() {
  return (
    <div
      className="fixed z-[10000] text-[14px] text-[#86868b] font-mono font-semibold select-none pointer-events-none bottom-[max(0.5rem,env(safe-area-inset-bottom))] right-[max(0.5rem,env(safe-area-inset-right))] drop-shadow-[0_0_2px_rgba(255,255,255,0.9)]"
      aria-hidden
    >
      {appVersion}
    </div>
  )
}
