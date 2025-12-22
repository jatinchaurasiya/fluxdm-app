import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { UploadCloud, Trash2, Image as ImageIcon, Video, Layers, CircleDashed } from 'lucide-react';

interface AutomationFlow {
    id: string;
    name: string;
    trigger_type?: string;
}

interface ScheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedDate: Date | null;
    onSuccess: () => void;
}

type MediaType = 'REEL' | 'IMAGE' | 'CAROUSEL' | 'STORY';

export default function ScheduleModal({ isOpen, onClose, selectedDate, onSuccess }: ScheduleModalProps) {
    const [loading, setLoading] = useState(false);
    const [automations, setAutomations] = useState<AutomationFlow[]>([]);

    // Form State
    const [mediaType, setMediaType] = useState<MediaType>('REEL');
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [caption, setCaption] = useState('');
    const [scheduleDate, setScheduleDate] = useState('');
    const [selectedAutomation, setSelectedAutomation] = useState<string>('');

    // Load available automations
    useEffect(() => {
        if (isOpen) {
            loadAutomations();
        }
    }, [isOpen]);

    // Update form date when selectedDate prop changes
    useEffect(() => {
        if (selectedDate && isOpen) {
            const pad = (n: number) => n < 10 ? '0' + n : n;
            const d = new Date(selectedDate); // clone

            // If the time is exactly midnight (default from calendar click), set to 9 AM
            if (d.getHours() === 0 && d.getMinutes() === 0) {
                d.setHours(9, 0, 0, 0);
            }

            const year = d.getFullYear();
            const month = pad(d.getMonth() + 1);
            const day = pad(d.getDate());
            const hour = pad(d.getHours());
            const minute = pad(d.getMinutes());

            setScheduleDate(`${year}-${month}-${day}T${hour}:${minute}`);
        } else if (isOpen && !scheduleDate) {
            // Default to tomorrow 9am
            const now = new Date();
            now.setDate(now.getDate() + 1);
            now.setHours(9, 0, 0, 0);

            const pad = (n: number) => n < 10 ? '0' + n : n;
            const year = now.getFullYear();
            const month = pad(now.getMonth() + 1);
            const day = pad(now.getDate());
            const hour = pad(now.getHours());
            const minute = pad(now.getMinutes());

            setScheduleDate(`${year}-${month}-${day}T${hour}:${minute}`);
        }
    }, [selectedDate, isOpen]);

    const loadAutomations = async () => {
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const flowsRes = await window.ipcRenderer.invoke('get-automations');
                if (flowsRes.success) setAutomations(flowsRes.data || []);
            }
        } catch (e) {
            console.error(e);
            setAutomations([]);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFile = e.dataTransfer.files[0];
            const type = droppedFile.type;

            // Validate based on Media Type
            if (mediaType === 'REEL') {
                if (!type.startsWith('video/')) {
                    toast.error('Reels require a video file (MP4/MOV).');
                    return;
                }
            } else if (mediaType === 'IMAGE' || mediaType === 'CAROUSEL') {
                if (!type.startsWith('image/')) {
                    toast.error(`${mediaType === 'IMAGE' ? 'Posts' : 'Carousels'} require an image file.`);
                    return;
                }
            } else if (mediaType === 'STORY') {
                // Story accepts both, technically
                if (!type.startsWith('image/') && !type.startsWith('video/')) {
                    toast.error('Story requires an image or video file.');
                    return;
                }
            }

            setFile(droppedFile);
            setPreviewUrl(URL.createObjectURL(droppedFile));
            toast.success('File uploaded successfully!');
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleSchedule = async () => {
        if (!file) {
            toast.error('Please upload a file first.');
            return;
        }
        if (!scheduleDate) {
            toast.error('Please select a date and time.');
            return;
        }

        setLoading(true);
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const filePath = (file as any).path;

                // Note: The backend expects 'files' array for consistent API usually, 
                // but let's check how Scheduler.tsx did it.
                // Scheduler.tsx: files: filePaths (array), caption, date, automationId, mediaType

                // We'll wrap our single file in an array to match the likely robust backend handler
                // or just pass filePath if the handler supports legacy/single mode.
                // Let's safe-bet on sending matching structure to Scheduler.tsx if possible.
                // The previous code sent 'filePath', implying the backend handles 'filePath' OR 'files'.
                // I will stick to the previous 'filePath' property but ADD mediaType.

                // @ts-ignore
                const res = await window.ipcRenderer.invoke('schedule-post', {
                    filePath, // Keeping for backward compat if handler checks this
                    files: [filePath], // Adding this to align with Scheduler.tsx
                    caption: mediaType === 'STORY' ? '' : caption,
                    date: scheduleDate,
                    automationId: selectedAutomation || null,
                    mediaType // Vital addition
                });

                if (res.success) {
                    toast.success(`${mediaType} Scheduled successfully!`);
                    onSuccess();
                    handleClose();
                } else {
                    toast.error('Error: ' + res.error);
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

    const handleClose = () => {
        // Reset form
        setFile(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setCaption('');
        setScheduleDate('');
        setSelectedAutomation('');
        // Don't reset mediaType, user might want to schedule same type again
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="max-w-4xl p-0 overflow-hidden bg-white dark:bg-zinc-900 border-0 shadow-2xl dark:ring-1 dark:ring-white/10">
                <div className="grid md:grid-cols-2 h-[550px]">

                    {/* LEFT: Upload Area */}
                    <div
                        className={`
                            relative flex flex-col items-center justify-center p-8 border-r border-gray-100 dark:border-zinc-800 
                            transition-colors ${!previewUrl ? 'bg-gray-50 hover:bg-gray-100 dark:bg-zinc-950 dark:hover:bg-zinc-900' : 'bg-black'}
                        `}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                    >
                        {previewUrl ? (
                            <div className="relative w-full h-full flex items-center justify-center bg-black">
                                {file?.type.startsWith('video/') ? (
                                    <video
                                        src={previewUrl}
                                        controls
                                        className="max-h-full max-w-full rounded-md shadow-2xl"
                                    />
                                ) : (
                                    <img
                                        src={previewUrl}
                                        className="max-h-full max-w-full rounded-md shadow-2xl object-contain"
                                        alt="Preview"
                                    />
                                )}
                                <Button
                                    variant="destructive"
                                    size="icon"
                                    className="absolute top-4 right-4 rounded-full opacity-80 hover:opacity-100"
                                    onClick={() => { setFile(null); setPreviewUrl(null); }}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                                <div className="absolute bottom-4 left-4 bg-black/60 text-white px-3 py-1 rounded-full text-xs backdrop-blur-sm pointer-events-none uppercase">
                                    {mediaType}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center space-y-4 cursor-pointer">
                                <div className={`p-4 rounded-full w-fit mx-auto ${mediaType === 'REEL' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-500' :
                                    mediaType === 'IMAGE' ? 'bg-green-50 dark:bg-green-900/20 text-green-500' :
                                        mediaType === 'STORY' ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-500' :
                                            'bg-purple-50 dark:bg-purple-900/20 text-purple-500'
                                    }`}>
                                    {mediaType === 'REEL' && <Video className="w-8 h-8" />}
                                    {mediaType === 'IMAGE' && <ImageIcon className="w-8 h-8" />}
                                    {mediaType === 'CAROUSEL' && <Layers className="w-8 h-8" />}
                                    {mediaType === 'STORY' && <UploadCloud className="w-8 h-8" />}
                                </div>
                                <div className="space-y-1">
                                    <h3 className="font-semibold text-lg dark:text-white">Drag {mediaType.toLowerCase()} here</h3>
                                    <p className="text-sm text-gray-500 dark:text-zinc-400">or drop a file</p>
                                </div>
                                <p className="text-xs text-gray-400 dark:text-zinc-500">
                                    {mediaType === 'REEL' ? 'MP4, MOV supported' : 'JPG, PNG supported'}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: Form */}
                    <div className="p-8 flex flex-col h-full bg-white dark:bg-zinc-900">
                        <DialogHeader className="mb-6">
                            <DialogTitle className="text-2xl font-bold flex items-center gap-2 dark:text-white">
                                Schedule Post
                            </DialogTitle>
                            <DialogDescription className="dark:text-zinc-400">
                                Set the time and attach logic.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 flex-1 overflow-y-auto pr-2">

                            {/* NEW: Post Type Selector */}
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">Post Type</label>
                                <Select value={mediaType} onValueChange={(v) => { setMediaType(v as MediaType); setFile(null); setPreviewUrl(null); }}>
                                    <SelectTrigger className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-white">
                                        <SelectValue placeholder="Select type" />
                                    </SelectTrigger>
                                    <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                                        <SelectItem value="REEL" className="dark:text-white dark:focus:bg-zinc-800">
                                            <div className="flex items-center gap-2"><Video className="w-4 h-4" /> Reel (Video)</div>
                                        </SelectItem>
                                        <SelectItem value="IMAGE" className="dark:text-white dark:focus:bg-zinc-800">
                                            <div className="flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Post (Image)</div>
                                        </SelectItem>
                                        <SelectItem value="CAROUSEL" className="dark:text-white dark:focus:bg-zinc-800">
                                            <div className="flex items-center gap-2"><Layers className="w-4 h-4" /> Carousel</div>
                                        </SelectItem>
                                        <SelectItem value="STORY" className="dark:text-white dark:focus:bg-zinc-800">
                                            <div className="flex items-center gap-2"><CircleDashed className="w-4 h-4" /> Story</div>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {mediaType !== 'STORY' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium dark:text-zinc-300">Caption</label>
                                    <Textarea
                                        placeholder="Write a catchy caption..."
                                        className="resize-none h-24 dark:bg-zinc-950 dark:border-zinc-800 dark:text-white"
                                        value={caption}
                                        onChange={(e) => setCaption(e.target.value)}
                                    />
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium dark:text-zinc-300">Schedule For</label>
                                <Input
                                    type="datetime-local"
                                    className="w-full dark:bg-zinc-950 dark:border-zinc-800 dark:text-white dark:[color-scheme:dark]"
                                    value={scheduleDate}
                                    onChange={(e) => setScheduleDate(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium dark:text-zinc-300">Attach Automation</label>
                                <Select value={selectedAutomation} onValueChange={setSelectedAutomation}>
                                    <SelectTrigger className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-white">
                                        <SelectValue placeholder="Select a flow..." />
                                    </SelectTrigger>
                                    <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                                        {automations.map(flow => (
                                            <SelectItem key={flow.id} value={flow.id} className="dark:text-white dark:focus:bg-zinc-800">
                                                {flow.name} {flow.trigger_type ? `(${flow.trigger_type.replace('_', ' ')})` : ''}
                                            </SelectItem>
                                        ))}
                                        {automations.length === 0 && (
                                            <SelectItem value="none" disabled>No automation flows found</SelectItem>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="pt-6 mt-auto border-t border-gray-100 dark:border-zinc-800">
                            <Button
                                className="w-full bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-500/20"
                                onClick={handleSchedule}
                                disabled={loading}
                            >
                                {loading ? 'Scheduling...' : `Schedule ${mediaType === 'IMAGE' ? 'Post' : mediaType.charAt(0) + mediaType.slice(1).toLowerCase()}`}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
