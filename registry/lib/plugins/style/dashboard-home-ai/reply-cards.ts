import { formatCount } from '@/core/utils/formatters'
import type {
  ContentCardData,
  ContentCardKind,
} from '../../../components/style/home-redesign/dashboard/shared/cards/content-card'
import {
  getBangumiEpisodeUrl,
  getLinkType,
  getVideoUrl,
  getWebUrl,
} from '../../../components/style/home-redesign/dashboard/shared/urls'
import { getImageUrl, getLink } from './reply'

export const replyCardLimit = 8

const replyCardExample = {
  type: 'done',
  reply: '上次看到这里，可以继续观看。',
  cards: [
    {
      title: '示例教程',
      url: 'https://www.bilibili.com/video/BV1xx411c7mD/',
      description: '演示如何制作简洁的片头。',
      coverUrl: '<static-2>',
      durationText: '12:34',
      progress: 0.35,
      upID: '12345',
      upName: '示例作者',
      topics: [{ id: '42', name: '剪辑教程' }],
      playCount: '1.2万',
    },
  ],
}

const replyCardSchema = `
type Id = string       // 十进制正整数
type WebUrl = string   // 完整的 HTTPS 地址
type Image = string    // 本轮有 <static-N> 时使用该编号，否则填写完整的 B 站 HTTPS 图片地址

type Cooperation = { id: Id; name: string; faceUrl?: Image }
type Topic = { id: Id; name: string; url?: WebUrl }

type Card = {
  // 内容标识
  title: string // 非空
  url: WebUrl   // 内容页面链接
  aid?: Id      // 视频 AV 号，仅填写数字部分
  kind?: "video" | "column" | "bangumi" | "other" // 可推断

  // 内容展示
  description?: string
  detail?: string       // 简介下方的补充文字
  badge?: string        // 封面角标
  durationText?: string // 例如 "12:34"
  progress?: number     // 0 <= progress <= 1
  coverUrl?: Image

  // 作者与话题
  upID?: Id
  upName?: string
  upUrl?: WebUrl
  upFaceUrl?: Image
  cooperation?: Cooperation[]
  topics?: Topic[]

  // 统计，使用字符串，例如 "205" 或 "1.2万"
  like?: string
  playCount?: string
  danmakuCount?: string
  coins?: string
  favorites?: string
  readCount?: string
}

type Done = {
  type: "done"
  reply: string  // Markdown
  cards?: Card[] // cards.length <= ${replyCardLimit}
}
`.trim()

export const replyCardsPrompt = [
  '无需继续请求时，返回一个符合 Done 的 JSON 对象。cards 显示在 reply 后。每张卡片必须提供 title 和 url。其他字段可省略。',
  `<reply-schema>\n${replyCardSchema}\n</reply-schema>`,
  `<reply-example>\n${JSON.stringify(replyCardExample, null, 2)}\n</reply-example>`,
].join('\n')

type CardFields = Record<string, unknown>
type ResolveImage = (value: unknown) => string | undefined

const cardKinds: ReadonlySet<unknown> = new Set(['video', 'column', 'bangumi', 'other'])
const isCardKind = (value: unknown): value is ContentCardKind => cardKinds.has(value)

const isRecord = (value: unknown): value is CardFields =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const getText = (value: unknown) =>
  typeof value === 'string' ? value.trim() || undefined : undefined

const getId = (value: unknown) => {
  const id = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : undefined
}

const getCardLink = (value: unknown) => getLink(getWebUrl(getText(value)))?.href

const getCountText = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? formatCount(value)
    : getText(value)

const getNamedEntries = <T>(
  value: unknown,
  getEntry: (fields: CardFields, id: number, name: string) => T,
) => {
  if (!Array.isArray(value)) {
    return undefined
  }
  const entries = new Map<number, T>()
  for (const fields of value) {
    if (!isRecord(fields)) {
      continue
    }
    const id = getId(fields.id)
    const name = getText(fields.name)
    if (id !== undefined && name && !entries.has(id)) {
      entries.set(id, getEntry(fields, id, name))
    }
  }
  return [...entries.values()]
}

const getCardKind = (value: unknown, url: string, epID: number | undefined): ContentCardKind => {
  if (isCardKind(value)) {
    return value
  }
  if (epID !== undefined) {
    return 'bangumi'
  }
  const type = getLinkType(new URL(url))
  return type === 'video' || type === 'column' ? type : 'other'
}

const getCard = (fields: CardFields, resolveImage: ResolveImage): ContentCardData | undefined => {
  const title = getText(fields.title)
  const aid = getId(fields.aid)
  const candidateBvid = getText(fields.bvid)
  const bvid =
    candidateBvid && /^BV[\da-z]{10}$/i.test(candidateBvid)
      ? `BV${candidateBvid.slice(2)}`
      : undefined
  const epID = getId(fields.epID)
  let url = getCardLink(fields.url) ?? getCardLink(fields.link)
  if (!url && epID !== undefined) {
    url = getBangumiEpisodeUrl(epID)
  }
  if (!url && (bvid || aid !== undefined)) {
    url = getVideoUrl(bvid ?? `av${aid}`)
  }
  if (!title || !url) {
    return undefined
  }

  const { progress } = fields
  return {
    title,
    url,
    aid,
    bvid,
    epID,
    kind: getCardKind(fields.kind, url, epID),
    coverUrl: resolveImage(fields.coverUrl) ?? resolveImage(fields.image),
    description: getText(fields.description),
    detail: getText(fields.detail),
    badge: getText(fields.badge),
    durationText: getText(fields.durationText),
    progress: typeof progress === 'number' && progress >= 0 && progress <= 1 ? progress : undefined,
    upID: getId(fields.upID),
    upName: getText(fields.upName),
    upFaceUrl: resolveImage(fields.upFaceUrl),
    upUrl: getCardLink(fields.upUrl),
    cooperation: getNamedEntries(fields.cooperation, (entry, id, name) => ({
      id,
      name,
      faceUrl: resolveImage(entry.faceUrl) ?? '',
    })),
    topics: getNamedEntries(fields.topics, (entry, id, name) => ({
      id,
      name,
      url: getCardLink(entry.url),
    })),
    like: getCountText(fields.like),
    playCount: getCountText(fields.playCount),
    danmakuCount: getCountText(fields.danmakuCount),
    coins: getCountText(fields.coins),
    favorites: getCountText(fields.favorites),
    readCount: getCountText(fields.readCount),
  }
}

export const getReplyCards = (
  input: unknown,
  staticUrls: ReadonlyMap<string, number>,
): ContentCardData[] => {
  if (!Array.isArray(input)) {
    return []
  }
  const imageUrls = new Map([...staticUrls].map(([url, index]) => [`<static-${index}>`, url]))
  const resolveImage: ResolveImage = value => {
    const image = getText(value)
    return image ? getImageUrl(getLink(getWebUrl(imageUrls.get(image) ?? image))) : undefined
  }
  const cards: ContentCardData[] = []
  for (const fields of input) {
    if (!isRecord(fields)) {
      continue
    }
    const candidate = getCard(fields, resolveImage)
    if (candidate) {
      cards.push(candidate)
      if (cards.length === replyCardLimit) {
        break
      }
    }
  }
  return cards
}
