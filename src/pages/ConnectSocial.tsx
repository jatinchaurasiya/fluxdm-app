import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Facebook, ShieldCheck, ShieldAlert, ArrowRight, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { useTranslation } from 'react-i18next';

export default function ConnectSocial() {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [pageName, setPageName] = useState('');
    const [accordionValue, setAccordionValue] = useState("");

    useEffect(() => {
        checkStatus();
    }, []);

    const checkStatus = async () => {
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('get-user-profile');
                if (res?.success && res.data) {
                    setIsConnected(true);
                    setPageName(res.data.name || 'Connected Account');
                } else {
                    setIsConnected(false);
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleConnect = async () => {
        setLoading(true);
        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('start-oauth-flow');

                if (res?.success) {
                    toast.success('Instagram Connected Successfully');
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    const errorMsg = res?.error || 'Unknown error';
                    toast.error('Connection Failed. Check your Page link.');

                    if (errorMsg.includes('No Instagram Business Account') || errorMsg.includes('Instagram Business Account linked')) {
                        setAccordionValue("item-1");
                    }
                }
            } else {
                toast.error('Desktop App Required. Cannot connect from browser.');
            }
        } catch (e) {
            toast.error('Error: ' + e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-5xl mx-auto h-full flex items-center justify-center bg-gray-50 dark:bg-black">
            <Card className="w-full max-w-lg shadow-2xl border-0 ring-1 ring-gray-200 dark:ring-zinc-800 dark:bg-zinc-900">
                <CardHeader className="text-center pt-10 pb-2">
                    <div className="mx-auto bg-blue-600 p-4 rounded-full mb-6 w-fit shadow-lg shadow-blue-900/20">
                        <Facebook className="w-10 h-10 text-white" />
                    </div>
                    <CardTitle className="text-2xl font-bold dark:text-white">{t('connect_social.title')}</CardTitle>
                    <CardDescription className="dark:text-zinc-400">
                        {t('connect_social.description')}
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

                <CardContent className="pt-8 pb-10 px-10">
                    <div className="space-y-6">
                        <div className="text-center text-sm text-gray-500 dark:text-zinc-500">
                            {t('connect_social.disclaimer')}
                        </div>

                        <Button
                            className="w-full h-14 text-lg font-bold bg-[#1877F2] hover:bg-[#166fe5] text-white shadow-lg transition-all dark:ring-2 dark:ring-blue-900/20"
                            onClick={handleConnect}
                            disabled={loading}
                            isLoading={loading}
                        >
                            {loading ? (
                                'Connecting...'
                            ) : isConnected ? (
                                <>
                                    <Plus className="w-5 h-5 mr-3" />
                                    Connect Another Account
                                </>
                            ) : (
                                <>
                                    <Facebook className="w-5 h-5 mr-3" />
                                    {t('connect_social.connect_fb')}
                                    <ArrowRight className="w-5 h-5 ml-auto opacity-70" />
                                </>
                            )}
                        </Button>

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
