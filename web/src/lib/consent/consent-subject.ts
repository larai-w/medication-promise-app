// 同意の主体を決める。
//
// 同意は本来「人」に紐づく。ただしこのアプリは世帯単位で、MVP モードには
// Cognito の subject が無い。**無いときに固定文字列へ落とすと、別世帯の同意が
// 混ざる**ので、必ず世帯を含めた識別子にする。
//
// - Cognito あり: `sub:<subject>` — 人に紐づく。これが本来の形
// - MVP モード:   `household:<householdId>` — 世帯に紐づく。限定テストの範囲

import type { AuthenticatedHousehold } from '../household.ts'

export function consentSubjectFor(household: AuthenticatedHousehold): string {
  if (household.providerSubject) return `sub:${household.providerSubject}`
  if (household.householdId) return `household:${household.householdId}`
  // どちらも無いなら、誰の同意か決められない。**共通の入れ物へ書かない。**
  // 呼び出し側で 503 にする。
  throw new ConsentSubjectError()
}

export class ConsentSubjectError extends Error {
  constructor() {
    super('同意の記録先を特定できませんでした')
    this.name = 'ConsentSubjectError'
  }
}
