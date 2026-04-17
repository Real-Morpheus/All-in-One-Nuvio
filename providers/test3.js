/**
 * @name ShowBox Pro
 * @description ShowBox API for Nuvio TV & Mobile
 * @settings
 * [
 * {"name": "uiToken", "type": "text", "label": "UI Token (Cookie)"},
 * {"name": "ossGroup", "type": "text", "label": "OSS Group (Optional)"}
 * ]
 */

// ShowBox Scraper - Compatibility Build for Android TV
var TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
var TMDB_BASE_URL = 'https://api.themoviedb.org/3';
var SHOWBOX_API_BASE = 'https://febapi.nuvioapp.space/api/media';

var WORKING_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36',
    'Accept': 'application/json',
    'Content-Type': 'application/json'
};

// Android TV compatible settings lookup
function getSettingsValue(key) {
    try {
        if (typeof global !== 'undefined' && global.SCRAPER_SETTINGS) {
            return global.SCRAPER_SETTINGS[key] || "";
        }
        if (typeof window !== 'undefined' && window.SCRAPER_SETTINGS) {
            return window.SCRAPER_SETTINGS[key] || "";
        }
    } catch (e) {
        return "";
    }
    return "";
}

function getTMDBDetails(tmdbId, mediaType) {
    var endpoint = (mediaType === 'tv') ? 'tv' : 'movie';
    var url = TMDB_BASE_URL + '/' + endpoint + '/' + tmdbId + '?api_key=' + TMDB_API_KEY;
    
    return fetch(url, { headers: WORKING_HEADERS })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            return {
                title: (mediaType === 'tv') ? data.name : data.title,
                year: (mediaType === 'tv' ? data.first_air_date : data.release_date || "").split('-')[0]
            };
        })
        .catch(function() {
            return { title: "Media", year: "" };
        });
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    var cookie = getSettingsValue('uiToken');
    var ossGroup = getSettingsValue('ossGroup');

    if (!cookie || cookie === "") {
        console.log("[ShowBox] No Token found in Settings");
        return Promise.resolve([]);
    }

    return getTMDBDetails(tmdbId, mediaType).then(function(info) {
        var apiUrl;
        if (mediaType === 'tv') {
            var ossPath = ossGroup ? '/oss=' + ossGroup : '';
            apiUrl = SHOWBOX_API_BASE + '/tv/' + tmdbId + ossPath + '/' + seasonNum + '/' + episodeNum + '?cookie=' + encodeURIComponent(cookie);
        } else {
            apiUrl = SHOWBOX_API_BASE + '/movie/' + tmdbId + '?cookie=' + encodeURIComponent(cookie);
        }

        return fetch(apiUrl, { headers: WORKING_HEADERS })
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (!data || !data.versions) return [];
                
                var streams = [];
                for (var i = 0; i < data.versions.length; i++) {
                    var v = data.versions[i];
                    if (!v.links) continue;
                    
                    for (var j = 0; j < v.links.length; j++) {
                        var l = v.links[j];
                        var q = (l.quality || v.quality || "HD").toUpperCase();
                        
                        streams.push({
                            name: "ShowBox " + q,
                            title: info.title + (info.year ? " (" + info.year + ")" : ""),
                            url: l.url,
                            quality: q,
                            provider: "showbox"
                        });
                    }
                }
                return streams;
            })
            .catch(function(err) {
                console.log("[ShowBox] Error: " + err.message);
                return [];
            });
    });
}

// Ensure the TV engine sees the function globally
if (typeof global !== 'undefined') { global.getStreams = getStreams; }
if (typeof window !== 'undefined') { window.getStreams = getStreams; }
if (typeof module !== 'undefined') { module.exports = { getStreams: getStreams }; }
