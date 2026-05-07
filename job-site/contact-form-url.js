/**
 * 応募・お問い合わせ用 Googleフォームの公開 URL
 *
 * 1. Googleフォームでフォームを作成し「送信」→リンク（または短い URL）をコピー
 * 2. 下の文字列にペースト（空のままだとボタンは無効のままです）
 *
 * 例: 'https://docs.google.com/forms/d/e/1FAIpQLSxxxxxxxx/viewform'
 * 例: 'https://forms.gle/xxxxxxxx'
 */
const GOOGLE_FORM_URL = 'https://forms.gle/9g2D7Up5YSqHJLHs5'

document.addEventListener('DOMContentLoaded', () => {
  const u = GOOGLE_FORM_URL.trim()
  document.querySelectorAll('[data-google-form]').forEach((a) => {
    if (u) {
      a.setAttribute('href', u)
      a.removeAttribute('aria-disabled')
      a.classList.remove('button--pending')
    } else {
      a.setAttribute('href', '#apply')
      a.setAttribute('aria-disabled', 'true')
      a.classList.add('button--pending')
      a.setAttribute(
        'title',
        '運営側で contact-form-url.js に Googleフォームの URL を設定すると開けます',
      )
    }
  })
})
