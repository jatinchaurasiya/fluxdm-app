import { useEffect, useState } from 'react';
import { Loader2, Image as ImageIcon, Video } from 'lucide-react';

interface MediaItem {
    id: string;
    caption?: string;
    media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
    thumbnail_url?: string;
    media_url: string;
    permalink: string;
}

interface MediaPickerProps {
    onSelect: (mediaId: string | null) => void;
    selectedId?: string | null;
}

export default function MediaPicker({ onSelect, selectedId }: MediaPickerProps) {
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchMedia = async () => {
            try {
                // @ts-ignore
                if (window.ipcRenderer) {
                    const result = await window.ipcRenderer.invoke('get-ig-media');
                    if (result.success) {
                        setMedia(result.data);
                    } else {
                        setError(result.error || 'Failed to fetch media');
                    }
                } else {
                    // Browser mode fallback or empty
                    setError('Desktop app required to fetch media.');
                }
            } catch (err) {
                setError('Failed to load media. Is your Meta token valid?');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchMedia();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                <p>Loading your posts...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center p-6 text-red-500/80 text-sm bg-red-50 dark:bg-red-900/10 rounded-lg">
                <p>{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Global Trigger Option */}
            <div
                className={`
                    p-3 border rounded-lg cursor-pointer transition-all flex items-center justify-between
                    ${!selectedId
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 ring-1 ring-purple-500/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                    }
                `}
                onClick={() => onSelect(null)}
            >
                <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100">Any Post (Global)</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Triggers on this keyword in ANY post</p>
                </div>
                {!selectedId && (
                    <div className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                )}
            </div>

            {/* Media Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-1">
                {media.map((item) => {
                    const isSelected = selectedId === item.id;
                    return (
                        <div
                            key={item.id}
                            onClick={() => onSelect(item.id)}
                            className={`
                                relative group cursor-pointer rounded-lg overflow-hidden border transition-all aspect-square
                                ${isSelected
                                    ? 'border-purple-500 ring-2 ring-purple-500/30'
                                    : 'border-gray-200 dark:border-gray-700 opacity-80 hover:opacity-100'
                                }
                            `}
                        >
                            <img
                                src={item.thumbnail_url || item.media_url}
                                alt="Post"
                                className="w-full h-full object-cover bg-gray-100 dark:bg-gray-800"
                                loading="lazy"
                            />

                            {/* Selection Checkmark Overlay */}
                            {isSelected && (
                                <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center z-10">
                                    <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center shadow-sm">
                                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                </div>
                            )}

                            {/* Type Icon */}
                            <div className="absolute top-1.5 right-1.5 bg-black/60 backdrop-blur rounded px-1.5 py-0.5 z-10">
                                {item.media_type === 'VIDEO' ? (
                                    <Video className="w-3 h-3 text-white" />
                                ) : (
                                    <ImageIcon className="w-3 h-3 text-white" />
                                )}
                            </div>

                            {/* Caption Overlay */}
                            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2 pt-6">
                                <p className="text-[10px] text-white truncate w-full opacity-90 font-medium">
                                    {item.caption || 'No caption'}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
