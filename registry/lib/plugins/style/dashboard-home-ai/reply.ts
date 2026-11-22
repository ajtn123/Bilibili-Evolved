import { getDescriptionHTML } from '@/components/description'
import {
  getLinkType,
  getWebUrl,
} from '../../../components/style/home-redesign/dashboard/shared/urls'
import type { ContentCardData } from '../../../components/style/home-redesign/dashboard/shared/cards/content-card'

export const replyCardLimit = 8

const markdownElements = new Set(
  'a blockquote br code del em h1 h2 h3 h4 h5 h6 hr li ol p pre strong table tbody td th thead tr ul'.split(
    ' ',
  ),
)

const getLink = (value: string | null) => {
  if (!value || !URL.canParse(value, location.href)) {
    return undefined
  }
  const url = new URL(value, location.href)
  return url.protocol === 'https:' || url.protocol === 'http:' ? url : undefined
}

const getImageUrl = (url: URL | undefined) => {
  if (!url || !/(?:^|\.)(?:hdslb|biliimg|bilibili)\.com$/.test(url.hostname)) {
    return undefined
  }
  url.protocol = 'https:'
  return url.href
}

export const getReplyCards = (
  input: unknown,
  staticUrls: ReadonlyMap<string, number>,
): ContentCardData[] => {
  if (!Array.isArray(input)) {
    return []
  }
  const imageUrls = new Map([...staticUrls].map(([url, index]) => [`<static-${index}>`, url]))
  const cards: ContentCardData[] = []
  for (const item of input) {
    if (cards.length === replyCardLimit) {
      break
    }
    if (!item || typeof item.title !== 'string' || !item.title.trim()) {
      continue
    }
    const link = getLink(getWebUrl(item.link))
    if (!link) {
      continue
    }
    const image = typeof item.image === 'string' ? item.image.trim() : ''
    const coverUrl = getImageUrl(getLink(getWebUrl(imageUrls.get(image) ?? image)))
    const type = getLinkType(link)
    cards.push({
      title: item.title.trim(),
      description: typeof item.description === 'string' ? item.description : undefined,
      url: link.href,
      coverUrl,
      kind: type === 'video' || type === 'column' ? type : 'other',
    })
  }
  return cards
}

export const renderReplyMarkdown = async (reply: string) => {
  // BE renders trusted component descriptions. Keep model output inert until it is filtered.
  const template = document.createElement('template')
  template.innerHTML = await getDescriptionHTML({ description: reply })
  template.content.querySelectorAll('*').forEach(element => {
    if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
      element.remove()
      return
    }
    if (element.localName === 'img') {
      const alt = element.getAttribute('alt') || '图片'
      const url = getLink(element.getAttribute('src'))
      const imageUrl = getImageUrl(url)
      if (imageUrl) {
        const image = element.ownerDocument.createElement('img')
        image.alt = alt
        image.loading = 'lazy'
        image.decoding = 'async'
        image.crossOrigin = 'anonymous'
        image.referrerPolicy = 'no-referrer'
        image.src = imageUrl
        element.replaceWith(image)
      } else if (url) {
        const link = document.createElement('a')
        link.href = url.href
        link.textContent = alt
        element.replaceWith(link)
      } else {
        element.replaceWith(alt)
      }
      return
    }
    if (!markdownElements.has(element.localName)) {
      element.remove()
      return
    }
    const link = element.localName === 'a' ? getLink(element.getAttribute('href')) : undefined
    const start = element.localName === 'ol' ? element.getAttribute('start') : null
    element.getAttributeNames().forEach(name => element.removeAttribute(name))
    if (link) {
      element.setAttribute('href', link.href)
    }
    if (start && /^-?\d+$/.test(start)) {
      element.setAttribute('start', start)
    }
  })
  return template.innerHTML.trim() || undefined
}
