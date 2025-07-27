import React, { useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Youtube, BarChart2, Download, Loader2, AlertTriangle, DollarSign, X, AtSign, ChevronsUpDown, Globe, Sparkles } from 'lucide-react';
import Head from 'next/head';
import Image from 'next/image';

// --- Helper Components ---

const StatCard = ({ title, value, icon, subtext }) => {
    const getFontSizeClass = (text) => {
        const len = String(text).length;
        if (len <= 3) return 'text-5xl';
        if (len <= 8) return 'text-4xl';
        if (len <= 12) return 'text-3xl';
        if (len <= 20) return 'text-2xl';
        return 'text-xl';
    };

    return (
        <div className="bg-gray-800 p-6 rounded-xl shadow-lg flex flex-col justify-center transition-transform transform hover:-translate-y-1 h-full">
            <div className="flex items-center space-x-4">
                <div className="bg-gray-700 p-3 rounded-full">{icon}</div>
                <div className="flex-1 min-w-0">
                    <p className="text-base text-gray-400 truncate">{title}</p>
                    <p className={`${getFontSizeClass(value)} font-bold text-white break-words`}>{value}</p>
                </div>
            </div>
            {subtext && <p className="text-sm text-gray-500 mt-2 truncate">{subtext}</p>}
        </div>
    );
};

const Portal = ({ children }) => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);
    return mounted ? ReactDOM.createPortal(children, document.body) : null;
};

