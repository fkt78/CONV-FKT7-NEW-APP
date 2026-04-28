import { useEffect } from 'react'

/**
 * 画面が表示されている間だけポーリングするカスタムフック。
 * ブラウザタブが非表示・端末スリープ・別アプリ表示中はポーリングを停止し、
 * 復帰時に即座に再実行する。Firestore の読み取り削減に有効。
 *
 * @param fetcher - 実行する非同期処理（毎回呼ばれる）
 * @param intervalMs - ポーリング間隔（ミリ秒）
 * @param enabled - false の間はポーリングしない（ログイン状態など外部条件で切替）
 * @param deps - 依存配列。変化したらポーリングを再起動
 */
export function useVisibilityPolling(
  fetcher: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean = true,
  deps: ReadonlyArray<unknown> = [],
) {
  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer) return
      void fetcher()
      timer = setInterval(() => {
        void fetcher()
      }, intervalMs)
    }
    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') {
      start()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, ...deps])
}
