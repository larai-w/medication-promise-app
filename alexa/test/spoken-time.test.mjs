import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  durationToMinutes,
  minutesAgoFromIntent,
  speakTime,
  SpokenTimeError,
  MAX_MINUTES_AGO,
} from '../spoken-time.mjs'

const intentWith = (value) => ({ name: 'RecordMorningIntent', slots: { ago: { value } } })

test('parses the durations Alexa actually sends', () => {
  assert.equal(durationToMinutes('PT30M'), 30)
  assert.equal(durationToMinutes('PT1H'), 60)
  assert.equal(durationToMinutes('PT1H30M'), 90)
  assert.equal(durationToMinutes('PT2H15M'), 135)
  assert.equal(durationToMinutes('P1D'), 1440)
})

test('no slot means "not stated" — the old behaviour must stay reachable', () => {
  assert.equal(minutesAgoFromIntent({ name: 'RecordMorningIntent' }), null)
  assert.equal(minutesAgoFromIntent({ name: 'X', slots: {} }), null)
  assert.equal(minutesAgoFromIntent(intentWith(undefined)), null)
  assert.equal(minutesAgoFromIntent(intentWith('')), null)
})

test('rejects durations that make no sense for a medication record', () => {
  // 週・月は服薬記録の文脈で意味を成さない
  assert.throws(() => durationToMinutes('P1W'), SpokenTimeError)
  assert.throws(() => durationToMinutes('P1M'), SpokenTimeError)
  assert.throws(() => durationToMinutes('PT'), SpokenTimeError)
  assert.throws(() => durationToMinutes('30分前'), SpokenTimeError)
})

test('refuses to record a mis-heard, implausibly large offset', () => {
  // 「10分前」が「10時間前」に化けても、上限を超えれば記録しない
  assert.equal(MAX_MINUTES_AGO, 720)
  assert.equal(minutesAgoFromIntent(intentWith('PT12H')), 720)
  assert.throws(() => minutesAgoFromIntent(intentWith('PT13H')), SpokenTimeError)
  assert.throws(() => minutesAgoFromIntent(intentWith('P1D')), SpokenTimeError)
})

test('reads the time back in a way a person can check by ear', () => {
  // 0埋めすると「ゼロはち時」のように読まれるので使わない
  assert.equal(speakTime('08:05'), '8時5分')
  assert.equal(speakTime('21:00'), '21時0分')
  assert.equal(speakTime('bogus'), 'bogus')
})
