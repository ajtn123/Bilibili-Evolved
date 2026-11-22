import { getDescriptionHTML } from '@/components/description'

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
      if (url && /(?:^|\.)(?:hdslb|biliimg|bilibili)\.com$/.test(url.hostname)) {
        url.protocol = 'https:'
        const image = element.ownerDocument.createElement('img')
        image.alt = alt
        image.loading = 'lazy'
        image.decoding = 'async'
        image.crossOrigin = 'anonymous'
        image.referrerPolicy = 'no-referrer'
        image.src = url.href
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
