const apiCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

const parseDuration = (duration) => {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    const hours = (parseInt(match[1]) || 0);
    const minutes = (parseInt(match[2]) || 0);
    const seconds = (parseInt(match[3]) || 0);
    return hours * 3600 + minutes * 60 + seconds;
};

const detectNicheAndGetRPM = (videos) => {
    const textCorpus = videos.map(v => `${v.snippet.title} ${v.snippet.description}`).join(' ').toLowerCase();
    const niches = {
        "Real Estate": { keywords: ["real estate", "property", "mortgage", "realtor"], rpm: { low: 12.0, high: 40.0 } },
        "Finance & Investing": { keywords: ["investing", "finance", "crypto", "stocks", "trading"], rpm: { low: 15.0, high: 50.0 } },
        "Technology": { keywords: ["tech", "review", "programming", "code", "developer", "ai", "gadget", "phone", "computer", "software"], rpm: { low: 10.0, high: 30.0 } },
        "Business & Entrepreneurship": { keywords: ["business", "entrepreneurship", "saas", "marketing", "ecommerce"], rpm: { low: 10.0, high: 25.0 } },
        "Education (Professional)": { keywords: ["tutorial", "how to", "learn", "education", "skill", "course"], rpm: { low: 10.0, high: 25.0 } },
        "Health & Fitness": { keywords: ["health", "fitness", "workout", "nutrition", "wellness"], rpm: { low: 5.0, high: 20.0 } },
        "Beauty & Fashion": { keywords: ["beauty", "fashion", "makeup", "style", "haul"], rpm: { low: 5.0, high: 18.0 } },
        "Travel (Luxury)": { keywords: ["travel", "vlog", "luxury", "resort", "airline"], rpm: { low: 8.0, high: 20.0 } },
        "ASMR": { keywords: ["asmr", "relaxing", "tingles", "sleep"], rpm: { low: 7.0, high: 15.0 } },
        "Home Improvement": { keywords: ["diy", "home improvement", "renovation", "crafts"], rpm: { low: 6.0, high: 12.0 } },
        "Pets & Animals": { keywords: ["pets", "animals", "dog", "cat"], rpm: { low: 3.0, high: 10.0 } },
        "Entertainment & Comedy": { keywords: ["entertainment", "comedy", "vlog", "prank", "funny"], rpm: { low: 2.0, high: 8.0 } },
        "Gaming": { keywords: ["gaming", "gameplay", "let's play"], rpm: { low: 1.0, high: 7.0 } },
        "Food & Cooking": { keywords: ["food", "cooking", "recipe"], rpm: { low: 1.0, high: 12.0 } }
    };

    let scores = {};
    for (const niche in niches) {
        scores[niche] = 0;
        niches[niche].keywords.forEach(keyword => { if (textCorpus.includes(keyword)) { scores[niche]++; } });
    }
    let detectedNiche = "General";
    let maxScore = 0;
    for (const niche in scores) { if (scores[niche] > maxScore) { maxScore = scores[niche]; detectedNiche = niche; } }
    
    return { name: detectedNiche, rpm: niches[detectedNiche]?.rpm || { low: 2.0, high: 10.0 } };
};

const sponsorshipCpms = {
    "Finance & Investing": { low: 20, high: 50 },
    "Technology": { low: 15, high: 30 },
    "Real Estate": { low: 15, high: 25 },
    "Health & Fitness": { low: 10, high: 20 },
    "Beauty & Fashion": { low: 10, high: 18 },
    "Gaming": { low: 5, high: 15 },
    "Entertainment & Comedy": { low: 5, high: 10 },
    "default": { low: 8, high: 20 }
};

