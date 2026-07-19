// Alexa household resolution boundary (Issue #12).
//
// The skill must resolve a household-scoped partition from the linked account
// identity before any DynamoDB access, and fail closed when the linked identity
// is missing, invalid, or ambiguous. See docs/ALEXA_ACCOUNT_LINKING_DESIGN.md.
//
// This module intentionally does NOT ship a real token verifier or a real
// membership store. Both are injected so the boundary is testable and so no
// provider-specific production integration is committed here yet.

// User-visible reasons for a failed household resolution. Speech copy stays
// supportive and non-clinical, and never exposes internal identifiers.
export const HOUSEHOLD_FAILURE = Object.freeze({
  NO_TOKEN: 'no-token',
  INVALID_TOKEN: 'invalid-token',
  NO_MEMBERSHIP: 'no-membership',
  AMBIGUOUS_MEMBERSHIP: 'ambiguous-membership',
  HOUSEHOLD_DISABLED: 'household-disabled',
  LOOKUP_ERROR: 'lookup-error',
})

const FAILURE_SPEECH = Object.freeze({
  [HOUSEHOLD_FAILURE.NO_TOKEN]:
    'このスキルはまだアカウントとリンクされていません。Alexaアプリを開いて、お薬の約束スキルのアカウントリンクを行ってください。',
  [HOUSEHOLD_FAILURE.INVALID_TOKEN]:
    'アカウントのリンクの有効期限が切れているようです。Alexaアプリを開いて、もう一度リンクし直してください。',
  [HOUSEHOLD_FAILURE.NO_MEMBERSHIP]:
    'このアカウントはまだ招待されていません。ウェブアプリから招待を受け取ってからお試しください。',
  [HOUSEHOLD_FAILURE.AMBIGUOUS_MEMBERSHIP]:
    '現在この操作はご利用いただけません。しばらくしてからもう一度お試しください。',
  [HOUSEHOLD_FAILURE.HOUSEHOLD_DISABLED]:
    '現在この操作はご利用いただけません。しばらくしてからもう一度お試しください。',
  [HOUSEHOLD_FAILURE.LOOKUP_ERROR]:
    '申し訳ありません、一時的な問題が発生しました。もう一度お試しください。',
})

export class AlexaHouseholdError extends Error {
  constructor(reason) {
    super(`Alexa household resolution failed: ${reason}`)
    this.name = 'AlexaHouseholdError'
    this.reason = reason
    this.speech = FAILURE_SPEECH[reason] ?? FAILURE_SPEECH[HOUSEHOLD_FAILURE.LOOKUP_ERROR]
  }
}

// Keep the partition key convention identical to the Web side
// (web/src/lib/dynamodb.ts makeHouseholdPK).
export function makeHouseholdPK(householdId) {
  return `HOUSEHOLD#${householdId}`
}

// The linked account access token is placed by Alexa account linking on the
// request context (and, for some request shapes, on the session user).
export function extractLinkedToken(event) {
  const contextToken = event?.context?.System?.user?.accessToken
  if (typeof contextToken === 'string' && contextToken) return contextToken
  const sessionToken = event?.session?.user?.accessToken
  if (typeof sessionToken === 'string' && sessionToken) return sessionToken
  return undefined
}

// Default verifier fails closed: production must inject a real verifier that
// checks signature/introspection, expiry, issuer, audience, and subject.
function unconfiguredVerifier() {
  throw new Error('No linked-token verifier configured')
}

// Default membership lookup fails closed for the same reason.
function unconfiguredMemberships() {
  throw new Error('No household membership lookup configured')
}

function isActiveMembership(membership) {
  const status = membership?.status
  return status === undefined || status === 'active'
}

// Resolve the household partition for a linked Alexa request.
//
// verifyLinkedToken(token) -> { subject } (throws on invalid/expired token).
// getMembershipsBySubject(subject) -> array of { householdId, status? }.
//
// Returns { householdId, providerSubject, partitionKey } or throws
// AlexaHouseholdError with a user-visible `speech`.
export async function resolveAlexaHousehold(
  event,
  {
    verifyLinkedToken = unconfiguredVerifier,
    getMembershipsBySubject = unconfiguredMemberships,
  } = {}
) {
  const token = extractLinkedToken(event)
  if (!token) {
    throw new AlexaHouseholdError(HOUSEHOLD_FAILURE.NO_TOKEN)
  }

  let subject
  try {
    const claims = await verifyLinkedToken(token)
    subject = typeof claims?.subject === 'string' ? claims.subject.trim() : ''
  } catch {
    throw new AlexaHouseholdError(HOUSEHOLD_FAILURE.INVALID_TOKEN)
  }
  if (!subject) {
    throw new AlexaHouseholdError(HOUSEHOLD_FAILURE.INVALID_TOKEN)
  }

  let memberships
  try {
    memberships = await getMembershipsBySubject(subject)
  } catch {
    throw new AlexaHouseholdError(HOUSEHOLD_FAILURE.LOOKUP_ERROR)
  }

  const all = Array.isArray(memberships) ? memberships : []
  const active = all.filter(isActiveMembership)

  if (active.length === 0) {
    // Distinguish "never invited" from "invited but currently disabled" so the
    // operator-facing failure reason is accurate; both fail closed.
    throw new AlexaHouseholdError(
      all.length > 0
        ? HOUSEHOLD_FAILURE.HOUSEHOLD_DISABLED
        : HOUSEHOLD_FAILURE.NO_MEMBERSHIP
    )
  }
  if (active.length > 1) {
    throw new AlexaHouseholdError(HOUSEHOLD_FAILURE.AMBIGUOUS_MEMBERSHIP)
  }

  const householdId = active[0].householdId
  if (typeof householdId !== 'string' || !householdId) {
    throw new AlexaHouseholdError(HOUSEHOLD_FAILURE.LOOKUP_ERROR)
  }

  return {
    householdId,
    providerSubject: subject,
    partitionKey: makeHouseholdPK(householdId),
  }
}
