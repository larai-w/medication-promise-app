import {
  getMedicationSettings,
  recordMedication,
  getMedicationSettingsForHousehold,
  recordMedicationForHousehold,
  getHouseholdMembershipsBySubject,
} from './dynamodb.mjs'
import { AlexaHouseholdError, resolveAlexaHousehold } from './household.mjs'
import { makeCognitoTokenVerifier } from './cognito.mjs'
import { buildReminderText, formatReminderSummary, getMedicationName, getReminderSchedule } from './config.mjs'

// Default household resolver: verify the linked Cognito token, then resolve the
// caller's household membership. Both dependencies are built from environment
// configuration; see household.mjs and cognito.mjs.
function defaultResolveHousehold(event, env) {
  return resolveAlexaHousehold(event, {
    verifyLinkedToken: makeCognitoTokenVerifier(env),
    getMembershipsBySubject: (subject) => getHouseholdMembershipsBySubject(subject),
  })
}

// ★ interaction-model.json のインテント名と完全一致させること
const INTENT_TO_TIMING = {
  'RecordMorningIntent':    '朝',
  'RecordLunchIntent':      '昼',
  'RecordDinnerIntent':     '晩',
  'RecordNightEightIntent': '夜8時',
  'RecordNightNineIntent':  '夜9時',
}

import { minutesAgoFromIntent, speakTime, SpokenTimeError, MAX_MINUTES_AGO } from './spoken-time.mjs'

const NIGHT9_MESSAGE =
  '夜9時の服薬を記録しました。今日も一日お疲れさまでした。どうぞゆっくりお休みください。'

