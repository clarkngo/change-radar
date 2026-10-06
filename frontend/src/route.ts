import { useEffect, useState } from 'react'

export type Page = 'dashboard' | 'metrics' | 'changes' | 'investigate' | 'guidelines'
export const PAGES: Page[] = ['dashboard', 'metrics', 'changes', 'investigate', 'guidelines']

export interface Route {
  page: Page
  params: URLSearchParams
}

function parse(): Route {
  const [path, query = ''] = window.location.hash.replace(/^#\/?/, '').split('?')
  const page = (PAGES as string[]).includes(path) ? (path as Page) : 'dashboard'
  return { page, params: new URLSearchParams(query) }
}

/** Hash routing, so deep links work on GitHub Pages without server rewrites. */
export function useRoute(): Route {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const onChange = () => setRoute(parse())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(page: Page, params: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString()
  window.location.hash = `/${page}${query ? `?${query}` : ''}`
}
