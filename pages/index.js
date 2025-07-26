import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Youtube, BarChart2, Download, Loader2, AlertTriangle, DollarSign, X, AtSign, ChevronsUpDown } from 'lucide-react';
import Head from 'next/head';
// The global CSS import has been moved to pages/_app.js

// --- Helper Components ---

const StatCard = ({ title, value, icon, subtext }) => {
    const getFontSizeClass = (text) => {
        const len = String(text).length;
        if (len <= 3) return 'text-5xl';
        if (len <= 6) return 'text-4xl';
        if (len <= 12) return 'text-3xl';
        return 'text-2xl';
    };

    return (
        <div className="bg-gray-800 p-6 rounded-xl shadow-lg flex flex-col justify-center transition-transform transform hover:-translate-y-1 h-full">
            <div className="flex items-center space-x-4">
                <div className="bg-gray-700 p-3 rounded-full">{icon}</div>
                <div className="flex-1 min-w-0">
                    <p className="text-base text-gray-400 truncate">{title}</p>
                    <p className={`${getFontSizeClass(value)} font-bold text-white truncate`}>{value}</p>
                </div>
            </div>
            {subtext && <p className="text-sm text-gray-500 mt-2 truncate">{subtext}</p>}
        </div>
    );
};

const EarningsModal = ({ video, rpm, onClose }) => {
    if (!video || !rpm) return null;
    const viewCount = parseInt(video.statistics.viewCount || 0);
    const lowEstimate = (viewCount / 1000) * rpm.low;
    const highEstimate = (viewCount / 1000) * rpm.high;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full p-6 relative animate-fade-in-up">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition"><X size={24} /></button>
                <h3 className="text-2xl font-bold mb-4 text-white">Estimated Earnings</h3>
                <div className="flex items-center space-x-4 mb-4">
                    <img src={video.snippet.thumbnails.medium.url} alt={video.snippet.title} className="w-24 h-auto rounded-lg" />
                    <div>
                        <p className="font-semibold text-gray-200">{video.snippet.title}</p>
                        <p className="text-sm text-gray-400">{viewCount.toLocaleString()} views</p>
                    </div>
                </div>
                <div className="bg-gray-900 p-4 rounded-lg space-y-3">
                    <p className="text-lg text-green-400 font-bold">~ ${lowEstimate.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} - ${highEstimate.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                    <p className="text-xs text-gray-500">Disclaimer: This is a rough estimate. Actual earnings depend heavily on video niche, audience location, and ad performance.</p>
                </div>
            </div>
        </div>
    );
};

