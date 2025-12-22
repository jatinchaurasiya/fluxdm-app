import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
    MessageCircle, Users, Clock, TrendingUp, RefreshCw,
    ArrowUpRight, Sun, Moon, Zap
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AutomationList from '@/components/AutomationList';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/components/theme-provider';

interface StatsData {
    dms_sent: number;
    dms_trend?: string;
    leads: number;
    leads_trend?: string;
    queue: number;
    queue_trend?: string;
    conversion: number;
    conversion_trend?: string;
    graphData: { date: string; count: number }[];
    recentLogs: { id: number; level: string; message: string; created_at: string }[];
}

export default function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
    const { t } = useTranslation();
    const { theme, setTheme } = useTheme();
    const [stats, setStats] = useState<StatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [range, setRange] = useState('7d');

    const loadStats = async () => {
        setIsRefreshing(true);
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('get-dashboard-stats', { range });
                if (res.success) {
                    setStats(res.data);
                }
            } else {
                // Browser Mode or Fallback -> Show Zeros
                setStats({
                    dms_sent: 0,
                    dms_trend: t('dashboard.trends.default_vs_last'),
                    leads: 0,
                    leads_trend: t('dashboard.trends.default_today'),
                    queue: 0,
                    queue_trend: t('dashboard.trends.processing'),
                    conversion: 0,
                    conversion_trend: t('dashboard.trends.based_on_replies'),
                    graphData: [],
                    recentLogs: []
                });
            }
        } catch (error) {
            console.error("Failed to load stats:", error);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        loadStats();
        // Set up polling every 30 seconds
        const interval = setInterval(loadStats, 30000);
        return () => clearInterval(interval);
    }, [range]);

    return (
        <div className="p-8 space-y-8 h-full overflow-y-auto bg-gray-50/50 dark:bg-black">

            {/* 1. Header & Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{t('dashboard.title')}</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">{t('dashboard.subtitle')}</p>
                </div>

                <div className="flex items-center gap-2">
                    <Select value={range} onValueChange={setRange}>
                        <SelectTrigger className="w-[140px] bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800">
                            <SelectValue placeholder="Time Range" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7d">Last 7 Days</SelectItem>
                            <SelectItem value="30d">Last 30 Days</SelectItem>
                            <SelectItem value="90d">Last 3 Months</SelectItem>
                            <SelectItem value="12m">Last Year</SelectItem>
                        </SelectContent>
                    </Select>

                    <Button
                        variant="outline"
                        size="icon"
                        onClick={loadStats}
                        disabled={isRefreshing}
                        className={isRefreshing ? "animate-spin" : ""}
                    >
                        <RefreshCw className="h-4 w-4" />
                    </Button>

                    <div className="flex items-center bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-1 mr-2 h-9">
                        <button
                            onClick={() => setTheme('light')}
                            className={`p-1.5 rounded-md transition-all ${theme !== 'dark' ? 'bg-gray-100 text-yellow-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Light Mode"
                        >
                            <Sun className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setTheme('dark')}
                            className={`p-1.5 rounded-md transition-all ${theme === 'dark' ? 'bg-zinc-800 text-blue-400 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                            title="Dark Mode"
                        >
                            <Moon className="w-4 h-4" />
                        </button>
                    </div>

                    <Button onClick={() => onNavigate('automations')} className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black">
                        <Zap className="mr-2 h-4 w-4" /> {t('automations.create_button')}
                    </Button>
                </div>
            </div>

            {/* 2. Key Metrics Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                    title={t('dashboard.stats.sent')}
                    value={stats?.dms_sent ?? 0}
                    icon={MessageCircle}
                    trend={stats?.dms_trend || t('dashboard.trends.calculating')}
                    loading={loading}
                />
                <MetricCard
                    title={t('dashboard.stats.leads')}
                    value={stats?.leads ?? 0}
                    icon={Users}
                    trend={stats?.leads_trend || t('dashboard.trends.default_today')}
                    loading={loading}
                />
                <MetricCard
                    title={t('dashboard.stats.queue')}
                    value={stats?.queue ?? 0}
                    icon={Clock}
                    trend={stats?.queue_trend || t('dashboard.trends.processing')}
                    loading={loading}
                />
                <MetricCard
                    title={t('dashboard.stats.conversion')}
                    value={`${stats?.conversion ?? 0}%`}
                    icon={TrendingUp}
                    trend={stats?.conversion_trend || t('dashboard.trends.based_on_replies')}
                    loading={loading}
                />
            </div>

            {/* 3. Main Content: Graph & Activity */}
            <div className="grid gap-6 md:grid-cols-7">

                {/* 3a. Engagement Trend Graph (2/3 width) */}
                <Card className="col-span-4 md:col-span-5 bg-white dark:bg-zinc-900 dark:border-zinc-800 border-none shadow-sm rounded-3xl overflow-hidden ring-1 ring-inset ring-transparent dark:ring-white/5">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div className="space-y-1">
                            <CardTitle className="text-xl font-bold dark:text-white">{t('dashboard.engagement_trend')}</CardTitle>
                            <CardDescription className="dark:text-zinc-400">{t('dashboard.trend_desc')}</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="pl-0 pb-0">
                        <div className="h-[350px] w-full">
                            {loading ? (
                                <Skeleton className="h-full w-full rounded-none dark:bg-zinc-800" />
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={stats?.graphData || []} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-zinc-800" />
                                        <XAxis
                                            dataKey="date"
                                            stroke="#9CA3AF"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(val) => {
                                                const d = new Date(val);
                                                return `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })}`;
                                            }}
                                            dy={10}
                                            className="dark:text-zinc-500"
                                        />
                                        <YAxis
                                            stroke="#9CA3AF"
                                            fontSize={12}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(value) => `${value}`}
                                            className="dark:text-zinc-500"
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'transparent' }}
                                            contentStyle={{
                                                backgroundColor: '#fff',
                                                borderRadius: '12px',
                                                border: 'none',
                                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                                            }}
                                            itemStyle={{ color: '#111827', fontWeight: 600 }}
                                        />
                                        <Bar
                                            dataKey="count"
                                            fill="#18181B"
                                            radius={[4, 4, 0, 0]}
                                            barSize={32}
                                            className="fill-zinc-900 dark:fill-white"
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* 3b. Recent Activity (1/3 width) - Redesigned List */}
                <Card className="col-span-3 md:col-span-2 bg-white dark:bg-zinc-900 dark:border-zinc-800 border-none shadow-sm rounded-3xl flex flex-col ring-1 ring-inset ring-transparent dark:ring-white/5">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-xl font-bold dark:text-white">{t('dashboard.recent_activity')}</CardTitle>
                        <CardDescription className="dark:text-zinc-400">{t('dashboard.active_automations')}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-y-auto px-6 py-0">
                        {/* We repurpose AutomationList but inside a container that looks like the reference */}
                        <div className="space-y-6 pb-6">
                            <AutomationList compact={true} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* 5. Recent Logs (Optional, purely listing for debugging/transparency) */}
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-zinc-800">
                    <h3 className="font-semibold dark:text-white">{t('dashboard.logs')}</h3>
                </div>
                <div className="p-0">
                    <table className="w-full text-sm text-left">
                        <thead className="text-gray-500 bg-gray-50 dark:bg-zinc-800/50">
                            <tr>
                                <th className="px-6 py-3 font-medium">{t('dashboard.logs_header.timestamp')}</th>
                                <th className="px-6 py-3 font-medium">{t('dashboard.logs_header.level')}</th>
                                <th className="px-6 py-3 font-medium">{t('dashboard.logs_header.message')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
                            {stats?.recentLogs && stats.recentLogs.length > 0 ? (
                                stats.recentLogs.map((log: any) => (
                                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors">
                                        <td className="px-6 py-3 text-gray-500 dark:text-zinc-500 whitespace-nowrap">
                                            {new Date(log.created_at).toLocaleTimeString()}
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${log.level === 'ERROR' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400'
                                                }`}>
                                                {log.level}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-gray-700 dark:text-zinc-300 truncate max-w-xs" title={log.message}>
                                            {log.message}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={3} className="px-6 py-8 text-center text-gray-400 dark:text-zinc-600 italic">
                                        No recent logs found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
}

// Subcomponent for Metric Cards
function MetricCard({ title, value, icon: Icon, trend, loading }: any) {
    return (
        <Card className="bg-white dark:bg-zinc-900 dark:border-zinc-800 border-none shadow-sm hover:shadow-md transition-all rounded-2xl overflow-hidden ring-1 ring-inset ring-transparent dark:ring-white/5 group">
            <CardContent className="p-6 relative">

                {/* Header: Title Left, Icon Right */}
                <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-medium text-gray-500 dark:text-zinc-400">{title}</p>
                    <div className="p-2 bg-gray-50 dark:bg-zinc-800 rounded-xl group-hover:bg-gray-100 dark:group-hover:bg-zinc-700 transition-colors">
                        <Icon className="h-5 w-5 text-gray-400 dark:text-white" />
                    </div>
                </div>

                {/* Main Value */}
                <div className="mb-2">
                    {loading ? (
                        <Skeleton className="h-10 w-32 rounded-lg dark:bg-zinc-800" />
                    ) : (
                        <h2 className="text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                            {value}
                        </h2>
                    )}
                </div>

                {/* Footer: Context / Trend */}
                <div>
                    {loading ? (
                        <Skeleton className="h-4 w-24 rounded-md dark:bg-zinc-800" />
                    ) : (
                        <p className="text-xs font-medium text-gray-400 flex items-center gap-1.5">
                            {trend && (
                                <span className={`flex items-center ${trend.includes('+') ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-zinc-500"}`}>
                                    {trend.includes('+') ? (
                                        <ArrowUpRight className="w-3 h-3" />
                                    ) : (
                                        <span>•</span>
                                    )}
                                    {trend}
                                </span>
                            )}
                            {!trend && <span className="text-gray-400 dark:text-zinc-600">Fixed Value</span>}
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
