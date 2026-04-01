import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import LanguageSwitcher from '../components/LanguageSwitcher'
import type { NotificationSettings as NotificationSettingsType } from '../lib/messaging'

export default function NotificationSettings() {
  const { t } = useTranslation()
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [supported, setSupported] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<NotificationSettingsType>({
    enabled: true,
    messages: true,
    coupons: true,
    news: true,
    sound: true,
  })
  const [permission, setPermission] = useState<NotificationPermission | null>(null)

  useEffect(() => {
    if (!currentUser) return
    let cancelled = false

    async function load() {
      try {
        const mod = await import('../lib/messaging')
        const sup = await mod.isPushSupported()
        if (cancelled) return
        setSupported(sup)
        setPermission(Notification.permission)

        if (sup) {
          const s = await mod.getNotificationSettings(currentUser!.uid)
          if (!cancelled) setSettings(s)
        }
      } catch {
        setSupported(false)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [currentUser])

  async function handleRequestPermission() {
    if (!currentUser || !supported) return
    const perm = await Notification.requestPermission()
    setPermission(perm)
    if (perm === 'granted') {
      const mod = await import('../lib/messaging')
      const reg = await navigator.serviceWorker.ready
      await mod.registerForPushNotifications(currentUser.uid, reg)
    }
  }

  async function handleToggle(enabled: boolean) {
    if (!currentUser) return
    const next = { ...settings, enabled }
    setSettings(next)
    setSaving(true)
    try {
      const mod = await import('../lib/messaging')
      await mod.saveNotificationSettings(currentUser.uid, next)
      if (!enabled) await mod.removePushToken(currentUser.uid)
      else if (permission === 'granted') {
        const reg = await navigator.serviceWorker.ready
        await mod.registerForPushNotifications(currentUser.uid, reg)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleSettingChange<K extends keyof NotificationSettingsType>(key: K, value: NotificationSettingsType[K]) {
    if (!currentUser) return
    const next = { ...settings, [key]: value }
    setSettings(next)
    setSaving(true)
    try {
      const mod = await import('../lib/messaging')
      await mod.saveNotificationSettings(currentUser.uid, next)
    } finally {
      setSaving(false)
    }
  }

  if (!currentUser) return null

  return (
    <div className="min-h-dvh bg-[#f5f5f7] flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 bg-white border-b border-[#e5e5ea]">
        <button
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#0095B6]"
        >
          ←
        </button>
        <h1 className="flex-1 text-[#1d1d1f] font-semibold text-[17px]">{t('notifications.title')}</h1>
        <LanguageSwitcher className="flex-shrink-0" />
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {loading ? (
          <p className="text-[#86868b] text-center">{t('notifications.loading')}</p>
        ) : !supported ? (
          <div className="bg-white rounded-2xl p-4 border border-[#e5e5ea]">
            <p className="text-[#86868b] text-[15px]">
              {t('notifications.unsupported')}
            </p>
            <p className="text-[#86868b] text-[13px] mt-2">
              {t('notifications.iosNote')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 border border-[#e5e5ea]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#1d1d1f] font-medium text-[15px]">{t('notifications.pushTitle')}</p>
                  <p className="text-[#86868b] text-[13px] mt-0.5">{t('notifications.pushDesc')}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={settings.enabled}
                  onClick={() => handleToggle(!settings.enabled)}
                  disabled={saving}
                  className={`w-12 h-7 rounded-full transition ${settings.enabled ? 'bg-[#0095B6]' : 'bg-[#e5e5ea]'}`}
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white shadow-sm mt-1 transition-transform ${
                      settings.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {settings.enabled && permission !== 'granted' && (
                <button
                  onClick={handleRequestPermission}
                  className="mt-3 w-full py-2.5 bg-[#0095B6] text-white text-[15px] font-medium rounded-xl"
                >
                  {t('notifications.allowNotifications')}
                </button>
              )}
            </div>

            {settings.enabled && (
              <>
                <div className="bg-white rounded-2xl p-4 border border-[#e5e5ea] space-y-3">
                  <p className="text-[#1d1d1f] font-medium text-[15px]">{t('notifications.typesTitle')}</p>
                  {[
                    { key: 'messages' as const, label: t('notifications.typeMessages'), desc: t('notifications.typeMessagesDesc') },
                    { key: 'coupons' as const, label: t('notifications.typeCoupons'), desc: t('notifications.typeCouponsDesc') },
                    { key: 'news' as const, label: t('notifications.typeNews'), desc: t('notifications.typeNewsDesc') },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center justify-between py-2 border-b border-[#e5e5ea] last:border-0">
                      <div>
                        <p className="text-[#1d1d1f] text-[15px]">{label}</p>
                        <p className="text-[#86868b] text-[12px]">{desc}</p>
                      </div>
                      <button
                        role="switch"
                        aria-checked={settings[key]}
                        onClick={() => handleSettingChange(key, !settings[key])}
                        disabled={saving}
                        className={`w-12 h-7 rounded-full transition ${settings[key] ? 'bg-[#0095B6]' : 'bg-[#e5e5ea]'}`}
                      >
                        <span
                          className={`block w-5 h-5 rounded-full bg-white shadow-sm mt-1 transition-transform ${
                            settings[key] ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="bg-white rounded-2xl p-4 border border-[#e5e5ea]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[#1d1d1f] font-medium text-[15px]">{t('notifications.soundTitle')}</p>
                      <p className="text-[#86868b] text-[13px] mt-0.5">{t('notifications.soundDesc')}</p>
                    </div>
                    <button
                      role="switch"
                      aria-checked={settings.sound}
                      onClick={() => handleSettingChange('sound', !settings.sound)}
                      disabled={saving}
                      className={`w-12 h-7 rounded-full transition ${settings.sound ? 'bg-[#0095B6]' : 'bg-[#e5e5ea]'}`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white shadow-sm mt-1 transition-transform ${
                          settings.sound ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
