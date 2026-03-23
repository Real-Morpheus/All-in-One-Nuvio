// HDMovie2 Provider for Nuvio
// Bollywood + Hollywood Hindi Dubbed Movies
// NO async/await! Only .then() chains!

var TMDB_KEY = 'd80ba92bc7cefe3359668d30d06f3305'
var BASE = 'https://hdmovie2.restaurant'
var CDN = 'https://hdm2.ink'
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'

function httpGet(url, headers) {
  return fetch(url, {
    headers: Object.assign({ 'User-Agent': UA }, headers || {})
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return r.text()
  })
}

function httpPost(url, body, headers) {
  return fetch(url, {
    method: 'POST',
    headers: Object.assign({
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded'
    }, headers || {}),
    body: body
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return r.text()
  })
}

function cleanTitle(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function searchSite(title, year) {
  var url = BASE + '/?s=' + encodeURIComponent(title)
  return httpGet(url, { 'Referer': BASE + '/' })
    .then(function(html) {
      var results = []
      var articleRegex = /<article[^>]*class="item[^"]*movies[^"]*"[^>]*>([\s\S]*?)<\/article>/g
      var articleMatch

      while ((articleMatch = articleRegex.exec(html)) !== null) {
        var articleHtml = articleMatch[1]
        var linkMatch = articleHtml.match(/href="(https:\/\/hdmovie2\.restaurant\/movies\/([^"]+)\/)"/)
        var titleMatch = articleHtml.match(/<h3><a[^>]+>([^<]+)<\/a><\/h3>/)
        var yearMatch = articleHtml.match(/\((\d{4})\)/)

        if (linkMatch && titleMatch) {
          var itemUrl = linkMatch[1]
          var slug = linkMatch[2]
          var itemTitle = titleMatch[1].trim()
          var itemYear = yearMatch ? parseInt(yearMatch[1]) : null

          var exists = false
          for (var i = 0; i < results.length; i++) {
            if (results[i].slug === slug) { exists = true; break }
          }
          if (!exists && slug) {
            results.push({ url: itemUrl, slug: slug, title: itemTitle, year: itemYear })
          }
        }
      }

      console.log('[HDMovie2] Raw results: ' + results.length + ' for: ' + title + ' (' + year + ')')

      // Filter with year if available
      var withYear = []
      var withoutYear = []
      if (year) {
        withYear = results.filter(function(r) {
          return r.year && Math.abs(r.year - year) <= 1
        })
        withoutYear = results.filter(function(r) { return !r.year })
      }

      var candidates = withYear.length > 0 ? withYear : (year ? withoutYear : results)
      if (candidates.length === 0) candidates = results

      // Sort by title closeness
      var cleanSearch = cleanTitle(title)
      candidates.sort(function(a, b) {
        var cleanA = cleanTitle(a.title)
        var cleanB = cleanTitle(b.title)

        var exactA = cleanA === cleanSearch ? 0 : 1
        var exactB = cleanB === cleanSearch ? 0 : 1
        if (exactA !== exactB) return exactA - exactB

        var startsA = cleanA.indexOf(cleanSearch) === 0 ? 0 : 1
        var startsB = cleanB.indexOf(cleanSearch) === 0 ? 0 : 1
        if (startsA !== startsB) return startsA - startsB

        return cleanA.length - cleanB.length
      })

      if (candidates.length > 0) {
        console.log('[HDMovie2] Best: ' + candidates[0].title + ' (' + candidates[0].year + ')')
      }

      return candidates
    })
}

function getStreamFromMoviePage(movieUrl) {
  return httpGet(movieUrl, { 'Referer': BASE + '/' })
    .then(function(html) {
      // Extract post ID
      var postIdMatch = html.match(/postid-(\d+)/)
      if (!postIdMatch) {
        console.log('[HDMovie2] No post ID on: ' + movieUrl)
        return null
      }
      var postId = postIdMatch[1]
      console.log('[HDMovie2] Post ID: ' + postId)

      // POST to get player embed
      return httpPost(
        BASE + '/wp-admin/admin-ajax.php',
        'action=doo_player_ajax&post=' + postId + '&nume=1&type=movie',
        { 'Referer': movieUrl }
      ).then(function(body) {
        var data
        try { data = JSON.parse(body) } catch(e) { return null }

        var embedUrl = data.embed_url || ''
        // Extract hdm2.ink URL from iframe
        var iframeMatch = embedUrl.match(/src=\\"(https:\/\/hdm2\.ink\/play\?v=[^\\]+)\\"/)
        if (!iframeMatch) {
          // Try unescaped
          var iframeMatch2 = embedUrl.match(/src="(https:\/\/hdm2\.ink\/play\?v=[^"]+)"/)
          if (!iframeMatch2) {
            console.log('[HDMovie2] No hdm2 iframe found')
            return null
          }
          return iframeMatch2[1]
        }
        return iframeMatch[1].replace(/\\\//g, '/')
      })
    })
    .then(function(playerUrl) {
      if (!playerUrl) return null
      console.log('[HDMovie2] Player URL: ' + playerUrl)

      // Fetch player page
      return httpGet(playerUrl, { 'Referer': BASE + '/' })
        .then(function(html) {
          // Extract data-stream-url from script tag
          var streamMatch = html.match(/data-stream-url="([^"]+)"/)
          if (!streamMatch) {
            console.log('[HDMovie2] No stream URL in player page')
            return null
          }

          // Decode HTML entities
          var streamPath = streamMatch[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')

          var m3u8Url = CDN + streamPath
          console.log('[HDMovie2] M3U8: ' + m3u8Url.substring(0, 80))
          return { url: m3u8Url }
        })
    })
}

function getStreams(tmdbId, mediaType, season, episode) {
  return new Promise(function(resolve) {
    // Only handle movies
    if (mediaType !== 'movie') {
      resolve([])
      return
    }

    var tmdbUrl = 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY

    console.log('[HDMovie2] Start: ' + tmdbId)

    fetch(tmdbUrl)
      .then(function(r) { return r.json() })
      .then(function(data) {
        var title = data.title || data.name
        if (!title) throw new Error('No title')
        var releaseDate = data.release_date || ''
        var year = releaseDate ? parseInt(releaseDate.split('-')[0]) : null
        console.log('[HDMovie2] Title: ' + title + ' Year: ' + year)
        return searchSite(title, year)
      })
      .then(function(results) {
        if (!results || results.length === 0) {
          console.log('[HDMovie2] Not found')
          resolve([])
          return null
        }
        var result = results[0]
        console.log('[HDMovie2] Using: ' + result.url)
        return getStreamFromMoviePage(result.url)
      })
      .then(function(streamData) {
        if (!streamData) { resolve([]); return }
        console.log('[HDMovie2] Resolving stream!')
        resolve([{
          name: '🎬 HDMovie2',
          title: 'Hindi Dubbed • HD',
          url: streamData.url,
          quality: '1080p',
          headers: {
            'Referer': CDN + '/',
            'Origin': CDN,
            'User-Agent': UA
          }
        }])
      })
      .catch(function(err) {
        console.error('[HDMovie2] Error: ' + err.message)
        resolve([])
      })
  })
}

module.exports = { getStreams }
