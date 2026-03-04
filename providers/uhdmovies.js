const cheerio = require("cheerio-without-node-native")

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"

const DOMAINS = [
  "https://uhdmovies.email",
  "https://uhdmovies.fyi",
  "https://uhdmovies.zip"
]

async function request(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA }
  })

  if (!res.ok) throw new Error("HTTP " + res.status)

  return res.text()
}

async function getDomain() {
  for (const d of DOMAINS) {
    try {
      const r = await fetch(d, { headers: { "User-Agent": UA } })
      if (r.ok) return d
    } catch {}
  }

  return DOMAINS[0]
}

function quality(text) {
  if (!text) return "HD"

  text = text.toLowerCase()

  if (text.includes("2160") || text.includes("4k")) return "4K"
  if (text.includes("1080")) return "1080p"
  if (text.includes("720")) return "720p"

  return "HD"
}

module.exports = {

  name: "UHDMovies",

  domains: DOMAINS,

  async search(query) {

    const domain = await getDomain()

    const html = await request(
      `${domain}/?s=${encodeURIComponent(query)}`
    )

    const $ = cheerio.load(html)

    const results = []

    $("article, .post, .blog-item").each((i, el) => {

      const link = $(el).find("a[href*='download']").attr("href")

      if (!link) return

      const title =
        $(el).find("h2,h3,h1").first().text().trim()

      if (!title) return

      results.push({
        title,
        url: link.startsWith("http") ? link : domain + link
      })
    })

    return results
  },

  async sources(result) {

    const html = await request(result.url)

    const $ = cheerio.load(html)

    const streams = []

    $("a").each((i, el) => {

      const href = $(el).attr("href")
      if (!href) return

      if (
        href.includes("driveleech") ||
        href.includes("tech.") ||
        href.includes("video-seed") ||
        href.includes("video-leech")
      ) {

        const text = $(el).parent().text()

        streams.push({
          source: "UHDMovies",
          quality: quality(text),
          url: href
        })
      }
    })

    return streams
  }
}
