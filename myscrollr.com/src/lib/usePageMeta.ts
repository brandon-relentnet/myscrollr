import { useEffect } from 'react'

type PageMetaOptions = {
  title?: string
  description?: string
  canonicalUrl?: string
}

function upsertMeta(attr: string, key: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.append(el)
  }
  el.content = content
}

function upsertLink(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.append(el)
  }
  el.href = href
}

export function usePageMeta({
  title,
  description,
  canonicalUrl,
}: PageMetaOptions) {
  useEffect(() => {
    if (title) {
      document.title = title
      upsertMeta('property', 'og:title', title)
      upsertMeta('name', 'twitter:title', title)
    }

    if (description) {
      upsertMeta('name', 'description', description)
      upsertMeta('property', 'og:description', description)
      upsertMeta('name', 'twitter:description', description)
    }

    if (canonicalUrl) {
      upsertLink('canonical', canonicalUrl)
      upsertMeta('property', 'og:url', canonicalUrl)
    }
  }, [title, description, canonicalUrl])
}
