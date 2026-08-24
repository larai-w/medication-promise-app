// 画面をどう出すかの判断。**AWS も React も使わない純粋関数**にして、
// 「DB が落ちたら記録できない」を作らないことをテストで固定する。
//
// CLAUDE.md §2.6: VEAI で一番危ないのは「これに頼れる」と思わせて
// 肝心なときに動かないこと。同意画面は**手段を置き換える**変更なので、
// 失敗したときに既存の手段（記録する）が残ることを設計で保証する。

import type { ConsentEvaluation, ConsentType } from './consent-record.ts'

export type ConsentGateDecision =
  /** 同意画面を出す。まだ同意していない */
  | { kind: 'ask' }
  /** そのまま使わせる */
  | { kind: 'allow' }
  /**
   * 確認できなかった。**使わせる。**
   * 服薬の記録は、こちらの障害を理由に止めてよいものではない。
   * 画面には控えめな注意を出し、次の起動で再確認する。
   */
  | { kind: 'allow-unverified'; notice: string }

export const CONSENT_UNVERIFIED_NOTICE =
  '同意設定の確認に失敗しました。記録はこれまでどおり行えます。あとで設定画面からご確認ください。'

/**
 * アプリ本体を使わせるかの判断。
 *
 * `state` が null は「サーバから状態を取れなかった」。
 * **ここで ask にしてはいけない。** 同意画面を出しても、押した先の書き込みも
 * 失敗するので、利用者は記録できないまま閉じ込められる。
 */
export function decideAppGate(
  state: Record<ConsentType, ConsentEvaluation> | null,
): ConsentGateDecision {
  if (state === null) {
    return { kind: 'allow-unverified', notice: CONSENT_UNVERIFIED_NOTICE }
  }
  const basic = state.basic
  if (basic.granted) return { kind: 'allow' }
  if (basic.ownStatus === 'unavailable') {
    return { kind: 'allow-unverified', notice: CONSENT_UNVERIFIED_NOTICE }
  }
  // absent / revoked / expired — いずれも改めて同意を取る
  return { kind: 'ask' }
}

/**
 * 研究用エクスポート等、**データを使う側**の判断。
 * こちらは確認できなければ通さない（fail closed）。アプリ本体とは基準が違う。
 */
export function mayUseForResearch(
  state: Record<ConsentType, ConsentEvaluation> | null,
): boolean {
  if (state === null) return false
  return state.event_export.granted === true
}
