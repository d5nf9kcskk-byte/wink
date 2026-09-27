export interface SearchResult {
  olWorkKey: string
  title: string
  authors: string[]
  coverId: number | null
  pages: number | null
  subjects: string[]
  firstPublishYear: number | null
}

interface Doc {
  key: string
  title: string
  author_name?: string[]
  cover_i?: number
  number_of_pages_median?: number
  subject?: string[]
  first_publish_year?: number
}

const FIELDS = 'key,title,author_name,cover_i,number_of_pages_median,subject,first_publish_year'

/** Open Library search. Rejects on network failure; honours the abort signal. */
export async function searchBooks(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const res = await fetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=${FIELDS}&limit=12`,
    { signal },
  )
  if (!res.ok) throw new Error(`Open Library didn't answer (error ${res.status}). Try again in a moment.`)
  const { docs } = (await res.json()) as { docs: Doc[] }
  return docs.map((d) => ({
    olWorkKey: d.key,
    title: d.title,
    authors: d.author_name ?? [],
    coverId: d.cover_i ?? null,
    pages: d.number_of_pages_median ?? null,
    subjects: (d.subject ?? []).slice(0, 20),
    firstPublishYear: d.first_publish_year ?? null,
  }))
}

export function coverUrl(coverId: number, size: 'S' | 'M' | 'L' = 'M'): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`
}
