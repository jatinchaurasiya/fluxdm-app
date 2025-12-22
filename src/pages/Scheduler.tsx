import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { FileVideo, Image as ImageIcon, Layers, CircleDashed, Trash2, X } from 'lucide-react';
import FileUploader from '@/components/scheduler/FileUploader';
import { useTranslation } from 'react-i18next';

interface AutomationFlow {
    id: string;
    name: string;
}

type MediaType = 'REEL' | 'IMAGE' | 'CAROUSEL' | 'STORY';

export default function Scheduler() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [automations, setAutomations] = useState<AutomationFlow[]>([]);

    // Form State
    const [mediaType, setMediaType] = useState<MediaType>('REEL');
    const [files, setFiles] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);

    const [caption, setCaption] = useState('');
    const [scheduleDate, setScheduleDate] = useState('');
    const [selectedAutomation, setSelectedAutomation] = useState<string>('');

    useEffect(() => {
        loadData();
        return () => {
            // Cleanup object URLs
            previews.forEach(url => URL.revokeObjectURL(url));
        };
    }, []);

    useEffect(() => {
        // Clear files when switching restrictive modes
        setFiles([]);
        setPreviews(prev => {
            prev.forEach(url => URL.revokeObjectURL(url));
            return [];
        });
    }, [mediaType]);

    const loadData = async () => {
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const flowsRes = await window.ipcRenderer.invoke('get-automations');
                if (flowsRes.success) setAutomations(flowsRes.data);

            }
        } catch (e) {
            console.error(e);
            toast.error('Failed to load automations');
        }
    };

    const processFiles = (newFiles: File[]) => {
        let validFiles: File[] = [];

        for (const file of newFiles) {
            // Validation Logic
            if (mediaType === 'REEL') {
                if (!file.type.startsWith('video/')) {
                    toast.error(`Skipped ${file.name}: Reels must be video files (MP4/MOV).`);
                    continue;
                }
                validFiles = [file]; // Only 1 file for Reel
                break; // Stop after first valid
            }
            else if (mediaType === 'IMAGE' || mediaType === 'CAROUSEL') {
                if (!file.type.startsWith('image/')) {
                    toast.error(`Skipped ${file.name}: Please upload images (JPG/PNG).`);
                    continue;
                }
                // Carousel accepts multiple, Image accepts 1
                if (mediaType === 'IMAGE') {
                    validFiles = [file];
                    break;
                } else {
                    validFiles.push(file);
                }
            }
            else if (mediaType === 'STORY') {
                // Story supports both, but typically single file for automation
                // We'll treat as single file for now
                if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
                    toast.error('Story requires image or video.');
                    continue;
                }
                validFiles = [file];
                break;
            }
        }

        if (validFiles.length > 0) {
            if (mediaType === 'CAROUSEL') {
                setFiles(prev => [...prev, ...validFiles]);
                const newPreviews = validFiles.map(f => URL.createObjectURL(f));
                setPreviews(prev => [...prev, ...newPreviews]);
                toast.success(`Added ${validFiles.length} file(s)`);
            } else {
                setFiles(validFiles);
                const newPreview = URL.createObjectURL(validFiles[0]);
                setPreviews([newPreview]);
                toast.success('File uploaded!');
            }
        }
    };

    const removeFile = (index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
        setPreviews(prev => {
            const urlToRemove = prev[index];
            URL.revokeObjectURL(urlToRemove);
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleSchedule = async () => {
        if (files.length === 0) {
            toast.error('Please upload content first.');
            return;
        }
        if (!scheduleDate) {
            toast.error('Please select a date and time.');
            return;
        }

        setLoading(true);
        try {
            // Extract paths
            // @ts-ignore
            const filePaths = files.map(f => f.path);

            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('schedule-post', {
                    files: filePaths,
                    caption: mediaType === 'STORY' ? '' : caption, // No caption for Story
                    date: scheduleDate,
                    automationId: selectedAutomation || null,
                    mediaType
                });

                if (res.success) {
                    const dateObj = new Date(scheduleDate);
                    const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    toast.success(`Post Scheduled for ${dateStr}`);
                    // Reset Form
                    setFiles([]);
                    setPreviews([]);
                    setCaption('');
                    setScheduleDate('');
                    setSelectedAutomation('');
                } else {
                    toast.error('Error: ' + res.error);
                }
            } else {
                toast.error('Desktop app required for scheduling.');
            }
        } catch (e) {
            toast.error('Scheduling failed: ' + e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8 h-full overflow-y-auto bg-gray-50/50 dark:bg-black">
            <div className="space-y-4">
                <div className="space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{t('scheduler.title')}</h1>
                    <p className="text-gray-500 dark:text-zinc-500">{t('scheduler.subtitle')}</p>
                </div>

                {/* Task 1: Format Selector */}
                <Tabs value={mediaType} onValueChange={(v) => setMediaType(v as MediaType)} className="w-full max-w-lg">
                    <TabsList className="grid w-full grid-cols-4 bg-gray-200 dark:bg-zinc-800 p-1">
                        <TabsTrigger value="REEL" className="gap-2 dark:data-[state=active]:bg-zinc-900 dark:text-zinc-400 dark:data-[state=active]:text-white"><FileVideo className="w-4 h-4" /> {t('scheduler.types.REEL')}</TabsTrigger>
                        <TabsTrigger value="IMAGE" className="gap-2 dark:data-[state=active]:bg-zinc-900 dark:text-zinc-400 dark:data-[state=active]:text-white"><ImageIcon className="w-4 h-4" /> {t('scheduler.types.IMAGE')}</TabsTrigger>
                        <TabsTrigger value="CAROUSEL" className="gap-2 dark:data-[state=active]:bg-zinc-900 dark:text-zinc-400 dark:data-[state=active]:text-white"><Layers className="w-4 h-4" /> {t('scheduler.types.CAROUSEL')}</TabsTrigger>
                        <TabsTrigger value="STORY" className="gap-2 dark:data-[state=active]:bg-zinc-900 dark:text-zinc-400 dark:data-[state=active]:text-white"><CircleDashed className="w-4 h-4" /> {t('scheduler.types.STORY')}</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div className="grid md:grid-cols-2 gap-8 h-[600px]">

                {/* LEFT: Media Upload */}
                <Card className="h-full border-0 shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                    <CardContent className="p-0 h-full flex flex-col">

                        {/* Task 2: Dynamic Upload Zone */}
                        <FileUploader
                            mediaType={mediaType}
                            onFileSelect={(newFiles) => {
                                // Delegate to existing process logic which handles appending vs replacing
                                processFiles(newFiles);
                            }}
                        >
                            {/* PREVIEW CONTENT RENDERED AS CHILDREN */}

                            {/* Single File View (Reel/Image/Story) */}
                            {files.length > 0 && mediaType !== 'CAROUSEL' && (

                                <div className="relative w-full h-full flex items-center justify-center">
                                    {mediaType === 'REEL' || (mediaType === 'STORY' && files[0].type.startsWith('video/')) ? (
                                        <video
                                            src={previews[0]}
                                            controls
                                            className="max-h-full max-w-full rounded-md shadow-2xl"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    ) : (
                                        <img src={previews[0]} className="max-h-full max-w-full rounded-md shadow-2xl object-contain cursor-pointer" alt="Preview" />
                                    )}
                                    <Button
                                        variant="destructive"
                                        size="icon"
                                        aria-label="Remove file"
                                        className="absolute top-4 right-4 rounded-full opacity-80 hover:opacity-100"
                                        onClick={(e) => {
                                            e.stopPropagation(); // Prevent re-triggering selector
                                            removeFile(0);
                                        }}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                    <div className="absolute bottom-4 left-4 bg-black/60 text-white px-3 py-1 rounded-full text-xs backdrop-blur-sm pointer-events-none">
                                        {mediaType} Output
                                    </div>
                                </div>
                            )
                            }

                            {/* Carousel View */}
                            {files.length > 0 && mediaType === 'CAROUSEL' && (
                                <div className="w-full h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
                                    {/* Main Preview */}
                                    <div className="flex-1 flex items-center justify-center relative bg-zinc-950/50 rounded-lg overflow-hidden mb-4 border border-zinc-800">
                                        <img src={previews[previews.length - 1]} className="max-h-full max-w-full object-contain" alt="Latest" />
                                        <div className="absolute top-2 left-2 text-white text-xs bg-black/50 px-2 py-1 rounded">Latest Upload</div>
                                    </div>

                                    {/* Thumbnails Scroll */}
                                    <div className="h-24 flex gap-3 overflow-x-auto p-2 bg-gray-100 dark:bg-zinc-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                        {previews.map((url, idx) => (
                                            <div key={idx} className="relative group min-w-[80px] w-20 h-20 rounded-md overflow-hidden ring-1 ring-gray-300 dark:ring-gray-600 flex-shrink-0">
                                                <img src={url} className="w-full h-full object-cover" alt={`Preview ${idx + 1}`} />
                                                <button
                                                    aria-label={`Remove file ${idx + 1}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        removeFile(idx);
                                                    }}
                                                    className="absolute top-0 right-0 p-1 bg-red-600 text-white rounded-bl-md opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                                <div className="absolute bottom-0 left-0 bg-black/60 text-white text-[10px] px-1 w-full text-center">
                                                    {idx + 1}
                                                </div>
                                            </div>
                                        ))}
                                        {/* Drop More Button */}
                                        <div className="min-w-[80px] w-20 h-20 rounded-md border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400 cursor-pointer hover:bg-white/50 transition-colors">
                                            <p className="text-[10px] text-center font-medium">Add<br />More</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </FileUploader>
                    </CardContent>
                </Card>

                {/* RIGHT: Details Form */}
                <Card className="h-full border-0 shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 bg-white dark:bg-zinc-900">
                    <CardContent className="p-8 flex flex-col h-full space-y-6">
                        <div>
                            <h3 className="font-semibold mb-6 flex items-center gap-2 text-lg dark:text-white">
                                {mediaType === 'REEL' && <FileVideo className="w-5 h-5" />}
                                {mediaType === 'IMAGE' && <ImageIcon className="w-5 h-5" />}
                                {mediaType === 'CAROUSEL' && <Layers className="w-5 h-5" />}
                                {mediaType === 'STORY' && <CircleDashed className="w-5 h-5" />}
                                {t('scheduler.details_label', { type: t(`scheduler.types.${mediaType}`) })}
                            </h3>

                            <div className="space-y-6">
                                {/* Task 3: Hide Caption for Story */}
                                {mediaType !== 'STORY' && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">{t('scheduler.caption_label')}</label>
                                        <Textarea
                                            placeholder={t('scheduler.caption_placeholder')}
                                            className="resize-none h-32 text-base bg-white dark:bg-zinc-950 border-gray-200 dark:border-zinc-800 dark:text-white"
                                            value={caption}
                                            onChange={(e) => setCaption(e.target.value)}
                                        />
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">{t('scheduler.date_label')}</label>
                                    <Input
                                        type="datetime-local"
                                        className="h-12 text-base bg-white dark:bg-zinc-950 border-gray-200 dark:border-zinc-800 dark:text-white dark:[color-scheme:dark]"
                                        value={scheduleDate}
                                        onChange={(e) => setScheduleDate(e.target.value)}
                                        min={new Date().toISOString().slice(0, 16)}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">{t('scheduler.automation_label')}</label>
                                    <Select value={selectedAutomation} onValueChange={setSelectedAutomation}>
                                        <SelectTrigger className="h-12 text-base bg-white dark:bg-zinc-950 border-gray-200 dark:border-zinc-800 dark:text-white">
                                            <SelectValue placeholder={t('scheduler.select_flow')} />
                                        </SelectTrigger>
                                        <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                                            {automations.map(flow => (
                                                <SelectItem key={flow.id} value={flow.id} className="dark:text-white dark:focus:bg-zinc-800">
                                                    {flow.name}
                                                </SelectItem>
                                            ))}
                                            {automations.length === 0 && (
                                                <SelectItem value="none" disabled>{t('scheduler.no_flows', 'No automation flows found')}</SelectItem> /* I missed no_flows but fallbacks are fine */
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-gray-400 dark:text-zinc-500">
                                        {t('scheduler.automation_helper')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-auto pt-4">
                            <Button
                                className="w-full bg-black hover:bg-gray-800 text-white dark:bg-white dark:text-black dark:hover:bg-gray-200 h-14 text-lg font-semibold shadow-lg transition-all hover:scale-[1.01]"
                                onClick={handleSchedule}
                                disabled={loading}
                                isLoading={loading}
                            >
                                {loading ? 'Scheduling...' : t('scheduler.schedule_button')}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

        </div>
    );
}
