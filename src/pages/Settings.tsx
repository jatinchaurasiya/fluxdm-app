import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { AlertCircle, Download, RefreshCw, Shield, Database, Trash2, Zap } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function SettingsPage() {
    const { setTheme, theme } = useTheme();
    const { t, i18n } = useTranslation();

    const [settings, setSettings] = useState({
        launchAtLogin: false,
        safeMode: true,
        replyDelay: 30, // seconds
        blacklist: '',
    });

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        // @ts-ignore
        if (window.ipcRenderer) {
            // @ts-ignore
            const res = await window.ipcRenderer.invoke('get-settings');
            if (res.success && res.data) {
                setSettings(prev => ({ ...prev, ...res.data }));
            }
        }
    };

    const saveSetting = async (key: string, value: any) => {
        // Backend Sync
        // @ts-ignore
        if (window.ipcRenderer) {
            // Special handling for launch-at-login
            if (key === 'launchAtLogin') {
                // @ts-ignore
                await window.ipcRenderer.invoke('set-launch-at-login', value);
            }
            // Save to generic settings JSON
            // @ts-ignore
            await window.ipcRenderer.invoke('save-setting', { key, value });
            toast.success('Preferences Saved');
        }
    };

    const updateSetting = (key: string, value: any) => {
        // Optimistic UI Update
        setSettings(prev => ({ ...prev, [key]: value }));
        saveSetting(key, value);
    };

    const handleExportLeads = async () => {
        // @ts-ignore
        if (window.ipcRenderer) {
            // @ts-ignore
            const res = await window.ipcRenderer.invoke('export-leads-csv');
            if (res.success) toast.success(`Leads exported to ${res.filePath}`);
            else toast.error('Export failed: ' + res.error);
        }
    };



    const handleFactoryReset = async () => {
        // @ts-ignore
        if (window.ipcRenderer) {
            // @ts-ignore
            await window.ipcRenderer.invoke('hard-reset-data');
            toast.success('Database Wiped Successfully');
            window.location.reload();
        }
    };

    const handleReplayTour = () => {
        localStorage.removeItem('fluxdm_tour_completed');
        window.location.reload();
    };

    const [seeding, setSeeding] = useState(false);

    const handleSeedData = async (stressTest: boolean) => {
        setSeeding(true);
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('seed-demo-data', { stressTest });
                if (res.success) {
                    toast.success(stressTest ? 'Stress Test Data Loaded (50k msgs)' : 'Demo Data Loaded');
                    window.location.reload();
                } else {
                    toast.error('Seeding Failed: ' + res.error);
                }
            }
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setSeeding(false);
        }
    };

    return (

        <div className="p-8 max-w-4xl mx-auto space-y-8 h-full overflow-y-auto bg-gray-50/50 dark:bg-black">
            <div className="space-y-1">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{t('settings.title')}</h1>
                <p className="text-gray-500 dark:text-zinc-400">{t('settings.description')}</p>
            </div>

            <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-8 bg-gray-100 dark:bg-zinc-900 p-1">
                    <TabsTrigger value="general" className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-white">{t('settings.general')}</TabsTrigger>
                    <TabsTrigger value="safety" className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-white">{t('settings.safety')}</TabsTrigger>
                    <TabsTrigger value="system" className="data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-white">{t('settings.system')}</TabsTrigger>
                </TabsList>

                {/* 1. GENERAL TAB */}
                <TabsContent value="general" className="space-y-4">
                    <Card className="bg-white dark:bg-zinc-900/50 dark:border-zinc-800 ring-1 ring-inset ring-transparent dark:ring-white/5">
                        <CardHeader>
                            <CardTitle className="dark:text-white">{t('settings.appearance')}</CardTitle>
                            <CardDescription className="dark:text-zinc-400">{t('settings.appearance_desc')}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">

                            {/* Theme & Appearance Group */}
                            <div className="grid gap-6">

                                {/* Language Settings */}
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-base dark:text-white">{t('settings.language')}</Label>
                                        <p className="text-sm text-gray-500 dark:text-zinc-500">Select your preferred language.</p>
                                    </div>
                                    <Select value={i18n.language ? i18n.language.split('-')[0] : 'en'} onValueChange={(val) => i18n.changeLanguage(val)}>
                                        <SelectTrigger className="w-[200px] dark:bg-zinc-950 dark:border-zinc-800 dark:text-white">
                                            <SelectValue placeholder="Select Language" />
                                        </SelectTrigger>
                                        <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                                            <SelectItem value="en" className="dark:text-white dark:focus:bg-zinc-800">🇺🇸 English</SelectItem>
                                            <SelectItem value="pt" className="dark:text-white dark:focus:bg-zinc-800">🇧🇷 Português</SelectItem>
                                            <SelectItem value="es" className="dark:text-white dark:focus:bg-zinc-800">🇲🇽 Español</SelectItem>
                                            <SelectItem value="de" className="dark:text-white dark:focus:bg-zinc-800">🇩🇪 Deutsch</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="h-[1px] bg-gray-100 dark:bg-zinc-800" />

                                {/* Dark Mode */}
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-base dark:text-white">{t('settings.dark_mode')}</Label>
                                        <p className="text-sm text-gray-500 dark:text-zinc-500">Enable dark theme for the interface.</p>
                                    </div>
                                    <Switch
                                        checked={theme === 'dark'}
                                        onCheckedChange={(c) => setTheme(c ? 'dark' : 'light')}
                                        className="data-[state=checked]:bg-black dark:data-[state=checked]:bg-white"
                                    />
                                </div>

                                {/* Accent Color */}
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-base dark:text-white">{t('settings.accent_color')}</Label>
                                        <p className="text-sm text-gray-500 dark:text-zinc-500">Choose your preferred visual style.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {['blue', 'green', 'purple', 'orange'].map((color) => (
                                            <button
                                                key={color}
                                                aria-label={`Select ${color} theme`}
                                                title={`Select ${color} theme`}
                                                onClick={() => toast.success(`Theme set to ${color} (Preview)`)}
                                                className={`w-6 h-6 rounded-full border-2 transition-all ${color === 'blue' ? 'bg-blue-500 border-blue-600' :
                                                    color === 'green' ? 'bg-green-500 border-green-600' :
                                                        color === 'purple' ? 'bg-purple-500 border-purple-600' :
                                                            'bg-orange-500 border-orange-600'
                                                    } hover:scale-110 active:scale-95`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="h-[1px] bg-gray-100 dark:bg-zinc-800" />

                            {/* System Start Group */}
                            <div className="grid gap-6">
                                {/* Launch at Login */}
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-base dark:text-white">{t('settings.launch_startup')}</Label>
                                        <p className="text-sm text-gray-500 dark:text-zinc-500">Automatically open FluxDM when you log in.</p>
                                    </div>
                                    <Switch
                                        checked={settings.launchAtLogin}
                                        onCheckedChange={(c) => updateSetting('launchAtLogin', c)}
                                        className="data-[state=checked]:bg-black dark:data-[state=checked]:bg-white"
                                    />
                                </div>

                                {/* Replay Onboarding */}
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-base dark:text-white">{t('settings.replay_tour')}</Label>
                                        <p className="text-sm text-gray-500 dark:text-zinc-500">Replay the welcome tour to learn the basics.</p>
                                    </div>
                                    <Button variant="outline" onClick={handleReplayTour} className="dark:bg-zinc-800 dark:border-zinc-700 dark:text-white dark:hover:bg-zinc-700">
                                        <RefreshCw className="mr-2 h-4 w-4" /> {t('settings.replay_tour')}
                                    </Button>
                                </div>
                            </div>

                        </CardContent>
                    </Card>
                </TabsContent>

                {/* 2. AUTOMATION SAFETY TAB */}
                <TabsContent value="safety" className="space-y-4">
                    <Card className="border-orange-200 dark:border-orange-900 bg-orange-50/30 dark:bg-orange-900/10 ring-1 ring-inset ring-transparent">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                                <Shield className="h-5 w-5" /> {t('settings.anti_ban')}
                            </CardTitle>
                            <CardDescription className="dark:text-orange-300/70">
                                These settings help simulate human behavior to prevent Instagram from flagging your account.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-8">

                            {/* Safe Mode */}
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label className="text-base text-gray-900 dark:text-white">{t('settings.safe_mode')}</Label>
                                    <p className="text-sm text-gray-500 dark:text-zinc-400">Injects random micro-delays between actions.</p>
                                </div>
                                <Switch
                                    checked={settings.safeMode}
                                    onCheckedChange={(c) => updateSetting('safeMode', c)}
                                />
                            </div>

                            {/* Reply Speed Slider */}
                            <div className="space-y-4">
                                <div className="flex justify-between">
                                    <Label className="text-base text-gray-900 dark:text-white">{t('settings.reply_delay')}</Label>
                                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{settings.replyDelay}s</span>
                                </div>
                                <Slider
                                    value={[settings.replyDelay]}
                                    max={120}
                                    min={5}
                                    step={5}
                                    onValueChange={(vals) => setSettings(prev => ({ ...prev, replyDelay: vals[0] }))}
                                    onValueCommit={(vals) => saveSetting('replyDelay', vals[0])}
                                />
                                <p className="text-xs text-gray-500 dark:text-zinc-500">Wait at least this many seconds before sending a DM response.</p>
                            </div>

                            {/* Blacklist */}
                            <div className="space-y-2">
                                <Label className="text-base text-gray-900 dark:text-white">{t('settings.blacklist')}</Label>
                                <p className="text-sm text-gray-500 dark:text-zinc-400">One username per line. We will never interact with these users.</p>
                                <Textarea
                                    placeholder="competitor_account&#10;troll_user_123"
                                    className="min-h-[120px] bg-white dark:bg-zinc-900 dark:border-zinc-800 dark:text-white dark:placeholder:text-zinc-600"
                                    value={settings.blacklist}
                                    onChange={(e) => updateSetting('blacklist', e.target.value)}
                                />
                            </div>

                        </CardContent>
                    </Card>
                </TabsContent>

                {/* 3. DATA & SYSTEM TAB */}
                <TabsContent value="system" className="space-y-4">
                    <Card className="bg-white dark:bg-zinc-900/50 dark:border-zinc-800 ring-1 ring-inset ring-transparent dark:ring-white/5">
                        <CardHeader>
                            <CardTitle className="dark:text-white">{t('settings.data_management')}</CardTitle>
                            <CardDescription className="dark:text-zinc-400">{t('settings.data_desc')}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">

                            {/* Export Leads */}
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-gray-50 dark:bg-zinc-800/30 dark:border-zinc-800">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-white dark:bg-zinc-900 rounded-md border shadow-sm dark:border-zinc-800">
                                        <Database className="h-6 w-6 text-blue-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium dark:text-white">{t('settings.export_leads')}</p>
                                        <p className="text-sm text-gray-500 dark:text-zinc-400">Download a CSV of every captured lead.</p>
                                    </div>
                                </div>
                                <Button onClick={handleExportLeads} className="dark:bg-white dark:text-black dark:hover:bg-gray-200">
                                    <Download className="mr-2 h-4 w-4" /> {t('settings.export_leads')}
                                </Button>
                            </div>

                            {/* Load Demo Data (Stress Test) */}
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-white dark:bg-zinc-900 rounded-md border shadow-sm dark:border-zinc-800">
                                        <Zap className="h-6 w-6 text-orange-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium dark:text-white">Load Demo Data & Stress Test</p>
                                        <p className="text-sm text-gray-500 dark:text-zinc-400">Generate mock data for testing performance.</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => handleSeedData(false)}
                                        disabled={seeding}
                                        className="dark:bg-zinc-950"
                                    >
                                        <Database className="w-4 h-4 mr-2" />
                                        Demo Data
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className="text-orange-600 border-orange-200 dark:bg-zinc-950"
                                        onClick={() => handleSeedData(true)}
                                        disabled={seeding}
                                    >
                                        <Zap className="w-4 h-4 mr-2" />
                                        50k Msg Stress Test
                                    </Button>
                                </div>
                            </div>


                            {/* Factory Reset */}
                            <div className="flex items-center justify-between p-4 border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/30 rounded-lg">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-white dark:bg-zinc-900 rounded-md border border-red-100 dark:border-red-900 shadow-sm">
                                        <AlertCircle className="h-6 w-6 text-red-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium text-red-700 dark:text-red-400">{t('settings.factory_reset')}</p>
                                        <p className="text-sm text-red-600/80 dark:text-red-400/80">Wipes all data and resets application state.</p>
                                    </div>
                                </div>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" className="bg-red-600 hover:bg-red-700 text-white">
                                            <Trash2 className="mr-2 h-4 w-4" /> Hard Reset (Force Clean)
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This action cannot be undone. This will permanently delete all your leads, automation flows, and scheduled posts.
                                                Your connection to Instagram will remain active.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleFactoryReset} className="bg-red-600 text-white hover:bg-red-700">
                                                Confirm Reset
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>

                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
