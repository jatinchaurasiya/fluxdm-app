import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
    MessageCircle, PlayCircle, ArrowRight, ArrowLeft,
    CheckCircle, Mail, History, ExternalLink,
    ChevronLeft, Video, RotateCcw,
    Camera, Mic, Image as ImageIcon, Smile, Plus,
    MoreHorizontal, Bookmark, Sparkles, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { AutomationSuccessDialog } from '@/components/automations/AutomationSuccessDialog';
import MediaPicker from '@/components/instagram/MediaPicker';

interface RewardButton {
    id: string;
    title: string;
    url: string;
}

interface AutomationWizardProps {
    onNavigate?: (page: string) => void;
}

export default function AutomationWizard({ onNavigate }: AutomationWizardProps) {
    const { t } = useTranslation();
    const [step, setStep] = useState(1);
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Active Instagram account for live DM preview & default URLs
    const [activeAccount, setActiveAccount] = useState<{
        username?: string;
        name?: string;
        profile_picture_url?: string;
    } | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        triggerType: 'POST_COMMENT', // 'POST_COMMENT' | 'STORY_REPLY'
        triggerKeyword: '',
        publicReply: "Thanks for commenting! I've sent you a DM. 👇",
        attachedMediaId: null as string | null,
        targetPostMode: 'ALL' as 'ALL' | 'SPECIFIC',

        // Phase 1: Hook DM
        hookText: "Hey there! I'm so happy you're here, thanks so much for your interest 😊\n\nClick below and I'll send you the link in just a sec ✨",
        hookButtonText: 'Send me the link',

        // Phase 2: Follow Gatekeeper
        isFollowGated: true,
        gateText: "Oh no! It seems you're not following me 👀 It would really mean a lot if you visit my profile and hit the follow button 🤗.\nOnce you have done that, click on the 'I'm following' button below and you will get the link ✨.",
        visitProfileButtonText: 'Visit Profile',
        profileUrl: '',
        verifyButtonText: 'I\'m following ✅',

        // Phase 3: Payload / Reward (Custom Multi-Buttons up to 5)
        rewardText: 'Thanks for your comment!!',
        rewardButtons: [
            { id: '1', title: 'Here is Your Link!', url: 'https://fluxdm.space' },
            { id: '2', title: 'Linkedin Profile', url: 'https://linkedin.com' }
        ] as RewardButton[],

        // Other Settings
        emailGate: false,
        smartRewind: false
    });

    // Dynamic Button Management (Min 1, Max 5)
    const handleAddRewardButton = () => {
        if (formData.rewardButtons.length >= 5) {
            toast.error("Maximum 5 link buttons allowed per automation.");
            return;
        }
        const nextId = String(Date.now());
        const count = formData.rewardButtons.length + 1;
        setFormData(prev => ({
            ...prev,
            rewardButtons: [
                ...prev.rewardButtons,
                { id: nextId, title: `Link #${count}`, url: 'https://' }
            ]
        }));
    };

    const handleRemoveRewardButton = (id: string) => {
        if (formData.rewardButtons.length <= 1) {
            toast.error("At least 1 destination link button is required.");
            return;
        }
        setFormData(prev => ({
            ...prev,
            rewardButtons: prev.rewardButtons.filter(b => b.id !== id)
        }));
    };

    const handleUpdateRewardButton = (id: string, field: 'title' | 'url', value: string) => {
        setFormData(prev => ({
            ...prev,
            rewardButtons: prev.rewardButtons.map(b => {
                if (b.id === id) {
                    return {
                        ...b,
                        [field]: field === 'title' ? value.slice(0, 20) : value
                    };
                }
                return b;
            })
        }));
    };

    // Interactive Demo Simulation State
    const [simStep, setSimStep] = useState<number>(1); // 1: Hook sent, 2: Gatekeeper, 3: Reward delivered
    const [isSimTyping, setIsSimTyping] = useState<boolean>(false);
    const [simMode, setSimMode] = useState<'interactive' | 'full'>('interactive');
    const [simFeedback, setSimFeedback] = useState<string | null>(null);

    const triggerFeedback = (msg: string) => {
        setSimFeedback(msg);
        setTimeout(() => setSimFeedback(null), 3200);
    };

    const handleSimHookClick = () => {
        if (simStep !== 1 || isSimTyping) return;
        setIsSimTyping(true);
        setTimeout(() => {
            setIsSimTyping(false);
            if (formData.isFollowGated) {
                setSimStep(2);
                triggerFeedback("Follow Gatekeeper activated: checking follow status...");
            } else {
                setSimStep(3);
                triggerFeedback("Follow Gate disabled: link unlocked directly!");
            }
        }, 700);
    };

    const handleSimVerifyClick = () => {
        if (simStep !== 2 || isSimTyping) return;
        setIsSimTyping(true);
        setTimeout(() => {
            setIsSimTyping(false);
            setSimStep(3);
            triggerFeedback("Follower verified via Meta API ✅ Links unlocked!");
        }, 750);
    };

    const handleSimVisitProfile = () => {
        const target = formData.profileUrl || (activeAccount?.username ? `https://instagram.com/${activeAccount.username}` : 'https://instagram.com');
        triggerFeedback(`Simulating Profile Open: ${target}`);
    };

    const handleResetSim = () => {
        setSimStep(1);
        setIsSimTyping(false);
        setSimFeedback(null);
    };

    useEffect(() => {
        const fetchAccount = async () => {
            try {
                // @ts-ignore
                if (window.ipcRenderer) {
                    // @ts-ignore
                    const res = await window.ipcRenderer.invoke('get-accounts');
                    if (res?.success && res?.data?.length > 0) {
                        const acc = res.data.find((a: any) => a.id === res.activeId) || res.data[0];
                        if (acc) setActiveAccount(acc);
                    }
                }
            } catch (err) {
                console.error('Failed to load active account for preview:', err);
            }
        };
        fetchAccount();
    }, []);

    useEffect(() => {
        try {
            const raw = sessionStorage.getItem('edit_automation_flow');
            if (raw) {
                const flow = JSON.parse(raw);
                setEditingId(flow.id);
                const cfg = typeof flow.nodes_json === 'string' ? JSON.parse(flow.nodes_json || '{}') : (flow.nodes_json || {});

                let initialButtons: RewardButton[] = [
                    { id: '1', title: 'Here is Your Link!', url: 'https://fluxdm.space' },
                    { id: '2', title: 'Linkedin Profile', url: 'https://linkedin.com' }
                ];

                if (Array.isArray(cfg.reward_buttons) && cfg.reward_buttons.length > 0) {
                    initialButtons = cfg.reward_buttons.slice(0, 5).map((b: any, idx: number) => ({
                        id: b.id || String(idx + 1),
                        title: b.title || 'Here is Your Link!',
                        url: b.url || 'https://fluxdm.space'
                    }));
                } else if (cfg.reward_link) {
                    initialButtons = [
                        { id: '1', title: cfg.reward_button_text || 'Here is Your Link!', url: cfg.reward_link },
                        ...(cfg.secondary_button_text && cfg.secondary_link ? [{
                            id: '2',
                            title: cfg.secondary_button_text,
                            url: cfg.secondary_link
                        }] : [])
                    ];
                }

                setFormData({
                    triggerType: flow.trigger_type || 'POST_COMMENT',
                    triggerKeyword: flow.trigger_keyword || '',
                    publicReply: flow.reply_text || "Thanks for commenting! I've sent you a DM. 👇",
                    attachedMediaId: flow.attached_media_id || null,
                    targetPostMode: flow.attached_media_id ? 'SPECIFIC' : 'ALL',

                    hookText: cfg.hook_text || "Hey there! I'm so happy you're here, thanks so much for your interest 😊\n\nClick below and I'll send you the link in just a sec ✨",
                    hookButtonText: cfg.hook_button_text || 'Send me the link',
                    isFollowGated: cfg.is_follow_gated !== undefined ? Boolean(cfg.is_follow_gated) : true,
                    gateText: cfg.gate_text || "Oh no! It seems you're not following me 👀 It would really mean a lot if you visit my profile and hit the follow button 🤗.\nOnce you have done that, click on the 'I'm following' button below and you will get the link ✨.",
                    visitProfileButtonText: cfg.visit_profile_button_text || 'Visit Profile',
                    profileUrl: cfg.profile_url || '',
                    verifyButtonText: cfg.verify_button_text || "I'm following ✅",
                    rewardText: cfg.reward_text || 'Thanks for your comment!!',
                    rewardButtons: initialButtons,

                    emailGate: Boolean(cfg.settings?.emailCollect),
                    smartRewind: Boolean(cfg.settings?.smartRewind)
                });
                sessionStorage.removeItem('edit_automation_flow');
            }
        } catch (e) {
            console.error('Failed to parse flow for editing:', e);
        }
    }, []);

    const updateForm = (key: string, value: any) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const nextStep = () => setStep(prev => prev + 1);
    const prevStep = () => setStep(prev => prev - 1);

    const [loading, setLoading] = useState(false);

    const handleNavigate = (page: string) => {
        if (onNavigate) {
            onNavigate(page);
        } else {
            window.location.hash = `#/${page}`;
        }
    };

    const handleLaunch = async () => {
        setLoading(true);
        const resolvedProfileUrl = formData.profileUrl || (activeAccount?.username ? `https://instagram.com/${activeAccount.username}` : '');

        const automationData = {
            id: editingId || undefined,
            name: formData.triggerKeyword ? `Keyword: ${formData.triggerKeyword}` : `New Automation ${new Date().toLocaleDateString()}`,
            trigger_type: formData.triggerType || 'POST_COMMENT',
            trigger_keyword: formData.triggerKeyword,
            attached_media_id: formData.targetPostMode === 'SPECIFIC' ? formData.attachedMediaId : null,
            reply_text: formData.publicReply,

            // Smart Follow Sequence Fields
            hook_text: formData.hookText,
            hook_button_text: formData.hookButtonText || 'Send me the link',
            is_follow_gated: formData.isFollowGated,
            gate_text: formData.gateText,
            visit_profile_button_text: formData.visitProfileButtonText || 'Visit Profile',
            profile_url: resolvedProfileUrl,
            verify_button_text: formData.verifyButtonText || "I'm following ✅",
            reward_text: formData.rewardText,

            // Dynamic Multi-Buttons (Up to 5 buttons) + Legacy fallback fields
            reward_button_text: formData.rewardButtons[0]?.title || 'Here is Your Link!',
            reward_link: formData.rewardButtons[0]?.url || 'https://fluxdm.space',
            secondary_button_text: formData.rewardButtons[1]?.title || '',
            secondary_link: formData.rewardButtons[1]?.url || '',
            reward_buttons: formData.rewardButtons,

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
                    setShowSuccessDialog(true);
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

    const isWide = step === 2;
    const accountHandle = activeAccount?.username || 'project.oneeighty';
    const accountName = activeAccount?.name || accountHandle;

    return (
        <div className="p-5 md:p-8 flex-1 min-h-0 w-full overflow-y-auto bg-gray-50/60 dark:bg-black flex flex-col items-center pb-24">

            {/* Stepper Header with Persistent Action Buttons */}
            <div className={`transition-all duration-300 mb-5 ${isWide ? 'w-full max-w-[1200px]' : 'w-full max-w-[800px]'}`}>
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h2 className="text-xl font-bold dark:text-white tracking-tight">{t('automations.wizard.title')}</h2>
                        <span className="text-xs font-medium text-gray-500 dark:text-zinc-400">
                            Step {step} of 3 • <span className="text-black dark:text-white font-semibold">{step === 1 ? t('automations.wizard.step_1') : step === 2 ? t('automations.wizard.step_2') : t('automations.wizard.step_3')}</span>
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        {step > 1 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={prevStep}
                                className="h-9 px-3.5 text-xs font-medium border-gray-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-700"
                            >
                                <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> {t('automations.wizard.previous')}
                            </Button>
                        )}

                        {step < 3 ? (
                            <Button
                                size="sm"
                                onClick={nextStep}
                                className="h-9 px-4 text-xs font-semibold bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 shadow-sm"
                            >
                                {t('automations.wizard.next')} <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                onClick={handleLaunch}
                                className="h-9 px-5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white shadow-sm"
                                isLoading={loading}
                            >
                                {!loading && <CheckCircle className="w-3.5 h-3.5 mr-1.5" />} {t('automations.wizard.launch_button')}
                            </Button>
                        )}
                    </div>
                </div>

                <div className="h-1.5 bg-gray-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full bg-black dark:bg-white transition-all duration-300 ease-out ${step === 1 ? 'w-1/3' : step === 2 ? 'w-2/3' : 'w-full'}`}
                    />
                </div>
            </div>

            {/* Main Content Area */}
            <div className={`transition-all duration-300 ${isWide ? 'w-full max-w-[1200px] grid grid-cols-1 lg:grid-cols-12 gap-6 items-start' : 'w-full max-w-[800px]'}`}>

                {/* Left Column: Form Configuration */}
                <Card className={`shadow-sm border border-gray-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 ${isWide ? 'lg:col-span-7' : ''}`}>
                    {step === 1 && (
                        <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
                            <CardHeader>
                                <CardTitle className="text-xl font-bold dark:text-white">{t('automations.wizard.step_1_title')}</CardTitle>
                                <CardDescription className="dark:text-zinc-400">{t('automations.wizard.step_1_desc')}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        className={`
                                            p-5 rounded-2xl border-2 text-left transition-all hover:scale-[1.01]
                                            ${formData.triggerType === 'POST_COMMENT'
                                                ? 'border-black bg-zinc-50 dark:border-white dark:bg-zinc-800/80 shadow-xs'
                                                : 'border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700'
                                            }
                                        `}
                                        onClick={() => updateForm('triggerType', 'POST_COMMENT')}
                                    >
                                        <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 rounded-xl w-fit mb-3">
                                            <MessageCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <h3 className="font-semibold text-base dark:text-white">{t('automations.wizard.trigger_post_comment')}</h3>
                                        <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">When someone comments on your posts or reels.</p>
                                    </button>

                                    <button
                                        type="button"
                                        className={`
                                            p-5 rounded-2xl border-2 text-left transition-all hover:scale-[1.01]
                                            ${formData.triggerType === 'STORY_REPLY'
                                                ? 'border-black bg-zinc-50 dark:border-white dark:bg-zinc-800/80 shadow-xs'
                                                : 'border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700'
                                            }
                                        `}
                                        onClick={() => updateForm('triggerType', 'STORY_REPLY')}
                                    >
                                        <div className="p-2.5 bg-pink-50 dark:bg-pink-900/30 rounded-xl w-fit mb-3">
                                            <PlayCircle className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                                        </div>
                                        <h3 className="font-semibold text-base dark:text-white">{t('automations.wizard.trigger_story_reply')}</h3>
                                        <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1">When someone replies to your Instagram Story.</p>
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="keyword" className="text-sm font-semibold dark:text-white">{t('automations.wizard.trigger_keyword_label')}</Label>
                                    <Input
                                        id="keyword"
                                        placeholder="e.g. 'TOOLKIT', 'LINK', or 'AI'"
                                        value={formData.triggerKeyword}
                                        onChange={(e) => updateForm('triggerKeyword', e.target.value)}
                                        className="h-11 text-sm dark:bg-zinc-800 dark:border-zinc-700 dark:text-white"
                                    />
                                    <p className="text-xs text-gray-500 dark:text-zinc-500">Leave empty to trigger on ANY comment or reply.</p>
                                </div>

                                {/* Target Post/Reel Selector */}
                                <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                                    <Label className="text-sm font-semibold dark:text-white">Target Post or Reel</Label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => updateForm('targetPostMode', 'ALL')}
                                            className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                                                formData.targetPostMode === 'ALL'
                                                    ? 'border-black bg-zinc-100 text-black dark:border-white dark:bg-zinc-800 dark:text-white font-semibold'
                                                    : 'border-gray-200 dark:border-zinc-800 text-gray-500 dark:text-zinc-400'
                                            }`}
                                        >
                                            All Current & Future Posts
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateForm('targetPostMode', 'SPECIFIC')}
                                            className={`flex-1 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                                                formData.targetPostMode === 'SPECIFIC'
                                                    ? 'border-black bg-zinc-100 text-black dark:border-white dark:bg-zinc-800 dark:text-white font-semibold'
                                                    : 'border-gray-200 dark:border-zinc-800 text-gray-500 dark:text-zinc-400'
                                            }`}
                                        >
                                            Select Specific Post / Reel
                                        </button>
                                    </div>

                                    {formData.targetPostMode === 'SPECIFIC' && (
                                        <div className="p-3 bg-gray-50 dark:bg-zinc-800/40 rounded-xl border border-gray-200 dark:border-zinc-800 mt-2">
                                            <MediaPicker
                                                selectedId={formData.attachedMediaId}
                                                onSelect={(id) => updateForm('attachedMediaId', id)}
                                            />
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
                            <CardHeader className="pb-4">
                                <CardTitle className="text-xl font-bold dark:text-white">{t('automations.wizard.step_2_title')}</CardTitle>
                                <CardDescription className="dark:text-zinc-400">
                                    Configure your ManyChat-style sequence. Add up to 5 custom destination link buttons with live preview.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">

                                {/* Public Reply (Post Comment) */}
                                {formData.triggerType === 'POST_COMMENT' && (
                                    <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label className="flex items-center gap-2 font-semibold text-xs text-zinc-800 dark:text-zinc-200">
                                                <MessageCircle className="w-3.5 h-3.5 text-blue-500" />
                                                Public Post Reply (Comment)
                                            </Label>
                                            <span className="text-[10px] text-zinc-500 font-medium">Auto-Comment</span>
                                        </div>
                                        <Input
                                            placeholder="Thanks for commenting! I've sent you a DM. 👇"
                                            value={formData.publicReply}
                                            onChange={(e) => updateForm('publicReply', e.target.value)}
                                            className="h-9 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-xs dark:text-white"
                                        />
                                    </div>
                                )}

                                {/* STEP 1: The Initial Hook DM */}
                                <div className="p-4 rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3.5 shadow-2xs">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-black flex items-center justify-center text-xs font-bold">
                                                1
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-xs text-zinc-900 dark:text-white uppercase tracking-wider">
                                                    Initial Hook Message
                                                </h3>
                                                <p className="text-[11px] text-zinc-500">Sent immediately when someone comments</p>
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300">
                                            Instant DM
                                        </span>
                                    </div>

                                    <div className="space-y-2.5">
                                        <div className="space-y-1">
                                            <Label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">First DM Message</Label>
                                            <Textarea
                                                rows={3}
                                                value={formData.hookText}
                                                onChange={(e) => updateForm('hookText', e.target.value)}
                                                className="bg-zinc-50/70 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-white text-xs leading-relaxed resize-none"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Action Button Label</Label>
                                                <span className="text-[10px] text-zinc-400 font-mono">{(formData.hookButtonText || '').length}/20 chars</span>
                                            </div>
                                            <Input
                                                placeholder="Send me the link"
                                                maxLength={20}
                                                value={formData.hookButtonText}
                                                onChange={(e) => updateForm('hookButtonText', e.target.value)}
                                                className="h-9 bg-zinc-50/70 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-white text-xs"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* STEP 2: Follow Gatekeeper (Meta Graph API) */}
                                <div className="p-4 rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3.5 shadow-2xs">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-black flex items-center justify-center text-xs font-bold">
                                                2
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-xs text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                                    Smart Follow Gate
                                                    <span className="text-[10px] font-normal px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                                        Meta API
                                                    </span>
                                                </h3>
                                                <p className="text-[11px] text-zinc-500">Only send rewards to verified followers</p>
                                            </div>
                                        </div>
                                        <Switch
                                            checked={formData.isFollowGated}
                                            onCheckedChange={(c) => updateForm('isFollowGated', c)}
                                            className="data-[state=checked]:bg-emerald-500"
                                        />
                                    </div>

                                    {formData.isFollowGated && (
                                        <div className="space-y-3 pt-1 border-t border-zinc-100 dark:border-zinc-800 animate-in fade-in duration-200">
                                            <div className="space-y-1">
                                                <Label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                                    Gatekeeper Message <span className="text-zinc-400 font-normal">(Sent if user doesn't follow yet)</span>
                                                </Label>
                                                <Textarea
                                                    rows={3}
                                                    value={formData.gateText}
                                                    onChange={(e) => updateForm('gateText', e.target.value)}
                                                    className="bg-zinc-50/70 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-white text-xs leading-relaxed resize-none"
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {/* Profile Button Card */}
                                                <div className="p-3 bg-zinc-50/80 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-zinc-700/80 space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <Label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                                                            <ExternalLink className="w-3 h-3 text-blue-500" />
                                                            Profile Button Title
                                                        </Label>
                                                        <span className="text-[10px] text-zinc-400 font-mono">{(formData.visitProfileButtonText || '').length}/20</span>
                                                    </div>
                                                    <Input
                                                        placeholder="Visit Profile (or Mera Profile)"
                                                        maxLength={20}
                                                        value={formData.visitProfileButtonText}
                                                        onChange={(e) => updateForm('visitProfileButtonText', e.target.value)}
                                                        className="h-8.5 bg-white dark:bg-zinc-900 text-xs dark:text-white"
                                                    />
                                                    <div className="pt-0.5">
                                                        <Label className="text-[10px] text-zinc-500">Custom Profile URL (Optional)</Label>
                                                        <Input
                                                            placeholder={activeAccount?.username ? `https://instagram.com/${activeAccount.username}` : 'https://instagram.com/your_handle'}
                                                            value={formData.profileUrl}
                                                            onChange={(e) => updateForm('profileUrl', e.target.value)}
                                                            className="h-8 bg-white dark:bg-zinc-900 text-[11px] text-zinc-600 dark:text-zinc-300 mt-0.5"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Verification Button Card */}
                                                <div className="p-3 bg-zinc-50/80 dark:bg-zinc-800/40 rounded-xl border border-zinc-200 dark:border-zinc-700/80 space-y-2 flex flex-col justify-between">
                                                    <div>
                                                        <div className="flex items-center justify-between mb-2">
                                                            <Label className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                                                                <CheckCircle className="w-3 h-3 text-emerald-500" />
                                                                Verification Button Title
                                                            </Label>
                                                            <span className="text-[10px] text-zinc-400 font-mono">{(formData.verifyButtonText || '').length}/20</span>
                                                        </div>
                                                        <Input
                                                            placeholder="I'm following ✅"
                                                            maxLength={20}
                                                            value={formData.verifyButtonText}
                                                            onChange={(e) => updateForm('verifyButtonText', e.target.value)}
                                                            className="h-8.5 bg-white dark:bg-zinc-900 text-xs dark:text-white"
                                                        />
                                                    </div>
                                                    <p className="text-[10px] text-zinc-500 leading-tight pt-1">
                                                        Tapping this re-checks follow status via Meta Graph API and delivers the link!
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* STEP 3: The Reward Payload (Dynamic Multi-Button List up to 5) */}
                                <div className="p-4 rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-3.5 shadow-2xs">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-black flex items-center justify-center text-xs font-bold">
                                                3
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-xs text-zinc-900 dark:text-white uppercase tracking-wider">
                                                    Reward Payload Delivery
                                                </h3>
                                                <p className="text-[11px] text-zinc-500">Delivered immediately once follower status is confirmed</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                                                {formData.rewardButtons.length}/5 Buttons
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-1">
                                        <div className="space-y-1">
                                            <Label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Success Message Text</Label>
                                            <Input
                                                placeholder="Thanks for your comment!!"
                                                value={formData.rewardText}
                                                onChange={(e) => updateForm('rewardText', e.target.value)}
                                                className="h-9 bg-zinc-50/70 dark:bg-zinc-800/60 dark:border-zinc-700 dark:text-white text-xs"
                                            />
                                        </div>

                                        {/* Dynamic Buttons List Header */}
                                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                                            <div>
                                                <Label className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                                                    <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                                                    Custom Link Buttons <span className="text-zinc-400 font-normal text-[11px]">(Min 1, Max 5)</span>
                                                </Label>
                                                <p className="text-[10px] text-zinc-500">Users tap these buttons in Instagram DM to open your links.</p>
                                            </div>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handleAddRewardButton}
                                                disabled={formData.rewardButtons.length >= 5}
                                                className="h-7 px-2.5 text-[11px] font-medium border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                                            >
                                                <Plus className="w-3 h-3 mr-1" />
                                                Add Link Button
                                            </Button>
                                        </div>

                                        {/* Dynamic Buttons Cards */}
                                        <div className="space-y-2.5">
                                            {formData.rewardButtons.map((btn, idx) => (
                                                <div
                                                    key={btn.id}
                                                    className="p-3 bg-zinc-50/90 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700/80 space-y-2 animate-in fade-in duration-150"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 bg-white dark:bg-zinc-900 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700">
                                                            Button #{idx + 1}
                                                        </span>

                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] text-zinc-400 font-mono">
                                                                {(btn.title || '').length}/20 chars
                                                            </span>
                                                            {formData.rewardButtons.length > 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveRewardButton(btn.id)}
                                                                    className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all cursor-pointer"
                                                                    title="Delete this link button"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                        <div>
                                                            <Label className="text-[10px] text-zinc-500">Button Label (Max 20 chars)</Label>
                                                            <Input
                                                                placeholder="e.g. Here is Your Link!"
                                                                maxLength={20}
                                                                value={btn.title}
                                                                onChange={(e) => handleUpdateRewardButton(btn.id, 'title', e.target.value)}
                                                                className="h-8.5 bg-white dark:bg-zinc-900 text-xs dark:text-white mt-0.5"
                                                            />
                                                        </div>
                                                        <div>
                                                            <Label className="text-[10px] text-zinc-500">Destination URL</Label>
                                                            <Input
                                                                placeholder="https://yourwebsite.com/link"
                                                                value={btn.url}
                                                                onChange={(e) => handleUpdateRewardButton(btn.id, 'url', e.target.value)}
                                                                className="h-8.5 bg-white dark:bg-zinc-900 text-xs dark:text-white mt-0.5"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                            </CardContent>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="animate-in fade-in slide-in-from-bottom-3 duration-300">
                            <CardHeader>
                                <CardTitle className="text-xl font-bold dark:text-white">{t('automations.wizard.step_3_title')}</CardTitle>
                                <CardDescription className="dark:text-zinc-400">{t('automations.wizard.step_3_desc')}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5">

                                <div
                                    className="flex items-center justify-between p-4 border rounded-2xl cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors border-gray-200 dark:border-zinc-800"
                                    onClick={() => updateForm('emailGate', !formData.emailGate)}
                                >
                                    <div className="flex items-center gap-3.5">
                                        <div className="p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                                            <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <Label className="text-sm font-semibold cursor-pointer dark:text-white">Email Collection (Coming Soon)</Label>
                                            <p className="text-xs text-gray-500 dark:text-zinc-500">Ask for email address before sending the main payload.</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={formData.emailGate}
                                        onCheckedChange={(c) => updateForm('emailGate', c)}
                                        disabled
                                    />
                                </div>

                                <div
                                    className="flex items-center justify-between p-4 border rounded-2xl bg-gray-50/50 dark:bg-zinc-900/30 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800/50 transition-colors border-gray-200 dark:border-zinc-800"
                                    onClick={() => updateForm('smartRewind', !formData.smartRewind)}
                                >
                                    <div className="flex items-center gap-3.5">
                                        <div className="p-2.5 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
                                            <History className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <Label className="text-sm font-semibold cursor-pointer dark:text-white">Smart Rewind</Label>
                                            <p className="text-xs text-gray-500 dark:text-zinc-500">Apply this automation to past comments from the last 24h.</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={formData.smartRewind}
                                        onCheckedChange={(c) => updateForm('smartRewind', c)}
                                        className="data-[state=checked]:bg-orange-500"
                                    />
                                </div>

                                <div className="p-5 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-900/40">
                                    <h4 className="font-semibold text-sm text-emerald-900 dark:text-emerald-300 mb-2.5 flex items-center gap-1.5">
                                        <Sparkles className="w-4 h-4 text-emerald-500" /> Automation Summary
                                    </h4>
                                    <ul className="text-xs space-y-2 text-emerald-800 dark:text-emerald-300/90">
                                        <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Trigger: {formData.triggerType} ({formData.triggerKeyword || 'All Comments'})</li>
                                        <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Follow Gate: {formData.isFollowGated ? 'Active (Meta Graph API verified)' : 'Disabled'}</li>
                                        <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Hook Button: "{formData.hookButtonText}"</li>
                                        <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Profile Button: "{formData.visitProfileButtonText}"</li>
                                        <li className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Reward Payload: {formData.rewardButtons.length} Custom Link Buttons configured</li>
                                    </ul>
                                </div>

                            </CardContent>
                        </div>
                    )}

                    <CardFooter className="flex justify-between border-t border-gray-100 dark:border-zinc-800 pt-4 pb-4 px-6 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-b-xl">
                        <Button
                            variant="ghost"
                            onClick={prevStep}
                            disabled={step === 1}
                            className="pl-0 hover:pl-1 transition-all text-xs dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800"
                        >
                            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> {t('automations.wizard.previous')}
                        </Button>

                        {step < 3 ? (
                            <Button onClick={nextStep} className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 px-5 text-xs font-semibold shadow-xs">
                                {t('automations.wizard.next')} <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                            </Button>
                        ) : (
                            <Button onClick={handleLaunch} className="bg-emerald-600 hover:bg-emerald-700 text-white px-7 text-xs font-semibold shadow-xs" isLoading={loading}>
                                {!loading && <CheckCircle className="w-3.5 h-3.5 mr-1.5" />} {t('automations.wizard.launch_button')}
                            </Button>
                        )}
                    </CardFooter>
                </Card>

                {/* Right Column: Working Ultra-Realistic Instagram Phone Mockup */}
                {isWide && (
                    <div className="lg:col-span-5 space-y-2.5 animate-in fade-in slide-in-from-right-4 duration-300 sticky top-4">
                        
                        {/* Interactive Mode Controls */}
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-1 bg-zinc-200/70 dark:bg-zinc-800/80 p-1 rounded-xl">
                                <button
                                    type="button"
                                    onClick={() => setSimMode('interactive')}
                                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                                        simMode === 'interactive'
                                            ? 'bg-white dark:bg-zinc-900 text-black dark:text-white shadow-xs'
                                            : 'text-zinc-500 hover:text-black dark:hover:text-white'
                                    }`}
                                >
                                    Interactive Demo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSimMode('full')}
                                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                                        simMode === 'full'
                                            ? 'bg-white dark:bg-zinc-900 text-black dark:text-white shadow-xs'
                                            : 'text-zinc-500 hover:text-black dark:hover:text-white'
                                    }`}
                                >
                                    Full Overview
                                </button>
                            </div>

                            {simMode === 'interactive' && (
                                <button
                                    type="button"
                                    onClick={handleResetSim}
                                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-black dark:hover:text-white bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-2xs transition-all active:scale-95"
                                    title="Reset interactive preview to step 1"
                                >
                                    <RotateCcw className="w-3 h-3 text-zinc-500" />
                                    <span>Restart</span>
                                </button>
                            )}
                        </div>

                        {/* Physical Smartphone Frame */}
                        <div className="w-[335px] sm:w-[350px] h-[670px] bg-[#121316] rounded-[48px] p-2.5 border-[4px] border-[#22242a] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08)] flex flex-col relative select-none mx-auto">
                            
                            {/* Device Inner Screen */}
                            <div className="flex-1 bg-black rounded-[38px] overflow-hidden flex flex-col relative border border-white/5">
                                
                                {/* Top Floating Simulated Toast Banner */}
                                {simFeedback && (
                                    <div className="absolute top-16 left-3 right-3 z-40 bg-zinc-900/95 border border-zinc-700 text-white text-[11px] font-medium py-2 px-3 rounded-2xl shadow-xl backdrop-blur text-center animate-in fade-in slide-in-from-top-2 duration-200">
                                        {simFeedback}
                                    </div>
                                )}

                                {/* Dynamic Island / Speaker Pill */}
                                <div className="w-24 h-5 bg-[#0a0a0b] rounded-full mx-auto mt-2 flex items-center justify-end px-2.5 z-30 ring-1 ring-white/10">
                                    <div className="w-2.5 h-2.5 rounded-full bg-[#181a20] border border-white/10 flex items-center justify-center">
                                        <div className="w-1 h-1 rounded-full bg-[#2a2c35]" />
                                    </div>
                                </div>

                                {/* Status Bar */}
                                <div className="px-5 pt-1 pb-1 flex items-center justify-between text-[11px] text-zinc-300 font-semibold tracking-tight">
                                    <span>2:19</span>
                                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-300">
                                        <span>5G</span>
                                        <div className="w-5 h-2.5 border border-zinc-400 rounded-xs p-0.5 flex items-center">
                                            <div className="h-full bg-white rounded-2xs w-[82%]" />
                                        </div>
                                    </div>
                                </div>

                                {/* Instagram DM Header (1:1 from Competitor Reference) */}
                                <div className="px-3.5 py-2.5 bg-black/95 backdrop-blur border-b border-zinc-900 flex items-center justify-between z-20">
                                    <div className="flex items-center gap-2.5">
                                        <ChevronLeft className="w-5 h-5 text-white cursor-pointer" />
                                        
                                        {/* Avatar with colorful Instagram Story gradient ring */}
                                        <div className="p-[2px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 rounded-full">
                                            {activeAccount?.profile_picture_url ? (
                                                <img
                                                    src={activeAccount.profile_picture_url}
                                                    alt="Profile"
                                                    className="w-7 h-7 rounded-full object-cover border border-black"
                                                />
                                            ) : (
                                                <div className="w-7 h-7 rounded-full bg-zinc-800 border border-black flex items-center justify-center text-white text-[11px] font-bold">
                                                    {accountHandle?.[0]?.toUpperCase() || 'P'}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex flex-col leading-tight">
                                            <div className="flex items-center gap-1">
                                                <span className="font-semibold text-xs text-white truncate max-w-[120px]">
                                                    {accountName}
                                                </span>
                                                {/* Meta Verified Blue Tick */}
                                                <svg className="w-3.5 h-3.5 fill-[#0095f6]" viewBox="0 0 24 24">
                                                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.8 14.5l-4-4 1.4-1.4 2.6 2.6 6.6-6.6 1.4 1.4-8 8z" />
                                                </svg>
                                            </div>
                                            <span className="text-[10px] text-zinc-400 truncate max-w-[120px]">
                                                {accountHandle}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Header Action Icons */}
                                    <div className="flex items-center gap-3 text-zinc-300 pr-1">
                                        <Video className="w-4 h-4 cursor-pointer" />
                                        <Bookmark className="w-4 h-4 cursor-pointer" />
                                        <MoreHorizontal className="w-4 h-4 cursor-pointer" />
                                    </div>
                                </div>

                                {/* Instagram Context Banner */}
                                <div className="py-1.5 px-4 bg-black text-center border-b border-zinc-900/60 leading-tight">
                                    <p className="text-[10px] text-zinc-400">
                                        {accountHandle} messaged you about a comment you made on their post. <span className="text-[#0095f6] font-semibold cursor-pointer">See Post</span>
                                    </p>
                                </div>

                                {/* Scrollable Instagram Chat Stream */}
                                <div className="flex-1 p-3 space-y-3 overflow-y-auto bg-black text-xs">
                                    
                                    {/* 1. Bot Hook Bubble with Integrated Button Card */}
                                    <div className="flex items-end gap-2 max-w-[88%]">
                                        <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 mb-1 border border-zinc-700">
                                            {activeAccount?.profile_picture_url ? (
                                                <img src={activeAccount.profile_picture_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-white text-[9px] font-bold">
                                                    {accountHandle[0]?.toUpperCase()}
                                                </div>
                                            )}
                                        </div>

                                        <div className="bg-[#262626] text-white rounded-[22px] rounded-bl-[4px] p-3.5 shadow-sm leading-relaxed whitespace-pre-line text-[12.5px] w-full">
                                            <p className="mb-3">{formData.hookText || "Hey there! Tap below to get the link ✨"}</p>
                                            
                                            {/* Native Instagram DM Button Inside Bubble */}
                                            <button
                                                type="button"
                                                onClick={handleSimHookClick}
                                                className={`w-full bg-[#33373d] hover:bg-[#3d424b] active:bg-[#484e58] text-white font-medium text-[12.5px] py-2.5 px-4 rounded-xl text-center cursor-pointer transition-all border border-white/5 flex items-center justify-center ${
                                                    simMode === 'interactive' && simStep === 1 ? 'ring-2 ring-blue-500/50 animate-pulse' : ''
                                                }`}
                                            >
                                                <span>{formData.hookButtonText || "Send me the link"}</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* 2. User Response Bubble (Purple Pill) */}
                                    {(simMode === 'full' || simStep >= 2) && (
                                        <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
                                            <div className="bg-[#7000ff] text-white rounded-[22px] rounded-br-[4px] px-4 py-2.5 max-w-[78%] text-[12.5px] font-normal shadow-sm">
                                                {formData.hookButtonText || "Send me the link"}
                                            </div>
                                        </div>
                                    )}

                                    {/* 3. Bot Follow Gatekeeper Bubble (If enabled) */}
                                    {formData.isFollowGated && (simMode === 'full' || simStep >= 2) && (
                                        <div className="flex items-end gap-2 max-w-[88%] animate-in fade-in slide-in-from-bottom-2 duration-200">
                                            <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 mb-1 border border-zinc-700">
                                                {activeAccount?.profile_picture_url ? (
                                                    <img src={activeAccount.profile_picture_url} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-white text-[9px] font-bold">
                                                        {accountHandle[0]?.toUpperCase()}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="bg-[#262626] text-white rounded-[22px] rounded-bl-[4px] p-3.5 shadow-sm leading-relaxed whitespace-pre-line text-[12.5px] w-full">
                                                <p className="mb-3">{formData.gateText || "Oh no! It seems you're not following me 👀"}</p>
                                                
                                                {/* Two Stacked Action Buttons */}
                                                <div className="space-y-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={handleSimVisitProfile}
                                                        className="w-full bg-[#33373d] hover:bg-[#3d424b] active:bg-[#484e58] text-white font-medium text-[12.5px] py-2.5 px-4 rounded-xl text-center cursor-pointer transition-all border border-white/5 flex items-center justify-center gap-1.5"
                                                    >
                                                        <span>{formData.visitProfileButtonText || "Visit Profile"}</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleSimVerifyClick}
                                                        className={`w-full bg-[#33373d] hover:bg-[#3d424b] active:bg-[#484e58] text-white font-medium text-[12.5px] py-2.5 px-4 rounded-xl text-center cursor-pointer transition-all border border-white/5 flex items-center justify-center gap-1.5 ${
                                                            simMode === 'interactive' && simStep === 2 ? 'ring-2 ring-emerald-500/60 animate-pulse' : ''
                                                        }`}
                                                    >
                                                        <span>{formData.verifyButtonText || "I'm following ✅"}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* 4. User Taps Verification Response (Purple Pill) */}
                                    {formData.isFollowGated && (simMode === 'full' || simStep >= 3) && (
                                        <div className="flex justify-end animate-in fade-in slide-in-from-bottom-2 duration-200">
                                            <div className="bg-[#7000ff] text-white rounded-[22px] rounded-br-[4px] px-4 py-2.5 max-w-[78%] text-[12.5px] font-normal shadow-sm">
                                                {formData.verifyButtonText || "I'm following ✅"}
                                            </div>
                                        </div>
                                    )}

                                    {/* 5. Bot Success Payload Bubble with ALL Configured Reward Buttons */}
                                    {(simMode === 'full' || simStep >= 3) && (
                                        <div className="flex items-end gap-2 max-w-[88%] animate-in fade-in slide-in-from-bottom-2 duration-200">
                                            <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 mb-1 border border-zinc-700">
                                                {activeAccount?.profile_picture_url ? (
                                                    <img src={activeAccount.profile_picture_url} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-white text-[9px] font-bold">
                                                        {accountHandle[0]?.toUpperCase()}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="bg-[#262626] text-white rounded-[22px] rounded-bl-[4px] p-3.5 shadow-sm leading-relaxed whitespace-pre-line text-[12.5px] w-full">
                                                <p className="mb-3">{formData.rewardText || "Thanks for your comment!!"}</p>
                                                
                                                {/* Dynamic Reward Action Buttons (Up to 5 Buttons) */}
                                                <div className="space-y-1.5">
                                                    {formData.rewardButtons.map((btn, idx) => (
                                                        <button
                                                            key={btn.id || idx}
                                                            type="button"
                                                            onClick={() => triggerFeedback(`Opened ${btn.title || 'Link'}: ${btn.url || 'https://fluxdm.space'}`)}
                                                            className="w-full bg-[#33373d] hover:bg-[#3d424b] active:bg-[#484e58] text-white font-medium text-[12.5px] py-2.5 px-4 rounded-xl text-center cursor-pointer transition-all border border-white/5 flex items-center justify-center gap-1.5 truncate"
                                                        >
                                                            <span>{btn.title || `Link #${idx + 1}`}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Typing Indicator Dots */}
                                    {isSimTyping && (
                                        <div className="flex items-end gap-2 max-w-[88%] animate-in fade-in duration-150">
                                            <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 mb-1 border border-zinc-700">
                                                {activeAccount?.profile_picture_url ? (
                                                    <img src={activeAccount.profile_picture_url} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-white text-[9px] font-bold">
                                                        {accountHandle[0]?.toUpperCase()}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="bg-[#262626] rounded-[18px] px-3.5 py-2.5 flex items-center gap-1">
                                                <div className="w-2 h-2 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                <div className="w-2 h-2 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                <div className="w-2 h-2 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                            </div>
                                        </div>
                                    )}

                                    {/* Timestamp */}
                                    <div className="text-center text-[10px] text-zinc-600 font-medium pt-2">
                                        10 MAY, 7:20 PM
                                    </div>
                                </div>

                                {/* Instagram Bottom Bar */}
                                <div className="p-2.5 bg-black border-t border-zinc-900 flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-[#0095f6] flex items-center justify-center text-white shrink-0 shadow-xs">
                                        <Camera className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 bg-[#262626] rounded-full px-3.5 py-1.5 text-zinc-400 text-[11.5px] flex items-center justify-between">
                                        <span>Message...</span>
                                        <Mic className="w-3.5 h-3.5 text-zinc-400 cursor-pointer" />
                                    </div>
                                    <div className="flex items-center gap-2 text-zinc-400 pr-1">
                                        <ImageIcon className="w-4 h-4 cursor-pointer" />
                                        <Smile className="w-4 h-4 cursor-pointer" />
                                        <Plus className="w-4 h-4 cursor-pointer" />
                                    </div>
                                </div>

                            </div>
                        </div>

                    </div>
                )}
            </div>

            <AutomationSuccessDialog
                open={showSuccessDialog}
                onOpenChange={setShowSuccessDialog}
                onViewAutomations={() => handleNavigate('automations')}
                onCreateAnother={() => {
                    setShowSuccessDialog(false);
                    setStep(1);
                    setFormData({
                        triggerType: 'POST_COMMENT',
                        triggerKeyword: '',
                        publicReply: "Thanks for commenting! I've sent you a DM. 👇",
                        attachedMediaId: null,
                        targetPostMode: 'ALL',
                        hookText: "Hey there! I'm so happy you're here, thanks so much for your interest 😊\n\nClick below and I'll send you the link in just a sec ✨",
                        hookButtonText: 'Send me the link',
                        isFollowGated: true,
                        gateText: "Oh no! It seems you're not following me 👀 It would really mean a lot if you visit my profile and hit the follow button 🤗.\nOnce you have done that, click on the 'I'm following' button below and you will get the link ✨.",
                        visitProfileButtonText: 'Visit Profile',
                        profileUrl: '',
                        verifyButtonText: "I'm following ✅",
                        rewardText: 'Thanks for your comment!!',
                        rewardButtons: [
                            { id: '1', title: 'Here is Your Link!', url: 'https://fluxdm.space' },
                            { id: '2', title: 'Linkedin Profile', url: 'https://linkedin.com' }
                        ],
                        emailGate: false,
                        smartRewind: false
                    });
                    setSimStep(1);
                }}
            />
        </div>
    );
}
