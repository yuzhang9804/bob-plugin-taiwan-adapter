import { langs } from './lang'

const SYSTEM_PROMPT = '请将以下文本转换为符合台湾人风格的中文。请注意使用台湾常用的词汇、语法和表达方式。确保语气自然，符合台湾文化习惯。'

function ensureHttpsAndNoTrailingSlash(url: string) {
  const hasProtocol = /^[a-z]+:\/\//i.test(url)
  const modifiedUrl = hasProtocol ? url : 'https://' + url

  return modifiedUrl.endsWith('/') ? modifiedUrl.slice(0, -1) : modifiedUrl
}

function buildHeader(apiKey: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
}

function generatePrompts(query: Bob.TranslateQuery) {
  const userPrompt = `文本:\n${query.text}`

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
  }
}

function buildRequestBody(model: string, query: Bob.TranslateQuery) {
  const { systemPrompt, userPrompt } = generatePrompts(query)

  const standardBody = {
    model: model,
    temperature: 0.2,
    max_tokens: 1000,
    top_p: 1,
    frequency_penalty: 1,
    presence_penalty: 1,
  }

  return {
    ...standardBody,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  }
}

function handleError(completion: Bob.Completion, result: Bob.HttpResponse) {
  const { statusCode } = result.response
  const reason = statusCode >= 400 && statusCode < 500 ? 'param' : 'api'
  completion({
    error: {
      type: reason,
      message: `接口响应错误 - ${result.data.error.message}`,
      addtion: JSON.stringify(result),
    },
  })
}

function handleResponse(completion: Bob.Completion, query: Bob.TranslateQuery, result: Bob.HttpResponse) {
  const { choices } = result.data

  if (!choices || choices.length === 0) {
    completion({
      error: {
        type: 'api',
        message: '接口未返回结果',
        addtion: JSON.stringify(result),
      },
    })
    return
  }

  let targetText = choices[0].message.content.trim()

  // 使用正则表达式删除字符串开头和结尾的特殊字符
  targetText = targetText.replace(/^(『|「|"|“)|(』|」|"|”)$/g, '')

  // 判断并删除字符串末尾的 `" =>`
  if (targetText.endsWith('" =>')) {
    targetText = targetText.slice(0, -4)
  }

  completion({
    result: {
      from: query.detectFrom,
      to: query.detectTo,
      toParagraphs: targetText.split('\n'),
    },
  })
}

export function supportLanguages(): string[] {
  return langs.map(([key]) => key)
}

export function translate(query: Bob.TranslateQuery, completion: Bob.Completion) {
  const { model, apiKeys } = $option

  if (!apiKeys) {
    completion({
      error: {
        type: 'secretKey',
        message: '配置错误 - 请确保您在插件配置中填入了正确的 API Keys',
        addtion: '请在插件配置中填写 API Keys',
      },
    })
  }
  const trimmedApiKeys = apiKeys.endsWith(',') ? apiKeys.slice(0, -1) : apiKeys
  const apiKeySelection = trimmedApiKeys.split(',').map((key) => key.trim())
  const apiKey = apiKeySelection[Math.floor(Math.random() * apiKeySelection.length)]

  const baseUrl = ensureHttpsAndNoTrailingSlash('https://api.deepseek.com')
  const apiUrlPath = '/chat/completions'

  const header = buildHeader(apiKey)
  const body = buildRequestBody(model, query)

  ;(async () => {
    const result = await $http.request({
      method: 'POST',
      url: baseUrl + apiUrlPath,
      header,
      body,
    })

    if (result.error) {
      handleError(completion, result)
    } else {
      handleResponse(completion, query, result)
    }
  })().catch((err) => {
    completion({
      error: {
        type: err._type || 'unknown',
        message: err._message || '未知错误',
        addtion: err._addition,
      },
    })
  })
}
