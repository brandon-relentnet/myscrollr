import { useEffect } from 'react'

type PageMetaOptions = {
  title?: string
  description?: string
}

export function usePageMeta({ title, description }: PageMetaOptions) {
  useEffect(() => {
    if (title) {
      document.title = title
    }

    if (description) {
      let meta = document.querySelector<HTMLMetaElement>(
        'meta[name="description"]',
      )

      if (!meta) {
        meta = document.createElement('meta')
        meta.name = 'description'
        document.head.append(meta)
      }

      meta.content = description
    }
  }, [title, description])
}
