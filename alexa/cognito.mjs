// Amazon Cognito token verifier adapter (Issue #12).
//
// Implements the `verifyLinkedToken` seam that resolveAlexaHousehold() expects:
// given the linked account access token, verify it against the Cognito user
// pool and return the stable provider subject. See
// docs/ALEXA_ACCOUNT_LINKING_DESIGN.md ("Token Handling").
//
// The underlying JWT verifier is injectable so this module is unit-testable
// without network or a real user pool. The real Cognito verifier is loaded
// lazily (dynamic import) and built from Lambda environment configuration, so
// no pool identifiers are committed and the module loads even where the
// dependency is not installed.

// aws-jwt-verify checks signature (against the pool JWKS), expiry, issuer,
// token_use, and client id. We build it for access tokens because Alexa
// account linking forwards the provider access token.
async function buildDefaultVerifier(env) {
  const userPoolId = env.COGNITO_USER_POOL_ID
  const clientId = env.COGNITO_CLIENT_ID
  if (!userPoolId || !clientId) {
    throw new Error('Cognito verifier requires COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID')
  }
  const { CognitoJwtVerifier } = await import('aws-jwt-verify')
  return CognitoJwtVerifier.create({ userPoolId, tokenUse: 'access', clientId })
}

// Returns an async verifyLinkedToken(token) -> { subject }.
// Pass { verifier } (an object with an async `verify(token)` returning claims)
// to bypass the default Cognito verifier in tests. Fails closed: a missing
// configuration or a failed verification throws, which resolveAlexaHousehold()
// maps to an `invalid-token` outcome.
export function makeCognitoTokenVerifier(env = process.env, { verifier } = {}) {
  let jwtVerifier = verifier
  return async function verifyLinkedToken(token) {
    if (!jwtVerifier) jwtVerifier = await buildDefaultVerifier(env)
    const claims = await jwtVerifier.verify(token)
    const subject = typeof claims?.sub === 'string' ? claims.sub.trim() : ''
    return { subject }
  }
}
