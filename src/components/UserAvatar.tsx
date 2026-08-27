import { getAvatarBg } from '../lib/userAvatar'

interface Props {
  /** 表示名（先頭1文字をアイコンに出す） */
  fullName: string
  /** イエローカード枚数。未取得なら 0 扱い */
  yellowCards: number | null | undefined
  /** 円の直径（Tailwind のサイズ指定にそのまま使う） */
  size?: 'xs' | 'sm' | 'md'
  className?: string
}

const SIZE = {
  xs: { box: 'w-7 h-7', text: 'text-[10px]' },
  sm: { box: 'w-9 h-9', text: 'text-sm' },
  md: { box: 'w-10 h-10', text: 'text-sm' },
} as const

export default function UserAvatar({ fullName, yellowCards, size = 'md', className = '' }: Props) {
  const s = SIZE[size]
  return (
    <div
      className={`${s.box} rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${className}`}
      style={{ backgroundColor: getAvatarBg(yellowCards) }}
    >
      <span className={`text-white font-bold ${s.text}`}>{fullName.charAt(0)}</span>
    </div>
  )
}
