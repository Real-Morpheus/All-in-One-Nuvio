console.log("[UHDMovies] Provider Loaded");

const TMDB_API_KEY = "439c478a771f35c05022f9feabcca01c";
const BASE = "https://uhdmovies.tips";

function req(url){
    return fetch(url,{
        headers:{
            "User-Agent":"Mozilla/5.0",
            "Accept":"text/html"
        }
    }).then(r=>{
        if(!r.ok) throw new Error("HTTP "+r.status);
        return r.text();
    });
}

function quality(text){
    if(!text) return "HD";
    text=text.toLowerCase();
    if(text.includes("2160")) return "2160p";
    if(text.includes("1080")) return "1080p";
    if(text.includes("720")) return "720p";
    return "HD";
}

function extractPosts(html){
    const posts=[];
    const regex=/<a href="([^"]+)"[^>]*rel="bookmark"/gi;
    let m;
    while((m=regex.exec(html))!==null){
        posts.push(m[1]);
    }
    return posts;
}

function extractButtons(html){
    const links=[];
    const regex=/<a[^>]*href="([^"]+)"[^>]*>(Download|V-Cloud|GDToT|Driveleech|Instant)[^<]*<\/a>/gi;
    let m;
    while((m=regex.exec(html))!==null){
        links.push(m[1]);
    }
    return links;
}

function followRedirect(url){
    return fetch(url,{redirect:"follow"}).then(r=>r.url).catch(()=>null);
}

async function scrape(title,year){

    const search=`${BASE}/?s=${encodeURIComponent(title+" "+year)}`;
    console.log("[UHDMovies] search:",search);

    const html=await req(search).catch(()=>null);
    if(!html) return [];

    const posts=extractPosts(html);
    if(!posts.length) return [];

    const page=await req(posts[0]).catch(()=>null);
    if(!page) return [];

    const buttons=extractButtons(page);

    const results=[];

    for(const b of buttons){

        const final=await followRedirect(b);
        if(!final) continue;

        results.push({
            name:"UHDMovies",
            title:"UHDMovies "+quality(final),
            url:final,
            quality:quality(final),
            provider:"uhdmovies"
        });
    }

    return results;
}

function getStreams(tmdbId,mediaType="movie",season=null,episode=null){

    const tmdb=`https://api.themoviedb.org/3/${mediaType==="tv"?"tv":"movie"}/${tmdbId}?api_key=${TMDB_API_KEY}`;

    return fetch(tmdb)
    .then(r=>r.json())
    .then(data=>{

        const title=mediaType==="tv"?data.name:data.title;
        const year=mediaType==="tv"
            ?data.first_air_date?.slice(0,4)
            :data.release_date?.slice(0,4);

        if(!title) return [];

        return scrape(title,year);
    })
    .catch(()=>[]);
}

if(typeof module!=="undefined"){
    module.exports={getStreams};
}else{
    global.getStreams=getStreams;
}