// --- Niche Detection Logic (Needed for frontend analysis object) ---
const detectNicheAndGetRPM = (videos) => {
    const textCorpus = videos.map(v => `${v.snippet.title} ${v.snippet.description}`).join(' ').toLowerCase();
    const niches = {
        "Finance & Business": { keywords: ["investing", "finance", "crypto", "business", "marketing", "software", "real estate", "trading", "ecommerce", "stocks"], rpm: { low: 8.0, high: 20.0 } },
        "Tech": { keywords: ["tech", "review", "programming", "code", "developer", "ai", "gadget", "phone", "computer"], rpm: { low: 5.0, high: 15.0 } },
        "Education": { keywords: ["tutorial", "how to", "learn", "education", "science", "history", "documentary"], rpm: { low: 4.0, high: 12.0 } },
        "Gaming": { keywords: ["gaming", "gameplay", "let's play", "fortnite", "minecraft", "roblox", "valorant"], rpm: { low: 1.5, high: 5.0 } },
        "Entertainment & Comedy": { keywords: ["vlog", "prank", "music", "entertainment", "comedy", "funny", "challenge"], rpm: { low: 1.0, high: 4.0 } }
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

// --- Main App Component ---
export default function HomePage() {
    const [userInput, setUserInput] = useState('');
    const [videoCount, setVideoCount] = useState(25);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [channelData, setChannelData] = useState(null);
    const [videoData, setVideoData] = useState([]);
    const [selectedVideo, setSelectedVideo] = useState(null);
    
    const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

    const handleAnalyze = async () => {
        if (isLoading) return;
        if (!userInput) {
            setError('Please provide a YouTube Handle or Channel ID.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setChannelData(null);
        setVideoData([]);

        const cacheKey = `yt-analyzer-frontend-${userInput}-${videoCount}`;
        try {
            const cachedData = localStorage.getItem(cacheKey);
            if (cachedData) {
                const { timestamp, data } = JSON.parse(cachedData);
                if (Date.now() - timestamp < CACHE_DURATION) {
                    setChannelData(data.channelData);
                    setVideoData(data.videoData);
                    setIsLoading(false);
                    return;
                }
            }
        } catch (e) { console.error("Could not read from frontend cache", e); }

        try {
            const response = await fetch(`/api/youtube`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: userInput, count: videoCount })
            });
            if (!response.ok) {
                const errorResult = await response.json();
                throw new Error(errorResult.message || 'An error occurred with the server.');
            }
            const result = await response.json();
            setChannelData(result.channelData);
            setVideoData(result.videoData);
            try {
                const dataToCache = { timestamp: Date.now(), data: { channelData: result.channelData, videoData: result.videoData } };
                localStorage.setItem(cacheKey, JSON.stringify(dataToCache));
            } catch (e) { console.error("Could not save to frontend cache", e); }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleKeyPress = (event) => {
        if (event.key === 'Enter') handleAnalyze();
    };

    const analysis = useMemo(() => {
        if (!channelData || videoData.length === 0) return null;
        const nicheInfo = detectNicheAndGetRPM(videoData);
        const totalViews = videoData.reduce((sum, v) => sum + parseInt(v.statistics.viewCount || 0), 0);
        const totalLikes = videoData.reduce((sum, v) => sum + parseInt(v.statistics.likeCount || 0), 0);
        const lowEstimate = (totalViews / 1000) * nicheInfo.rpm.low;
        const highEstimate = (totalViews / 1000) * nicheInfo.rpm.high;
        const sortedVideos = [...videoData].sort((a, b) => new Date(a.snippet.publishedAt) - new Date(b.snippet.publishedAt));
        const oldestVideoDate = new Date(sortedVideos[0].snippet.publishedAt);
        const newestVideoDate = new Date(sortedVideos[sortedVideos.length - 1].snippet.publishedAt);
        const formatDate = (date) => date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        const dateRange = videoData.length > 1 ? `Covering ${formatDate(oldestVideoDate)} - ${formatDate(newestVideoDate)}` : `On ${formatDate(newestVideoDate)}`;
        return {
            totalVideos: videoData.length, totalViews, totalLikes,
            avgViews: Math.round(totalViews / videoData.length),
            estimatedEarnings: `~$${lowEstimate.toLocaleString(undefined, {maximumFractionDigits: 0})} - $${highEstimate.toLocaleString(undefined, {maximumFractionDigits: 0})}`,
            dateRange, rpm: nicheInfo.rpm
        };
    }, [channelData, videoData]);

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            <Head>
                <title>YouTube Channel Analyzer</title>
                <meta name="description" content="Analyze YouTube channel performance and estimated earnings." />
                <link rel="icon" href="/favicon.ico" />
            </Head>
            <div className="container mx-auto p-4 md:p-8">
                <header className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-400 pb-2">YouTube Channel Analyzer</h1>
                    <p className="text-gray-400 mt-2 max-w-2xl mx-auto">Enter a channel's handle to fetch and analyze its public performance and estimated earnings.</p>
                </header>
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 mb-8">
                    <div className="max-w-lg mx-auto">
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="sm:col-span-2">
                                    <label htmlFor="userInput" className="block text-sm font-medium text-gray-300 mb-2">YouTube Handle or Channel ID</label>
                                    <div className="relative"><AtSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} /><input type="text" id="userInput" value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyDown={handleKeyPress} placeholder="@handle or Channel ID" className="w-full bg-gray-900 border border-gray-600 rounded-lg py-3 pl-10 pr-4 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition" /></div>
                                </div>
                                <div>
                                    <label htmlFor="videoCount" className="block text-sm font-medium text-gray-300 mb-2">Videos</label>
                                    <div className="relative"><select id="videoCount" value={videoCount} onChange={(e) => setVideoCount(Number(e.target.value))} className="w-full bg-gray-900 border border-gray-600 rounded-lg py-3 pl-3 pr-8 appearance-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition"><option value={25}>Last 25</option><option value={50}>Last 50</option></select><ChevronsUpDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20}/></div>
                                </div>
                            </div>
                            <button onClick={handleAnalyze} disabled={isLoading} className="w-full flex items-center justify-center bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 px-4 rounded-lg shadow-lg transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed">{isLoading ? <><Loader2 className="animate-spin mr-2" /> Analyzing...</> : 'Analyze Channel'}</button>
                        </div>
                    </div>
                </div>
                {error && (<div className="max-w-4xl mx-auto bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg flex items-center"><AlertTriangle className="mr-3" /><div><strong className="font-bold">Error:</strong><span className="block sm:inline ml-2">{error}</span></div></div>)}
                {channelData && videoData.length === 0 && !isLoading && (<div className="text-center py-16"><img src={channelData.snippet.thumbnails.medium.url} alt="Channel Thumbnail" className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-gray-700"/><h2 className="text-3xl font-bold">{channelData.snippet.title}</h2><p className="text-gray-400 mt-4">This channel doesn't have any public videos to analyze.</p></div>)}
                {channelData && analysis && (
                    <div className="space-y-8">
                        <div className="text-center"><img src={channelData.snippet.thumbnails.medium.url} alt="Channel Thumbnail" className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-gray-700"/><h2 className="text-3xl font-bold">{channelData.snippet.title}</h2><p className="text-gray-400">Subscribers: {Number(channelData.statistics.subscriberCount).toLocaleString()} &bull; Total Views: {Number(channelData.statistics.viewCount).toLocaleString()}</p></div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                            <StatCard title="Videos Analyzed" value={analysis.totalVideos} icon={<Youtube size={24} className="text-red-400" />} />
                            <StatCard title="Total Views (Analyzed)" value={analysis.totalViews.toLocaleString()} icon={<BarChart2 size={24} className="text-blue-400" />} />
                            <StatCard title="Total Likes (Analyzed)" value={analysis.totalLikes.toLocaleString()} icon={<BarChart2 size={24} className="text-green-400" />} />
                            <StatCard title="Est. Earnings" value={analysis.estimatedEarnings} icon={<DollarSign size={24} className="text-yellow-400" />} subtext={analysis.dateRange} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold mb-4">Analyzed Videos</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {videoData.map(video => (
                                    <div key={video.id} className="bg-gray-800 rounded-xl shadow-lg flex flex-col overflow-hidden">
                                        <img src={video.snippet.thumbnails.medium.url} alt={video.snippet.title} className="w-full h-auto object-cover" />
                                        <div className="p-4 flex flex-col flex-grow">
                                            <p className="font-semibold text-gray-200 text-sm mb-2 flex-grow">{video.snippet.title}</p>
                                            <div className="text-xs text-gray-400 mb-4"><span>{parseInt(video.statistics.viewCount || 0).toLocaleString()} views</span> &bull; <span>{parseInt(video.statistics.likeCount || 0).toLocaleString()} likes</span></div>
                                            <button onClick={() => setSelectedVideo(video)} className="mt-auto w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition">Estimate Earnings</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <button onClick={() => {}} className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition"><Download size={18} /> Export as CSV</button>
                            <button onClick={() => {}} className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg transition"><Download size={18} /> Export as JSON</button>
                        </div>
                    </div>
                )}
            </div>
            {selectedVideo && <EarningsModal video={selectedVideo} rpm={analysis.rpm} onClose={() => setSelectedVideo(null)} />}
        </div>
    );
}