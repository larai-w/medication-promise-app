import type { OpenNextConfig } from '@opennextjs/aws/types/open-next.js'

// Minimal OpenNext config for AWS (CloudFront + Lambda).
// Defaults deploy the whole app as a single server Lambda with S3-hosted assets.
const config: OpenNextConfig = {
  default: {},
}

export default config
