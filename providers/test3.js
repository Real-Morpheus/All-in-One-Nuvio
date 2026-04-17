/**
 * @name ShowBox Scraper
 * @description ShowBox API for Nuvio
 * @author Nuvio
 * @version 1.6.0
 * @settings
 * [
 * {"name": "uiToken", "type": "text", "label": "UI Token (Cookie)"},
 * {"name": "ossGroup", "type": "text", "label": "OSS Group (Optional)"}
 * ]
 */

// API Config - Using 'var' for Android TV compatibility
var TMDB_API_KEY = '439c478a771f35c05022f9feabcca01c';
var TMDB_BASE_URL = 'https://api.themoviedb.org/3';
var SHOWBOX_API_BASE = 'https://febapi.nuvioapp.space/api/media';

// Settings Helper - This pulls the text you type into the UI Token box
function getSetting(key) {
    try {
        var settings = (typeof global !== 'undefined' && global.SCRAPER_SETTINGS) ? global.SCRAPER_SETTINGS : {};
        return settings[key] || "";
    } catch (e) {
        return "";
    }
}

// Main Stream Function
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    var token = getSetting('uiToken');
    var oss = getSetting('ossGroup');

    // If no token is entered in the UI box, exit
    if (!token) {
        console.log("ShowBox: No UI Token entered in settings");
        return Promise.resolve([]);
    }

    var tmdbUrl = TMDB_BASE_URL + (mediaType === 'tv' ? '/tv/' : '/movie/') + tmdbId + '?api_key=' + TMDB_API_KEY;

    return fetch(tmdbUrl)
        .then(function(res) { return res.json(); })
        .then(function(mediaInfo) {
            var title = (mediaType === 'tv' ? mediaInfo.name : mediaInfo.title) || "Media";
            var year = (mediaType === 'tv' ? mediaInfo.first_air_date : mediaInfo.release_date || "").split('-')[0];

            var apiUrl;
            if (mediaType === 'tv') {
                var ossPath = oss ? '/oss=' + oss : '';
                apiUrl = SHOWBOX_API_BASE + '/tv/' + tmdbId + ossPath + '/' + seasonNum + '/' + episodeNum + '?cookie=' + encodeURIComponent(token);
            } else {
                apiUrl = SHOWBOX_API_BASE + '/movie/' + tmdbId + '?cookie=' + encodeURIComponent(token);
            }

            return fetch(apiUrl, { 
                headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10)' } 
            })
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (!data || !data.versions) return [];
                var streams = [];
                for (var i = 0; i < data.versions.length; i++) {
                    var v = data.versions[i];
                    if (!v.links) continue;
                    for (var j = 0; j < v.links.length; j++) {
                        var l = v.links[j];
                        streams.push({
                            name: "ShowBox " + (l.quality || "HD"),
                            title: title + (year ? " (" + year + ")" : ""),
                            url: l.url,
                            quality: l.quality || "HD",
                            provider: "showbox"
                        });
                    }
                }
                return streams;
            });
        })
        .catch(function() { return []; });
}

// Exports for Mobile & TV
global.getStreams = getStreams;
if (typeof module !== 'undefined') { module.exports = { getStreams: getStreams }; }
