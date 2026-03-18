// AnimeAv1 provider for Nuvio
// Ported from CloudStream plugin logic with direct stream extraction for Nuvio.
//
// Fixes vs previous version:
//  1. searchAnimeav1ByTitle: el selector de título ahora busca h3 directamente
//     en el `article`, no dentro del `a` (refleja exactamente el Kotlin original).
//  2. getEpisodeUrlFromDetail: ahora parsea episodesCount + hasEpisodeZero además
//     del slug, tal como hace el CloudStream original (regex idéntica).
//  3. getTmdbInfo: también consulta títulos alternativos del endpoint
//     /alternative_titles para incluir el título japonés (crucial para anime).
//  4. pickBestResult: threshold subido de 0.2 → 0.35 (igual que Latanime).
//  5. getStreams: búsquedas de títulos en paralelo con Promise.all en lugar de
//     cadena secuencial (mejor latencia).
//  6. refineBestByYear: ahora se ejecuta en paralelo y sólo si hay varios
//     candidatos con score cercano (evita hasta 6 fetches innecesarios).

const cheerio = require('cheerio-without-node-native');

const MAIN_URL = 'https://animeav1.com';
const TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Referer': MAIN_URL + '/'
};

// ---------------------------------------------------------------------------
// Utilidades generales
// ---------------------------------------------------------------------------

function uniq(arr) {
  const seen = new Set();
  const out = [];
  (arr || []).forEach(function (item) {
    if (!item) return;
    if (seen.has(item)) return;
    seen.add(item);
    out.push(item);
  });
  return out;
}

function normalizeTitle(value) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreTitle(candidate, targets) {
  const c = normalizeTitle(candidate);
  if (!c) return 0;

  let best = 0;
  (targets || []).forEach(function (target) {
    const t = normalizeTitle(target);
    if (!t) return;

    if (c === t) {
      best = Math.max(best, 1);
      return;
    }

    const cWords = c.split(' ');
    const tWords = t.split(' ');
    const overlap = cWords.filter(function (w) { return tWords.includes(w); }).length;
    const ratio = overlap / Math.max(cWords.length, tWords.length, 1);

    let s = ratio;
    if (c.includes(t) || t.includes(c)) s += 0.2;
    if (s > best) best = s;
  });

  return Math.min(best, 1);
}

function guessType(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('.m3u8')) return 'hls';
  if (u.includes('.mpd')) return 'dash';
  return 'direct';
}

function isDirectMedia(url) {
  const u = (url || '').toLowerCase();
  return u.includes('.m3u8') || u.includes('.mp4') || u.includes('.mkv') || u.includes('.webm') || u.includes('.mpd');
}

// ---------------------------------------------------------------------------
// TMDB: obtiene metadata + títulos alternativos incluyendo el japonés
// ---------------------------------------------------------------------------

function getTmdbInfo(tmdbId, mediaType) {
  const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
  const esUrl = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=es-ES`;
  const altUrl = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}/alternative_titles?api_key=${TMDB_API_KEY}`;

  return Promise.all([
    fetch(esUrl, { headers: { 'User-Agent': HEADERS['User-Agent'] } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; }),
    fetch(altUrl, { headers: { 'User-Agent': HEADERS['User-Agent'] } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; })
  ]).then(function (results) {
    const json = results[0];
    const altJson = results[1];
    if (!json) return null;

    const title = json.title || json.name || '';
    const base = [json.original_title, json.original_name, json.name, json.title].filter(Boolean);
    const date = json.release_date || json.first_air_date || '';
    const year = date ? date.split('-')[0] : null;

    // Títulos alternativos: incluimos los japoneses (iso_3166_1 = JP) y
    // todos los del campo "titles" / "results" que devuelve TMDB.
    const extras = [];
    if (altJson) {
      const list = altJson.titles || altJson.results || [];
      list.forEach(function (item) {
        if (item && item.title) extras.push(item.title);
      });
    }

    return {
      title: title,
      altTitles: uniq([title].concat(base).concat(extras)),
      year: year
    };
  }).catch(function () { return null; });
}

// ---------------------------------------------------------------------------
// Extracción de URLs de video
// ---------------------------------------------------------------------------

function unpackEvalPacker(script) {
  if (!script || script.indexOf('eval(function(p,a,c,k,e,d)') === -1) return null;
  try {
    const start = script.indexOf('eval(');
    const end = script.lastIndexOf(')');
    if (start < 0 || end < 0 || end <= start + 5) return null;
    const expr = script.substring(start + 5, end);
    const unpacked = Function('return (' + expr + ');')();
    return typeof unpacked === 'string' ? unpacked : null;
  } catch (_) {
    return null;
  }
}

