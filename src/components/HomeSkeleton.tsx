/**
 * Home画面のスケルトンUI。
 * ユーザーデータ取得中に表示し、真っ白な状態を回避する。
 */
export default function HomeSkeleton() {
  return (
    <div className="flex flex-col min-h-screen bg-[#f5f5f7] animate-pulse">
      <div className="h-14 bg-white border-b border-[#e5e5ea] flex items-center px-4">
        <div className="w-24 h-5 bg-[#e5e5ea] rounded" />
        <div className="ml-auto w-10 h-10 bg-[#e5e5ea] rounded-full" />
      </div>
      <div className="mx-4 mt-4">
        <div className="w-20 h-4 bg-[#e5e5ea] rounded mb-2" />
        <div className="rounded-2xl bg-white border border-[#e5e5ea] p-4 space-y-3 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="h-4 bg-[#e5e5ea] rounded w-3/4" />
          <div className="h-4 bg-[#e5e5ea] rounded w-1/2" />
        </div>
      </div>
      <div className="mx-4 mt-4">
        <div className="rounded-2xl bg-[#e5e5ea] h-40 shadow-[0_2px_12px_rgba(0,0,0,0.06)]" />
      </div>
      <div className="mx-4 mt-4 space-y-2">
        <div className="w-24 h-4 bg-[#e5e5ea] rounded" />
        <div className="rounded-2xl bg-white border border-[#e5e5ea] p-4 h-28 shadow-[0_2px_12px_rgba(0,0,0,0.06)]" />
      </div>
    </div>
  )
}
