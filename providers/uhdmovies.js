const cheerio = require("cheerio-without-node-native")

const BASE = "https://uhdmovies.email"

async function request(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  })

  return await res.text()
}

async function search(title) {

  const html = await request(`${BASE}/?s=${encodeURIComponent(title)}`)

  const $ = cheerio.load(html)

  const results = []

  $("article a[href*='download']").each((i, el) => {

    const link = $(el).attr("href")
    const name = $(el).text().trim()

    if (!link || !name) return

    results.push({
      title: name,
      url: link
    })
  })

  return results
}

async function getStreams(url) {

  const html = await request(url)

  const $ = cheerio.load(html)

  const streams = []

  $("a").each((i, el) => {

    const href = $(el).attr("href")

    if (!href) return

    if (
      href.includes("driveleech") ||
      href.includes("tech.") ||
      href.includes("seed") ||
      href.includes("leech")
    ) {

      streams.push({
        name: "UHDMovies",
        url: href
      })
    }
  })

  return streams
}

module.exports = {
  name: "UHDMovies",

  async getStreams(meta) {

    const results = await search(meta.title)

    if (!results.length) return []

    return await getStreams(results[0].url)
  }
}
