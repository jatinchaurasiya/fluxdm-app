import { format } from "date-fns";
import {
    Calendar as CalendarIcon,
    FileVideo,
    Image,
    Layers,
    CircleDashed,
    Zap,
    Edit3
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
// import { cn } from "@/lib/utils";

interface AccountabilitySidebarProps {
    stats: {
        total: number;
        pending: number;
        published: number;
        failed: number;
    };
    upcomingPosts: any[];
    automations: any[];
    t: (key: string) => string;
    onEventClick: (e: any, event: any) => void;
    onAutomationClick: (flow: any) => void;
}

export function AccountabilitySidebar({
    stats,
    upcomingPosts,
    automations,
    t,
    onEventClick,
    onAutomationClick
}: AccountabilitySidebarProps) {
    return (
        <div className="h-full flex flex-col gap-8 overflow-y-auto p-6">
            {/* Accountable Metrics */}
            <div className="shrink-0">
                <h3 className="text-sm font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-wider mb-4">
                    {t('calendar.metrics.accountibility') || "Accountability Metrics"}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-xl bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800">
                        <div className="text-2xl font-bold text-black dark:text-white mb-1">{stats.total}</div>
                        <div className="text-xs text-gray-500 dark:text-zinc-500 font-medium">
                            {t('calendar.metrics.total_scheduled') || "Total Scheduled"}
                        </div>
                    </div>
                    <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30">
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">{stats.pending}</div>
                        <div className="text-xs text-blue-600/80 dark:text-blue-400/80 font-medium">
                            {t('calendar.metrics.upcoming') || "Upcoming"}
                        </div>
                    </div>
                    <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/30">
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400 mb-1">{stats.published}</div>
                        <div className="text-xs text-green-600/80 dark:text-green-400/80 font-medium">
                            {t('calendar.metrics.published') || "Published"}
                        </div>
                    </div>
                    <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400 mb-1">{stats.failed}</div>
                        <div className="text-xs text-red-600/80 dark:text-red-400/80 font-medium">
                            {t('calendar.metrics.failed') || "Failed"}
                        </div>
                    </div>
                </div>
            </div>

            {/* Upcoming Queue */}
            <div className="shrink-0">
                <h3 className="text-sm font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-wider mb-4 flex items-center justify-between">
                    {t('calendar.sidebar.upcoming_queue') || "Upcoming Queue"}
                    <Badge variant="outline" className="text-[10px]">{upcomingPosts.length}</Badge>
                </h3>

                {upcomingPosts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-center border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-xl bg-gray-50/50 dark:bg-zinc-900/50">
                        <CalendarIcon className="w-8 h-8 text-gray-300 dark:text-zinc-600 mb-2" />
                        <p className="text-sm font-medium text-gray-500 dark:text-zinc-500">
                            {t('calendar.sidebar.no_upcoming') || "No content upcoming"}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-zinc-600 max-w-[150px]">
                            {t('calendar.sidebar.select_date') || "Select a date on the calendar to schedule."}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {upcomingPosts.map(event => (
                            <div
                                key={event.id}
                                onClick={(e) => onEventClick(e, event)}
                                className="group flex gap-3 p-3 rounded-xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-blue-200 dark:hover:border-blue-900 transition-all cursor-pointer shadow-sm"
                            >
                                <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden relative">
                                    {event.mediaType === 'REEL' && <FileVideo className="w-5 h-5 text-gray-400" />}
                                    {event.mediaType === 'IMAGE' && <Image className="w-5 h-5 text-gray-400" />}
                                    {event.mediaType === 'CAROUSEL' && <Layers className="w-5 h-5 text-gray-400" />}
                                    {event.mediaType === 'STORY' && <CircleDashed className="w-5 h-5 text-gray-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-bold text-gray-500 dark:text-zinc-500 uppercase">
                                            {format(new Date(event.datetime), 'MMM d')} • {format(new Date(event.datetime), 'h:mm a')}
                                        </span>
                                        {event.automationId && <Zap className="w-3 h-3 text-yellow-500" />}
                                    </div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {event.caption || (event.mediaType ? `${event.mediaType} Post` : "Untitled Post")}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Active Automations */}
            <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-500 dark:text-zinc-500 uppercase tracking-wider mb-4 flex items-center justify-between">
                    {t('calendar.sidebar.recent_automations') || "Recent Automations"}
                </h3>
                <div className="space-y-3">
                    {automations.slice(0, 5).map(flow => (
                        <div
                            key={flow.id}
                            onClick={() => onAutomationClick(flow)}
                            className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:bg-gray-50 dark:hover:bg-zinc-800 hover:border-gray-200 dark:hover:border-zinc-700 transition-all cursor-pointer relative group"
                        >
                            <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500 dark:text-blue-400">
                                <Zap className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-bold text-gray-900 dark:text-white truncate">{flow.name}</h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 uppercase tracking-wider">
                                        {flow.trigger_keyword ? `Key: ${flow.trigger_keyword}` : 'Visual Flow'}
                                    </Badge>
                                </div>
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 absolute right-2 top-1/2 -translate-y-1/2 bg-white dark:bg-zinc-800 shadow-sm border border-gray-200 dark:border-zinc-700 rounded-lg p-1.5 transition-opacity">
                                <Edit3 className="w-3 h-3 text-gray-500" />
                            </div>
                        </div>
                    ))}
                    {automations.length === 0 && (
                        <div className="text-center py-6 text-sm text-gray-400 dark:text-zinc-600 italic">
                            {t('calendar.sidebar.no_automations') || "No active automations"}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
