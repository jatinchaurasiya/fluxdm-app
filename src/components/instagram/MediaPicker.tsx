import { useEffect, useState, useMemo } from 'react';
import { 
    Loader2, 
    Image as ImageIcon, 
    Video, 
    Layers, 
    RefreshCw, 
    Search, 
    ExternalLink, 
    Heart, 
    MessageCircle, 
    Check, 
    Sparkles, 
    AlertCircle,
    Film,
    Calendar
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface MediaItem {
    id: string;
    caption?: string;
    media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | string;
    thumbnail_url?: string;
    media_url?: string;
    permalink?: string;
    timestamp?: string;
    like_count?: number;
    comments_count?: number;
}

interface MediaPickerProps {
    onSelect: (mediaId: string | null) => void;
    selectedId?: string | null;
}

export default function MediaPicker({ onSelect, selectedId }: MediaPickerProps) {
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'ALL' | 'VIDEO' | 'IMAGE'>('ALL');

    const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

    const fetchMedia = async (forceRefresh = false) => {
        if (forceRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const result = await window.ipcRenderer.invoke('get-ig-media', { 
                    forceRefresh,
                    targetMediaId: selectedId || undefined
                });
                if (result.success && Array.isArray(result.data)) {
                    setMedia(result.data);
                } else {
                    setError(result.error || 'Failed to fetch Instagram posts.');
                }
            } else {
                setError('Desktop application required to fetch live Instagram posts.');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load media. Please check your Instagram connection.');
            console.error(err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchMedia(false);
    }, [selectedId]);

    // Filtered media by search query and type
    const filteredMedia = useMemo(() => {
        return media.filter((item) => {
            const matchesSearch = 
                !searchQuery || 
                (item.caption && item.caption.toLowerCase().includes(searchQuery.toLowerCase())) ||
                item.id.includes(searchQuery);

            const isVideo = item.media_type === 'VIDEO';
            const isImage = item.media_type === 'IMAGE' || item.media_type === 'CAROUSEL_ALBUM';

            if (filterType === 'VIDEO') return matchesSearch && isVideo;
            if (filterType === 'IMAGE') return matchesSearch && isImage;
            return matchesSearch;
        });
    }, [media, searchQuery, filterType]);

    // Currently selected item details
    const selectedItem = useMemo(() => {
        if (!selectedId) return null;
        return media.find(m => m.id === selectedId) || null;
    }, [media, selectedId]);

    const videoCount = useMemo(() => media.filter(m => m.media_type === 'VIDEO').length, [media]);
    const imageCount = useMemo(() => media.filter(m => m.media_type !== 'VIDEO').length, [media]);

    return (
        <div className="space-y-3.5">
            {/* Top Toolbar: Search, Filters & Refresh */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                {/* Search Input */}
                <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                        type="text"
                        placeholder="Search posts by caption or ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 pl-8 text-xs bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 rounded-lg focus-visible:ring-1"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* Filter Tabs & Refresh Button */}
                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <div className="inline-flex p-0.5 rounded-lg bg-gray-100 dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-800 text-[11px]">
                        <button
                            type="button"
                            onClick={() => setFilterType('ALL')}
                            className={`px-2 py-1 rounded-md font-medium transition-all ${
                                filterType === 'ALL'
                                    ? 'bg-white dark:bg-zinc-900 text-gray-900 dark:text-white shadow-2xs font-semibold'
                                    : 'text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-gray-200'
                            }`}
                        >
                            All ({media.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterType('VIDEO')}
                            className={`px-2 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${
                                filterType === 'VIDEO'
                                    ? 'bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-2xs font-semibold'
                                    : 'text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-gray-200'
                            }`}
                        >
                            <Film className="w-3 h-3" /> Reels ({videoCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilterType('IMAGE')}
                            className={`px-2 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${
                                filterType === 'IMAGE'
                                    ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-2xs font-semibold'
                                    : 'text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-gray-200'
                            }`}
                        >
                            <ImageIcon className="w-3 h-3" /> Posts ({imageCount})
                        </button>
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => fetchMedia(true)}
                        disabled={loading || refreshing}
                        title="Sync latest posts directly from Instagram"
                        className="h-8 w-8 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-lg"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-purple-500' : ''}`} />
                    </Button>
                </div>
            </div>

            {/* Selected Post Banner (if specific post is selected) */}
            {selectedItem && (
                <div className="p-2.5 bg-purple-500/10 border border-purple-500/30 rounded-xl flex items-center justify-between gap-3 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-800 shrink-0 relative border border-purple-500/30">
                            <img
                                src={selectedItem.thumbnail_url || selectedItem.media_url}
                                alt="Selected"
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <div className="absolute top-0.5 right-0.5 bg-black/70 rounded p-0.5">
                                {selectedItem.media_type === 'VIDEO' ? (
                                    <Video className="w-2.5 h-2.5 text-white" />
                                ) : (
                                    <ImageIcon className="w-2.5 h-2.5 text-white" />
                                )}
                            </div>
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500 text-white">
                                    Target Post Selected
                                </span>
                                {selectedItem.permalink && (
                                    <a
                                        href={selectedItem.permalink}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[11px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-0.5"
                                        title="View live post on Instagram"
                                    >
                                        Instagram <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                )}
                            </div>
                            <p className="text-xs text-gray-800 dark:text-zinc-200 font-medium truncate mt-0.5">
                                {selectedItem.caption || `Post #${selectedItem.id}`}
                            </p>
                        </div>
                    </div>

                    <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => onSelect(null)}
                        className="h-7 text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 font-medium shrink-0"
                    >
                        Switch to Global
                    </Button>
                </div>
            )}

            {/* Global Trigger Option */}
            <div
                onClick={() => onSelect(null)}
                className={`
                    p-3 border rounded-xl cursor-pointer transition-all flex items-center justify-between
                    ${!selectedId
                        ? 'border-purple-500 bg-purple-50/70 dark:bg-purple-950/30 ring-1 ring-purple-500/40 shadow-2xs'
                        : 'border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900/60'
                    }
                `}
            >
                <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        !selectedId ? 'bg-purple-500 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-500'
                    }`}>
                        <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                        <p className="font-semibold text-xs text-gray-900 dark:text-gray-100">
                            Any Post or Reel (Global Trigger)
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            Automation activates whenever someone comments this keyword on ANY current or future post
                        </p>
                    </div>
                </div>
                {!selectedId && (
                    <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center text-white shadow-2xs">
                        <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                )}
            </div>

            {/* Loading State */}
            {loading && (
                <div className="py-12 text-center text-gray-400 space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-purple-500" />
                    <p className="text-xs font-medium">Fetching real Reels & Posts from Instagram...</p>
                </div>
            )}

            {/* Error State */}
            {!loading && error && (
                <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl text-center space-y-2">
                    <AlertCircle className="w-5 h-5 text-red-500 mx-auto" />
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
                    <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() => fetchMedia(true)}
                        className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30"
                    >
                        <RefreshCw className="w-3 h-3 mr-1" /> Try Again
                    </Button>
                </div>
            )}

            {/* Empty State */}
            {!loading && !error && filteredMedia.length === 0 && (
                <div className="py-10 text-center border border-dashed border-gray-200 dark:border-zinc-800 rounded-xl p-4">
                    <Film className="w-8 h-8 text-gray-400 mx-auto mb-2 opacity-50" />
                    <p className="text-xs font-medium text-gray-600 dark:text-zinc-300">
                        {searchQuery ? `No posts matching "${searchQuery}"` : 'No Instagram posts found'}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                        {searchQuery ? 'Try searching for a different word or clear search.' : 'Publish a Reel or Post to select it here.'}
                    </p>
                    {searchQuery && (
                        <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="mt-2 h-7 text-xs text-purple-600"
                        >
                            Clear Search
                        </Button>
                    )}
                </div>
            )}

            {/* Real Media Grid */}
            {!loading && !error && filteredMedia.length > 0 && (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-zinc-400 px-0.5">
                        <span>Click any post to link automation:</span>
                        <span>Showing {filteredMedia.length} item{filteredMedia.length !== 1 ? 's' : ''}</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1 pb-1">
                        {filteredMedia.map((item) => {
                            const isSelected = selectedId === item.id;
                            const isVideo = item.media_type === 'VIDEO';
                            const isCarousel = item.media_type === 'CAROUSEL_ALBUM';
                            const imageSrc = item.thumbnail_url || item.media_url;

                            let formattedDate = '';
                            if (item.timestamp) {
                                try {
                                    const d = new Date(item.timestamp);
                                    formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                } catch {}
                            }

                            return (
                                <div
                                    key={item.id}
                                    onClick={() => onSelect(item.id)}
                                    className={`
                                        group relative cursor-pointer rounded-xl overflow-hidden border transition-all duration-200 bg-zinc-900
                                        ${isSelected
                                            ? 'border-purple-500 ring-2 ring-purple-500/50 shadow-md scale-[0.99]'
                                            : 'border-gray-200 dark:border-zinc-800 hover:border-purple-400 dark:hover:border-purple-500/60 hover:shadow-sm'
                                        }
                                    `}
                                >
                                    {/* Thumbnail aspect ratio (4:5 / portrait) */}
                                    <div className="aspect-[4/5] w-full relative overflow-hidden bg-zinc-900">
                                        {imageSrc && !failedImages[item.id] ? (
                                            <img
                                                src={imageSrc}
                                                alt={item.caption || 'Instagram Post'}
                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                loading="lazy"
                                                onError={() => setFailedImages(prev => ({ ...prev, [item.id]: true }))}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-gray-500 p-2 text-center">
                                                <Film className="w-8 h-8 opacity-40 mb-1" />
                                                <span className="text-[10px] line-clamp-1">{item.caption ? item.caption.slice(0, 20) : 'Instagram Media'}</span>
                                            </div>
                                        )}

                                        {/* Top Badges: Type & Date */}
                                        <div className="absolute top-1.5 inset-x-1.5 flex items-center justify-between pointer-events-none z-10">
                                            <div className="flex items-center gap-1 bg-black/70 backdrop-blur-md rounded-md px-1.5 py-0.5 text-[10px] text-white font-medium">
                                                {isVideo ? (
                                                    <>
                                                        <Video className="w-3 h-3 text-pink-400" />
                                                        <span>Reel</span>
                                                    </>
                                                ) : isCarousel ? (
                                                    <>
                                                        <Layers className="w-3 h-3 text-blue-400" />
                                                        <span>Album</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <ImageIcon className="w-3 h-3 text-emerald-400" />
                                                        <span>Post</span>
                                                    </>
                                                )}
                                            </div>

                                            {formattedDate && (
                                                <div className="flex items-center gap-1 bg-black/70 backdrop-blur-md rounded-md px-1.5 py-0.5 text-[9px] text-zinc-300">
                                                    <Calendar className="w-2.5 h-2.5 opacity-70" />
                                                    {formattedDate}
                                                </div>
                                            )}
                                        </div>

                                        {/* Selection Overlay */}
                                        {isSelected && (
                                            <div className="absolute inset-0 bg-purple-600/30 backdrop-blur-[1px] flex items-center justify-center z-20">
                                                <div className="w-9 h-9 bg-purple-500 rounded-full flex items-center justify-center text-white shadow-lg ring-2 ring-white">
                                                    <Check className="w-5 h-5 stroke-[3]" />
                                                </div>
                                            </div>
                                        )}

                                        {/* Metrics: Likes and Comments */}
                                        <div className="absolute bottom-9 left-1.5 flex items-center gap-2 text-[10px] text-white font-semibold drop-shadow-md z-10">
                                            {(item.like_count ?? 0) > 0 && (
                                                <span className="flex items-center gap-0.5 bg-black/50 backdrop-blur-xs px-1.5 py-0.5 rounded">
                                                    <Heart className="w-2.5 h-2.5 text-red-400 fill-red-400" /> {item.like_count}
                                                </span>
                                            )}
                                            {(item.comments_count ?? 0) > 0 && (
                                                <span className="flex items-center gap-0.5 bg-black/50 backdrop-blur-xs px-1.5 py-0.5 rounded">
                                                    <MessageCircle className="w-2.5 h-2.5 text-blue-300" /> {item.comments_count}
                                                </span>
                                            )}
                                        </div>

                                        {/* Caption Gradient Overlay */}
                                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-2 pt-6 z-10">
                                            <p className="text-[11px] text-white line-clamp-2 leading-tight font-medium drop-shadow-xs">
                                                {item.caption || <span className="italic opacity-60">No caption</span>}
                                            </p>
                                        </div>

                                        {/* External link button on hover */}
                                        {item.permalink && (
                                            <a
                                                href={item.permalink}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 hover:bg-black text-white p-1 rounded-md z-30"
                                                title="View on Instagram"
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
