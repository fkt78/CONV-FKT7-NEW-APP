interface RefreshButtonProps {
  onRefresh: () => Promise<void>
  loading: boolean
  label?: string
}

export default function RefreshButton({ onRefresh, loading, label = '更新' }: RefreshButtonProps) {
  return (
    <button
      onClick={onRefresh}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#e5e5ea] bg-white text-[#1d1d1f] text-[13px] font-medium hover:bg-[#f5f5f7] disabled:opacity-50 disabled:cursor-not-allowed transition"
      aria-label={loading ? '更新中...' : label}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-[#e5e5ea] border-t-[#0095B6] rounded-full animate-spin" />
      ) : (
        <svg className="w-3.5 h-3.5 text-[#0095B6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 12a9 9 0 0 1-15 6.7L3 16" />
          <polyline points="21 8 21 3 16 3" />
          <polyline points="3 16 3 21 8 21" />
        </svg>
      )}
      <span>{loading ? '更新中...' : label}</span>
    </button>
  )
}
