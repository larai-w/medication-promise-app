import { recordMedication } from './dynamodb.mjs'

const REMINDER_SCHEDULE = [
  { hour: 8,  min: 0,  text: '朝のお薬の時間です。レボドパを飲んでください。飲んだら「アレクサ、お薬の約束を開いて」と話しかけてください。' },
  { hour: 12, min: 0,  text: '昼のお薬の時間です。レボドパを飲んでください。飲んだら「アレクサ、お薬の約束を開いて」と話しかけてください。' },
  { hour: 18, min: 0,  text: '晩のお薬の時間です。レボドパを飲んでください。飲んだら「アレクサ、お薬の約束を開いて」と話しかけてください。' },
  { hour: 20, min: 0,  text: '夜8時のお薬の時間です。レボドパを飲んでください。飲んだら「アレクサ、お薬の約束を開いて」と話しかけてください。' },
  { hour: 21, min: 0,  text: '夜9時のお薬の時間です。今日も一日お疲れ様でした。レボドパを飲んでください。飲んだら「アレクサ、お薬の約束を開いて」と話しかけてください。' },
]

// ★ interaction-model.json のインテント名と完全一致させること
const INTENT_TO_TIMING = {
  'RecordMorningIntent':    '朝',
  'RecordLunchIntent':      '昼',
  'RecordDinnerIntent':     '晩',
  'RecordNightEightIntent': '夜8時',
  'RecordNightNineIntent':  '夜9時',
}

const NIGHT9_MESSAGE =
  '夜9時の薬ですね。今日も問題がなければ、' +
  '看護師さんを呼ばずにこのまま夜おやすみできますよ。' +
  '安心しておやすみくださいね。'

async function setAllReminders(apiEndpoint, apiAccessToken) {
  const headers = {
    'Authorization': `Bearer ${apiAccessToken}`,
    'Content-Type': 'application/json',
  }

  // 既存リマインダーを取得して全削除（重複防止）
  const listRes = await fetch(`${apiEndpoint}/v1/alerts/reminders`, { headers })
  if (listRes.status === 401 || listRes.status === 403) {
    return { permissionDenied: true }
  }
  if (listRes.ok) {
    const { alerts = [] } = await listRes.json()
    for (const alert of alerts) {
      await fetch(`${apiEndpoint}/v1/alerts/reminders/${alert.alertToken}`, {
        method: 'DELETE',
        headers,
      })
    }
  }

  // 5つのリマインダーを作成
  const todayJST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  for (const { hour, min, text } of REMINDER_SCHEDULE) {
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
          content: [{ locale: 'ja-JP', text }],
        },
      },
      pushNotification: { status: 'ENABLED' },
    }
    const res = await fetch(`${apiEndpoint}/v1/alerts/reminders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Reminder API ${res.status}: ${errBody}`)
    }
  }

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

export const handler = async (event) => {
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
      try {
        await recordMedication(timing)
      } catch (err) {
        console.error('DynamoDB error:', err)
        return respond('申し訳ありません、記録中にエラーが発生しました。もう一度お試しください。')
      }
      const speech = timing === '夜9時' ? NIGHT9_MESSAGE : `${timing}の服薬を記録しました。`
      return respond(speech)
    }

    // リマインダーセット
    if (intentName === 'SetRemindersIntent') {
      const { apiEndpoint, apiAccessToken } = event.context.System
      let result
      try {
        result = await setAllReminders(apiEndpoint, apiAccessToken)
      } catch (err) {
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
      return respond('5つの薬のリマインダーを設定しました。朝8時、昼12時、晩18時、夜8時、夜9時に呼びかけます。')
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
