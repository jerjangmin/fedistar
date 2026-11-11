import { EMOJI_CATALOG_REFRESH_INTERVAL_MS, isEmojiCatalogRefreshDue } from './emojiCatalog'

describe('emoji catalog refresh throttle', () => {
  const now = 1_800_000_000_000

  it('refreshes when never refreshed or the stored value is invalid', () => {
    expect(isEmojiCatalogRefreshDue(null, now)).toBe(true)
    expect(isEmojiCatalogRefreshDue(Number('garbage'), now)).toBe(true)
  })

  it('skips the network refresh within the interval', () => {
    expect(isEmojiCatalogRefreshDue(now - 60_000, now)).toBe(false)
  })

  it('refreshes after the interval or when the clock moved backwards', () => {
    expect(isEmojiCatalogRefreshDue(now - EMOJI_CATALOG_REFRESH_INTERVAL_MS, now)).toBe(true)
    expect(isEmojiCatalogRefreshDue(now + 60_000, now)).toBe(true)
  })
})
