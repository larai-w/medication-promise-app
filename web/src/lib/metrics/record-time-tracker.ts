interface RecordTimeEvent {
  product: 'medpromise'
  channel: 'web'
  durationMs: number
}

class RecordTimeTracker {
  private startedAt: number | null = null

  start(): void {
    if (!hasMetricsConsent()) return
    this.startedAt = Date.now()
  }

  cancel(): void {
    this.startedAt = null
  }

  async stop(): Promise<void> {
    if (!hasMetricsConsent() || this.startedAt === null) {
      this.cancel()
      return
    }

    const durationMs = Date.now() - this.startedAt
    this.cancel()
    if (!Number.isInteger(durationMs) || durationMs < 100 || durationMs > 3_600_000) return

    const event: RecordTimeEvent = { product: 'medpromise', channel: 'web', durationMs }
    try {
      await fetch('/api/metrics/record-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        keepalive: true,
      })
    } catch {
      // Optional telemetry must never block medication recording.
    }
  }
}

export function hasMetricsConsent(): boolean {
  return typeof window !== 'undefined' && localStorage.getItem('metrics_consent') === 'granted'
}

export function setMetricsConsent(consent: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem('metrics_consent', consent ? 'granted' : 'denied')
}

export const medpromiseTracker = new RecordTimeTracker()
