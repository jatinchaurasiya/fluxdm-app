
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Facebook, Instagram, ShieldCheck, ShieldAlert, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Save, Key, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface Account {
    id: number;
    username: string;
    profile_picture_url: string;
    instagram_business_id: string;
    is_active: number;
}

export default function ConnectSocial() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [connectMode, setConnectMode] = useState<'instagram' | 'facebook'>('instagram');
    const [pageName, setPageName] = useState('');
    const [isConnected, setIsConnected] = useState(false); // Refers to ACTIVE account
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [accordionValue, setAccordionValue] = useState("");

    // Developer Settings State
    const [customAppId, setCustomAppId] = useState('');
    const [customAppSecret, setCustomAppSecret] = useState('');
    const [customInstagramAppId, setCustomInstagramAppId] = useState('');
    const [customInstagramAppSecret, setCustomInstagramAppSecret] = useState('');
    const [customGraphApiKey, setCustomGraphApiKey] = useState('');
    const [showSecret, setShowSecret] = useState(false);
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    useEffect(() => {
        loadAccounts();
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('get-settings');
                if (res?.success) {
                    const metaConfig = res.data.meta_config || {};
                    setCustomAppId(metaConfig.appId || '');
                    setCustomAppSecret(metaConfig.appSecret || '');
                    setCustomInstagramAppId(metaConfig.instagramAppId || '');
                    setCustomInstagramAppSecret(metaConfig.instagramAppSecret || '');
                    setCustomGraphApiKey(metaConfig.graphApiKey || '');
                }
            }
        } catch (e) {
            console.error("Failed to load settings", e);
        }
    };

    const loadAccounts = async () => {
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('get-accounts');
                if (res?.success) {
                    setAccounts(res.data);
                    const activeId = res.activeId;
                    const activeAccount = res.data.find((a: Account) => a.id === activeId);

                    if (activeAccount) {
                        setIsConnected(true);
                        setPageName(activeAccount.username);
                    } else {
                        setIsConnected(false);
                        setPageName('');
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleConnect = async (mode: 'instagram' | 'facebook' = 'instagram') => {
        if (mode === 'instagram' && !customInstagramAppId) {
            toast.error('Instagram App ID required for direct login. Check Developer Settings below or click "Connect via Facebook Page".', { duration: 6000 });
            setAccordionValue("item-2");
            return;
        }

        setLoading(true);
        setConnectMode(mode);
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('start-oauth-flow', { mode });

                if (res?.success) {
                    toast.success('Instagram Connected Successfully');
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    const errorMsg = res?.error || 'Unknown error';
                    toast.error(`Connection Failed: ${errorMsg}`);

                    if (errorMsg.includes('No Instagram Business Account') || errorMsg.includes('Instagram Business Account linked')) {
                        setAccordionValue("item-1");
                    }
                }
            } else {
                toast.error('Desktop App Required. Cannot connect from browser.');
            }
        } catch (e: any) {
            toast.error('Error: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnect = async (id: number) => {
        if (!confirm(t('connect_social.disconnect_confirm'))) return;

        try {
            // @ts-ignore
            const res = await window.ipcRenderer.invoke('delete-account', id);
            if (res.success) {
                toast.success(t('connect_social.account_disconnected'));
                window.location.reload();
            } else {
                toast.error(t('connect_social.disconnect_failed') + res.error);
            }
        } catch (e) {
            toast.error("Error: " + e);
        }
    };

    const handleSaveSettings = async () => {
        setIsSavingSettings(true);
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('save-setting', {
                    key: 'meta_config',
                    value: {
                        appId: customAppId,
                        appSecret: customAppSecret,
                        instagramAppId: customInstagramAppId,
                        instagramAppSecret: customInstagramAppSecret,
                        graphApiKey: customGraphApiKey
                    }
                });

                if (res.success) {
                    toast.success(t('connect_social.developer_settings.saved_success'));
                } else {
                    toast.error(t('connect_social.developer_settings.save_error'));
                }
            }
        } catch (e) {
            toast.error("Error saving settings");
        } finally {
            setIsSavingSettings(false);
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-black overflow-y-auto">
            <Card className="w-full max-w-lg shadow-2xl border-0 ring-1 ring-gray-200 dark:ring-zinc-800 dark:bg-zinc-900 mb-8">
                <CardHeader className="text-center pt-10 pb-2">
                    <div className="mx-auto bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888] p-4 rounded-3xl mb-6 w-fit shadow-xl shadow-pink-500/25">
                        <Instagram className="w-10 h-10 text-white" />
                    </div>
                    <CardTitle className="text-2xl font-bold dark:text-white">Connect Instagram Account</CardTitle>
                    <CardDescription className="dark:text-zinc-400">
                        Link your Instagram account to enable instant DM replies, comment triggers, and scheduling.
                    </CardDescription>

                    <div className="pt-6 flex justify-center">
                        {isConnected ? (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 px-4 py-1 text-sm gap-2">
                                <ShieldCheck className="w-4 h-4" />
                                {t('connect_social.status_connected', { user: pageName })}
                            </Badge>
                        ) : (
                            <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800 px-4 py-1 text-sm gap-2">
                                <ShieldAlert className="w-4 h-4" />
                                {t('connect_social.status_not_connected')}
                            </Badge>
                        )}
                    </div>
                </CardHeader>

                <CardContent className="pt-6 pb-10 px-10">
                    <div className="space-y-5">
                        {/* Primary: Direct Instagram Login */}
                        <div>
                            <Button
                                className="w-full h-14 text-base font-bold bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] hover:opacity-95 text-white shadow-xl transition-all rounded-xl flex items-center justify-center gap-3 border-0"
                                onClick={() => handleConnect('instagram')}
                                disabled={loading}
                            >
                                {loading && connectMode === 'instagram' ? (
                                    'Opening Instagram Login...'
                                ) : accounts.length > 0 ? (
                                    <>
                                        <Plus className="w-5 h-5 mr-1" />
                                        Connect Another Instagram Account
                                    </>
                                ) : (
                                    <>
                                        <Instagram className="w-5 h-5" />
                                        <span>Connect with Instagram</span>
                                        <ArrowRight className="w-5 h-5 ml-auto opacity-80" />
                                    </>
                                )}
                            </Button>
                            <p className="text-[11px] text-center text-zinc-500 dark:text-zinc-400 mt-2">
                                ✨ Direct Instagram Login • <strong>No Facebook Page required</strong>
                            </p>
                        </div>

                        {/* Divider */}
                        <div className="relative flex py-1 items-center">
                            <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
                            <span className="flex-shrink mx-3 text-xs text-zinc-400">or if you use Facebook Pages</span>
                            <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
                        </div>

                        {/* Secondary: Facebook Page Login */}
                        <Button
                            variant="outline"
                            className="w-full h-12 text-sm font-semibold border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all rounded-xl flex items-center justify-center gap-2"
                            onClick={() => handleConnect('facebook')}
                            disabled={loading}
                        >
                            {loading && connectMode === 'facebook' ? (
                                'Opening Facebook Login...'
                            ) : (
                                <>
                                    <Facebook className="w-4 h-4 text-[#1877F2]" />
                                    <span>Connect via Facebook Page</span>
                                </>
                            )}
                        </Button>

                        {/* Connected Accounts List */}
                        {accounts.length > 0 && (
                            <div className="mt-8">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-200 mb-3 uppercase tracking-wide">
                                    {t('connect_social.connected_accounts_title')}
                                </h3>
                                <div className="space-y-3">
                                    {accounts.map((acc) => (
                                        <div
                                            key={acc.id}
                                            className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-zinc-800/50 border border-gray-100 dark:border-zinc-800"
                                        >
                                            <div className="flex items-center gap-3">
                                                <Avatar className="w-10 h-10 border border-gray-200 dark:border-zinc-700">
                                                    <AvatarImage src={acc.profile_picture_url} />
                                                    <AvatarFallback>{acc.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                                                </Avatar>
                                                <div className="text-left">
                                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                        {acc.username}
                                                    </p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        {acc.instagram_business_id ? t('connect_social.account_type_instagram') : t('connect_social.account_type_facebook')}
                                                    </p>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                onClick={() => handleDisconnect(acc.id)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Troubleshooting Accordion */}
                        <Accordion
                            type="single"
                            collapsible
                            value={accordionValue}
                            onValueChange={setAccordionValue}
                            className="bg-gray-100 dark:bg-zinc-800/50 rounded-lg px-4 border border-gray-200 dark:border-zinc-700"
                        >
                            <AccordionItem value="item-1" className="border-b-0">
                                <AccordionTrigger className="text-sm font-medium text-gray-700 dark:text-zinc-300 hover:no-underline">
                                    {t('connect_social.troubleshooting.title')}
                                </AccordionTrigger>
                                <AccordionContent className="text-sm text-gray-600 dark:text-zinc-400 space-y-2 pb-4">
                                    <p>{t('connect_social.troubleshooting.step1')}</p>
                                    <p>{t('connect_social.troubleshooting.step2')}</p>
                                    <p>{t('connect_social.troubleshooting.step3')}</p>
                                    <p>{t('connect_social.troubleshooting.step4')}</p>
                                </AccordionContent>
                            </AccordionItem>

                            {/* Developer Settings & Tutorial */}
                            <AccordionItem value="item-2" className="border-b-0 border-t border-gray-200 dark:border-zinc-700">
                                <AccordionTrigger className="text-sm font-medium text-gray-700 dark:text-zinc-300 hover:no-underline py-4">
                                    <div className="flex items-center gap-2">
                                        <Key className="w-4 h-4 text-purple-500" />
                                        <span>Developer Settings & Custom API Key</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="text-sm text-gray-600 dark:text-zinc-400 space-y-6 pb-6 px-1">

                                    <div className="space-y-4 border p-4 rounded-lg bg-white dark:bg-zinc-900 border-gray-200 dark:border-zinc-800">
                                        <div className="space-y-1">
                                            <h4 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                                <Key className="w-3 h-3" /> Custom Meta App Config
                                            </h4>
                                            <p className="text-xs text-gray-500">
                                                Use your own Meta App ID and Secret for full control. Leave blank to use default FluxDM keys.
                                            </p>
                                        </div>

                                        <div className="space-y-3">
                                            <div className="space-y-1">
                                                <Label htmlFor="appId" className="text-xs">Meta App ID</Label>
                                                <Input
                                                    id="appId"
                                                    placeholder="Enter your App ID"
                                                    value={customAppId}
                                                    onChange={(e) => setCustomAppId(e.target.value)}
                                                    className="h-9 bg-gray-50 dark:bg-zinc-800"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <Label htmlFor="appSecret" className="text-xs">{t('connect_social.developer_settings.app_secret_label')} Key</Label>
                                                <div className="relative">
                                                    <Input
                                                        id="appSecret"
                                                        type={showSecret ? "text" : "password"}
                                                        placeholder={t('connect_social.developer_settings.app_secret_placeholder')}
                                                        value={customAppSecret}
                                                        onChange={(e) => setCustomAppSecret(e.target.value)}
                                                        className="h-9 pr-10 bg-gray-50 dark:bg-zinc-800"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowSecret(!showSecret)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                                                    >
                                                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="pt-3 border-t border-gray-200 dark:border-zinc-800 space-y-3">
                                                <div className="space-y-0.5">
                                                    <Label htmlFor="igAppId" className="text-xs font-semibold text-pink-600 dark:text-pink-400 flex items-center gap-1.5">
                                                        <Instagram className="w-3.5 h-3.5" /> Instagram App ID (Direct Login)
                                                    </Label>
                                                    <p className="text-[11px] text-gray-500 dark:text-zinc-400">
                                                        Meta Dashboard &gt; Products &gt; Instagram &gt; API setup with Instagram business login
                                                    </p>
                                                </div>
                                                <Input
                                                    id="igAppId"
                                                    placeholder="Enter your Instagram App ID"
                                                    value={customInstagramAppId}
                                                    onChange={(e) => setCustomInstagramAppId(e.target.value)}
                                                    className="h-9 bg-gray-50 dark:bg-zinc-800 font-mono text-xs"
                                                />

                                                <div className="space-y-0.5">
                                                    <Label htmlFor="igAppSecret" className="text-xs font-semibold text-pink-600 dark:text-pink-400">
                                                        Instagram App Secret
                                                    </Label>
                                                    <Input
                                                        id="igAppSecret"
                                                        type="password"
                                                        placeholder="Enter your Instagram App Secret"
                                                        value={customInstagramAppSecret}
                                                        onChange={(e) => setCustomInstagramAppSecret(e.target.value)}
                                                        className="h-9 bg-gray-50 dark:bg-zinc-800 font-mono text-xs"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <Label htmlFor="graphApiKey" className="text-xs">{t('connect_social.developer_settings.graph_api_key_label')}</Label>
                                                <Input
                                                    id="graphApiKey"
                                                    type="password"
                                                    placeholder={t('connect_social.developer_settings.graph_api_key_placeholder')}
                                                    value={customGraphApiKey}
                                                    onChange={(e) => setCustomGraphApiKey(e.target.value)}
                                                    className="h-9 bg-gray-50 dark:bg-zinc-800"
                                                />
                                            </div>

                                            <Button
                                                onClick={handleSaveSettings}
                                                disabled={isSavingSettings}
                                                size="sm"
                                                className="w-full mt-2"
                                                variant="outline"
                                            >
                                                {isSavingSettings ? t('connect_social.developer_settings.saving') : (
                                                    <>
                                                        <Save className="w-3 h-3 mr-2" />
                                                        {t('connect_social.developer_settings.save_button')}
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-2">
                                        <h4 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                            <Video className="w-4 h-4 text-red-500" />
                                            {t('connect_social.developer_settings.how_to_title')}
                                        </h4>
                                        <p className="text-xs text-gray-500">
                                            {t('connect_social.developer_settings.how_to_desc')}
                                        </p>

                                        <div className="relative w-full rounded-lg overflow-hidden shadow-md aspect-video bg-black">
                                            <iframe
                                                width="100%"
                                                height="100%"
                                                src="https://www.youtube.com/embed/BuF9g9_QC04?si=qTx8fGoeNnZ7D1Mn"
                                                title="YouTube video player"
                                                frameBorder="0"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                                allowFullScreen
                                            ></iframe>
                                        </div>

                                        <div className="flex justify-between items-center px-1">
                                            <a
                                                href="https://youtu.be/BuF9g9_QC04?si=qTx8fGoeNnZ7D1Mn"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-red-600 hover:underline flex items-center gap-1"
                                            >
                                                <Video className="w-3 h-3" />
                                                {t('connect_social.developer_settings.watch_on_youtube')}
                                            </a>

                                            <a
                                                href="https://developers.facebook.com/apps/"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-blue-600 hover:underline"
                                            >
                                                {t('connect_social.developer_settings.meta_dev_link')}
                                            </a>
                                        </div>
                                    </div>

                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>

                        {!window.ipcRenderer && (
                            <div className="text-center bg-red-50 p-3 rounded-lg border border-red-100 dark:bg-red-900/10 dark:border-red-900/30">
                                {navigator.userAgent.toLowerCase().includes('electron') ? (
                                    <p className="text-xs text-red-600 dark:text-red-400">
                                        ❌ <strong>{t('connect_social.error_bridge')}</strong><br />
                                        The preload script failed to load. Check console logs.
                                    </p>
                                ) : (
                                    <p className="text-xs text-red-500 dark:text-red-400">
                                        ⚠️ {t('connect_social.error_browser')}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