const calculateSponsorships = (subscriberCount, videosInMonth, nicheInfo) => {
    const totalViewsInMonth = videosInMonth.reduce((sum, v) => sum + parseInt(v.statistics.viewCount || 0), 0);
    if (totalViewsInMonth < 500000) {
        return { min: 0, max: 0 };
    }

    const avgViewsPerVideo = totalViewsInMonth / videosInMonth.length;
    
    const getTierRate = (subs) => {
        if (subs >= 1500000) return { min: 18000, max: 50000 };
        if (subs >= 1000000) return { min: 12000, max: 25000 };
        if (subs >= 500000) return { min: 6000, max: 15000 };
        if (subs >= 100000) return { min: 2000, max: 5000 };
        return { min: 0, max: 0 };
    };

    const tierRate = getTierRate(subscriberCount);
    const viewBasedRateMin = (avgViewsPerVideo / 1000) * (sponsorshipCpms[nicheInfo.name] || sponsorshipCpms.default).low;
    const viewBasedRateMax = (avgViewsPerVideo / 1000) * (sponsorshipCpms[nicheInfo.name] || sponsorshipCpms.default).high;

    // Use the higher of the two estimates to get a more realistic floor and ceiling
    const finalRateMin = Math.max(tierRate.min, viewBasedRateMin);
    const finalRateMax = Math.max(tierRate.max, viewBasedRateMax);

    const sponsorshipDeals = {
        "Finance & Investing": { low: 1, high: 2 },
        "Technology": { low: 2, high: 4 },
        "Real Estate": { low: 1, high: 2 },
        "Health & Fitness": { low: 1, high: 3 },
        "Beauty & Fashion": { low: 2, high: 3 },
        "Gaming": { low: 4, high: 8 },
        "Entertainment & Comedy": { low: 1, high: 2 },
        "default": { low: 1, high: 2 }
    };

    const deals = sponsorshipDeals[nicheInfo.name] || sponsorshipDeals.default;
    
    const sponsorshipMin = finalRateMin * deals.low;
    const sponsorshipMax = finalRateMax * deals.high;

    return { min: sponsorshipMin, max: sponsorshipMax };
};


