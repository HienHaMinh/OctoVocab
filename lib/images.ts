const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY

/**
 * Search for a stock photo for a word via Unsplash API.
 * Free tier: 50 requests/hour.
 */
export async function searchWordImage(word: string): Promise<{
  url: string
  caption: string
  source: string
} | null> {
  if (!UNSPLASH_ACCESS_KEY) return null

  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(word)}&per_page=1&orientation=landscape`,
      {
        headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
      }
    )

    if (!res.ok) return null
    const data = await res.json()

    if (data.results && data.results.length > 0) {
      const photo = data.results[0]
      return {
        url: photo.urls.small,
        caption: photo.alt_description || photo.description || word,
        source: 'unsplash',
      }
    }
    return null
  } catch {
    return null
  }
}
