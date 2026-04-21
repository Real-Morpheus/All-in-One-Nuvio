// =============================================================
// Provider Nuvio : Nakios (VF / VOSTFR / MULTI)
// Version : 3.6.0
// - Détection auto du domaine via nakios.online (page vitrine)
// - Fallback sur nakios.fit si détection échoue
// - URLs proxy → decodeURIComponent + domaine comme Referer
// =============================================================

var NAKIOS_UA       = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
var NAKIOS_VITRINE  = 'https://nakios.online/';
var NAKIOS_FALLBACK = 'nakios.fit';

var _cachedEndpoint = null;

// ─── Détection du domaine actif ──────────────────────────────

function buildEndpoint(tld) {
  return {
    base:    'https://nakios.' + tld,
    api:     'https://api.nakios.' + tld + '/api',
    referer: 'https://nakios.' + tld + '/'
  };
}

function detectEndpoint() {
  if (_cachedEndpoint) {
    return Promise.resolve(_cachedEndpoint);
  }

  return fetch(NAKIOS_VITRINE, { redirect: 'follow' })
    .then(function(res) { return res.text(); })
    .then(function(html) {
      // 1. Chercher dans le HTML de la vitrine
      var direct = html.match(/https?:\/\/nakios\.([a-z]{2,10})/i);
      if (direct && direct[1] !== 'online') {
        return direct[1];
      }
      // 2. Chercher dans le bundle JS
      var bundleMatch = html.match(/src=["'](\/assets\/[^"']+\.js)["']/);
      if (!bundleMatch) throw new Error('Bundle introuvable');
      return fetch('https://nakios.online' + bundleMatch[1])
        .then(function(r) { return r.text(); })
        .then(function(js) {
          var m = js.match(/https?:\/\/nakios\.([a-z]{2,10})/i);
          if (!m || m[1] === 'online') throw new Error('Domaine introuvable dans bundle');
          return m[1];
        });
    })
    .then(function(tld) {
      console.log('[Nakios] Domaine détecté: nakios.' + tld);
      _cachedEndpoint = buildEndpoint(tld);
      return _cachedEndpoint;
    })
    .catch(function(err) {
      console.warn('[Nakios] Détection échouée (' + (err.message || err) + '), fallback: ' + NAKIOS_FALLBACK);
      _cachedEndpoint = buildEndpoint(NAKIOS_FALLBACK);
      return _cachedEndpoint;
    });
}

// ─── Fetch sources ───────────────────────────────────────────

function fetchSources(endpoint, tmdbId, mediaType, season, episode) {
  var url = mediaType === 'tv'
    ? endpoint.api + '/sources/tv/' + tmdbId + '/' + (season || 1) + '/' + (episode || 1)
    : endpoint.api + '/sources/movie/' + tmdbId;

  console.log('[Nakios] Fetch: ' + url);

  return fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': NAKIOS_UA,
      'Referer':    endpoint.referer,
      'Origin':     endpoint.base
    }
  })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      if (!data || !data.success || !data.sources || data.sources.length === 0) {
        throw new Error('Aucune source');
      }
      return data.sources;
    });
}

// ─── Résolution des URLs ─────────────────────────────────────

function extractOrigin(url) {
  var m = url.match(/^(https?:\/\/[^\/]+)/);
  return m ? m[1] : null;
}

function resolveSource(source, endpoint) {
  var rawUrl = source.url || '';

  // URL directe (ex: cdn.fastflux.xyz)
  if (rawUrl.startsWith('http')) {
    return {
      url:     rawUrl,
      format:  (source.isM3U8 || rawUrl.indexOf('.m3u8') !== -1) ? 'm3u8' : 'mp4',
      referer: endpoint.referer,
      origin:  endpoint.base
    };
  }

  // URL proxy relative → /api/sources/proxy?url=ENCODED&s=xxx
  // On garde l'URL proxy complète nakios — les segments ont chacun leur s= signé
  if (rawUrl.charAt(0) === '/') {
    return {
      url:     endpoint.base + rawUrl,
      format:  'm3u8',
      referer: endpoint.referer,
      origin:  endpoint.base
    };
  }

  return null;
}

// ─── Normalisation ───────────────────────────────────────────

function normalizeSources(sources, endpoint) {
  var results = [];

  for (var i = 0; i < sources.length; i++) {
    var source  = sources[i];
    if (source.isEmbed) continue;

    var lang    = (source.lang    || 'MULTI').toUpperCase();
    var quality = source.quality  || 'HD';
    var name    = source.name     || 'Nakios';

    var resolved = resolveSource(source, endpoint);
    if (!resolved) continue;

    console.log('[Nakios] +' + quality + ' ' + lang + ' ' + resolved.format + ' → ' + resolved.url.substring(0, 70));

    results.push({
      name:    'Nakios',
      title:   name + ' - ' + lang + ' ' + quality,
      url:     resolved.url,
      quality: quality,
      format:  resolved.format,
      headers: {
        'User-Agent': NAKIOS_UA,
        'Referer':    resolved.referer,
        'Origin':     resolved.origin
      }
    });
  }

  return results;
}

// ─── Point d'entrée ──────────────────────────────────────────

function getStreams(tmdbId, mediaType, season, episode) {
  console.log('[Nakios] START tmdbId=' + tmdbId + ' type=' + mediaType + ' S' + season + 'E' + episode);

  return detectEndpoint()
    .then(function(endpoint) {
      return fetchSources(endpoint, tmdbId, mediaType, season, episode)
        .catch(function(err) {
          // Si l'endpoint détecté échoue, forcer re-détection au prochain appel
          console.warn('[Nakios] Endpoint ' + endpoint.base + ' KO, reset cache');
          _cachedEndpoint = null;
          throw err;
        });
    })
    .then(function(sources) {
      return normalizeSources(sources, _cachedEndpoint);
    })
    .then(function(results) {
      console.log('[Nakios] ' + results.length + ' source(s) disponible(s)');
      return results;
    })
    .catch(function(err) {
      console.error('[Nakios] Erreur: ' + (err.message || String(err)));
      return [];
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
