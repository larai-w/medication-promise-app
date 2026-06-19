import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME ?? 'DrugAndOathRecords'
const USER_ID    = process.env.USER_ID ?? 'default-user'

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

const docClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({}),
  { marshallOptions: { removeUndefinedValues: true } }
)

function nowJST() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  return {
    date: jst.toISOString().slice(0, 10),
    time: jst.toISOString().slice(11, 16),
    iso:  new Date().toISOString(),
  }
}

async function recordMedication(timing) {
  const { date, time, iso } = nowJST()
  const uuid = randomUUID()
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK:        `USER#${USER_ID}`,
      SK:        `RECORD#${date}T${time}:00#${uuid}`,
      userId:    USER_ID,
      date,
      time,
      timing,
      source:    'alexa',
      createdAt: iso,
    },
  }))
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
