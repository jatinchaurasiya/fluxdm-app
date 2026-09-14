import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
    FileVideo,
    Image as ImageIcon,
    Layers,
    CircleDashed,
    Trash2,
    UploadCloud,
    FolderOpen,
    Play,
    Volume2,
    VolumeX,
    Heart,
    MessageCircle,
    Send,
    MoreHorizontal,
    Music2,
    CheckCircle2,
    Clock,
    AlertCircle,
    Loader2,
    Zap,
    RefreshCw,
    Sparkles,
    ExternalLink
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AutomationFlow {
    id: string;
    name: string;
}

interface ConnectedAccount {
    id: number;
    username: string;
    profile_picture_url?: string;
    instagram_business_id?: string;
}

interface ScheduledPostItem {
    id: number;
    account_id?: number;
    account_username?: string;
    file_path: string;
    caption: string;
    publish_at: string;
    status: 'PENDING' | 'PROCESSING' | 'PUBLISHED' | 'FAILED';
    linked_flow_id?: string;
    automation_id?: string;
    media_type?: string;
    error_message?: string;
    permalink?: string;
    created_at?: string;
}

interface SelectedMediaFile {
    path: string;
    previewUrl: string;
    name: string;
    size?: number;
    type: string;
}

type MediaType = 'REEL' | 'IMAGE' | 'CAROUSEL' | 'STORY';

