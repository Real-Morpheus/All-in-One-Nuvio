function getStreams(tmdbId, mediaType, seasonNum, episodeNum, title) {

    return new Promise(function(resolve) {

        let streams = [];
        let searchTitle = title || "Ben 10";

        let searchUrl = "https://kartoons.me/?s=" + encodeURIComponent(searchTitle);

        fetch(searchUrl)
        .then(function(res){ return res.text(); })
        .then(function(html){

            let postMatch = html.match(/class="post-title".*?href="([^"]+)"/i);
            if(!postMatch) {
                resolve([]);
                return;
            }

            return fetch(postMatch[1]);
        })
        .then(function(res){
            if(!res) return null;
            return res.text();
        })
        .then(function(html){

            if(!html){
                resolve([]);
                return;
            }

            // Find token used for playlist
            let tokenMatch = html.match(/playlist\/([A-Za-z0-9_\-]+)/);

            if(!tokenMatch){
                resolve([]);
                return;
            }

            let m3u8 = "https://v5.m3u8mock.workers.dev/playlist/" + tokenMatch[1];

            streams.push({
                name: "Kartoons",
                description: "M3U8 Stream",
                url: m3u8,
                behaviorHints: {
                    notWebReady: false
                }
            });

            resolve(streams);

        })
        .catch(function(){
            resolve([]);
        });

    });

}

module.exports = { getStreams };
