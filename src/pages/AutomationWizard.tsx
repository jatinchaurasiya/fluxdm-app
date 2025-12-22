import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
    MessageCircle, PlayCircle, ArrowRight, ArrowLeft,
    CheckCircle, Mail, History, ExternalLink, UserCheck
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export default function AutomationWizard() {
    const { t } = useTranslation();
    const [step, setStep] = useState(1);

    // Form State
    const [formData, setFormData] = useState({
        triggerType: 'POST_COMMENT', // 'POST_COMMENT' | 'STORY_REPLY'
        triggerKeyword: '',
        publicReply: '',

        // Smart Follow Gate Fields
        hookText: '',
        verificationKeyword: 'READY', // Replaces buttonLabel
        isFollowGated: false,
        gateText: 'I checked, but you aren\'t following yet! Please follow and reply READY again.',
        rewardText: 'Thanks for following! Here is your link:',
        rewardLink: '',

        // Other Settings
        emailGate: false,
        smartRewind: false
    });

    const updateForm = (key: string, value: any) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const nextStep = () => setStep(prev => prev + 1);
    const prevStep = () => setStep(prev => prev - 1);

    const [loading, setLoading] = useState(false);

    const handleLaunch = async () => {
        setLoading(true);
        // Construct clean JSON object matching backend expectations
        const automationData = {
            name: formData.triggerKeyword ? `Keyword: ${formData.triggerKeyword}` : `New Automation ${new Date().toLocaleDateString()}`,
            trigger_type: formData.triggerType || 'POST_COMMENT',
            trigger_keyword: formData.triggerKeyword,

            // Standard/Legacy fields just in case
            reply_text: formData.publicReply, // Public reply

            // New Smart Flow Fields
            hook_text: formData.hookText,
            verification_keyword: formData.verificationKeyword,
            is_follow_gated: formData.isFollowGated,
            gate_text: formData.gateText,
            reward_text: formData.rewardText,
            reward_link: formData.rewardLink,

            settings: {
                emailCollect: formData.emailGate,
                smartRewind: formData.smartRewind
            }
        };



        try {
            // @ts-ignore
            if (window.ipcRenderer) {
                // @ts-ignore
                const res = await window.ipcRenderer.invoke('save-flow', automationData);

                if (res.success) {
                    toast.success("Automation Active");
                    // Reset or Redirect
                    window.location.hash = '#/automations';
                } else {
                    toast.error("Failed to save: " + res.error);
                }
            } else {
                toast.error("Desktop App Required");
            }
        } catch (e: any) {
            console.error("Save Error:", e);
            toast.error("Error: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    // Use a wider layout (grid) when on step 2 to show preview
    const isWide = step === 2;

    return (

        <div className="p-8 h-full overflow-y-auto bg-gray-50/50 dark:bg-black flex flex-col items-center">

            {/* Stepper Header */}
            <div className="w-full max-w-[800px] mb-8">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-bold dark:text-white">{t('automations.wizard.title')}</h2>
                    <span className="text-sm text-gray-500 dark:text-zinc-500">Step {step} of 3</span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full bg-black dark:bg-white transition-all duration-300 ease-out ${step === 1 ? 'w-1/3' : step === 2 ? 'w-2/3' : 'w-full'}`}
                    />
                </div>
                <div className="flex justify-between mt-2 text-xs font-medium text-gray-500 dark:text-zinc-500 uppercase tracking-wide">
                    <span className={step >= 1 ? 'text-black dark:text-white' : ''}>1. {t('automations.wizard.step_1')}</span>
                    <span className={step >= 2 ? 'text-black dark:text-white' : ''}>2. {t('automations.wizard.step_2')}</span>
                    <span className={step >= 3 ? 'text-black dark:text-white' : ''}>3. {t('automations.wizard.step_3')}</span>
                </div>
            </div>

            {/* Main Content Card */}
            <div className={`transition-all duration-300 ${isWide ? 'w-full max-w-[1100px] grid grid-cols-1 lg:grid-cols-5 gap-6' : 'w-full max-w-[800px]'}`}>

                <Card className={`shadow-lg border-0 ring-1 ring-gray-200 dark:ring-zinc-800 bg-white dark:bg-zinc-900 ${isWide ? 'lg:col-span-3' : ''}`}>
                    {step === 1 && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <CardHeader>
                                <CardTitle className="text-2xl dark:text-white">{t('automations.wizard.step_1_title')}</CardTitle>
                                <CardDescription className="dark:text-zinc-400">{t('automations.wizard.step_1_desc')}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-8">
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        className={`
                                            p-6 rounded-xl border-2 text-left transition-all hover:scale-[1.02]
                                            ${formData.triggerType === 'POST_COMMENT'
                                                ? 'border-black bg-gray-50 dark:border-white dark:bg-zinc-800'
                                                : 'border-gray-100 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700'
                                            }
                                        `}
                                        onClick={() => updateForm('triggerType', 'POST_COMMENT')}
                                    >
                                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-full w-fit mb-4">
                                            <MessageCircle className="w-6 h-6 text-blue-500" />
                                        </div>
                                        <h3 className="font-semibold text-lg dark:text-white">{t('automations.wizard.trigger_post_comment')}</h3>
                                        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">When someone comments on your posts or reels.</p>
                                    </button>

                                    <button
                                        className={`
                                            p-6 rounded-xl border-2 text-left transition-all hover:scale-[1.02]
                                            ${formData.triggerType === 'STORY_REPLY'
                                                ? 'border-black bg-gray-50 dark:border-white dark:bg-zinc-800'
                                                : 'border-gray-100 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700'
                                            }
                                        `}
                                        onClick={() => updateForm('triggerType', 'STORY_REPLY')}
                                    >
                                        <div className="p-3 bg-pink-50 dark:bg-pink-900/20 rounded-full w-fit mb-4">
                                            <PlayCircle className="w-6 h-6 text-pink-500" />
                                        </div>
                                        <h3 className="font-semibold text-lg dark:text-white">{t('automations.wizard.trigger_story_reply')}</h3>
                                        <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">When someone replies to your Instagram Story.</p>
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="keyword" className="text-base dark:text-white">{t('automations.wizard.trigger_keyword_label')}</Label>
                                    <Input
                                        id="keyword"
                                        placeholder="e.g. 'PRICE', 'INFO', or 'START'"
                                        value={formData.triggerKeyword}
                                        onChange={(e) => updateForm('triggerKeyword', e.target.value)}
                                        className="h-12 text-lg dark:bg-zinc-800 dark:border-zinc-700 dark:text-white"
                                    />
                                    <p className="text-xs text-gray-500 dark:text-zinc-500">Leave empty to match ALL comments/replies.</p>
                                </div>
                            </CardContent>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <CardHeader>
                                <CardTitle className="text-2xl dark:text-white">{t('automations.wizard.step_2_title')}</CardTitle>
                                <CardDescription className="dark:text-zinc-400">{t('automations.wizard.step_2_desc')}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-8">

                                {/* Public Reply (Only for Comments) */}
                                {formData.triggerType === 'POST_COMMENT' && (
                                    <div className="space-y-2 p-4 bg-gray-50 dark:bg-zinc-800/30 rounded-lg border border-gray-100 dark:border-zinc-800">
                                        <Label className="flex items-center gap-2 font-semibold dark:text-white">
                                            <MessageCircle className="w-4 h-4 text-gray-400" />
                                            Public Reply (Comment)
                                        </Label>
                                        <Textarea
                                            placeholder="Thanks for commenting! I've sent you a DM. 👇"
                                            rows={2}
                                            value={formData.publicReply}
                                            onChange={(e) => updateForm('publicReply', e.target.value)}
                                            className="bg-white dark:bg-zinc-900 border-none rounded-md resize-none dark:text-white"
                                        />
                                    </div>
                                )}

                                {/* SECTION A: The Hook */}
                                <div className={`space-y-4 border-l-2 pl-4 ${formData.hookText ? 'border-blue-500' : 'border-gray-200 dark:border-zinc-800'}`}>
                                    <div>
                                        <Label className="text-base font-semibold flex items-center gap-2 dark:text-white">
                                            <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs">1</span>
                                            {t('automations.wizard.hook_section')} <span className="text-xs font-normal text-gray-500 dark:text-zinc-500">(Sent immediately)</span>
                                        </Label>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500 dark:text-zinc-400">First DM Message</Label>
                                            <Textarea
                                                placeholder="Hey! 🔒 But you need to follow me first. Reply 'READY' here after you follow!"
                                                rows={3}
                                                value={formData.hookText}
                                                onChange={(e) => updateForm('hookText', e.target.value)}
                                                className="dark:bg-zinc-800 dark:border-zinc-700 dark:text-white"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500 dark:text-zinc-400">Verification Keyword</Label>
                                            <Input
                                                placeholder="READY"
                                                value={formData.verificationKeyword}
                                                onChange={(e) => updateForm('verificationKeyword', e.target.value)}
                                                className="uppercase dark:bg-zinc-800 dark:border-zinc-700 dark:text-white"
                                            />
                                            <p className="text-[10px] text-gray-400 dark:text-zinc-500">User must tap or type this exact word to confirm they followed.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* SECTION B: Follow Logic */}
                                <div className="p-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-zinc-800">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <UserCheck className={`w-5 h-5 ${formData.isFollowGated ? 'text-green-500' : 'text-gray-400'}`} />
                                            <div>
                                                <Label className="text-base cursor-pointer dark:text-white">{t('automations.wizard.enable_gate')}</Label>
                                                <p className="text-xs text-gray-500 dark:text-zinc-500">{t('automations.wizard.gate_desc')}</p>
                                            </div>
                                        </div>
                                        <Switch
                                            checked={formData.isFollowGated}
                                            onCheckedChange={(c) => updateForm('isFollowGated', c)}
                                            className="data-[state=checked]:bg-green-500"
                                        />
                                    </div>

                                    {/* SECTION C: Gatekeeper */}
                                    {formData.isFollowGated && (
                                        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-zinc-800 animate-in slide-in-from-top-2">
                                            <div className="space-y-3 px-2">
                                                <Label className="text-sm font-semibold flex items-center gap-2 text-orange-600 dark:text-orange-400">
                                                    2. {t('automations.wizard.gatekeeper_section')} <span className="text-xs font-normal opacity-70">(If they don't follow)</span>
                                                </Label>
                                                <Textarea
                                                    placeholder="I checked, but you aren't following yet! Please follow and reply READY again."
                                                    rows={2}
                                                    value={formData.gateText}
                                                    onChange={(e) => updateForm('gateText', e.target.value)}
                                                    className="border-orange-200 dark:border-orange-900/50 bg-white dark:bg-zinc-900 focus-visible:ring-orange-500 dark:text-white"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* SECTION D: The Reward */}
                                <div className={`space-y-4 border-l-2 pl-4 ${formData.rewardLink ? 'border-green-500' : 'border-gray-200 dark:border-zinc-800'}`}>
                                    <div>
                                        <Label className="text-base font-semibold flex items-center gap-2 dark:text-white">
                                            <span className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 flex items-center justify-center text-xs">3</span>
                                            {t('automations.wizard.payload_section')} <span className="text-xs font-normal text-gray-500 dark:text-zinc-500">(Sent after verification)</span>
                                        </Label>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500 dark:text-zinc-400">Success Message</Label>
                                            <Textarea
                                                placeholder="Here is the link you requested!"
                                                rows={2}
                                                value={formData.rewardText}
                                                onChange={(e) => updateForm('rewardText', e.target.value)}
                                                className="dark:bg-zinc-800 dark:border-zinc-700 dark:text-white"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs text-gray-500 dark:text-zinc-400">Destination URL</Label>
                                            <div className="relative">
                                                <ExternalLink className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                                                <Input
                                                    className="pl-9 dark:bg-zinc-800 dark:border-zinc-700 dark:text-white"
                                                    placeholder="https://your-site.com/secret"
                                                    value={formData.rewardLink}
                                                    onChange={(e) => updateForm('rewardLink', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                            </CardContent>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <CardHeader>
                                <CardTitle className="text-2xl dark:text-white">{t('automations.wizard.step_3_title')}</CardTitle>
                                <CardDescription className="dark:text-zinc-400">{t('automations.wizard.step_3_desc')}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">

                                <div
                                    className="flex items-center justify-between p-4 border rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors border-gray-200 dark:border-zinc-800"
                                    onClick={() => updateForm('emailGate', !formData.emailGate)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                            <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <Label className="text-base cursor-pointer dark:text-white">Email Collection (Coming Soon)</Label>
                                            <p className="text-xs text-gray-500 dark:text-zinc-500">Ask for email before sending the main payload.</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={formData.emailGate}
                                        onCheckedChange={(c) => updateForm('emailGate', c)}
                                        disabled // Disabled for now to focus on Follow Gate
                                    />
                                </div>

                                <div
                                    className="flex items-center justify-between p-4 border rounded-xl bg-gray-50/50 dark:bg-zinc-900/30 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800/50 transition-colors border-gray-200 dark:border-zinc-800"
                                    onClick={() => updateForm('smartRewind', !formData.smartRewind)}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                                            <History className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <Label className="text-base cursor-pointer dark:text-white">Smart Rewind</Label>
                                            <p className="text-xs text-gray-500 dark:text-zinc-500">Apply this automation to past comments (last 24h).</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={formData.smartRewind}
                                        onCheckedChange={(c) => updateForm('smartRewind', c)}
                                        className="data-[state=checked]:bg-orange-500"
                                    />
                                </div>

                                <div className="p-6 bg-green-50 dark:bg-green-900/10 rounded-xl border border-green-200 dark:border-green-900/30">
                                    <h4 className="font-semibold text-green-800 dark:text-green-400 mb-2">Ready to Launch?</h4>
                                    <ul className="text-sm space-y-2 text-green-700 dark:text-green-300">
                                        <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Trigger: {formData.triggerType} ({formData.triggerKeyword || 'All'})</li>
                                        <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Follow Gate: {formData.isFollowGated ? 'Active' : 'Disabled'}</li>
                                        <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Reward: {formData.rewardLink ? 'Link Attached' : 'No Link'}</li>
                                    </ul>
                                </div>

                            </CardContent>
                        </div>
                    )}

                    <CardFooter className="flex justify-between border-t border-gray-100 dark:border-zinc-800 pt-6 pb-6 px-8">
                        <Button
                            variant="ghost"
                            onClick={prevStep}
                            disabled={step === 1}
                            className="pl-0 hover:pl-2 transition-all dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" /> {t('automations.wizard.previous')}
                        </Button>

                        {step < 3 ? (
                            <Button onClick={nextStep} className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200">
                                {t('automations.wizard.next')} <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        ) : (
                            <Button onClick={handleLaunch} className="bg-green-600 hover:bg-green-700 text-white px-8" isLoading={loading}>
                                {!loading && <CheckCircle className="w-4 h-4 mr-2" />} {t('automations.wizard.launch_button')}
                            </Button>
                        )}
                    </CardFooter>
                </Card>

                {/* VISUAL PREVIEW SIDEBAR */}
                {isWide && (
                    <div className="lg:col-span-2 space-y-4 animate-in fade-in slide-in-from-right-8 duration-700">
                        <div className="bg-white dark:bg-black border border-gray-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-xl sticky top-4 max-h-[600px] flex flex-col">
                            <div className="bg-gray-100 dark:bg-zinc-900 p-4 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-center">
                                <span className="text-xs font-semibold text-gray-500 dark:text-zinc-500 uppercase tracking-widest">Conversation Preview</span>
                            </div>
                            <div className="flex-1 p-6 space-y-6 overflow-y-auto bg-[#FAFAFA] dark:bg-zinc-950">

                                {/* Bubble 1: Hook */}
                                <div className="flex flex-col items-start space-y-2 animate-in slide-in-from-left-2 transition-all">
                                    <div className="bg-gray-200 dark:bg-zinc-800 rounded-2xl rounded-tl-none px-4 py-3 max-w-[90%] shadow-sm">
                                        <p className="text-sm text-gray-800 dark:text-zinc-200">
                                            {formData.hookText || <span className="text-gray-400 italic">Enter hook text...</span>}
                                        </p>
                                    </div>
                                    <div className="text-[10px] text-gray-400 ml-2">
                                        User replies: <span className="font-mono text-xs bg-gray-100 dark:bg-zinc-900 px-1 rounded border border-gray-300 dark:border-zinc-700">{formData.verificationKeyword || "READY"}</span>
                                    </div>
                                </div>

                                {/* Bubble 2: Gatekeeper (Conditional) */}
                                {formData.isFollowGated && (
                                    <div className="flex flex-col items-start space-y-2 opacity-80 animate-in slide-in-from-left-4 delay-100">
                                        <div className="text-[10px] text-gray-400 ml-2 uppercase tracking-wide mb-1">If Not Following:</div>
                                        <div className="bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-900/50 rounded-2xl rounded-tl-none px-4 py-3 max-w-[90%] shadow-sm">
                                            <p className="text-sm text-orange-900 dark:text-orange-200">
                                                {formData.gateText || "Gate message..."}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Bubble 3: Reward */}
                                <div className="flex flex-col items-start space-y-2 animate-in slide-in-from-left-4 delay-200">
                                    <div className="text-[10px] text-gray-400 ml-2 uppercase tracking-wide mb-1">
                                        {formData.isFollowGated ? 'After Verification:' : 'After Keyword:'}
                                    </div>
                                    <div className="bg-blue-600 text-white rounded-2xl rounded-tl-none px-4 py-3 max-w-[90%] shadow-md">
                                        <p className="text-sm">
                                            {formData.rewardText || "Success message..."}
                                        </p>
                                    </div>
                                    {formData.rewardLink && (
                                        <div className="bg-white dark:bg-zinc-900 border-2 border-blue-100 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm max-w-[200px]">
                                            <div className="h-20 bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                                                <ExternalLink className="text-gray-400" />
                                            </div>
                                            <div className="p-2 text-xs text-gray-500 dark:text-zinc-500 truncate bg-gray-50 dark:bg-zinc-950">
                                                {formData.rewardLink}
                                            </div>
                                        </div>
                                    )}
                                </div>

                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
