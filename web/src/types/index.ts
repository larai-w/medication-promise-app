import type { Timing } from '@/lib/constants'

export interface MedicationRecord {
  id: string         // base64url(SK) — for API use
  userId: string
  date: string       // YYYY-MM-DD
  time: string       // HH:MM
  timing: Timing
  source: 'alexa' | 'manual'
  notes?: string
  createdAt: string  // ISO8601
  updatedAt?: string // ISO8601
}

export interface CreateRecordInput {
  date: string       // YYYY-MM-DD
  time: string       // HH:MM
  timing: Timing
  source?: 'alexa' | 'manual'
  notes?: string
}

export interface UpdateRecordInput {
  time?: string
  timing?: Timing
  notes?: string
}

export interface DynamoRecord {
  PK: string
  SK: string
  userId: string
  date: string
  time: string
  timing: Timing
  source: 'alexa' | 'manual'
  notes?: string
  createdAt: string
  updatedAt?: string
}
