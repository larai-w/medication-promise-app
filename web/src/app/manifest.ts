import type { MetadataRoute } from 'next'

// ホーム画面に置いたときの見え方を決める。
// これが無いと Android は汎用アイコンかページのスクショで代用し、
// 名前も URL のままになる（2026-09-17 に実機で「解像度の低い何か」が出ると報告された）。
//
// アイコンは src/app/icon.png（512）と src/app/apple-icon.png（180）。
// Next.js の App Router が <link rel="icon"> と <link rel="apple-touch-icon"> を自動で出す。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'おくすりの約束',
    // ホーム画面のラベルはここが使われる。長いと省略されるので短く保つ。
    short_name: 'おくすり',
    description: '声とワンタップで残す服薬記録',
    lang: 'ja',
    start_url: '/',
    display: 'standalone',
    background_color: '#fffcf6',
    theme_color: '#e8912d',
    icons: [
      { src: '/icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  }
}
