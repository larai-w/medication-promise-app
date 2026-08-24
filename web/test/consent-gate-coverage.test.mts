// 同意ゲートが全画面にかかっていることを固定する。
//
// 2026-08-24 に GutPacer で同じ種類の穴を本番で踏んだ（オーナーが実機で発見）。
// こちらは形が違うが同じ話で、**`ConsentGate` が `/` にしか付いておらず、
// `/monthly` と `/settings` が素通り**だった。記録の中身が同意なしで見られる。
//
// 画面ごとにゲートを付ける形だと、新しい画面を足したときに必ず忘れる。
// **既定でゲートし、素通しする画面だけを明示する**形にした。
// このテストは、その形が崩れていないかを見る。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync('src/app/layout.tsx', 'utf8')
const gate = readFileSync('src/components/ConsentGate.tsx', 'utf8')

/** src/app 配下の page.tsx からルートを組み立てる。 */
function routes(dir = 'src/app', prefix = ''): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === 'api') continue
      out.push(...routes(`${dir}/${e.name}`, `${prefix}/${e.name}`))
    } else if (e.name === 'page.tsx') {
      out.push(prefix === '' ? '/' : prefix)
    }
  }
  return out.sort()
}

test('ゲートは layout でかかっている（画面ごとではない）', () => {
  assert.match(
    layout,
    /<ConsentGate>\s*\{children\}\s*<\/ConsentGate>/,
    'layout.tsx が children を ConsentGate で包んでいない。' +
      '画面ごとに付ける形だと、新しい画面を足したときに忘れる',
  )
})

test('素通しする画面が明示されている', () => {
  assert.match(gate, /const UNGATED_PATHS = \[/, 'UNGATED_PATHS が無い')
})

test('プライバシーポリシーと利用条件は同意前に読める', () => {
  // 同意する前に読めなければ、同意を求める意味がない。
  const m = gate.match(/const UNGATED_PATHS = \[([^\]]*)\]/)
  assert.ok(m, 'UNGATED_PATHS を読み取れない')
  for (const required of ['/privacy', '/terms', '/login']) {
    assert.ok(m[1].includes(`'${required}'`), `${required} が素通しに入っていない`)
  }
})

test('記録を扱う画面が素通しに紛れ込んでいない', () => {
  const m = gate.match(/const UNGATED_PATHS = \[([^\]]*)\]/)!
  // ここに `/` や `/monthly` が入ると、全体が素通しになる
  for (const mustBeGated of ["'/'", "'/monthly'", "'/settings'"]) {
    assert.ok(
      !m[1].includes(mustBeGated),
      `${mustBeGated} が素通しに入っている。記録が同意なしで見られる`,
    )
  }
})

test('すべての画面が、ゲートされるか明示的に素通しかのどちらかである', () => {
  const m = gate.match(/const UNGATED_PATHS = \[([^\]]*)\]/)!
  const ungated = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  const all = routes()
  assert.ok(all.length > 0, '画面が1つも見つからない（検出が壊れている可能性）')

  for (const route of all) {
    const isUngated = ungated.some((u) => route === u || route.startsWith(`${u}/`))
    // layout でゲートしているので、素通し以外は自動的にゲートされる。
    // ここで見たいのは「意図せず素通しになっている画面が無いか」。
    if (isUngated) continue
    assert.ok(
      layout.includes('<ConsentGate>'),
      `${route} をゲートする仕組みが layout に無い`,
    )
  }
})

test('ゲート自身は素通しの画面でネットワークを叩かない', () => {
  // ログイン前に /api/consent を叩くと 401 が出続けてログが汚れる。
  assert.match(gate, /if \(ungated\) return/, '素通しの画面で早期 return していない')
})