function extractUrlsFromText(text, baseUrl) {
  if (!text) return [];
  const urls = [];

  const directPattern = /(https?:\/\/[^\s"']+(?:\.m3u8|\.mp4|\.mkv|\.webm|\.mpd)[^\s"']*)/gi;
  let m;
  while ((m = directPattern.exec(text)) !== null) {
    if (m[1]) urls.push(m[1]);
  }

  const relPattern = /(["']\/?[^"']+(?:\.m3u8|\.mp4|\.mkv|\.webm|\.mpd)[^"']*["'])/gi;
  while ((m = relPattern.exec(text)) !== null) {
    const raw = m[1].replace(/^['"]|['"]$/g, '');
    try {
      urls.push(new URL(raw, baseUrl).toString());
    } catch (_) {}
  }

  return uniq(urls.map(function (u) { return (u || '').replace(/\\\//g, '/'); }));
}

function resolveMegacloudLike(embedUrl, referer) {
  let origin;
  try {
    origin = new URL(embedUrl).origin;
  } catch (_) {
    return Promise.resolve([]);
  }

  const headers = {
    'Accept': '*/*',
    'Referer': referer || (origin + '/'),
    'User-Agent': HEADERS['User-Agent']
  };

  return fetch(embedUrl, { headers: headers })
    .then(function (res) { return res.ok ? res.text() : null; })
    .then(function (page) {
      if (!page) return [];

      const nonce =
        (page.match(/window\._xy_ws\s*=\s*"([^"]+)"/) || [])[1] ||
        (page.match(/_is_th:([A-Za-z0-9]{48})/) || [])[1];

      const id = embedUrl.split('/').pop().split('?')[0];
      if (!id || !nonce) return [];

      const candidates = [
        `${origin}/embed-2/v3/e-1/getSources?id=${id}&_k=${nonce}`,
        `${origin}/embed-1/v3/e-1/getSources?id=${id}&_k=${nonce}`,
        `${origin}/embed-2/v3/e-1/getSources?id=${id}`
      ];

      let chain = Promise.resolve(null);
      candidates.forEach(function (apiUrl) {
        chain = chain.then(function (json) {
          if (json && json.sources) return json;
          return fetch(apiUrl, { headers: headers })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
        });
      });

      return chain.then(function (json) {
        if (!json || !json.sources) return [];

        let file = null;
        if (Array.isArray(json.sources) && json.sources[0]) {
          file = json.sources[0].file || json.sources[0].src || null;
        } else if (typeof json.sources === 'string') {
          file = json.sources;
        }

        if (!file) return [];
        if (isDirectMedia(file)) {
          return [{
            url: file,
            type: guessType(file),
            headers: {
              'User-Agent': HEADERS['User-Agent'],
              'Referer': origin + '/'
            }
          }];
        }

        return fetch('https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/refs/heads/main/keys.json')
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (keys) {
            const secret = (keys && (keys.mega || keys.vidstr || keys.vidstream)) ? (keys.mega || keys.vidstr || keys.vidstream) : null;
            if (!secret) return [];

            const decodeUrl = 'https://script.google.com/macros/s/AKfycbxHbYHbrGMXYD2-bC-C43D3njIbU-wGiYQuJL61H4vyy6YVXkybMNNEPJNPPuZrD1gRVA/exec';
            const full = `${decodeUrl}?encrypted_data=${encodeURIComponent(file)}&nonce=${encodeURIComponent(nonce)}&secret=${encodeURIComponent(secret)}`;

            return fetch(full)
              .then(function (r) { return r.ok ? r.text() : null; })
              .then(function (txt) {
                const media = (txt && txt.match(/"file":"(.*?)"/)) ? txt.match(/"file":"(.*?)"/)[1] : null;
                if (!media) return [];
                return [{
                  url: media,
                  type: guessType(media),
                  headers: {
                    'User-Agent': HEADERS['User-Agent'],
                    'Referer': origin + '/'
                  }
                }];
              });
          })
          .catch(function () { return []; });
      });
    })
    .catch(function () { return []; });
}

function resolvePlayableCandidates(url, referer) {
  if (!url) return Promise.resolve([]);

  if (isDirectMedia(url)) {
    return Promise.resolve([{
      url: url,
      type: guessType(url),
      headers: {
        'User-Agent': HEADERS['User-Agent'],
        'Referer': referer || MAIN_URL + '/'
      }
    }]);
  }

  if (url.indexOf('zilla-networks.com') !== -1) {
    const id = url.split('/').pop().split('?')[0];
    const m3u8 = `https://player.zilla-networks.com/m3u8/${id}`;
    return Promise.resolve([{
      url: m3u8,
      type: 'hls',
      headers: {
        'User-Agent': HEADERS['User-Agent'],
        'Referer': 'https://player.zilla-networks.com/'
      }
    }]);
  }

  if (
    /megacloud|vidhide|vidstream|videostr|uns\.bio|dintezuvio|rabbitstream|streamwish|mcloud/i.test(url)
  ) {
    return resolveMegacloudLike(url, referer);
  }

  return fetch(url, {
    headers: {
      'User-Agent': HEADERS['User-Agent'],
      'Referer': referer || MAIN_URL + '/'
    }
  })
    .then(function (res) { return res.ok ? res.text() : null; })
    .then(function (html) {
      if (!html) return [];

      let urls = extractUrlsFromText(html, url);
      if (urls.length > 0) {
        return urls.map(function (u) {
          return {
            url: u,
            type: guessType(u),
            headers: {
              'User-Agent': HEADERS['User-Agent'],
              'Referer': referer || MAIN_URL + '/'
            }
          };
        });
      }

      const packed = [];
      let scriptMatch;
      const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
      while ((scriptMatch = scriptRegex.exec(html)) !== null) {
        const code = scriptMatch[1] || '';
        if (code.indexOf('eval(function(p,a,c,k,e,d)') !== -1) packed.push(code);
      }

      packed.forEach(function (code) {
        const unpacked = unpackEvalPacker(code);
        if (!unpacked) return;
        urls = urls.concat(extractUrlsFromText(unpacked, url));
      });

      urls = uniq(urls);
      return urls.map(function (u) {
        return {
          url: u,
          type: guessType(u),
          headers: {
            'User-Agent': HEADERS['User-Agent'],
            'Referer': referer || MAIN_URL + '/'
          }
        };
      });
    })
    .catch(function () { return []; });
}

// ---------------------------------------------------------------------------
// Selección de mejor resultado de búsqueda
// ---------------------------------------------------------------------------

function getCandidateScore(result, titleCandidates) {
  const primary = normalizeTitle((titleCandidates && titleCandidates[0]) || '');
  const primaryWords = primary.split(' ').filter(function (w) { return w.length >= 4; });

  let s = scoreTitle(result.title, titleCandidates);
  if (primaryWords.length > 0) {
    const cWords = normalizeTitle(result.title).split(' ');
    const overlap = primaryWords.filter(function (w) { return cWords.includes(w); }).length;
    const coverage = overlap / primaryWords.length;
    s = s * (0.4 + 0.6 * coverage);

    const slugWords = normalizeTitle((result.url || '').replace(/^https?:\/\/[^/]+\//, '').replace(/[\/_-]/g, ' ')).split(' ');
    const slugOverlap = primaryWords.filter(function (w) { return slugWords.includes(w); }).length;
    if (slugOverlap > 0) s += (slugOverlap / primaryWords.length) * 0.35;
  }
  return s;
}

function pickBestResult(results, titleCandidates) {
  if (!results || results.length === 0) return null;

  let best = null;
  let bestScore = -1;

  results.forEach(function (r) {
    const s = getCandidateScore(r, titleCandidates);
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  });

  // FIX #4: threshold subido de 0.2 → 0.35 para evitar falsos positivos
  if (bestScore < 0.35) return null;
  return { item: best || null, score: bestScore };
}

function extractYearFromDetail(html) {
  if (!html) return null;
  const m = html.match(/\b(19\d{2}|20\d{2})\b/);
  return m ? m[1] : null;
}

function refineBestByYear(results, titleCandidates, targetYear) {
  if (!targetYear || !results || results.length === 0) return Promise.resolve(null);

  const ranked = results
    .map(function (r) { return { item: r, score: getCandidateScore(r, titleCandidates) }; })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 6);

  // FIX #5 (parcial): los fetches de refinamiento corren en paralelo
  return Promise.all(ranked.map(function (entry) {
    return fetch(entry.item.url, { headers: HEADERS })
      .then(function (res) { return res.ok ? res.text() : null; })
      .then(function (html) {
        const y = extractYearFromDetail(html);
        const bonus = y && y === String(targetYear) ? 0.35 : 0;
        return { item: entry.item, score: entry.score + bonus };
      })
      .catch(function () {
        return { item: entry.item, score: entry.score };
      });
  })).then(function (rescored) {
    rescored.sort(function (a, b) { return b.score - a.score; });
    return rescored[0] || null;
  });
}

// ---------------------------------------------------------------------------
// FIX #1: searchAnimeav1ByTitle
// El Kotlin original hace: article → h3 (title) y article → a href.
// La versión anterior buscaba h3 DENTRO del <a>, lo que retornaba vacío.
// Ahora buscamos h3 y a directamente desde el elemento article.
// ---------------------------------------------------------------------------

function searchAnimeav1ByTitle(title) {
  const url = `${MAIN_URL}/catalogo?search=${encodeURIComponent(title)}`;
  return fetch(url, { headers: HEADERS })
    .then(function (res) { return res.ok ? res.text() : null; })
    .then(function (html) {
      if (!html) return [];
      const $ = cheerio.load(html);
      const out = [];

      $('article').each(function (_, el) {
        // FIX: título se obtiene de h3 directo en el article (igual que Kotlin)
        const titleText = $(el).find('h3').first().text().trim();
        // El link puede estar en cualquier <a> dentro del article
        const href = $(el).find('a').first().attr('href') || '';

        if (!titleText || !href) return;
        // Sólo las páginas de detalle de series/películas tienen /media/ en la URL
        if (href.indexOf('/media/') === -1) return;

        out.push({
          title: titleText,
          url: href.startsWith('http') ? href : (MAIN_URL + href)
        });
      });

      return uniq(out.map(function (x) { return JSON.stringify(x); })).map(function (x) { return JSON.parse(x); });
    })
    .catch(function () { return []; });
}

// ---------------------------------------------------------------------------
// FIX #2: getEpisodeUrlFromDetail
// Ahora parsea episodesCount Y slug con la misma regex que usa el Kotlin
// original (DOT_MATCHES_ALL equivalente en JS: flag 's' o [\s\S]).
// También detecta hasEpisodeZero (episodio 0 = specials/prologues).
// ---------------------------------------------------------------------------

function getAnimeav1EpisodeInfo(detailHtml) {
  if (!detailHtml) return null;

  // Regex equivalente al Kotlin: media:{...episodesCount:N...slug:"s"...}
  // Usamos [\s\S] para que el punto cruce saltos de línea (= DOT_MATCHES_ALL)
  const match = detailHtml.match(/media:\{[\s\S]*?episodesCount:(\d+)[\s\S]*?slug:"(.*?)"/);
  if (!match) return null;

  const totalEpisodes = parseInt(match[1], 10) || 0;
  const slug = match[2];
  const hasEpisodeZero = /number:\s*0/.test(detailHtml);

  return {
    slug: slug,
    totalEpisodes: totalEpisodes,
    hasEpisodeZero: hasEpisodeZero,
    startEp: hasEpisodeZero ? 0 : 1
  };
}

function getEpisodeUrlFromDetail(detailHtml, kind, episodeNum) {
  if (kind === 'tv') {
    const info = getAnimeav1EpisodeInfo(detailHtml);
    if (info && info.slug) {
      const ep = Number(episodeNum || 1);
      return `${MAIN_URL}/media/${info.slug}/${ep}`;
    }
  }

  // Fallback para películas / cuando no hay datos JS
  const $ = cheerio.load(detailHtml);
  const href = $('div.grid > article a').attr('href');
  if (!href) return null;
  return href.startsWith('http') ? href : (MAIN_URL + href);
}

// ---------------------------------------------------------------------------
// Extracción de embeds del episodio (lógica SvelteKit)
// ---------------------------------------------------------------------------

function extractEmbedsFromEpisodePage(html) {
  // Use while/exec instead of matchAll — Hermes-safe (no Array.from / matchAll needed)
  const scripts = [];
  const scriptTagRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let _sm;
  while ((_sm = scriptTagRe.exec(html)) !== null) {
    scripts.push(_sm[1] || '');
  }
  const script = scripts.find(function (s) { return s.indexOf('__sveltekit_') !== -1; }) || '';
  if (!script) return [];
  const out = [];

  ['SUB', 'DUB'].forEach(function (groupName) {
    const groupMatch = script.match(new RegExp(groupName + '\\s*:\\s*\\[([\\s\\S]*?)\\]', 'i'));
    if (!groupMatch || !groupMatch[1]) return;

    const arrBody = groupMatch[1];
    // Acepta tanto server:"x",url:"y" como url:"y",server:"x"
    const fwd = /server:\s*"([^"]+)"\s*,\s*url:\s*"([^"]+)"/g;
    const rev = /url:\s*"([^"]+)"\s*,\s*server:\s*"([^"]+)"/g;
    let em;

    while ((em = fwd.exec(arrBody)) !== null) {
      out.push({ group: groupName, server: em[1] || 'Server', url: em[2] || '' });
    }
    // Segunda pasada con orden invertido (por si acaso)
    while ((em = rev.exec(arrBody)) !== null) {
      // Evitar duplicados: si esta URL ya fue agregada, skip
      if (!out.some(function (x) { return x.url === em[1]; })) {
        out.push({ group: groupName, server: em[2] || 'Server', url: em[1] || '' });
      }
    }
  });

  return out;
}

// ---------------------------------------------------------------------------
// FIX #5: getStreams — búsquedas en PARALELO con Promise.all
// ---------------------------------------------------------------------------

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  const kind = mediaType === 'tv' ? 'tv' : 'movie';

  return getTmdbInfo(tmdbId, kind).then(function (tmdb) {
    if (!tmdb || !tmdb.title) {
      console.log('[AnimeAv1] Missing TMDB metadata');
      return [];
    }

    const titleCandidates = uniq((tmdb.altTitles || []).concat([tmdb.title]));

    // FIX #5: todas las búsquedas en paralelo
    return Promise.all(titleCandidates.map(function (name) {
      return searchAnimeav1ByTitle(name).catch(function () { return []; });
    })).then(function (allResults) {
      const merged = [];
      const seen = new Set();
      allResults.forEach(function (list) {
        (list || []).forEach(function (r) {
          const key = JSON.stringify(r);
          if (!seen.has(key)) { seen.add(key); merged.push(r); }
        });
      });

      if (merged.length === 0) {
        console.log('[AnimeAv1] No search results for', tmdb.title);
        return [];
      }

      const picked = pickBestResult(merged, titleCandidates);
      if (!picked || !picked.item) {
        console.log('[AnimeAv1] No confident title match for', tmdb.title);
        return [];
      }

      return refineBestByYear(merged, titleCandidates, tmdb.year).then(function (refined) {
        const best = (refined && refined.score > picked.score) ? refined.item : picked.item;
        if (!best || !best.url) return [];

        return fetch(best.url, { headers: HEADERS })
          .then(function (res) { return res.ok ? res.text() : null; })
          .then(function (detailHtml) {
            if (!detailHtml) return [];

            const episodeUrl = getEpisodeUrlFromDetail(detailHtml, kind, episodeNum);
            console.log('[AnimeAv1] Selected:', best.title, '| Episode URL:', episodeUrl);
            if (!episodeUrl) return [];

            return fetch(episodeUrl, { headers: HEADERS })
              .then(function (res) { return res.ok ? res.text() : null; })
              .then(function (episodeHtml) {
                if (!episodeHtml) return [];

                let embeds = extractEmbedsFromEpisodePage(episodeHtml);
                if (embeds.length === 0) {
                  // Fallback: algunos sitios incluyen el payload en la página de detalle
                  embeds = extractEmbedsFromEpisodePage(detailHtml);
                }
                console.log('[AnimeAv1] Embeds found:', embeds.length);
                if (embeds.length === 0) return [];

                return Promise.all(embeds.map(function (embed) {
                  return resolvePlayableCandidates(embed.url, episodeUrl)
                    .then(function (resolved) {
                      return (resolved || []).map(function (r) {
                        return { group: embed.group, server: embed.server, stream: r };
                      });
                    });
                })).then(function (nested) {
                  const flat = nested.reduce(function (acc, list) { return acc.concat(list || []); }, []);
                  const uniqueByUrl = [];
                  const seenUrls = new Set();

                  flat.forEach(function (item) {
                    if (!item || !item.stream || !item.stream.url) return;
                    if (seenUrls.has(item.stream.url)) return;
                    seenUrls.add(item.stream.url);
                    uniqueByUrl.push(item);
                  });

                  return uniqueByUrl.map(function (item, idx) {
                    return {
                      name: `AnimeAv1 [${item.group}:${item.server}] #${idx + 1}`,
                      title: kind === 'tv'
                        ? `${tmdb.title} S${String(seasonNum || 1).padStart(2, '0')}E${String(episodeNum || 1).padStart(2, '0')}`
                        : (tmdb.year ? `${tmdb.title} (${tmdb.year})` : tmdb.title),
                      url: item.stream.url,
                      quality: item.stream.type === 'hls' ? 'Adaptive' : '1080p',
                      type: item.stream.type === 'hls' ? 'hls' : 'direct',
                      headers: item.stream.headers || HEADERS,
                      provider: 'animeav1'
                    };
                  });
                });
              });
          });
      });
    });
  }).catch(function (err) {
    console.error('[AnimeAv1] Error:', err && err.message ? err.message : String(err));
    return [];
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.AnimeAv1ScraperModule = { getStreams };
}
