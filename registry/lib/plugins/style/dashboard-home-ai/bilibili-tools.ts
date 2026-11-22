import dashboardUrlsSource from '../../../components/style/home-redesign/dashboard/shared/urls.ts?raw'

const responseLimit = 0x10000
const requestTimeoutMs = 0x2000

const example = { type: 'request', method: 'GET', url: 'https://api.bilibili.com/…', clean: true }

const staticUrlPattern =
  /(?:https?:)?\/\/[a-z0-9.-]+\.(?:hdslb|biliimg)\.com\/[a-z0-9_%.~@/?&=+#:-]*/gi

const decorativeFields = new Map([
  [
    'module_author',
    new Set(['avatar', 'pendant', 'decorate', 'decoration_card', 'decorate_card', 'icon_badge']),
  ],
  ['basic', new Set(['like_icon'])],
  ['modules', new Set(['module_more'])],
  ['vip', new Set(['label', 'avatar_icon', 'avatar_subscript_url', 'nickname_color'])],
  ['rich_text_nodes', new Set(['style'])],
])

export const bilibiliToolsPrompt = [
  '请求 Bilibili API 时，每次只提交一个请求，由插件按照用户选择的审批模式处理。',
  '仅允许请求 bilibili.com 及其子域名的 HTTPS 地址，请根据下方 urls.ts 的接口参考选择参数。',
  'clean 为 true 时，精简响应：省略空字段、动态装扮和菜单等界面数据，省略富文本中重复的原文，并将静态资源地址替换为编号 <static-N>。卡片可用这些编号作为 image。如需保留原始字段，设为 false。',
  `<example>\n${JSON.stringify(example)}\n</example>`,
  `<urls.ts>\n${dashboardUrlsSource}\n</urls.ts>`,
].join('\n')

type JsonValue = string | number | boolean | null | object

export interface ToolResult {
  status: number
  body?: JsonValue
  truncated: boolean
}

const validateToolUrl = (value: string) => {
  if (!URL.canParse(value)) {
    return false
  }
  const { protocol, hostname } = new URL(value)
  if (
    protocol !== 'https:' ||
    (hostname !== 'bilibili.com' && !hostname.endsWith('.bilibili.com'))
  ) {
    return false
  }
  return true
}

const isEmptyField = (value: JsonValue) =>
  value === null || value === '' || (typeof value === 'object' && Object.keys(value).length === 0)

const cleanValue = (
  value: JsonValue,
  staticUrls: Map<string, number>,
  section?: string,
): JsonValue => {
  if (typeof value === 'string') {
    return value.replace(staticUrlPattern, url => {
      const index = staticUrls.get(url) ?? staticUrls.size + 1
      staticUrls.set(url, index)
      return `<static-${index}>`
    })
  }
  if (Array.isArray(value)) {
    return value.map(item => cleanValue(item, staticUrls, section))
  }
  if (value !== null && typeof value === 'object') {
    const omitted = decorativeFields.get(section)
    const text = 'text' in value ? value.text : undefined
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !omitted?.has(key))
        .filter(
          ([key, field]) => section !== 'rich_text_nodes' || key !== 'orig_text' || field !== text,
        )
        .map(([key, field]) => [key, cleanValue(field, staticUrls, key)] as const)
        .filter(([, field]) => !isEmptyField(field)),
    )
  }
  return value
}

const readBody = (body: string, clean: boolean, staticUrls: Map<string, number>): JsonValue => {
  try {
    const json: JsonValue = JSON.parse(body)
    return clean ? cleanValue(json, staticUrls) : json
  } catch {
    return clean ? cleanValue(body, staticUrls) : body
  }
}

export const runToolRequest = async (
  method: string,
  url: string,
  clean: boolean,
  signal: AbortSignal,
  staticUrls: Map<string, number>,
): Promise<ToolResult> => {
  if (!validateToolUrl(url)) {
    throw new Error('请求地址必须是 B 站的 HTTPS 地址。')
  }
  const response = await fetch(url, {
    method,
    credentials: 'include',
    redirect: 'follow',
    referrerPolicy: 'origin',
    signal: AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]),
  })
  const { status } = response
  const body = await response.text()
  if (!body) {
    return { status, truncated: false }
  }
  if (!clean && body.length > responseLimit) {
    return { status, body: body.slice(0, responseLimit), truncated: true }
  }

  const result = readBody(body, clean, staticUrls)
  const text = typeof result === 'string' ? result : JSON.stringify(result)
  if (text.length > responseLimit) {
    return { status, body: text.slice(0, responseLimit), truncated: true }
  }
  return { status, body: result, truncated: false }
}