export default function Scheduler() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [automations, setAutomations] = useState<AutomationFlow[]>([]);
    const [activeAccount, setActiveAccount] = useState<ConnectedAccount | null>(null);

    // Form State
    const [mediaType, setMediaType] = useState<MediaType>('REEL');
    const [selectedMedia, setSelectedMedia] = useState<SelectedMediaFile[]>([]);
    const [caption, setCaption] = useState('');
    const [scheduleDate, setScheduleDate] = useState('');
    const [selectedAutomation, setSelectedAutomation] = useState<string>('');

    // Video Player State
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    // Scheduled Posts Queue State
    const [scheduledPosts, setScheduledPosts] = useState<ScheduledPostItem[]>([]);
    const [loadingPosts, setLoadingPosts] = useState(false);
    const [isPublishingId, setIsPublishingId] = useState<number | null>(null);

    // Drag and drop state
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadData();
        loadScheduledPosts();

        return () => {
            selectedMedia.forEach(m => URL.revokeObjectURL(m.previewUrl));
        };
    }, []);

    useEffect(() => {
        // Clear files when switching restrictive modes
        selectedMedia.forEach(m => URL.revokeObjectURL(m.previewUrl));
        setSelectedMedia([]);
        setIsPlaying(true);
        setProgress(0);
    }, [mediaType]);

    const loadData = async () => {
        try {
            if ((window as any).ipcRenderer) {
                // 1. Load Automations
                const flowsRes = await (window as any).ipcRenderer.invoke('get-automations');
                if (flowsRes.success) setAutomations(flowsRes.data || []);

                // 2. Load Active Account
                const accRes = await (window as any).ipcRenderer.invoke('get-accounts');
                if (accRes.success && accRes.data && accRes.data.length > 0) {
                    const active = accRes.data.find((a: any) => a.id === accRes.activeId) || accRes.data[0];
                    if (active) {
                        setActiveAccount(active);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to load initial data', e);
        }
    };

    const loadScheduledPosts = async () => {
        setLoadingPosts(true);
        try {
            if ((window as any).ipcRenderer) {
                const res = await (window as any).ipcRenderer.invoke('get-scheduled-posts');
                if (res.success) {
                    setScheduledPosts(res.data || []);
                }
            }
        } catch (e) {
            console.error('Failed to fetch scheduled posts', e);
        } finally {
            setLoadingPosts(false);
        }
    };

    // Native OS file dialog
    const handleBrowseFiles = async () => {
        try {
            if ((window as any).ipcRenderer) {
                const res = await (window as any).ipcRenderer.invoke('select-media-file', { mediaType });
                if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
                    await processFilePaths(res.filePaths);
                }
            } else {
                fileInputRef.current?.click();
            }
        } catch (e) {
            console.error('File dialog error:', e);
            fileInputRef.current?.click();
        }
    };

    const processFilePaths = async (paths: string[]) => {
        const newItems: SelectedMediaFile[] = [];

        for (const filePath of paths) {
            const previewRes = await (window as any).ipcRenderer.invoke('read-media-preview', { filePath });
            if (previewRes.success && previewRes.buffer) {
                const blob = new Blob([previewRes.buffer], { type: previewRes.mimeType });
                const previewUrl = URL.createObjectURL(blob);
                const fileName = filePath.split(/[/\\]/).pop() || 'media_file';
                newItems.push({
                    path: filePath,
                    previewUrl,
                    name: fileName,
                    size: previewRes.buffer.byteLength || 0,
                    type: previewRes.mimeType
                });
            }
        }

        if (newItems.length > 0) {
            if (mediaType === 'CAROUSEL') {
                setSelectedMedia(prev => [...prev, ...newItems]);
                toast.success(`Added ${newItems.length} file(s) to carousel`);
            } else {
                selectedMedia.forEach(m => URL.revokeObjectURL(m.previewUrl));
                setSelectedMedia([newItems[0]]);
                toast.success(`Loaded ${newItems[0].name}`);
            }
        }
    };

    // HTML input & drag-and-drop handler
    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            processDomFiles(Array.from(e.target.files));
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const processDomFiles = (files: File[]) => {
        const validItems: SelectedMediaFile[] = [];

        for (const file of files) {
            if (mediaType === 'REEL' && !file.type.startsWith('video/')) {
                toast.error(`Skipped ${file.name}: Reels must be MP4 or MOV video.`);
                continue;
            }
            if (mediaType === 'IMAGE' && !file.type.startsWith('image/')) {
                toast.error(`Skipped ${file.name}: Posts must be JPG or PNG images.`);
                continue;
            }

            const previewUrl = URL.createObjectURL(file);
            let diskPath = '';
            if ((window as any).ipcRenderer?.getPathForFile) {
                diskPath = (window as any).ipcRenderer.getPathForFile(file) || (file as any).path || file.name;
            } else {
                diskPath = (file as any).path || file.name;
            }

            validItems.push({
                path: diskPath,
                previewUrl,
                name: file.name,
                size: file.size,
                type: file.type
            });

            if (mediaType !== 'CAROUSEL') break;
        }

        if (validItems.length > 0) {
            if (mediaType === 'CAROUSEL') {
                setSelectedMedia(prev => [...prev, ...validItems]);
                toast.success(`Added ${validItems.length} file(s)`);
            } else {
                selectedMedia.forEach(m => URL.revokeObjectURL(m.previewUrl));
                setSelectedMedia([validItems[0]]);
                toast.success('Media loaded successfully!');
            }
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processDomFiles(Array.from(e.dataTransfer.files));
        }
    };

    const removeMediaItem = (index: number) => {
        const toRemove = selectedMedia[index];
        if (toRemove) URL.revokeObjectURL(toRemove.previewUrl);
        setSelectedMedia(prev => prev.filter((_, i) => i !== index));
    };

    // Video player controls
    const togglePlayPause = () => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) {
            videoRef.current.play();
            setIsPlaying(true);
        } else {
            videoRef.current.pause();
            setIsPlaying(false);
        }
    };

    const toggleMute = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!videoRef.current) return;
        videoRef.current.muted = !videoRef.current.muted;
        setIsMuted(videoRef.current.muted);
    };

    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        const current = videoRef.current.currentTime;
        const dur = videoRef.current.duration || 1;
        setCurrentTime(current);
        setProgress((current / dur) * 100);
    };

    const handleLoadedMetadata = () => {
        if (!videoRef.current) return;
        setDuration(videoRef.current.duration || 0);
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        if (!videoRef.current || !duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, clickX / rect.width));
        videoRef.current.currentTime = percentage * duration;
    };

    const formatSeconds = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    // Schedule submission
    const handleSchedule = async (immediatePublish: boolean = false) => {
        if (selectedMedia.length === 0) {
            toast.error('Please upload or select media first.');
            return;
        }
        if (!immediatePublish && !scheduleDate) {
            toast.error('Please select a scheduled date and time.');
            return;
        }

        setLoading(true);
        try {
            const filePaths = selectedMedia.map(m => m.path);
            const targetDate = immediatePublish
                ? new Date().toISOString()
                : new Date(scheduleDate).toISOString();

            if ((window as any).ipcRenderer) {
                const res = await (window as any).ipcRenderer.invoke('schedule-post', {
                    files: filePaths,
                    caption: mediaType === 'STORY' ? '' : caption,
                    date: targetDate,
                    automationId: selectedAutomation || null,
                    mediaType,
                    accountId: activeAccount?.id
                });

                if (res.success) {
                    if (immediatePublish && res.id) {
                        toast.success('Post queued! Triggering immediate Instagram publishing...');
                        await handlePublishNow(res.id);
                    } else {
                        const dateFormatted = new Date(scheduleDate).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                        });
                        toast.success(`🎉 Post Scheduled for ${dateFormatted}`);
                    }

                    // Reset form
                    selectedMedia.forEach(m => URL.revokeObjectURL(m.previewUrl));
                    setSelectedMedia([]);
                    setCaption('');
                    setScheduleDate('');
                    setSelectedAutomation('');
                    loadScheduledPosts();
                } else {
                    toast.error('Scheduling error: ' + res.error);
                }
            } else {
                toast.error('Desktop app required for scheduling.');
            }
        } catch (e: any) {
            toast.error('Scheduling failed: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    // Immediate on-demand publish
    const handlePublishNow = async (jobId: number) => {
        setIsPublishingId(jobId);
        const toastId = toast.loading('Publishing to Instagram...');

        try {
            const res = await (window as any).ipcRenderer.invoke('publish-scheduled-post-now', { id: jobId });
            if (res.success) {
                toast.success(`🎉 Published successfully! (Instagram Media ID: ${res.mediaId})`, {
                    id: toastId,
                    duration: 5000
                });
            } else {
                toast.error(`❌ Publishing failed: ${res.error || 'Unknown Meta error'}`, {
                    id: toastId,
                    duration: 8000
                });
            }
            loadScheduledPosts();
        } catch (e: any) {
            toast.error(`Error: ${e.message}`, { id: toastId });
            loadScheduledPosts();
        } finally {
            setIsPublishingId(null);
        }
    };

    // Delete scheduled post
    const handleDeletePost = async (id: number) => {
        try {
            const res = await (window as any).ipcRenderer.invoke('delete-scheduled-post', { id });
            if (res.success) {
                toast.success('Post removed from queue');
                loadScheduledPosts();
            } else {
                toast.error(res.error || 'Failed to delete');
            }
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    const activeUsername = activeAccount?.username || 'project.oneeighty';
    const activeAvatar = activeAccount?.profile_picture_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces';

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-10 min-h-full pb-20 bg-gray-50/50 dark:bg-black text-gray-900 dark:text-zinc-100">
            {/* Hidden native input */}
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept={mediaType === 'REEL' ? 'video/mp4,video/quicktime,video/webm' : 'image/*,video/*'}
                multiple={mediaType === 'CAROUSEL'}
                onChange={handleFileInputChange}
            />

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        {t('scheduler.title', 'Post Scheduler')}
                        {activeAccount && (
                            <span className="text-xs font-normal px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                @{activeAccount.username}
                            </span>
                        )}
                    </h1>
                    <p className="text-gray-500 dark:text-zinc-400 text-sm">
                        {t('scheduler.subtitle', 'Schedule and automatically publish Reels, Posts, and Carousels to Instagram with $0 cloud bills.')}
                    </p>
                </div>

                {/* Format Tabs */}
                <Tabs value={mediaType} onValueChange={(v) => setMediaType(v as MediaType)} className="w-full md:w-auto">
                    <TabsList className="grid grid-cols-4 bg-gray-200/80 dark:bg-zinc-800/80 p-1 rounded-xl">
                        <TabsTrigger value="REEL" className="gap-2 text-xs md:text-sm dark:data-[state=active]:bg-zinc-900">
                            <FileVideo className="w-4 h-4 text-pink-500" /> Reel
                        </TabsTrigger>
                        <TabsTrigger value="IMAGE" className="gap-2 text-xs md:text-sm dark:data-[state=active]:bg-zinc-900">
                            <ImageIcon className="w-4 h-4 text-blue-500" /> Post
                        </TabsTrigger>
                        <TabsTrigger value="CAROUSEL" className="gap-2 text-xs md:text-sm dark:data-[state=active]:bg-zinc-900">
                            <Layers className="w-4 h-4 text-purple-500" /> Carousel
                        </TabsTrigger>
                        <TabsTrigger value="STORY" className="gap-2 text-xs md:text-sm dark:data-[state=active]:bg-zinc-900">
                            <CircleDashed className="w-4 h-4 text-orange-500" /> Story
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {/* MAIN CREATOR GRID */}
            <div className="grid lg:grid-cols-12 gap-8 items-start">

                {/* LEFT: Authentic Phone / Reel Preview Viewport (5 Cols) */}
                <div className="lg:col-span-5 flex flex-col items-center">
                    {selectedMedia.length > 0 ? (
                        /* REALISTIC INSTAGRAM REEL PHONE MOCKUP */
                        <div className="relative w-full max-w-[340px] flex flex-col items-center">
                            {/* Phone Chassis */}
                            <div className="relative w-full aspect-[9/16] bg-black rounded-[40px] p-2.5 shadow-2xl ring-1 ring-zinc-800 dark:ring-zinc-700 shadow-purple-500/10 overflow-hidden group">

                                {/* Notch / Dynamic Island */}
                                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-24 h-4 bg-black rounded-full z-30 flex items-center justify-center pointer-events-none ring-1 ring-white/10">
                                    <div className="w-2.5 h-2.5 bg-zinc-900 rounded-full border border-zinc-700/50 mr-2" />
                                    <div className="w-2 h-2 bg-blue-900/60 rounded-full" />
                                </div>

                                {/* Phone Inner Display Screen */}
                                <div
                                    onClick={togglePlayPause}
                                    className="relative w-full h-full rounded-[32px] overflow-hidden bg-zinc-950 cursor-pointer select-none"
                                >
                                    {/* Video Player */}
                                    {mediaType === 'REEL' || (mediaType === 'STORY' && selectedMedia[0].type.startsWith('video/')) ? (
                                        <video
                                            ref={videoRef}
                                            src={selectedMedia[0].previewUrl}
                                            autoPlay
                                            loop
                                            muted={isMuted}
                                            playsInline
                                            onTimeUpdate={handleTimeUpdate}
                                            onLoadedMetadata={handleLoadedMetadata}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <img
                                            src={selectedMedia[0].previewUrl}
                                            alt="Preview"
                                            className="w-full h-full object-cover"
                                        />
                                    )}

                                    {/* Gradient Overlays for authentic IG readability */}
                                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80 pointer-events-none" />

                                    {/* Top Bar Header */}
                                    <div className="absolute top-7 left-4 right-4 flex items-center justify-between z-20 pointer-events-none text-white">
                                        <div className="flex items-center gap-1.5 font-bold tracking-tight text-sm drop-shadow">
                                            <span>Reels</span>
                                        </div>
                                        <button
                                            onClick={toggleMute}
                                            className="pointer-events-auto p-2 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white/90 transition-transform active:scale-95"
                                            title={isMuted ? 'Unmute' : 'Mute'}
                                        >
                                            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                                        </button>
                                    </div>

                                    {/* Center Big Play/Pause Indicator (Shows when paused) */}
                                    {!isPlaying && (
                                        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none bg-black/20">
                                            <div className="p-4 bg-black/60 backdrop-blur-md rounded-full text-white shadow-xl animate-scaleIn">
                                                <Play className="w-8 h-8 fill-white translate-x-0.5" />
                                            </div>
                                        </div>
                                    )}

                                    {/* Right Side Instagram Interaction Stack */}
                                    <div className="absolute right-3 bottom-14 flex flex-col items-center gap-4 z-20 text-white pointer-events-none">
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="p-2.5 bg-black/30 backdrop-blur-sm rounded-full">
                                                <Heart className="w-5 h-5 fill-white/10 text-white hover:text-red-500 transition-colors" />
                                            </div>
                                            <span className="text-[11px] font-semibold drop-shadow">2.4K</span>
                                        </div>

                                        <div className="flex flex-col items-center gap-1">
                                            <div className="p-2.5 bg-black/30 backdrop-blur-sm rounded-full">
                                                <MessageCircle className="w-5 h-5 text-white" />
                                            </div>
                                            <span className="text-[11px] font-semibold drop-shadow">182</span>
                                        </div>

                                        <div className="flex flex-col items-center gap-1">
                                            <div className="p-2.5 bg-black/30 backdrop-blur-sm rounded-full">
                                                <Send className="w-5 h-5 text-white" />
                                            </div>
                                            <span className="text-[11px] font-semibold drop-shadow">45</span>
                                        </div>

                                        <div className="p-2 bg-black/30 backdrop-blur-sm rounded-full">
                                            <MoreHorizontal className="w-4 h-4 text-white" />
                                        </div>

                                        {/* Spinning Vinyl Disc */}
                                        <div className="relative mt-2">
                                            <div className="w-8 h-8 rounded-full border-2 border-zinc-900 bg-zinc-800 flex items-center justify-center shadow-lg animate-spin [animation-duration:4s]">
                                                <div className="w-3 h-3 rounded-full bg-pink-500" />
                                            </div>
                                            <Music2 className="w-3 h-3 text-white absolute -top-1 -right-1 animate-bounce" />
                                        </div>
                                    </div>

                                    {/* Bottom Left Profile & Caption Overlay */}
                                    <div className="absolute bottom-6 left-3 right-16 z-20 text-white pointer-events-none space-y-2">
                                        {/* Account Profile Header */}
                                        <div className="flex items-center gap-2">
                                            <img
                                                src={activeAvatar}
                                                alt={activeUsername}
                                                className="w-8 h-8 rounded-full border border-white/40 object-cover shadow"
                                            />
                                            <span className="text-xs font-bold drop-shadow tracking-tight">
                                                {activeUsername}
                                            </span>
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-white/60 bg-white/10 backdrop-blur-sm">
                                                Follow
                                            </span>
                                        </div>

                                        {/* Live Caption Preview */}
                                        <p className="text-xs text-white/95 line-clamp-2 drop-shadow font-normal leading-relaxed">
                                            {caption || 'Add your caption on the right to preview how it looks live on Instagram...'}
                                        </p>

                                        {/* Audio Track Tag */}
                                        <div className="flex items-center gap-1.5 text-[11px] text-white/80 drop-shadow">
                                            <Music2 className="w-3 h-3 text-pink-400" />
                                            <span className="truncate max-w-[170px]">Original audio • {activeUsername}</span>
                                        </div>

                                        {/* Linked Automation Flow Badge */}
                                        {selectedAutomation && (
                                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/80 backdrop-blur-md text-[10px] font-medium text-white shadow-sm">
                                                <Zap className="w-3 h-3 fill-yellow-300 text-yellow-300" />
                                                <span className="truncate max-w-[160px]">
                                                    {automations.find(a => a.id === selectedAutomation)?.name || 'Flow Linked'}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Video Scrubber Progress Bar */}
                                    <div
                                        onClick={handleSeek}
                                        className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/20 hover:h-2.5 transition-all cursor-pointer z-30"
                                    >
                                        <div
                                            className="h-full bg-pink-500 relative transition-all"
                                            style={{ width: `${progress}%` }}
                                        >
                                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Controls Below Mockup */}
                            <div className="w-full mt-4 flex items-center justify-between gap-2 px-2">
                                <div className="text-xs text-gray-500 dark:text-zinc-400 font-mono">
                                    {formatSeconds(currentTime)} / {formatSeconds(duration)}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleBrowseFiles}
                                        className="h-8 text-xs gap-1.5 rounded-lg border-gray-300 dark:border-zinc-700"
                                    >
                                        <FolderOpen className="w-3.5 h-3.5" /> Change Video
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => removeMediaItem(0)}
                                        className="h-8 text-xs gap-1.5 rounded-lg"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> Remove
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* EMPTY STATE DROPZONE */
                        <Card
                            onDrop={handleDrop}
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            className={`w-full max-w-[340px] aspect-[9/16] rounded-[36px] border-2 border-dashed flex flex-col items-center justify-center p-8 transition-all relative overflow-hidden ${
                                isDragOver
                                    ? 'border-pink-500 bg-pink-50/20 dark:bg-pink-950/20 scale-[1.01]'
                                    : 'border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-gray-400 dark:hover:border-zinc-700'
                            }`}
                        >
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="p-4 rounded-2xl bg-gradient-to-tr from-pink-500/20 to-purple-500/20 ring-1 ring-pink-500/30">
                                    <FileVideo className="w-8 h-8 text-pink-500 dark:text-pink-400" />
                                </div>

                                <div className="space-y-1">
                                    <h3 className="font-semibold text-base text-gray-900 dark:text-white">
                                        Upload {mediaType}
                                    </h3>
                                    <p className="text-xs text-gray-500 dark:text-zinc-400 max-w-[200px]">
                                        Drag & drop your video here or browse from your computer
                                    </p>
                                </div>

                                <Button
                                    onClick={handleBrowseFiles}
                                    className="bg-black hover:bg-gray-800 text-white dark:bg-white dark:text-black dark:hover:bg-gray-100 rounded-xl gap-2 text-xs h-10 px-4 shadow"
                                >
                                    <UploadCloud className="w-4 h-4" /> Browse Files
                                </Button>

                                <div className="pt-2 text-[11px] text-gray-400 dark:text-zinc-500 space-y-1 font-mono">
                                    <div>Supports MP4, MOV (9:16)</div>
                                    <div>Max 100MB • Direct Meta Upload</div>
                                </div>
                            </div>
                        </Card>
                    )}
                </div>

                {/* RIGHT: Post Configuration Form (7 Cols) */}
                <div className="lg:col-span-7 space-y-6">
                    <Card className="border-0 shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl">
                        <CardContent className="p-6 md:p-8 space-y-6">
                            <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800/80 pb-4">
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <Sparkles className="w-5 h-5 text-pink-500" /> Post Details & Automation Link
                                </h2>
                                <span className="text-xs text-gray-400 font-mono">
                                    {mediaType} Format
                                </span>
                            </div>

                            {/* Caption Field */}
                            {mediaType !== 'STORY' && (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                                            {t('scheduler.caption_label', 'Caption')}
                                        </label>
                                        <span className="text-xs text-gray-400 font-mono">
                                            {caption.length} chars
                                        </span>
                                    </div>
                                    <Textarea
                                        placeholder="Write an engaging Instagram caption with hashtags... (e.g. Comment 'GUIDE' to get the free link sent directly to your DMs!)"
                                        className="resize-none h-32 text-sm bg-gray-50/50 dark:bg-zinc-950 border-gray-200 dark:border-zinc-800 rounded-xl focus:ring-pink-500"
                                        value={caption}
                                        onChange={(e) => setCaption(e.target.value)}
                                    />
                                </div>
                            )}

                            {/* Date & Time Picker */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                                        {t('scheduler.date_label', 'Schedule Date & Time')}
                                    </label>
                                    <span className="text-xs text-gray-400">
                                        Local Time ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                                    </span>
                                </div>
                                <Input
                                    type="datetime-local"
                                    className="h-12 text-sm bg-gray-50/50 dark:bg-zinc-950 border-gray-200 dark:border-zinc-800 rounded-xl dark:[color-scheme:dark]"
                                    value={scheduleDate}
                                    onChange={(e) => setScheduleDate(e.target.value)}
                                    min={new Date().toISOString().slice(0, 16)}
                                />
                            </div>

                            {/* Automation Flow Selector */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-zinc-300 flex items-center gap-1.5">
                                    <Zap className="w-4 h-4 text-purple-500" />
                                    {t('scheduler.automation_label', 'Link DM Automation Flow')}
                                </label>
                                <Select value={selectedAutomation} onValueChange={setSelectedAutomation}>
                                    <SelectTrigger className="h-12 text-sm bg-gray-50/50 dark:bg-zinc-950 border-gray-200 dark:border-zinc-800 rounded-xl">
                                        <SelectValue placeholder="Select a flow to trigger on comments..." />
                                    </SelectTrigger>
                                    <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800 rounded-xl">
                                        {automations.map(flow => (
                                            <SelectItem key={flow.id} value={flow.id} className="dark:text-white dark:focus:bg-zinc-800">
                                                ⚡ {flow.name}
                                            </SelectItem>
                                        ))}
                                        {automations.length === 0 && (
                                            <SelectItem value="none" disabled>No automation flows found</SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-gray-400 dark:text-zinc-500">
                                    When this Reel is published, FluxDM will automatically attach this automation flow to reply to incoming comments with DMs.
                                </p>
                            </div>

                            {/* Action Buttons */}
                            <div className="pt-4 flex flex-col sm:flex-row items-center gap-3">
                                <Button
                                    className="w-full sm:flex-1 bg-black hover:bg-gray-800 text-white dark:bg-white dark:text-black dark:hover:bg-gray-100 h-13 text-base font-semibold rounded-xl shadow-lg transition-all"
                                    onClick={() => handleSchedule(false)}
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <span className="flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" /> Scheduling...
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-2">
                                            <Clock className="w-4 h-4" /> Schedule Post
                                        </span>
                                    )}
                                </Button>

                                <Button
                                    variant="outline"
                                    className="w-full sm:w-auto h-13 text-sm font-medium rounded-xl border-pink-500/30 text-pink-600 dark:text-pink-400 hover:bg-pink-500/10 gap-2"
                                    onClick={() => handleSchedule(true)}
                                    disabled={loading}
                                    title="Publish immediately to Instagram right now to test the upload pipeline"
                                >
                                    <Zap className="w-4 h-4" /> Publish Now (Test)
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* LOWER SECTION: SCHEDULED POSTS QUEUE & STATUS MONITOR */}
            <div className="space-y-4 pt-6 border-t border-gray-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                            <Clock className="w-5 h-5 text-blue-500" /> Scheduled Posts Queue
                            <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-gray-200 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300">
                                {scheduledPosts.length}
                            </span>
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-zinc-400">
                            Monitor queued jobs, status codes, and trigger immediate manual execution.
                        </p>
                    </div>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={loadScheduledPosts}
                        disabled={loadingPosts}
                        className="h-8 text-xs gap-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingPosts ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                </div>

                {scheduledPosts.length === 0 ? (
                    <div className="p-12 text-center border border-dashed border-gray-200 dark:border-zinc-800 rounded-2xl bg-white/50 dark:bg-zinc-900/30">
                        <Clock className="w-8 h-8 mx-auto text-gray-400 dark:text-zinc-600 mb-3" />
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-zinc-300">No Scheduled Posts Yet</h3>
                        <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1 max-w-sm mx-auto">
                            Use the form above to plan and schedule your next Reel or Post. It will appear here and publish automatically.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {scheduledPosts.map((post) => {
                            const isPending = post.status === 'PENDING';
                            const isProcessing = post.status === 'PROCESSING' || isPublishingId === post.id;
                            const isPublished = post.status === 'PUBLISHED';
                            const isFailed = post.status === 'FAILED';

                            const targetDateObj = new Date(post.publish_at);
                            const formattedTime = !isNaN(targetDateObj.getTime())
                                ? targetDateObj.toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                })
                                : post.publish_at;

                            return (
                                <Card
                                    key={post.id}
                                    className="border-0 shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden hover:ring-gray-300 dark:hover:ring-zinc-700 transition-all flex flex-col justify-between"
                                >
                                    <CardContent className="p-5 space-y-4">
                                        {/* Card Header: Type & Status */}
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-400">
                                                <FileVideo className="w-3.5 h-3.5" />
                                                {post.media_type || 'REEL'}
                                            </span>

                                            {/* Status Badge */}
                                            {isPublished && (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                    <CheckCircle2 className="w-3 h-3" /> Published
                                                </span>
                                            )}
                                            {isPending && (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                    <Clock className="w-3 h-3" /> Scheduled
                                                </span>
                                            )}
                                            {isProcessing && (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                                    <Loader2 className="w-3 h-3 animate-spin" /> Publishing...
                                                </span>
                                            )}
                                            {isFailed && (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                                                    <AlertCircle className="w-3 h-3" /> Failed
                                                </span>
                                            )}
                                        </div>

                                        {/* Caption */}
                                        <p className="text-sm font-medium line-clamp-2 text-gray-800 dark:text-zinc-200">
                                            {post.caption || <span className="italic text-gray-400">No caption provided</span>}
                                        </p>

                                        {/* Metadata */}
                                        <div className="space-y-1.5 text-xs text-gray-500 dark:text-zinc-400 font-mono">
                                            <div className="flex items-center gap-1.5">
                                                <Clock className="w-3.5 h-3.5 text-gray-400" />
                                                <span>{formattedTime}</span>
                                            </div>
                                            {post.account_username && (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-blue-500">@{post.account_username}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Error Alert if Failed */}
                                        {post.error_message && (
                                            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] text-red-600 dark:text-red-400 leading-snug">
                                                <strong>Error:</strong> {post.error_message}
                                            </div>
                                        )}
                                    </CardContent>

                                    {/* Footer Actions */}
                                    <div className="p-4 pt-0 flex items-center justify-between border-t border-gray-100 dark:border-zinc-800/80 mt-2">
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={isProcessing}
                                                onClick={() => handlePublishNow(post.id)}
                                                className="h-8 text-xs font-semibold text-pink-600 dark:text-pink-400 hover:bg-pink-500/10 gap-1.5 rounded-lg"
                                            >
                                                <Zap className="w-3.5 h-3.5" />
                                                {isPublished ? 'Re-publish' : 'Publish Now'}
                                            </Button>

                                            {post.permalink && (
                                                <a
                                                    href={post.permalink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-500 hover:text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-500/10 transition-colors"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" /> View Live
                                                </a>
                                            )}
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDeletePost(post.id)}
                                            className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                            title="Delete post"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