export async function setAllReminders(apiEndpoint, apiAccessToken, schedule, medicationName, fetchFn = fetch) {
  const headers = {
    'Authorization': `Bearer ${apiAccessToken}`,
    'Content-Type': 'application/json',
  }

  // 既存リマインダーを取得して全削除（重複防止）
  const listRes = await fetchFn(`${apiEndpoint}/v1/alerts/reminders`, { headers })
  if (listRes.status === 401 || listRes.status === 403) {
    return { permissionDenied: true }
  }
  if (!listRes.ok) {
    throw new Error(`Reminder list API ${listRes.status}`)
  }

  const { alerts = [] } = await listRes.json()
  await Promise.all(
    alerts.map(async (alert) => {
      const deleteRes = await fetchFn(`${apiEndpoint}/v1/alerts/reminders/${alert.alertToken}`, {
        method: 'DELETE',
        headers,
      })
      if (!deleteRes.ok) {
        throw new Error(`Reminder delete API ${deleteRes.status}`)
      }
    })
  )

  // 設定されたリマインダーを作成
  const todayJST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  await Promise.all(
    schedule.map(async ({ timing, hour, min }) => {
      const hh = String(hour).padStart(2, '0')
      const mm = String(min).padStart(2, '0')
      const body = {
        requestTime: new Date().toISOString(),
        trigger: {
          type: 'SCHEDULED_ABSOLUTE',
          scheduledTime: `${todayJST}T${hh}:${mm}:00.000`,
          timeZoneId: 'Asia/Tokyo',
          recurrence: { freq: 'DAILY' },
        },
        alertInfo: {
          spokenInfo: {
            content: [{ locale: 'ja-JP', text: buildReminderText(timing, medicationName) }],
          },
        },
        pushNotification: { status: 'ENABLED' },
      }
      const res = await fetchFn(`${apiEndpoint}/v1/alerts/reminders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errBody = await res.text()
        throw new Error(`Reminder API ${res.status}: ${errBody}`)
      }
    })
  )

  return { success: true }
}

function respond(text, shouldEndSession = true) {
  return {
    version: '1.0',
    response: {
      outputSpeech: { type: 'PlainText', text },
      reprompt: shouldEndSession ? undefined : {
        outputSpeech: {
          type: 'PlainText',
          text: 'いつの薬を飲みましたか？朝、昼、晩、夜8時、夜9時のいずれかを教えてください。',
        },
      },
      shouldEndSession,
    },
  }
}

export function createHandler({
  mode = process.env.ALEXA_HOUSEHOLD_MODE ?? 'legacy',
  recordMedicationFn = recordMedication,
  getMedicationSettingsFn = getMedicationSettings,
  recordMedicationForHouseholdFn = recordMedicationForHousehold,
  getMedicationSettingsForHouseholdFn = getMedicationSettingsForHousehold,
  resolveHouseholdFn,
  fetchFn = fetch,
  env = process.env,
} = {}) {
  // In 'household' mode the skill resolves the linked account's household before
  // any data access; otherwise it uses the legacy single-household path.
  const isLinked = mode === 'household'
  const resolveHousehold = resolveHouseholdFn ?? ((event) => defaultResolveHousehold(event, env))

  return async (event) => {
  const requestType = event.request.type
  console.log('RequestType:', requestType)

  if (requestType === 'LaunchRequest') {
    return respond(
      'お薬の約束です。朝、昼、晩、夜8時、夜9時のように、いつの薬を飲んだか教えてください。',
      false
    )
  }

  if (requestType === 'IntentRequest') {
    const intentName = event.request.intent.name
    console.log('Intent:', intentName)

    // 服薬記録（5インテント）
    const timing = INTENT_TO_TIMING[intentName]
    if (timing) {
      // 「30分前に飲んだ」のように言われたら、その分だけ遡った時刻で記録する。
      // 言われなければ従来どおり、話しかけた時刻を使う。
      let minutesAgo = null
      try {
        minutesAgo = minutesAgoFromIntent(event.request.intent)
      } catch (err) {
        if (err instanceof SpokenTimeError) {
          // 聞き間違いをそのまま記録しない。言い直してもらう。
          return respond(
            `すみません、いつ飲んだか聞き取れませんでした。`
            + `${MAX_MINUTES_AGO / 60}時間以内で、「30分前」のように言ってください。`,
            false
          )
        }
        throw err
      }

      let recorded
      try {
        if (isLinked) {
          const household = await resolveHousehold(event)
          recorded = await recordMedicationForHouseholdFn(household, timing, { minutesAgo })
        } else {
          recorded = await recordMedicationFn(timing, { minutesAgo })
        }
      } catch (err) {
        if (err instanceof AlexaHouseholdError) return respond(err.speech)
        console.error('DynamoDB error:', err)
        return respond('申し訳ありません、記録中にエラーが発生しました。もう一度お試しください。')
      }

      // 時刻を指定されたときは、解釈した時刻を必ず読み上げる。
      // 聞き間違いに本人が気づける唯一の手段。
      const when = minutesAgo !== null && recorded?.time
        ? `${speakTime(recorded.time)}に飲んだ、`
        : ''
      const speech = timing === '夜9時' && minutesAgo === null
        ? NIGHT9_MESSAGE
        : `${when}${timing}の服薬を記録しました。`
      return respond(speech)
    }

    // リマインダーセット
    if (intentName === 'SetRemindersIntent') {
      const { apiEndpoint, apiAccessToken } = event.context.System
      let result
      let schedule
      let settings
      try {
        settings = isLinked
          ? await getMedicationSettingsForHouseholdFn(await resolveHousehold(event))
          : await getMedicationSettingsFn()
        schedule = getReminderSchedule(env, settings.reminderSchedule)
        result = await setAllReminders(
          apiEndpoint,
          apiAccessToken,
          schedule,
          getMedicationName(env, settings),
          fetchFn
        )
      } catch (err) {
        if (err instanceof AlexaHouseholdError) return respond(err.speech)
        console.error('Reminder error:', err)
        return respond('申し訳ありません、リマインダーの設定中にエラーが発生しました。もう一度お試しください。')
      }
      if (result.permissionDenied) {
        return {
          version: '1.0',
          response: {
            outputSpeech: {
              type: 'PlainText',
              text: 'リマインダーを設定するには権限が必要です。Alexaアプリを開いて「お薬の約束」スキルのリマインダー権限を許可してください。',
            },
            card: {
              type: 'AskForPermissionsConsent',
              permissions: ['alexa::alerts:reminders:skill:readwrite'],
            },
          },
        }
      }
      return respond(`${schedule.length}つの服薬リマインダーを設定しました。${formatReminderSummary(schedule)}に呼びかけます。`)
    }

    // タイミング不明フォールバック
    if (intentName === 'RecordUnknownIntent') {
      return respond(
        'どのタイミングの薬ですか？朝、昼、晩、夜8時、夜9時のいずれかを教えてください。',
        false
      )
    }

    if (intentName === 'AMAZON.HelpIntent') {
      return respond(
        '「朝の薬を飲んだ」「夜9時の薬を飲んだ」のように話しかけると、服薬を記録できます。',
        false
      )
    }

    if (intentName === 'AMAZON.CancelIntent' || intentName === 'AMAZON.StopIntent') {
      return respond('またご利用ください。おやすみなさい。')
    }
  }

  if (requestType === 'SessionEndedRequest') {
    console.log('Session ended:', event.request.reason)
    return { version: '1.0', response: {} }
  }

  return respond('申し訳ありません。もう一度お試しください。')
  }
}

export const handler = createHandler()
