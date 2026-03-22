const IGA_LAT = 34.7667
const IGA_LON = 136.1333

export interface WeatherData {
  /** 現在の気温（表示用） */
  temperature: number
  /** その日の予想最高気温（hot_above 条件に使用） */
  temperatureMax: number
  /** その日の予想最低気温（cold_below 条件に使用） */
  temperatureMin: number
  /** その日の最大降水確率（%・雨クーポン判定は60%以上） */
  precipitationProbabilityMax: number
  precipitation: number
  weatherCode: number
  description: string
  emoji: string
  isRainy: boolean
  isSnowy: boolean
}

const WEATHER_MAP: Record<number, { text: string; emoji: string }> = {
  0:  { text: '快晴',           emoji: '☀️' },
  1:  { text: '晴れ',           emoji: '🌤' },
  2:  { text: '一部曇り',       emoji: '⛅' },
  3:  { text: '曇り',           emoji: '☁️' },
  45: { text: '霧',             emoji: '🌫️' },
  48: { text: '霧',             emoji: '🌫️' },
  51: { text: '霧雨',           emoji: '🌦' },
  53: { text: '霧雨',           emoji: '🌦' },
  55: { text: '霧雨',           emoji: '🌦' },
  61: { text: '小雨',           emoji: '🌧' },
  63: { text: '雨',             emoji: '🌧' },
  65: { text: '大雨',           emoji: '🌧' },
  66: { text: '凍結雨',         emoji: '🌧' },
  67: { text: '凍結雨',         emoji: '🌧' },
  71: { text: '小雪',           emoji: '🌨' },
  73: { text: '雪',             emoji: '🌨' },
  75: { text: '大雪',           emoji: '🌨' },
  77: { text: '霧氷',           emoji: '🌨' },
  80: { text: 'にわか雨',       emoji: '🌦' },
  81: { text: 'にわか雨',       emoji: '🌧' },
  82: { text: '激しいにわか雨', emoji: '⛈' },
  85: { text: 'にわか雪',       emoji: '🌨' },
  86: { text: 'にわか雪',       emoji: '🌨' },
  95: { text: '雷雨',           emoji: '⛈' },
  96: { text: '雹を伴う雷雨',   emoji: '⛈' },
  99: { text: '雹を伴う雷雨',   emoji: '⛈' },
}

const RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86])

export async function fetchWeather(): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${IGA_LAT}&longitude=${IGA_LON}` +
    `&current=temperature_2m,precipitation,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=Asia%2FTokyo`

  const res = await fetch(url)
  if (!res.ok) throw new Error('天気情報の取得に失敗しました')

  const json = await res.json()
  const c = json.current
  const d = json.daily
  const code = c.weather_code as number
  const info = WEATHER_MAP[code] ?? { text: '不明', emoji: '❓' }
  const pp = d?.precipitation_probability_max?.[0] as number | undefined

  return {
    temperature: c.temperature_2m,
    temperatureMax: (d?.temperature_2m_max?.[0] as number) ?? c.temperature_2m,
    temperatureMin: (d?.temperature_2m_min?.[0] as number) ?? c.temperature_2m,
    precipitationProbabilityMax: typeof pp === 'number' && Number.isFinite(pp) ? pp : 0,
    precipitation: c.precipitation,
    weatherCode: code,
    description: info.text,
    emoji: info.emoji,
    isRainy: RAIN_CODES.has(code),
    isSnowy: SNOW_CODES.has(code),
  }
}
