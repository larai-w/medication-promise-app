// 同意画面に出す文言。
//
// **ここは創作しない。** 公開済みのプライバシーポリシー
// (`src/app/privacy/page.tsx`) と利用条件から要点を引き写す。
// 同意画面とポリシーで書いてあることが違う、という状態を作らない。
//
// APPI と3省2ガイドラインが求める要素（COMP-01 §2.1）に対応させる:
//   C-01 利用目的 / C-02 取得データ範囲 / C-03 第三者提供の有無 /
//   C-04 任意性 / C-05 撤回方法 / C-07 要配慮の特別同意

import { CONSENT_TEXT_VERSION, PRIVACY_POLICY_VERSION } from './consent-versions.ts'

export interface ConsentSection {
  /** COMP-01 §2.1 の要素ID。どの要件を満たす文かを追えるようにする */
  requirement: 'C-01' | 'C-02' | 'C-03' | 'C-04' | 'C-05' | 'C-07'
  heading: string
  body: string
}

/**
 * 基本利用（basic）の同意文。
 *
 * ⚠️ **文面の最終確認はオーナー。** 出典はすべて公開済みの文書だが、
 * 「要配慮個人情報」の明示（C-07）だけはポリシー本文に無い表現のため、
 * ここで新しく書いている。法務的な言い回しの確認が要る。
 */
export const BASIC_CONSENT_SECTIONS: readonly ConsentSection[] = [
  {
    requirement: 'C-07',
    heading: '健康に関する情報を扱います',
    body:
      '服薬の記録と体調は、法律上とくに配慮が必要な個人情報です。' +
      'そのため、あらかじめご本人の同意をいただいたうえでお預かりします。',
  },
  {
    requirement: 'C-02',
    heading: 'お預かりするもの',
    body:
      '服薬を記録した日付、時刻、区分、入力元。任意で入力された日ごとの体調スコア（1〜5）と体調メモ。' +
      '任意で入力されたメモ。Alexaリマインダーの設定に必要な権限情報。' +
      '障害調査に必要なアクセス時刻やエラー情報。' +
      'Alexaへ話しかけた音声録音そのものは保存しません。',
  },
  {
    requirement: 'C-01',
    heading: '何に使うか',
    body:
      '服薬記録の保存・表示・PDF作成、Alexaでの記録とリマインダー、障害対応、' +
      '限定テストでの改善にのみ使います。広告配信やデータ販売には使いません。',
  },
  {
    requirement: 'C-03',
    heading: '外部への提供',
    body:
      '法令上必要な場合を除き、目的なく第三者へ情報を提供しません。' +
      '記録の保存とアプリの運用には Amazon Web Services を、音声操作には Amazon Alexa を利用します。',
  },
  {
    requirement: 'C-05',
    heading: 'いつでもやめられます',
    body:
      '記録は画面から個別に削除できます。世帯データの一括削除も設定画面から行えます。' +
      '同意の取り消しや限定テストへの参加終了は、設定画面またはお問い合わせから行えます。' +
      '削除後も、障害復旧用バックアップには最大35日間データが残る場合があります。',
  },
  {
    requirement: 'C-04',
    heading: '同意しない場合',
    body:
      'この同意は限定テストへの参加にともなうものです。同意されない場合でも、不利益はありません。' +
      'ご不明な点は info@veai.jp へご連絡ください。',
  },
] as const

/**
 * 研究用イベント出力（event_export）の同意文。**基本利用とは別に取る。**
 * 束ねると「アプリを使うには研究提供にも同意」になり、任意性が崩れる。
 */
export const EVENT_EXPORT_CONSENT_SECTIONS: readonly ConsentSection[] = [
  {
    requirement: 'C-01',
    heading: '研究のためのデータ提供（任意）',
    body:
      '服薬と体調の記録を、個人が特定されない形に変換して、介護と医療の研究に使わせていただくことがあります。' +
      'この同意は任意で、しなくてもアプリの機能はすべて使えます。',
  },
  {
    requirement: 'C-05',
    heading: 'あとから取り消せます',
    body:
      '設定画面からいつでも取り消せます。取り消したあとは新しい提供を行いません。' +
      'すでに提供済みのデータの扱いについては、お問い合わせください。',
  },
] as const

/** 同意画面が今どの版を見せているか。記録する ppVersion / consentTextVersion と一致させる。 */
export const CONSENT_TEXT_METADATA = {
  ppVersion: PRIVACY_POLICY_VERSION,
  consentTextVersion: CONSENT_TEXT_VERSION,
} as const

export const CONSENT_SECTIONS_BY_TYPE = {
  basic: BASIC_CONSENT_SECTIONS,
  event_export: EVENT_EXPORT_CONSENT_SECTIONS,
} as const
