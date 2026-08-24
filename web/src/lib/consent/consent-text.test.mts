// 同意文言が、法が求める要素を落としていないことを固定する。
//
// 文言は人が書き換える。書き換えたときに「撤回方法の記載が消えた」
// 「任意性の説明が消えた」を検知できないと、公開されたあと誰も気づかない。

import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BASIC_CONSENT_SECTIONS,
  CONSENT_SECTIONS_BY_TYPE,
  CONSENT_TEXT_METADATA,
  EVENT_EXPORT_CONSENT_SECTIONS,
} from './consent-text.ts'
import { CONSENT_TEXT_VERSION, PRIVACY_POLICY_VERSION } from './consent-versions.ts'

test('基本利用の同意文は APPI/3省2GL の必須要素をすべて含む', () => {
  const required = ['C-01', 'C-02', 'C-03', 'C-04', 'C-05', 'C-07']
  const present = BASIC_CONSENT_SECTIONS.map((s) => s.requirement)
  for (const r of required) {
    assert.ok(present.includes(r as never), `必須要素 ${r} の記載が無い`)
  }
})

test('要配慮個人情報であることの明示（C-07）がある', () => {
  const section = BASIC_CONSENT_SECTIONS.find((s) => s.requirement === 'C-07')
  assert.ok(section, 'C-07 が無い')
  assert.match(section.body, /配慮/, '要配慮であることが読み取れない')
  assert.match(section.body, /同意/, '事前同意の説明が無い')
})

test('撤回方法（C-05）と任意性（C-04）が具体的に書いてある', () => {
  const revoke = BASIC_CONSENT_SECTIONS.find((s) => s.requirement === 'C-05')
  assert.match(revoke!.body, /削除|取り消/, '撤回の手段が書かれていない')

  const optional = BASIC_CONSENT_SECTIONS.find((s) => s.requirement === 'C-04')
  assert.match(optional!.body, /不利益/, '同意しない場合の不利益が無いことが書かれていない')
})

test('第三者提供（C-03）は「しない」と言い切っている', () => {
  const third = BASIC_CONSENT_SECTIONS.find((s) => s.requirement === 'C-03')
  // 言い回しではなく**言い切っているか**を見る。
  // 「第三者へ情報を提供しません」と一字一句を求めると、短縮しただけで落ちる。
  assert.match(third!.body, /第三者へ[^。]*提供しません/, '第三者提供を否定していない')
})

test('研究提供は基本利用と別に取り、任意だと明記している', () => {
  assert.notDeepEqual(EVENT_EXPORT_CONSENT_SECTIONS, BASIC_CONSENT_SECTIONS)
  const purpose = EVENT_EXPORT_CONSENT_SECTIONS.find((s) => s.requirement === 'C-01')
  assert.match(purpose!.body, /任意/, '任意であることが書かれていない')
  assert.match(purpose!.body, /しなくても/, '同意しなくても使えることが書かれていない')
})

test('どの節も空文字ではない', () => {
  for (const sections of Object.values(CONSENT_SECTIONS_BY_TYPE)) {
    for (const s of sections) {
      assert.ok(s.heading.trim().length > 0, '見出しが空')
      assert.ok(s.body.trim().length > 10, `本文が短すぎる: ${s.heading}`)
    }
  }
})

test('記録する版は consent-versions と同じ出所', () => {
  assert.equal(CONSENT_TEXT_METADATA.ppVersion, PRIVACY_POLICY_VERSION)
  assert.equal(CONSENT_TEXT_METADATA.consentTextVersion, CONSENT_TEXT_VERSION)
})

test('効能効果をうたう表現を混ぜない', () => {
  const banned = ['治る', '治療', '改善します', '予防できます', '診断']
  for (const sections of Object.values(CONSENT_SECTIONS_BY_TYPE)) {
    for (const s of sections) {
      for (const word of banned) {
        assert.ok(!s.body.includes(word), `同意文に「${word}」が入っている: ${s.heading}`)
      }
    }
  }
})
