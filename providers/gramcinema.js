/**
 * Hashhackers - Pure Promise Version (Official TMDB API)
 */

function fetchJson(url, options) {
    console.log("[Hashhackers] Fetching: " + url);
    return fetch(url, options || {}).then(function(res) {
        if (!res.ok) {
            console.error("[Hashhackers] HTTP Error: " + res.status + " for " + url);
            throw new Error("HTTP " + res.status);
        }
        return res.json();
    }).catch(function(err) {
        console.error("[Hashhackers] Fetch Failed: " + err.message);
        throw err;
    });
}

function getStreams(tmdbId, mediaType, season, episode) {
    console.log("[Hashhackers] getStreams called for: " + tmdbId + " | Type: " + mediaType);
    if (mediaType !== 'movie') return Promise.resolve([]);

    // 1. Get TMDB info (Using Official TMDB API to avoid Cloudflare 403)
    var isImdb = String(tmdbId).startsWith("tt");
    var tmdbUrl = isImdb 
        ? "https://api.themoviedb.org/3/find/" + tmdbId + "?api_key=d131017ccc6e5462a81c9304d21476de&external_source=imdb_id&language=en-US"
        : "https://api.themoviedb.org/3/movie/" + tmdbId + "?api_key=d131017ccc6e5462a81c9304d21476de&language=en-US";

    return fetchJson(tmdbUrl)
        .then(function(tmdbData) {
            // If it was an IMDb ID, data is inside an array. If TMDB ID, it is direct.
            var movieData = isImdb ? (tmdbData.movie_results && tmdbData.movie_results[0]) : tmdbData;
            
            if (!movieData) {
                console.error("[Hashhackers] No movie data found from TMDB");
                return [];
            }

            console.log("[Hashhackers] TMDB Success: " + movieData.title);
            var title = movieData.title;
            var year = movieData.release_date ? movieData.release_date.split('-')[0] : '';
            var query = encodeURIComponent((title + " " + year).trim());

            // 2. Get Token from Vercel
            return fetchJson("https://hashhackers.vercel.app/api/token")
                .then(function(tokenData) {
                    console.log("[Hashhackers] Token Fetched Successfully");
                    var token = tokenData.token;
                    if (!token) {
                        console.error("[Hashhackers] No token returned!");
                        return [];
                    }

                    var HASH_HEADERS = {
                        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Mobile/15E148 Safari/604.1",
                        "Accept": "*/*",
                        "Accept-Language": "en-IN,en-US;q=0.9,en;q=0.8",
                        "Authorization": "Bearer " + token,
                        "Origin": "https://bollywood.eu.org",
                        "Referer": "https://bollywood.eu.org/"
                    };

                    var searchUrl = "https://tga-hd.api.hashhackers.com/mix_media_files/search?q=" + query + "&page=1";
                    
                    // 3. Search Hashhackers
                    return fetchJson(searchUrl, { headers: HASH_HEADERS })
                        .then(function(searchData) {
                            var files = searchData.files || [];
                            console.log("[Hashhackers] Search Results Found: " + files.length);
                            if (files.length === 0) return [];

                            var topFiles = files.slice(0, 5);
                            var streamPromises = topFiles.map(function(file) {
                                
                                // 4. Generate Links
                                return fetchJson("https://tga-hd.api.hashhackers.com/genLink?type=mix_media&id=" + file.id, { headers: HASH_HEADERS })
                                    .then(function(linkData) {
                                        if (linkData.success && linkData.url) {
                                            console.log("[Hashhackers] Link Generated for: " + file.file_name.substring(0, 15));
                                            var quality = "Auto";
                                            var fn = file.file_name.toLowerCase();
                                            if (fn.includes("2160p") || fn.includes("4k")) quality = "4K";
                                            else if (fn.includes("1080p")) quality = "1080p";
                                            else if (fn.includes("720p")) quality = "720p";

                                            return {
                                                name: "GramCinema",
                                                title: file.file_name.substring(0, 35) + "...",
                                                url: linkData.url,
                                                quality: quality
                                            };
                                        }
                                        return null;
                                    }).catch(function() { return null; });
                            });

                            return Promise.all(streamPromises).then(function(results) {
                                var finalStreams = results.filter(function(r) { return r !== null; });
                                console.log("[Hashhackers] Final Streams Sent to App: " + finalStreams.length);
                                return finalStreams;
                            });
                        });
                });
        }).catch(function(error) {
            console.error("[Hashhackers] Master Catch Error: " + error.message);
            return [];
        });
}

module.exports = { getStreams: getStreams };
