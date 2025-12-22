"use client"

import * as React from "react"
import {
    add,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isEqual,
    isSameDay,
    isSameMonth,
    isToday,
    startOfMonth,
    startOfToday,
    startOfWeek,
} from "date-fns"
// Import locales
import { enUS, es, ptBR, de } from "date-fns/locale"
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    PlusIcon,
    Calendar as CalendarIcon,
    Clock,
    Image,
    FileVideo,
    Layers,
    CircleDashed,
    Trash2,
    Zap,
    Edit3,
    BarChart2
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from 'sonner'

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import FileUploader from "@/components/scheduler/FileUploader"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { AccountabilitySidebar } from "@/components/calendar/AccountabilitySidebar"

export interface Event {
    id: number
    name: string
    time: string
    datetime: string
    status?: string
    type?: 'post' | 'reminder' | 'other'
    caption?: string
    automationId?: string
    mediaType?: string
    files?: string[]
}

export interface CalendarData {
    day: Date
    events: Event[]
}

interface FullScreenCalendarProps {
    data: CalendarData[]
    onRefresh?: () => void
}

const localeMap: Record<string, any> = {
    en: enUS,
    es: es,
    pt: ptBR,
    de: de,
}

interface AutomationFlow {
    id: string;
    name: string;
    nodes_json?: string;
    trigger_keyword?: string;
    trigger_type?: string;
}

