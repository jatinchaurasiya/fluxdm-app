import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { EmptyState } from '@/components/ui/EmptyState';
import { Trash2, Edit, PlayCircle, MessageCircle, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface Automation {
    id: string;
    name: string;
    trigger_type: string;
    trigger_keyword?: string;
    is_active: number; // 0 or 1
    created_at: string;
}

export default function AutomationList({ compact }: { compact?: boolean }) {
    const { t } = useTranslation();
    const [automations, setAutomations] = useState<Automation[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchAutomations = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('get-automations');
                if (res.success) {
                    setAutomations(res.data);
                } else {
                    toast.error("Failed to load: " + res.error);
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAutomations();
    }, []);

    const toggleAutomation = async (id: string, currentStatus: number) => {
        // Optimistic UI
        setAutomations(prev => prev.map(a =>
            a.id === id ? { ...a, is_active: currentStatus ? 0 : 1 } : a
        ));

        // @ts-ignore
        if (window.ipcRenderer) {
            // @ts-ignore
            await window.ipcRenderer.invoke('toggle-flow', id);
        }
    };

    const deleteAutomation = async (id: string) => {
        if (!confirm(t('automations.delete_confirm'))) return;

        setAutomations(prev => prev.filter(a => a.id !== id));
        // @ts-ignore
        if (window.ipcRenderer) {
            // @ts-ignore
            await window.ipcRenderer.invoke('delete-flow', id);
            toast.success(t('automations.deleted_success'));
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
            </div>
        );
    }

    if (automations.length === 0) {
        return (
            <EmptyState
                icon={Zap}
                title={t('automations.empty_title')}
                description={t('automations.empty_desc')}
                actionLabel={t('automations.create_button')}
                onAction={() => {
                    // Try to use window navigation if onNavigate isn't passed (though it should be passed down eventually)
                    // Currently, App.tsx handles navigation via state. We need a way to trigger that.
                    // The best way here since AutomationList is a child is to use a custom event or check if we can pass a prop.
                    // But looking at the codebase, a simple hash change might not be enough if App.tsx uses state.
                    // Let's assume for now we can dispatch a custom event that App.tsx listens to, or just reload to hash.
                    // But for a quick fix that works with most routers or our simple state:
                    window.dispatchEvent(new CustomEvent('navigate', { detail: 'wizard' }));
                }}
                className={compact ? "min-h-[200px] border-none shadow-none bg-transparent" : ""}
            />
        );
    }

    if (compact) {
        return (
            <div className="space-y-4">
                {automations.map((automation) => (
                    <div key={automation.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer group">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${automation.trigger_type === 'POST_COMMENT' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-pink-100 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400'}`}>
                                {automation.trigger_type === 'POST_COMMENT' ? <MessageCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                            </div>
                            <div>
                                <h4 className="font-semibold text-sm text-gray-900 dark:text-white truncate max-w-[150px]">{automation.name}</h4>
                                <p className="text-xs text-gray-500 dark:text-zinc-500">{automation.trigger_type === 'POST_COMMENT' ? t('automations.wizard.trigger_post_comment') : t('automations.wizard.trigger_story_reply')}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`px-2 py-1 rounded-full text-[10px] font-bold ${automation.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-500'
                                }`}>
                                {automation.is_active ? t('automations.status.active') : t('automations.status.paused')}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {automations.map((automation) => (
                <Card key={automation.id} className="flex flex-col justify-between hover:shadow-md transition-shadow dark:bg-zinc-900 dark:border-zinc-800 ring-1 ring-inset ring-transparent dark:ring-white/5">
                    <CardHeader className="pb-2">
                        <div className="flex justify-between items-start">
                            <div className="space-y-1">
                                <CardTitle className="text-base truncate pr-2 dark:text-white" title={automation.name}>
                                    {automation.name}
                                </CardTitle>
                                <CardDescription className="flex items-center gap-1 text-xs dark:text-zinc-400">
                                    {automation.trigger_type === 'POST_COMMENT' ? <MessageCircle className="w-3 h-3" /> : <PlayCircle className="w-3 h-3" />}
                                    {automation.trigger_type === 'POST_COMMENT' ? t('automations.wizard.trigger_post_comment') : t('automations.wizard.trigger_story_reply')}
                                    {automation.trigger_keyword && <span className="font-mono bg-gray-100 dark:bg-zinc-800 px-1 rounded border border-gray-200 dark:border-zinc-700 dark:text-zinc-300">"{automation.trigger_keyword}"</span>}
                                </CardDescription>
                            </div>
                            <Switch
                                checked={!!automation.is_active}
                                onCheckedChange={() => toggleAutomation(automation.id, automation.is_active)}
                                className="data-[state=checked]:bg-green-500"
                            />
                        </div>
                    </CardHeader>
                    <CardFooter className="pt-4 border-t border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50 flex justify-end gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => deleteAutomation(automation.id)}>
                            <Trash2 className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 dark:bg-zinc-800 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-700">
                            <Edit className="w-3 h-3 mr-1" /> {t('automations.edit_button')}
                        </Button>
                    </CardFooter>
                </Card>
            ))}
        </div>
    );
}