const EarningsModal = ({ video, rpm, geoMultiplier, midRollBonus, isSponsored, sponsorshipCpms, onClose }) => {
    if (!video || !rpm || !sponsorshipCpms) return null;
    const viewCount = parseInt(video.statistics.viewCount || 0);
    
    const bonus = video.contentDetails.durationInSeconds > 480 ? midRollBonus : 1.0;
    let lowEstimate = (viewCount / 1000) * rpm.low * geoMultiplier * bonus;
    let highEstimate = (viewCount / 1000) * rpm.high * geoMultiplier * bonus;

    let sponsorshipLow = 0;
    let sponsorshipHigh = 0;

    if (isSponsored) {
        const sponsorCpm = sponsorshipCpms[rpm.name] || sponsorshipCpms.default;
        sponsorshipLow = (viewCount / 1000) * sponsorCpm.low;
        sponsorshipHigh = (viewCount / 1000) * sponsorCpm.high;
        lowEstimate += sponsorshipLow;
        highEstimate += sponsorshipHigh;
    }

    return (
        <Portal>
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
                <div className="bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full p-6 relative animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
                    <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition"><X size={24} /></button>
                    <h3 className="text-2xl font-bold mb-4 text-white">Total Estimated Earnings</h3>
                    <div className="flex items-center space-x-4 mb-4">
                        <Image src={video.snippet.thumbnails.medium.url} alt={video.snippet.title} width={120} height={90} className="w-24 h-auto rounded-lg" />
                        <div>
                            <p className="font-semibold text-gray-200">{video.snippet.title}</p>
                            <p className="text-sm text-gray-400">{viewCount.toLocaleString()} views</p>
                        </div>
                    </div>
                    <div className="bg-gray-900 p-4 rounded-lg space-y-3">
                        <p className="text-lg text-green-400 font-bold">~ ${lowEstimate.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} - ${highEstimate.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                        {isSponsored && <p className="text-xs text-yellow-300">Includes sponsorship estimate of ~${sponsorshipLow.toLocaleString(undefined, {maximumFractionDigits: 0})} - ${sponsorshipHigh.toLocaleString(undefined, {maximumFractionDigits: 0})}</p>}
                        {bonus > 1 && <p className="text-xs text-green-300">Includes a Mid-roll Bonus for being over 8 minutes long.</p>}
                        <p className="text-xs text-gray-500">Disclaimer: This is a rough estimate. Actual earnings depend heavily on video niche, audience&apos;s location, and ad performance.</p>
                    </div>
                </div>
            </div>
        </Portal>
    );
};

// --- Main App Component ---
export default function HomePage() {
    const [userInput, setUserInput] = useState('');
    const [videoCount, setVideoCount] = useState(30);
    const [audienceTier, setAudienceTier] = useState('tier1');
    const [hasMemberships, setHasMemberships] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [channelData, setChannelData] = useState(null);
    const [videoData, setVideoData] = useState([]);
    const [analysis, setAnalysis] = useState(null);
    const [selectedVideo, setSelectedVideo] = useState(null);
    const [sponsoredVideos, setSponsoredVideos] = useState({});
    
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
        setAnalysis(null);
        setSponsoredVideos({});

        const cacheKey = `yt-analyzer-frontend-v5-${userInput}-${videoCount}`;
        try {
            const cachedData = localStorage.getItem(cacheKey);
            if (cachedData) {
                const { timestamp, data } = JSON.parse(cachedData);
                if (Date.now() - timestamp < CACHE_DURATION) {
                    setChannelData(data.channelData);
                    setVideoData(data.videoData);
                    setAnalysis(data.analysis);
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
            setAnalysis(result.analysis);
            try {
                const dataToCache = { timestamp: Date.now(), data: { channelData: result.channelData, videoData: result.videoData, analysis: result.analysis } };
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
    
    const finalEarnings = useMemo(() => {
        if (!analysis || !channelData) return null;
        
        const geoMultipliers = { tier1: 1.0, tier2: 0.4, tier3: 0.1 };
        const geoMultiplier = geoMultipliers[audienceTier];

        let membershipMin = 0;
        let membershipMax = 0;
        if (hasMemberships) {
            const subCount = parseInt(String(channelData.statistics.subscriberCount).replace(/,/g, ''));
            membershipMin = (subCount * 0.0005) * 4.99;
            membershipMax = (subCount * 0.005) * 4.99;
        }

        const lowEstimate = (analysis.adsense.min + membershipMin + analysis.sponsorships.min) * geoMultiplier;
        const highEstimate = (analysis.adsense.max + membershipMax + analysis.sponsorships.max) * geoMultiplier;

        return `~$${lowEstimate.toLocaleString(undefined, {maximumFractionDigits: 0})} - $${highEstimate.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
    }, [analysis, audienceTier, hasMemberships, channelData]);

    const geoMultiplierForModal = useMemo(() => {
        const geoMultipliers = { tier1: 1.0, tier2: 0.4, tier3: 0.1 };
        return geoMultipliers[audienceTier];
    }, [audienceTier]);

    const displayedBonuses = useMemo(() => {
        if (!analysis) return 'None';
        const bonuses = [...analysis.bonuses];
        if (hasMemberships && !bonuses.includes('Memberships')) {
            bonuses.push('Memberships');
        }
        if (!hasMemberships && bonuses.includes('Memberships')) {
            return bonuses.filter(b => b !== 'Memberships').join(', ') || 'None';
        }
        return bonuses.join(', ') || 'None';
    }, [analysis, hasMemberships]);

    useEffect(() => {
        if (selectedVideo) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [selectedVideo]);

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            <Head>
                <title>YouTube Channel Analyzer</title>
                <meta name="description" content="Analyze YouTube channel performance and estimated earnings." />
            </Head>
            <main className="container mx-auto p-4 md:p-8">
                <header className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-400 pb-2">YouTube Channel Analyzer</h1>
                    <p className="text-gray-400 mt-2 max-w-2xl mx-auto">Enter a channel&apos;s handle to fetch and analyze its public performance and estimated earnings.</p>
                </header>
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl shadow-2xl p-4 sm:p-6 md:p-8 mb-8">
                    <div className="max-w-xl mx-auto">
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="userInput" className="block text-sm font-medium text-gray-300 mb-2">YouTube Handle or Channel ID</label>
                                    <div className="relative"><AtSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} /><input type="text" id="userInput" value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyDown={handleKeyPress} placeholder="@handle or Channel ID" className="w-full bg-gray-900 border border-gray-600 rounded-lg py-3 pl-10 pr-4 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition" /></div>
                                </div>
                                <div>
                                    <label htmlFor="videoCount" className="block text-sm font-medium text-gray-300 mb-2">Videos to Scan</label>
                                    <div className="relative">
                                        <select id="videoCount" value={videoCount} onChange={(e) => setVideoCount(Number(e.target.value))} className="w-full bg-gray-900 border border-gray-600 rounded-lg py-3 pl-3 pr-8 appearance-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition">
                                            <option value={30}>Scan Last 30</option>
                                            <option value={60}>Scan Last 60</option>
                                        </select>
                                        <ChevronsUpDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20}/>
                                    </div>
                                </div>
                            </div>
                             <div>
                                <label htmlFor="audienceTier" className="block text-sm font-medium text-gray-300 mb-2">Primary Audience Location</label>
                                <div className="relative"><Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} /><select id="audienceTier" value={audienceTier} onChange={(e) => setAudienceTier(e.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded-lg py-3 pl-10 pr-8 appearance-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition"><option value="tier1">Tier 1 (US, UK, DE, etc.)</option><option value="tier2">Tier 2 (Brazil, Mexico, etc.)</option><option value="tier3">Tier 3 (India, PH, etc.)</option></select><ChevronsUpDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20}/></div>
                            </div>
                            <div className="flex items-center">
                                <input id="hasMemberships" type="checkbox" checked={hasMemberships} onChange={(e) => setHasMemberships(e.target.checked)} className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-red-600 focus:ring-red-500" />
                                <label htmlFor="hasMemberships" className="ml-2 block text-sm text-gray-300">Channel has Memberships Enabled</label>
                            </div>
                            <button onClick={handleAnalyze} disabled={isLoading} className="w-full flex items-center justify-center bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 px-4 rounded-lg shadow-lg transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed">{isLoading ? <><Loader2 className="animate-spin mr-2" /> Analyzing...</> : 'Analyze Channel'}</button>
                        </div>
                    </div>
                </div>
                {error && (<div className="max-w-4xl mx-auto mt-6 bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg flex items-center"><AlertTriangle className="mr-3" /><div><strong className="font-bold">Error:</strong><span className="block sm:inline ml-2">{error}</span></div></div>)}
                {channelData && videoData.length === 0 && !isLoading && (<div className="text-center py-16"><Image src={channelData.snippet.thumbnails.medium.url} alt="Channel Thumbnail" width={96} height={96} className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-gray-700"/><h2 className="text-3xl font-bold">{channelData.snippet.title}</h2><p className="text-gray-400 mt-4">This channel doesn&apos;t have any public videos to analyze.</p></div>)}
                {channelData && analysis && (
                    <div className="space-y-8 mt-8">
                        <div className="text-center"><Image src={channelData.snippet.thumbnails.medium.url} alt="Channel Thumbnail" width={96} height={96} className="w-24 h-24 rounded-full mx-auto mb-4 border-4 border-gray-700"/><h2 className="text-3xl font-bold">{channelData.snippet.title}</h2><p className="text-gray-400">Subscribers: {Number(channelData.statistics.subscriberCount).toLocaleString()} &bull; Total Views: {Number(channelData.statistics.viewCount).toLocaleString()}</p></div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            <StatCard title="Videos in Last 30 Days" value={analysis.videosInMonth} icon={<Youtube size={24} className="text-red-400" />} />
                            <StatCard title="Views in Last 30 Days" value={analysis.totalViews.toLocaleString()} icon={<BarChart2 size={24} className="text-blue-400" />} />
                            <StatCard title="Est. Monthly Earnings" value={finalEarnings} icon={<DollarSign size={24} className="text-yellow-400" />} subtext={analysis.dateRange} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold mb-4">Analyzed Videos (Last {videoCount} Scanned)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {videoData.map(video => (
                                    <div key={video.id} className="bg-gray-800 rounded-xl shadow-lg flex flex-col overflow-hidden">
                                        <Image src={video.snippet.thumbnails.medium.url} alt={video.snippet.title} width={320} height={180} className="w-full h-auto object-cover" />
                                        <div className="p-4 flex flex-col flex-grow">
                                            <p className="font-semibold text-gray-200 text-sm mb-2 flex-grow">{video.snippet.title}</p>
                                            <div className="text-xs text-gray-400 mb-4"><span>{parseInt(video.statistics.viewCount || 0).toLocaleString()} views</span> &bull; <span>{parseInt(video.statistics.likeCount || 0).toLocaleString()} likes</span></div>
                                            <div className="flex items-center justify-end mb-2">
                                                <label htmlFor={`sponsored-${video.id}`} className="mr-2 text-xs text-gray-400">Sponsorship included?</label>
                                                <input id={`sponsored-${video.id}`} type="checkbox" checked={!!sponsoredVideos[video.id]} onChange={(e) => setSponsoredVideos({...sponsoredVideos, [video.id]: e.target.checked})} className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-red-600 focus:ring-red-500" />
                                            </div>
                                            <button onClick={() => setSelectedVideo(video)} className="mt-auto w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition">Estimate Earnings</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </main>
            {selectedVideo && analysis && <EarningsModal video={selectedVideo} rpm={analysis.nicheInfo.rpm} geoMultiplier={geoMultiplierForModal} midRollBonus={analysis.midRollBonus} isSponsored={!!sponsoredVideos[selectedVideo.id]} sponsorshipCpms={analysis.sponsorshipCpms} onClose={() => setSelectedVideo(null)} />}
        </div>
    );
}