export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { query, count } = req.body;
    const API_KEY = process.env.YOUTUBE_API_KEY;

    if (!API_KEY) { return res.status(500).json({ message: 'YouTube API key is not configured.' }); }
    if (!query || !count) { return res.status(400).json({ message: 'Missing query or count.' }); }

    const cacheKey = `yt-backend-v5-${query}-${count}`;
    if (apiCache.has(cacheKey)) {
        const { timestamp, data } = apiCache.get(cacheKey);
        if (Date.now() - timestamp < CACHE_DURATION) {
            return res.status(200).json(data);
        }
    }

    try {
        const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
        let channelId = '';

        if (query.startsWith('UC') && query.length === 24) {
            channelId = query;
        } else {
            const handleWithoutAt = query.startsWith('@') ? query.substring(1) : query;
            const searchResponse = await fetch(`${YOUTUBE_API_BASE_URL}/channels?part=id&forHandle=${handleWithoutAt}&key=${API_KEY}&fields=items/id`);
            const searchResult = await searchResponse.json();
            if (searchResult.error || !searchResult.items || !searchResult.items[0]) { throw new Error(`Channel with handle "${query}" not found.`); }
            channelId = searchResult.items[0].id;
        }

        const channelFields = 'items(id,snippet(title,thumbnails),statistics(subscriberCount,viewCount),contentDetails/relatedPlaylists/uploads)';
        const channelResponse = await fetch(`${YOUTUBE_API_BASE_URL}/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${API_KEY}&fields=${encodeURIComponent(channelFields)}`);
        const channelResult = await channelResponse.json();
        if (channelResult.error || !channelResult.items || !channelResult.items[0]) { throw new Error(`Channel with ID "${channelId}" not found.`); }
        const fetchedChannelData = channelResult.items[0];

        if (!fetchedChannelData.contentDetails?.relatedPlaylists?.uploads) {
            const responseData = { channelData: fetchedChannelData, videoData: [], analysis: { adsense: {min: 0, max: 0}, sponsorships: {min: 0, max: 0}, videosInMonth: 0, totalViews: 0, totalLikes: 0, dateRange: "N/A", bonuses: [], nicheInfo: {name: 'N/A', rpm: {low: 0, high: 0}}, midRollBonus: 1.0, sponsorshipCpms }};
            apiCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
            return res.status(200).json(responseData);
        }
        const uploadsPlaylistId = fetchedChannelData.contentDetails.relatedPlaylists.uploads;

        const playlistResponse = await fetch(`${YOUTUBE_API_BASE_URL}/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=50&key=${API_KEY}&fields=items/contentDetails/videoId`);
        const playlistResult = await playlistResponse.json();
        if (playlistResult.error || !playlistResult.items || playlistResult.items.length === 0) {
            const responseData = { channelData: fetchedChannelData, videoData: [], analysis: { adsense: {min: 0, max: 0}, sponsorships: {min: 0, max: 0}, videosInMonth: 0, totalViews: 0, totalLikes: 0, dateRange: "N/A", bonuses: [], nicheInfo: {name: 'N/A', rpm: {low: 0, high: 0}}, midRollBonus: 1.0, sponsorshipCpms }};
            apiCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
            return res.status(200).json(responseData);
        }

        const videoIds = playlistResult.items.map(item => item.contentDetails.videoId).join(',');
        const videoFields = 'items(id,snippet(title,description,publishedAt,thumbnails),statistics(viewCount,likeCount),contentDetails(duration))';
        const videosResponse = await fetch(`${YOUTUBE_API_BASE_URL}/videos?part=snippet,statistics,contentDetails&id=${videoIds}&key=${API_KEY}&fields=${encodeURIComponent(videoFields)}`);
        const videosResult = await videosResponse.json();
        if (videosResult.error) { throw new Error(videosResult.error.message); }
        
        const allVideos = videosResult.items.map(v => ({...v, contentDetails: {...v.contentDetails, durationInSeconds: parseDuration(v.contentDetails.duration)}}));
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const videosInLast30Days = allVideos.filter(v => new Date(v.snippet.publishedAt) > thirtyDaysAgo);

        if (videosInLast30Days.length === 0) {
             const responseData = { channelData: fetchedChannelData, videoData: allVideos.slice(0, count), analysis: { adsense: {min: 0, max: 0}, sponsorships: {min: 0, max: 0}, videosInMonth: 0, totalViews: 0, totalLikes: 0, dateRange: "No videos in last 30 days", bonuses: [], nicheInfo: {name: 'N/A', rpm: {low: 0, high: 0}}, midRollBonus: 1.0, sponsorshipCpms }};
            apiCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
            return res.status(200).json(responseData);
        }

        const nicheInfo = detectNicheAndGetRPM(videosInLast30Days);
        const totalViews = videosInLast30Days.reduce((sum, v) => sum + parseInt(v.statistics.viewCount || 0), 0);
        const avgDuration = videosInLast30Days.reduce((sum, v) => sum + v.contentDetails.durationInSeconds, 0) / videosInLast30Days.length;
        const midRollBonus = avgDuration > 480 ? 1.5 : 1.0;
        
        const adsenseMin = (totalViews / 1000) * nicheInfo.rpm.low * midRollBonus;
        const adsenseMax = (totalViews / 1000) * nicheInfo.rpm.high * midRollBonus;
        
        const sponsorships = calculateSponsorships(parseInt(fetchedChannelData.statistics.subscriberCount), videosInLast30Days, nicheInfo);

        const bonuses = [];
        if (midRollBonus > 1) bonuses.push("Mid-roll Ads");
        if (sponsorships.min > 0) bonuses.push("Sponsorships");
        
        const analysisData = {
            adsense: { min: adsenseMin, max: adsenseMax },
            sponsorships: sponsorships,
            videosInMonth: videosInLast30Days.length,
            totalViews: totalViews,
            totalLikes: videosInLast30Days.reduce((sum, v) => sum + parseInt(v.statistics.likeCount || 0), 0),
            dateRange: `Based on videos in last 30 days`,
            bonuses,
            nicheInfo,
            midRollBonus,
            sponsorshipCpms
        };

        const responseData = { channelData: fetchedChannelData, videoData: allVideos.slice(0, count), analysis: analysisData };
        apiCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
        
        res.status(200).json(responseData);

    } catch (error) {
        res.status(500).json({ message: error.message || 'An internal server error occurred.' });
    }
}