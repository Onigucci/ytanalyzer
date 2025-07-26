const apiCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    const { query, count } = req.body;
    const API_KEY = process.env.YOUTUBE_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ message: 'YouTube API key is not configured on the server.' });
    }
    if (!query || !count) {
        return res.status(400).json({ message: 'Missing query or count parameters.' });
    }

    const cacheKey = `yt-backend-${query}-${count}`;
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
            if (searchResult.error || !searchResult.items || searchResult.items.length === 0) {
                throw new Error(`Channel with handle "${query}" not found.`);
            }
            channelId = searchResult.items[0].id;
        }

        const channelFields = 'items(id,snippet(title,thumbnails),statistics(subscriberCount,viewCount),contentDetails/relatedPlaylists/uploads)';
        const channelResponse = await fetch(`${YOUTUBE_API_BASE_URL}/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${API_KEY}&fields=${encodeURIComponent(channelFields)}`);
        const channelResult = await channelResponse.json();
        if (channelResult.error || !channelResult.items || channelResult.items.length === 0) {
            throw new Error(`Channel with ID "${channelId}" not found.`);
        }
        const fetchedChannelData = channelResult.items[0];

        if (!fetchedChannelData.contentDetails?.relatedPlaylists?.uploads) {
            const responseData = { channelData: fetchedChannelData, videoData: [] };
            apiCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
            return res.status(200).json(responseData);
        }
        
        const uploadsPlaylistId = fetchedChannelData.contentDetails.relatedPlaylists.uploads;
        const playlistFields = 'items/contentDetails/videoId';
        const playlistResponse = await fetch(`${YOUTUBE_API_BASE_URL}/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${count}&key=${API_KEY}&fields=${encodeURIComponent(playlistFields)}`);
        const playlistResult = await playlistResponse.json();
        
        if (playlistResult.error || !playlistResult.items || playlistResult.items.length === 0) {
            const responseData = { channelData: fetchedChannelData, videoData: [] };
            apiCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
            return res.status(200).json(responseData);
        }

        const videoIds = playlistResult.items.map(item => item.contentDetails.videoId).join(',');
        const videoFields = 'items(id,snippet(title,description,publishedAt,thumbnails),statistics(viewCount,likeCount))';
        const videosResponse = await fetch(`${YOUTUBE_API_BASE_URL}/videos?part=snippet,statistics&id=${videoIds}&key=${API_KEY}&fields=${encodeURIComponent(videoFields)}`);
        const videosResult = await videosResponse.json();
        if (videosResult.error) {
            throw new Error(videosResult.error.message);
        }

        const responseData = { channelData: fetchedChannelData, videoData: videosResult.items };
        apiCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
        
        res.status(200).json(responseData);

    } catch (error) {
        res.status(500).json({ message: error.message || 'An internal server error occurred.' });
    }
}