export function FullScreenCalendar({ data, onRefresh }: FullScreenCalendarProps) {
    const { t, i18n } = useTranslation()
    const currentLocale = localeMap[i18n.language] || enUS

    const today = startOfToday()
    const [selectedDay, setSelectedDay] = React.useState(today)
    const [currentMonth, setCurrentMonth] = React.useState(today)
    const [direction, setDirection] = React.useState(0)

    // Scheduler State
    const [isDialogOpen, setIsDialogOpen] = React.useState(false)
    const [editMode, setEditMode] = React.useState(false)
    const [selectedEventId, setSelectedEventId] = React.useState<number | null>(null)

    const [newEventType, setNewEventType] = React.useState<string>('POST') // POST, REEL, CAROUSEL, STORY
    const [files, setFiles] = React.useState<File[]>([])
    const [previews, setPreviews] = React.useState<string[]>([])
    // We treat 'files' as pure File objects for *uploads*.
    // For *editing*, we might display existing remote URLs which we can't easily convert to File objects.
    // So we'll have a separate 'existingFiles' state or just use previews if we can load them.
    // For now, "Editing" media is disabled as per typical requirements (usually re-schedule), 
    // but caption/time editing is enabled.

    const [caption, setCaption] = React.useState("")
    const [scheduleTime, setScheduleTime] = React.useState("12:00")

    // Automation State
    const [automations, setAutomations] = React.useState<AutomationFlow[]>([])
    const [selectedAutomation, setSelectedAutomation] = React.useState<string>("none")
    const [isLoading, setIsLoading] = React.useState(false)

    // Automation Management State
    const [editingAutomation, setEditingAutomation] = React.useState<AutomationFlow | null>(null)
    const [isEditAutoDialogOpen, setIsEditAutoDialogOpen] = React.useState(false)
    const [autoForm, setAutoForm] = React.useState({
        name: '',
        trigger_keyword: '',
        reply_text: '', // Derived from nodes_json for wizard flows
        isVisual: false
    })

    const handleAutomationClick = (flow: AutomationFlow) => {
        let isVisual = false;
        let replyText = '';

        try {
            const nodes = JSON.parse(flow.nodes_json || '{}');
            if (Array.isArray(nodes)) {
                isVisual = true;
            } else {
                // Wizard Config
                replyText = nodes.reply_text || '';
            }
        } catch (e) { isVisual = true; } // Fallback to visual if parse fails

        setAutoForm({
            name: flow.name,
            trigger_keyword: flow.trigger_keyword || '',
            reply_text: replyText,
            isVisual
        })
        setEditingAutomation(flow)
        setIsEditAutoDialogOpen(true)
    }

    const handleUpdateAutomation = async () => {
        if (!editingAutomation) return
        setIsLoading(true)
        try {
            // Re-construct the data payload similar to Wizard
            // @ts-ignore
            if (window.ipcRenderer) {
                // Check if we are updating a Wizard flow or just metadata of Visual flow
                // For now, if Visual, we only allow rename/keyword edit to avoid breaking logic? 
                // Or just basic metadata. 
                // Let's assume User mainly wants to fix typos in Wizard flows here.

                let payload: any = {
                    id: editingAutomation.id,
                    name: autoForm.name,
                    trigger_keyword: autoForm.trigger_keyword
                }

                if (!autoForm.isVisual) {
                    // It's a wizard flow, we need to preserve other settings but update text
                    const currentConfig = JSON.parse(editingAutomation.nodes_json || '{}');
                    payload = {
                        ...payload,
                        // Pass flattened fields exactly as save-flow expects for Wizard mode
                        reply_text: autoForm.reply_text,
                        dm_text: currentConfig.dm_text,
                        hook_text: currentConfig.hook_text,
                        verification_keyword: currentConfig.verification_keyword,
                        is_follow_gated: currentConfig.is_follow_gated,
                        gate_text: currentConfig.gate_text,
                        reward_text: currentConfig.reward_text,
                        reward_link: currentConfig.reward_link,
                        settings: currentConfig.settings,
                        // explicitly tell backend this is NOT visual nodes array
                        nodes: null
                    }
                } else {
                    // Visual Flow - We only updated metadata here effectively unless we redirect
                    // To keep it safe, we might skip updating nodes_json for Visual flows via this dialog
                    // BUT save-flow expects 'nodes' for visual or flattened for wizard. 
                    // If we send partial, we might overwrite. 
                    // Strategy: Only Name/Keyword update for Visual Flow here.
                    // We need to fetch current nodes/edges to re-save them or use a specific update-metadata handler?
                    // 'save-flow' does CONFLICT(id) update. 
                    // We should probably just redirect visual flows to builder.
                    // But for now let's just handle Wizard text updates.
                }

                // @ts-ignore
                const res = await window.ipcRenderer.invoke('save-flow', payload);
                if (res.success) {
                    toast.success("Automation Updated")
                    setIsEditAutoDialogOpen(false)
                    loadAutomations()
                } else {
                    toast.error("Failed update: " + res.error)
                }
            }
        } catch (e: any) {
            toast.error(e.message)
        } finally {
            setIsLoading(false)
        }
    }

    const handleDeleteAutomation = async () => {
        if (!editingAutomation) return
        if (!confirm("Delete this automation? This cannot be undone.")) return

        setIsLoading(true)
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('delete-flow', editingAutomation.id);
                if (res.success) {
                    toast.success("Automation Deleted")
                    setIsEditAutoDialogOpen(false)
                    loadAutomations()
                }
            }
        } catch (e) { console.error(e) }
        finally { setIsLoading(false) }
    }

    const firstDayCurrentMonth = startOfMonth(currentMonth)

    const days = eachDayOfInterval({
        start: startOfWeek(firstDayCurrentMonth, { locale: currentLocale }),
        end: endOfWeek(endOfMonth(firstDayCurrentMonth), { locale: currentLocale }),
    })

    React.useEffect(() => {
        loadAutomations()
        return () => {
            previews.forEach(url => URL.revokeObjectURL(url))
        }
    }, [])

    const loadAutomations = async () => {
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const flowsRes = await window.ipcRenderer.invoke('get-automations');
                if (flowsRes.success) setAutomations(flowsRes.data);
            }
        } catch (e) {
            console.error("Failed to load automations", e)
        }
    }

    function previousMonth() {
        setDirection(-1)
        setCurrentMonth(add(firstDayCurrentMonth, { months: -1 }))
    }

    function nextMonth() {
        setDirection(1)
        setCurrentMonth(add(firstDayCurrentMonth, { months: 1 }))
    }

    function goToToday() {
        setDirection(today > currentMonth ? 1 : -1)
        setCurrentMonth(today)
        setSelectedDay(today)
    }

    function handleDayClick(day: Date) {
        setEditMode(false)
        setSelectedEventId(null)
        setSelectedDay(day)

        // Reset form to defaults
        setNewEventType('POST')
        setFiles([])
        previews.forEach(url => URL.revokeObjectURL(url))
        setPreviews([])

        setCaption("")
        setScheduleTime("12:00")
        setSelectedAutomation("none")
        setIsDialogOpen(true)
    }

    function handleEventClick(e: React.MouseEvent, event: Event) {
        e.stopPropagation()
        setEditMode(true)
        setSelectedEventId(event.id)
        setSelectedDay(new Date(event.datetime))

        // Pre-fill form
        setNewEventType(event.mediaType || 'POST')
        setCaption(event.caption || "")

        const d = new Date(event.datetime)
        const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
        setScheduleTime(timeStr)

        setSelectedAutomation(event.automationId ? event.automationId.toString() : "none")

        // For existing files, we'll likely pass paths. 
        // Showing them as "previews" if they are local paths might work if allowed by browser security context (electron usually fine).
        // If they are local paths, we can try to set them.
        if (event.files && event.files.length > 0) {
            // In a real app we might need to convert 'path' to 'file://' URL or similar
            // For now we'll just not show them in the uploader to avoid complexity, 
            // OR we can try to show a placeholder.
            // Let's rely on user not changing media for now.
            setFiles([])
            setPreviews([]) // We won't show preview for existing to avoid confusion with new uploads
        } else {
            setFiles([])
            setPreviews([])
        }

        setIsDialogOpen(true)
    }

    const handleFileSelect = (newFiles: File[]) => {
        if (editMode) {
            toast.info("Media cannot be changed after scheduling. Please delete and recreate if needed.")
            return
        }

        if (newFiles.length === 0) return

        let finalFiles: File[] = []
        let finalPreviews: string[] = []

        if (newEventType === 'CAROUSEL') {
            finalFiles = [...files, ...newFiles]
            const newUrls = newFiles.map(f => URL.createObjectURL(f))
            finalPreviews = [...previews, ...newUrls]
        } else {
            finalFiles = [newFiles[0]]
            previews.forEach(url => URL.revokeObjectURL(url))
            finalPreviews = [URL.createObjectURL(newFiles[0])]
        }

        setFiles(finalFiles)
        setPreviews(finalPreviews)
    }

    const removeFile = (index: number, e: React.MouseEvent) => {
        e.stopPropagation()
        if (editMode) return

        const newFiles = [...files]
        const newPreviews = [...previews]

        URL.revokeObjectURL(newPreviews[index])

        newFiles.splice(index, 1)
        newPreviews.splice(index, 1)

        setFiles(newFiles)
        setPreviews(newPreviews)
    }

    const handleSchedule = async () => {
        if (!editMode && files.length === 0) {
            toast.error("Please upload content first.")
            return
        }

        setIsLoading(true)
        try {
            const [hours, minutes] = scheduleTime.split(':')
            const postDate = new Date(selectedDay)
            postDate.setHours(parseInt(hours), parseInt(minutes), 0, 0)
            const dateISO = postDate.toISOString()
            const autoId = selectedAutomation === 'none' ? null : selectedAutomation

            // @ts-ignore
            if (window.ipcRenderer) {
                if (editMode && selectedEventId) {
                    // UPDATE
                    // @ts-ignore
                    const res = await window.ipcRenderer.invoke('update-scheduled-post', {
                        id: selectedEventId,
                        caption: caption,
                        date: dateISO,
                        automationId: autoId
                    });
                    if (res.success) {
                        toast.success("Post updated successfully")
                        setIsDialogOpen(false)
                        onRefresh?.()
                    } else {
                        toast.error("Failed to update: " + res.error)
                    }
                } else {
                    // CREATE
                    // @ts-ignore
                    const filePaths = files.map(f => f.path)
                    // @ts-ignore
                    const res = await window.ipcRenderer.invoke('schedule-post', {
                        files: filePaths,
                        caption: newEventType === 'STORY' ? '' : caption,
                        date: dateISO,
                        automationId: autoId,
                        mediaType: newEventType
                    });

                    if (res.success) {
                        toast.success("Content Scheduled Successfully")
                        setIsDialogOpen(false)
                        onRefresh?.()
                    } else {
                        toast.error("Failed to schedule: " + res.error)
                    }
                }
            } else {
                toast.success("Success (Mock Mode)")
                setIsDialogOpen(false)
                onRefresh?.()
            }
        } catch (e: any) {
            toast.error("Error: " + e.message)
        } finally {
            setIsLoading(false)
        }
    }

    const handleDelete = async () => {
        if (!selectedEventId) return
        if (!confirm("Are you sure you want to delete this scheduled post?")) return

        setIsLoading(true)
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('delete-scheduled-post', { id: selectedEventId });
                if (res.success) {
                    toast.success("Post deleted")
                    setIsDialogOpen(false)
                    onRefresh?.()
                } else {
                    toast.error("Failed to delete")
                }
            }
        } catch (e) { console.error(e) }
        finally { setIsLoading(false) }
    }

    const weekDays = React.useMemo(() => {
        const start = startOfWeek(new Date(), { locale: currentLocale })
        return Array.from({ length: 7 }).map((_, i) => {
            const day = add(start, { days: i })
            return format(day, "eee", { locale: currentLocale })
        })
    }, [currentLocale])

    // Animation Variants
    const variants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 50 : -50,
            opacity: 0,
        }),
        center: {
            x: 0,
            opacity: 1,
        },
        exit: (direction: number) => ({
            x: direction < 0 ? 50 : -50,
            opacity: 0,
        }),
    }

    const renderPreview = () => {
        if (editMode) {
            return (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-zinc-900 text-gray-400">
                    <Edit3 className="w-10 h-10 mb-2 opacity-20" />
                    <p className="text-sm">Media editing disabled</p>
                </div>
            )
        }

        if (files.length === 0) return null

        if (newEventType === 'CAROUSEL') {
            return (
                <div className="w-full h-full relative" onClick={(e) => e.stopPropagation()}>
                    <div className="absolute inset-0 flex items-center justify-center p-2">
                        <div className="grid grid-cols-2 gap-2 w-full h-full overflow-y-auto">
                            {previews.map((url, idx) => (
                                <div key={idx} className="relative aspect-square rounded-md overflow-hidden bg-black/10">
                                    <img src={url} className="w-full h-full object-cover" alt="prev" />
                                    <button onClick={(e) => removeFile(idx, e)} aria-label="Remove item" className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-sm hover:scale-110 transition-transform">
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )
        }

        // Single File (Post, Reel, Story)
        const isVideo = files[0].type.startsWith('video/')
        return (
            <div className="w-full h-full relative flex items-center justify-center bg-black/5" onClick={(e) => e.stopPropagation()}>
                {isVideo ? (
                    <video src={previews[0]} className="max-w-full max-h-full rounded-md" controls />
                ) : (
                    <img src={previews[0]} className="max-w-full max-h-full object-contain rounded-md" alt="preview" />
                )}
                <button onClick={(e) => removeFile(0, e)} aria-label="Remove media" className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 shadow-md hover:scale-110 transition-transform">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        )
    }

    const upcomingPosts = React.useMemo(() => {
        const now = new Date()
        return data
            .flatMap(d => d.events)
            .filter(e => e.status === 'PENDING' && new Date(e.datetime) > now)
            .sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())
            .slice(0, 5) // Show top 5
    }, [data])

    const stats = React.useMemo(() => {
        const allEvents = data.flatMap(d => d.events)
        return {
            total: allEvents.length,
            pending: allEvents.filter(e => e.status === 'PENDING').length,
            published: allEvents.filter(e => e.status === 'PUBLISHED').length,
            failed: allEvents.filter(e => e.status === 'FAILED').length
        }
    }, [data])

    return (
        <div className="flex flex-col h-full bg-gray-50/50 dark:bg-black overflow-hidden font-sans">
            <div className="flex-1 flex flex-col p-4 md:p-8 h-full overflow-hidden">
                {/* Header Section */}
                <div className="flex flex-wrap items-center justify-between mb-8 gap-4 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-3 shadow-sm">
                            <CalendarIcon className="w-6 h-6 text-gray-900 dark:text-white" />
                        </div>
                        <div>
                            <div className="flex items-baseline gap-3">
                                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white capitalize tracking-tight">
                                    {format(currentMonth, "MMMM", { locale: currentLocale })}
                                </h2>
                                <span className="text-lg md:text-xl font-medium text-gray-400 dark:text-zinc-600">
                                    {format(currentMonth, "yyyy", { locale: currentLocale })}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 md:gap-2 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm ml-auto sm:ml-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={previousMonth}
                            className="hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg h-9 w-9"
                        >
                            <ChevronLeftIcon className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={goToToday}
                            className="font-medium px-3 md:px-4 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg h-9 text-xs md:text-sm"
                        >
                            {t('calendar.today', 'Today')}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={nextMonth}
                            className="hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg h-9 w-9"
                        >
                            <ChevronRightIcon className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="flex gap-2">
                        {/* Accountability Sidebar Trigger */}
                        <Sheet>
                            <SheetTrigger asChild>
                                <Button variant="outline" className="bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 shadow-sm rounded-xl h-11 px-4">
                                    <BarChart2 className="w-4 h-4 mr-2" />
                                    <span className="hidden md:inline">{t('calendar.metrics.title', 'Metrics')}</span>
                                </Button>
                            </SheetTrigger>
                            <SheetContent className="w-[400px] sm:w-[540px] p-0 bg-white dark:bg-zinc-950 border-l border-gray-200 dark:border-zinc-800">
                                <AccountabilitySidebar
                                    stats={stats}
                                    upcomingPosts={upcomingPosts}
                                    automations={automations}
                                    t={t}
                                    onEventClick={handleEventClick}
                                    onAutomationClick={handleAutomationClick}
                                />
                            </SheetContent>
                        </Sheet>

                        <Button onClick={() => handleDayClick(today)} className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black shadow-sm rounded-xl h-11 px-4 md:px-6">
                            <PlusIcon className="w-4 h-4 md:mr-2" />
                            <span className="hidden md:inline">{t('calendar.new_event', 'Schedule Content')}</span>
                        </Button>
                    </div>
                </div>

                {/* Calendar Grid Container */}
                <div className="flex-1 min-h-[600px] bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl shadow-sm flex flex-col overflow-hidden ring-1 ring-black/5 dark:ring-white/5">

                    {/* Days Header */}
                    <div className="grid grid-cols-7 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/30 dark:bg-zinc-900/50 shrink-0">
                        {weekDays.map((day) => (
                            <div key={day} className="py-4 text-center text-xs font-semibold text-gray-500 dark:text-zinc-500 uppercase tracking-widest">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Days Grid */}
                    <div className="flex-1 relative overflow-hidden">
                        <AnimatePresence initial={false} custom={direction} mode="popLayout">
                            <motion.div
                                key={currentMonth.toISOString()}
                                custom={direction}
                                variants={variants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                className="absolute inset-0 grid grid-cols-7 grid-rows-5 md:grid-rows-6"
                            >
                                {days.map((day) => {
                                    const isSelected = isEqual(day, selectedDay)
                                    const isCurrentMonth = isSameMonth(day, firstDayCurrentMonth)
                                    const isDateToday = isToday(day)
                                    const dayEvents = data.filter((d) => isSameDay(d.day, day)).flatMap(d => d.events)

                                    return (
                                        <div
                                            key={day.toString()}
                                            onClick={() => handleDayClick(day)}
                                            className={cn(
                                                "relative border-b border-r border-gray-100 dark:border-zinc-800/50 p-2 transition-all duration-200 cursor-pointer group flex flex-col",
                                                !isCurrentMonth && "bg-gray-50/30 dark:bg-zinc-950/30 text-gray-400 dark:text-zinc-700",
                                                isCurrentMonth && "bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800/20",
                                                isSelected && "bg-blue-50/30 dark:bg-blue-900/10"
                                            )}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span
                                                    className={cn(
                                                        "text-sm font-medium w-8 h-8 flex items-center justify-center rounded-full transition-all",
                                                        isDateToday && "bg-black text-white dark:bg-white dark:text-black shadow-lg scale-110",
                                                        !isDateToday && isSelected && "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
                                                        !isDateToday && !isSelected && "text-gray-700 dark:text-zinc-300 group-hover:bg-gray-100 dark:group-hover:bg-zinc-800"
                                                    )}
                                                >
                                                    {format(day, "d")}
                                                </span>
                                                {dayEvents.length > 0 && (
                                                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 md:hidden">
                                                        {dayEvents.length}
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Events List */}
                                            <div className="flex-1 space-y-1 overflow-y-auto custom-scrollbar">
                                                {dayEvents.slice(0, 4).map((event) => (
                                                    <motion.div
                                                        onClick={(e) => handleEventClick(e, event)}
                                                        initial={{ opacity: 0, y: 5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        key={event.id}
                                                        className={cn(
                                                            "hidden md:flex text-xs px-2 py-1.5 rounded-lg border w-full items-center gap-1.5 truncate shadow-sm transition-transform hover:scale-[1.02] cursor-pointer hover:border-blue-300 dark:hover:border-blue-700",
                                                            "bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-zinc-200"
                                                        )}
                                                    >
                                                        <div className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                                                            event.status === 'PUBLISHED' ? "bg-green-500" :
                                                                event.status === 'FAILED' ? "bg-red-500" : "bg-blue-500"
                                                        )} />
                                                        <span className="truncate font-medium">{event.name}</span>
                                                        <span className="text-[10px] text-gray-400 dark:text-zinc-500 ml-auto hidden xl:inline-block">
                                                            {event.time}
                                                        </span>
                                                    </motion.div>
                                                ))}
                                                {dayEvents.length > 4 && (
                                                    <div className="hidden md:block text-[10px] text-center text-gray-400 font-medium mt-1">
                                                        +{dayEvents.length - 4} more
                                                    </div>
                                                )}
                                            </div>

                                            {/* Mobile Dots */}
                                            <div className="flex md:hidden gap-0.5 mt-auto justify-center flex-wrap">
                                                {dayEvents.map(e => (
                                                    <div key={e.id} className="w-1 h-1 rounded-full bg-blue-500" />
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            {/* Schedule/Start Content Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-[800px] bg-white dark:bg-zinc-950 border-gray-200 dark:border-zinc-800 p-0 overflow-hidden gap-0">
                    <div className="px-6 py-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between bg-gray-50/50 dark:bg-zinc-900/50">
                        <div>
                            <DialogTitle className="text-xl font-bold dark:text-white flex items-center gap-2">
                                {editMode ? <Edit3 className="w-5 h-5 text-blue-600 dark:text-blue-400" /> : <PlusIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
                                {editMode ? 'Manage Content' : t('calendar.schedule_content', 'Schedule Content')}
                            </DialogTitle>
                            <DialogDescription className="text-gray-500 dark:text-zinc-400 text-sm font-medium mt-0.5">
                                {format(selectedDay, "EEEE, MMMM do yyyy", { locale: currentLocale })}
                            </DialogDescription>
                        </div>
                        {editMode && (
                            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isLoading} className="h-8 gap-2">
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                            </Button>
                        )}
                    </div>

                    <div className="flex flex-col md:flex-row h-[500px]"> {/* Fixed height container logic */}

                        {/* LEFT: Types & Upload */}
                        <div className="w-full md:w-[45%] p-6 border-r border-gray-100 dark:border-zinc-800 flex flex-col gap-6">

                            {/* Content Type Selector - Disabled in Edit Mode */}
                            <div className={cn("grid grid-cols-4 gap-2", editMode && "opacity-50 pointer-events-none")}>
                                {[
                                    { id: 'POST', label: 'Post', icon: Image },
                                    { id: 'REEL', label: 'Reel', icon: FileVideo },
                                    { id: 'CAROUSEL', label: 'Carousel', icon: Layers },
                                    { id: 'STORY', label: 'Story', icon: CircleDashed },
                                ].map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => {
                                            if (!editMode && type.id !== newEventType) { // Clear files on switch logic if strict about it, or keep it. Keeping for now but FileUploader handles logic if we pass files there
                                                setNewEventType(type.id)
                                                setFiles([])
                                                setPreviews([])
                                            }
                                        }}
                                        className={cn(
                                            "flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border transition-all duration-200",
                                            newEventType === type.id
                                                ? "bg-black text-white dark:bg-white dark:text-black border-transparent shadow-md transform scale-[1.02]"
                                                : "bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800 text-gray-600 dark:text-zinc-400 hover:border-gray-300 dark:hover:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800"
                                        )}
                                    >
                                        <type.icon className="w-4 h-4" />
                                        <span className="text-[10px] font-bold uppercase">{type.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Uploader */}
                            <div className="flex-1 relative rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-800">
                                <FileUploader
                                    mediaType={newEventType as any}
                                    onFileSelect={handleFileSelect}
                                >
                                    {renderPreview()}
                                </FileUploader>
                            </div>
                        </div>

                        {/* RIGHT: Details Form */}
                        <div className="w-full md:w-[55%] p-6 flex flex-col gap-5 overflow-y-auto">

                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-wider">Caption</Label>
                                <Textarea
                                    value={caption}
                                    onChange={(e) => setCaption(e.target.value)}
                                    placeholder={newEventType === 'STORY' ? "Stories don't usually have captions, but you can add notes here." : "Write a catchy caption..."}
                                    className="resize-none bg-white dark:bg-zinc-900 dark:border-zinc-800 dark:text-white text-sm p-3 min-h-[120px] focus-visible:ring-1 focus-visible:ring-black dark:focus-visible:ring-white"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-wider">Time</Label>
                                    <div className="relative">
                                        <Clock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 dark:text-zinc-500" />
                                        <Input
                                            type="time"
                                            value={scheduleTime}
                                            onChange={(e) => setScheduleTime(e.target.value)}
                                            className="pl-9 bg-white dark:bg-zinc-900 dark:border-zinc-800 dark:text-white"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                                        Automation <Zap className="w-3 h-3 text-yellow-500" />
                                    </Label>
                                    <Select value={selectedAutomation} onValueChange={setSelectedAutomation}>
                                        <SelectTrigger className="bg-white dark:bg-zinc-900 dark:border-zinc-800 dark:text-white">
                                            <SelectValue placeholder="Select Flow" />
                                        </SelectTrigger>
                                        <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                                            <SelectItem value="none" className="dark:text-zinc-400">None</SelectItem>
                                            {automations.map(flow => (
                                                <SelectItem key={flow.id} value={flow.id.toString()} className="dark:text-white">
                                                    {flow.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="mt-auto pt-4 border-t border-gray-100 dark:border-zinc-800 flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white">
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleSchedule}
                                    disabled={isLoading}
                                    className="bg-black text-white dark:bg-white dark:text-black shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] px-8"
                                >
                                    {isLoading ? (editMode ? "Updating..." : "Scheduling...") : (editMode ? "Update Content" : `Schedule ${newEventType.charAt(0) + newEventType.slice(1).toLowerCase()}`)}
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Manage Automation Dialog */}
            <Dialog open={isEditAutoDialogOpen} onOpenChange={setIsEditAutoDialogOpen}>
                <DialogContent className="sm:max-w-[500px] bg-white dark:bg-zinc-950 border-gray-200 dark:border-zinc-800">
                    <DialogTitle className="dark:text-white">{t('calendar.automation.manage_title')}</DialogTitle>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label className="text-xs uppercase font-bold text-gray-500">{t('calendar.automation.name_label')}</Label>
                            <Input
                                value={autoForm.name}
                                onChange={(e) => setAutoForm({ ...autoForm, name: e.target.value })}
                                className="bg-gray-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-white"
                            />
                        </div>
                        {autoForm.isVisual ? (
                            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-900/30 rounded-lg text-yellow-700 dark:text-yellow-400 text-sm">
                                {t('calendar.automation.visual_warning')}
                                <div className="mt-2 text-xs text-gray-500">{t('calendar.automation.visual_warning_desc')}</div>
                            </div>
                        ) : (
                            <>
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase font-bold text-gray-500">{t('calendar.automation.keyword_label')}</Label>
                                    <Input
                                        value={autoForm.trigger_keyword}
                                        onChange={(e) => setAutoForm({ ...autoForm, trigger_keyword: e.target.value })}
                                        className="bg-gray-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-white"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase font-bold text-gray-500">{t('calendar.automation.reply_label')}</Label>
                                    <Textarea
                                        value={autoForm.reply_text}
                                        onChange={(e) => setAutoForm({ ...autoForm, reply_text: e.target.value })}
                                        className="bg-gray-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-white min-h-[100px]"
                                        placeholder="Auto-reply text..."
                                    />
                                </div>
                            </>
                        )}
                    </div>
                    <DialogFooter className="gap-2 sm:justify-between">
                        <Button variant="destructive" onClick={handleDeleteAutomation} disabled={isLoading}>
                            <Trash2 className="w-4 h-4 mr-2" /> {t('calendar.automation.delete_button')}
                        </Button>
                        <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => setIsEditAutoDialogOpen(false)}>{t('calendar.automation.cancel_button')}</Button>
                            <Button onClick={handleUpdateAutomation} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
                                {isLoading ? t('calendar.automation.saving_button') : t('calendar.automation.save_button')}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
