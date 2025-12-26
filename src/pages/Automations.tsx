
import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Edit, PlayCircle, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Automation {
    id: number;
    name: string;
    trigger_type: string;
    trigger_keyword: string;
    is_active: number;
    created_at: string;
}

interface AutomationsProps {
    onNavigate: (page: string) => void;
}

export default function Automations({ onNavigate }: AutomationsProps) {
    const { t } = useTranslation();
    const [automations, setAutomations] = useState<Automation[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteId, setDeleteId] = useState<number | null>(null);

    useEffect(() => {
        fetchAutomations();
    }, []);

    const fetchAutomations = async () => {
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('get-automations');
                if (res.success) {
                    setAutomations(res.data);
                }
            }
        } catch (e) {
            console.error("Failed to fetch automations", e);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (id: number) => {
        // Optimistic UI Update
        setAutomations(prev => prev.map(a =>
            a.id === id ? { ...a, is_active: a.is_active ? 0 : 1 } : a
        ));

        // @ts-ignore
        if (window.ipcRenderer) {
            // @ts-ignore
            await window.ipcRenderer.invoke('toggle-flow', id);
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;

        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('delete-flow', deleteId);
                if (res.success) {
                    setAutomations(prev => prev.filter(a => a.id !== deleteId));
                    toast.success(t('automations.deleted_success'));
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setDeleteId(null);
        }
    };

    return (
        <div className="p-8 h-full overflow-y-auto bg-gray-50/50 dark:bg-black">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold dark:text-white mb-2">{t('sidebar.automations')}</h1>
                    <p className="text-gray-500 dark:text-zinc-400">Manage your active conversation flows.</p>
                </div>
                <Button
                    className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black"
                    onClick={() => onNavigate('automation-wizard')}
                >
                    <Plus className="w-4 h-4 mr-2" /> {t('automations.create_button')}
                </Button>
            </div>

            {loading ? (
                <div className="text-center py-20 text-gray-400">Loading...</div>
            ) : automations.length === 0 ? (
                <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-xl border border-dashed border-gray-200 dark:border-zinc-800">
                    <div className="mx-auto w-16 h-16 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4">
                        <PlayCircle className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-xl font-semibold dark:text-white mb-2">{t('automations.empty_title')}</h3>
                    <p className="text-gray-500 max-w-sm mx-auto mb-6">{t('automations.empty_desc')}</p>
                    <Button onClick={() => onNavigate('automation-wizard')}>
                        {t('automations.create_button')}
                    </Button>
                </div>
            ) : (
                <div className="grid gap-4">
                    {automations.map((automation) => (
                        <Card key={automation.id} className="border-0 shadow-sm ring-1 ring-gray-200 dark:ring-zinc-800 dark:bg-zinc-900">
                            <div className="flex items-center p-6">
                                {/* Icon / Status Indicator */}
                                <div className={`p-3 rounded-xl mr-4 ${automation.is_active ? 'bg-green-100 dark:bg-green-900/20' : 'bg-gray-100 dark:bg-zinc-800'}`}>
                                    {automation.trigger_type === 'STORY_REPLY' ? (
                                        <PlayCircle className={`w-6 h-6 ${automation.is_active ? 'text-green-600 dark:text-green-500' : 'text-gray-400'}`} />
                                    ) : (
                                        <MessageCircle className={`w-6 h-6 ${automation.is_active ? 'text-green-600 dark:text-green-500' : 'text-gray-400'}`} />
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1">
                                    <h3 className="text-lg font-semibold dark:text-white flex items-center gap-2">
                                        {automation.name}
                                        {!automation.is_active && (
                                            <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-zinc-800 text-gray-500 font-medium">
                                                PAUSED
                                            </span>
                                        )}
                                    </h3>
                                    <div className="flex gap-4 mt-1 text-sm text-gray-500 dark:text-zinc-500">
                                        <span className="flex items-center gap-1">
                                            Trigger: <span className="font-mono text-xs bg-gray-100 dark:bg-zinc-800 px-1.5 rounded text-gray-700 dark:text-zinc-300">
                                                {automation.trigger_keyword || '(All Comments)'}
                                            </span>
                                        </span>
                                        <span>•</span>
                                        <span>{new Date(automation.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 mr-4">
                                        <span className={`text-xs font-medium ${automation.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                                            {automation.is_active ? 'Active' : 'Paused'}
                                        </span>
                                        <Switch
                                            checked={!!automation.is_active}
                                            onCheckedChange={() => handleToggle(automation.id)}
                                            className="data-[state=checked]:bg-green-500"
                                        />
                                    </div>

                                    <div className="h-8 w-[1px] bg-gray-200 dark:bg-zinc-800 mx-2" />

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                        // TODO: Pass ID to wizard for editing
                                        onClick={() => onNavigate(`automation-wizard`)}
                                        title="Edit (Coming Soon)"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </Button>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                        onClick={() => setDeleteId(automation.id)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Delete Confirmation */}
            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('automations.delete_confirm')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the automation flow and its stats.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
