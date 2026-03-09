import { ROADMAP_ITEMS, exportRoadmapToCsv, type RoadmapItem } from '../lib/roadmap'

const PRIORITY_COLORS: Record<string, string> = {
  高: 'bg-red-500/20 text-red-400 border-red-500/30',
  中: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  低: 'bg-white/10 text-white/60 border-white/20',
}

function downloadCsv() {
  const csv = exportRoadmapToCsv()
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `FKT7_実装予定_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function groupByCategory(items: RoadmapItem[]): Map<string, RoadmapItem[]> {
  const map = new Map<string, RoadmapItem[]>()
  for (const item of items) {
    const list = map.get(item.category) ?? []
    list.push(item)
    map.set(item.category, list)
  }
  return map
}

export default function RoadmapManager() {
  const grouped = groupByCategory(ROADMAP_ITEMS)

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 flex-shrink-0">
        <h2 className="text-white/60 text-xs font-medium tracking-wide">
          実装予定一覧（{ROADMAP_ITEMS.length}件）
        </h2>
        <button
          onClick={downloadCsv}
          className="px-4 py-2 bg-amber-500/20 text-amber-400 text-xs font-semibold rounded-lg border border-amber-500/30 hover:bg-amber-500/30 transition"
        >
          📥 CSVダウンロード
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {Array.from(grouped.entries()).map(([category, items]) => (
          <div key={category} className="space-y-2">
            <h3 className="text-amber-400 font-bold text-sm tracking-wide border-b border-amber-400/20 pb-1">
              {category}
            </h3>
            <div className="space-y-2">
              {items.map((r, i) => (
                <div
                  key={`${category}-${i}`}
                  className="rounded-lg bg-white/[0.03] border border-white/5 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-white font-medium text-sm">{r.item}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded border flex-shrink-0 ${PRIORITY_COLORS[r.priority]}`}
                    >
                      {r.priority}
                    </span>
                  </div>
                  <p className="text-white/60 text-xs mt-1 leading-relaxed">{r.description}</p>
                  {r.notes && (
                    <p className="text-white/40 text-[11px] mt-1 italic">{r.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
