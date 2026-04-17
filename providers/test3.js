/*{
    "name": "ShowBox TV Pro",
    "version": "1.4.0",
    "settings": [
        {"name": "uiToken", "type": "text", "label": "UI Token (Cookie)"},
        {"name": "ossGroup", "type": "text", "label": "OSS Group (Optional)"}
    ]
}*/

// API CONFIG
var TMDB_KEY = '439c478a771f35c05022f9feabcca01c';
var SHOWBOX_BASE = 'https://febapi.nuvioapp.space/api/media';

// SETTINGS HANDLER
function getVal(key) {
    var s = (typeof global !== 'undefined' && global.SCRAPER_SETTINGS) ? global.SCRAPER_SETTINGS : {};
    return s[key] || "";
}

// MAIN FUNCTION
function getStreams(tmdbId, type, s, e) {
    var token = getVal('uiToken');
    var oss = getVal('ossGroup');

    if (!token) return Promise.resolve([]);

    var url = 'https://api.themoviedb.org/3/' + (type === 'tv' ? 'tv/' : 'movie/') + tmdbId + '?api_key=' + TMDB_KEY;

    return fetch(url).then(function(r) { return r.json(); }).then(function(m) {
        var name = (type === 'tv' ? m.name : m.title) || "Media";
        var api = (type === 'tv') 
            ? SHOWBOX_BASE + '/tv/' + tmdbId + (oss ? '/oss=' + oss : '') + '/' + s + '/' + e + '?cookie=' + encodeURIComponent(token)
            : SHOWBOX_BASE + '/movie/' + tmdbId + '?cookie=' + encodeURIComponent(token);

        return fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 11)' } })
            .then(function(r) { return r.json(); })
            .then(function(d) {
                if (!d || !d.versions) return [];
                var res = [];
                d.versions.forEach(function(v) {
                    if (v.links) v.links.forEach(function(l) {
                        res.push({
                            name: "ShowBox " + (l.quality || "HD"),
                            title: name,
                            url: l.url,
                            quality: l.quality || "HD",
                            provider: "showbox"
                        });
                    });
                });
                return res;
            });
    }).catch(function() { return []; });
}

global.getStreams = getStreams;
