import { invoke } from '@tauri-apps/api/core'
import { EmojiCatalogEntry } from 'src/entities/emojiCatalog'
import { domainFromAcct } from 'src/utils/domain'

type CatalogMap = Record<string, Record<string, string>>

let emojiCatalogs: CatalogMap = {}

const normalizeDomain = (value?: string | null): string | null => {
  if (!value) return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  return trimmed.includes('@') ? domainFromAcct(trimmed) : trimmed
}

export const setEmojiCatalogEntries = (entries: Array<EmojiCatalogEntry>) => {
  const next: CatalogMap = {}
  entries.forEach(entry => {
    const domain = normalizeDomain(entry.source_domain)
    if (!domain) return
    if (!next[domain]) {
      next[domain] = {}
    }
    next[domain][entry.shortcode] = entry.static_url || entry.image_url
  })
  emojiCatalogs = next
}

export const loadEmojiCatalogEntries = async () => {
  const entries = await invoke<Array<EmojiCatalogEntry>>('list_emoji_catalog_entries')
  setEmojiCatalogEntries(entries)
}

export const EMOJI_CATALOG_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000
const LAST_REFRESH_KEY = 'fedistar.emojiCatalog.lastRefreshedAt'

export const isEmojiCatalogRefreshDue = (lastRefreshedAt: number | null, now: number, interval = EMOJI_CATALOG_REFRESH_INTERVAL_MS) =>
  lastRefreshedAt === null || !Number.isFinite(lastRefreshedAt) || now - lastRefreshedAt >= interval || now < lastRefreshedAt

const readLastRefreshedAt = (): number | null => {
  try {
    const raw = window.localStorage.getItem(LAST_REFRESH_KEY)
    return raw === null ? null : Number(raw)
  } catch {
    return null
  }
}

const writeLastRefreshedAt = (value: number) => {
  try {
    window.localStorage.setItem(LAST_REFRESH_KEY, String(value))
  } catch {
    // Ignore storage failures; the catalog will simply refresh again next launch.
  }
}

// Fetches remote emoji lists in the background. The module-level map is swapped in place,
// so later renders pick up new entries without remounting the app.
export const refreshEmojiCatalogEntries = async ({ force = false } = {}) => {
  if (!force && !isEmojiCatalogRefreshDue(readLastRefreshedAt(), Date.now())) {
    return false
  }
  await invoke('refresh_emoji_catalogs')
  writeLastRefreshedAt(Date.now())
  await loadEmojiCatalogEntries()
  return true
}

export const resolveEmojiCatalogUrl = (shortcode: string, originHint?: string | null): string | null => {
  const domain = normalizeDomain(originHint)
  if (!domain) return null
  return emojiCatalogs[domain]?.[shortcode] || null
}
