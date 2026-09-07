import React, { useState } from 'react';
import { 
  Sparkles, 
  ShieldCheck, 
  Zap, 
  Smartphone, 
  ArrowRight, 
  Mail, 
  KeyRound, 
  X, 
  Loader2 
} from 'lucide-react';
import { toast } from 'sonner';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const PaywallModal: React.FC<PaywallModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [activeTab, setActiveTab] = useState<'checkout' | 'restore'>('checkout');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleCheckout = async () => {
    setLoading(true);
    try {
      // @ts-ignore
      const res = await window.ipcRenderer?.invoke('licensing:create-checkout', { email });
      if (res?.success && res.checkoutUrl) {
        // @ts-ignore
        await window.ipcRenderer?.invoke('open-external-url', res.checkoutUrl);
        toast.info('Checkout opened in browser. Complete your purchase to auto-unlock!');
      } else {
        toast.error(res?.error || 'Could not initiate checkout');
      }
    } catch (err: any) {
      toast.error(err.message || 'Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    if (!email || !email.includes('@')) {
      toast.error('Please enter a valid email');
      return;
    }
    setLoading(true);
    try {
      // @ts-ignore
      const res = await window.ipcRenderer?.invoke('licensing:request-email-otp', { email });
      if (res?.success) {
        setOtpSent(true);
        toast.success(res.message || 'Verification code dispatched to your email!');
      } else {
        toast.error(res?.error || 'Failed to send OTP code');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.trim().length < 6) {
      toast.error('Please enter the 6-digit code');
      return;
    }
    setLoading(true);
    try {
      // @ts-ignore
      const res = await window.ipcRenderer?.invoke('licensing:verify-email-otp', { email, code: otpCode });
      if (res?.success && res.isLicensed) {
        toast.success('🎉 Purchase Restored Successfully! All features unlocked.');
        if (onSuccess) onSuccess();
        onClose();
      } else {
        toast.error(res?.error || 'Invalid or expired code');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-6 text-white animate-in fade-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Badge */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>One-Time Lifetime Access</span>
          </div>
          <div className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            $0 Monthly Fees
          </div>
        </div>

        <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
          Unlock the Full Power of FluxDM
        </h2>
        <p className="text-zinc-400 text-sm mb-6">
          Convert comments into paying leads 24/7 on your laptop and mobile phone without ongoing subscription bills.
        </p>

        {/* Tab Switcher */}
        <div className="flex gap-2 p-1 bg-zinc-800/80 rounded-xl mb-6 text-sm">
          <button
            onClick={() => setActiveTab('checkout')}
            className={`flex-1 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'checkout'
                ? 'bg-zinc-700 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            New License
          </button>
          <button
            onClick={() => setActiveTab('restore')}
            className={`flex-1 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'restore'
                ? 'bg-zinc-700 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Restore Purchase
          </button>
        </div>

        {activeTab === 'checkout' ? (
          <div>
            {/* Feature Highlights */}
            <div className="space-y-3 mb-6">
              {[
                { icon: Zap, title: 'Unlimited Automated DMs & Viral Comments', desc: 'Handles 10,000+ comments locally at zero extra cost' },
                { icon: Smartphone, title: '2 Active Seats Included', desc: '1 Laptop (Mac/Win/Linux) + 1 Mobile Device (iOS/Android)' },
                { icon: ShieldCheck, title: 'Smart Anti-Ban Pacing & Human Jitter', desc: 'Keeps your Instagram account safe from rate limits' }
              ].map((feat, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-zinc-800/40 border border-zinc-800">
                  <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 shrink-0">
                    <feat.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-200">{feat.title}</h4>
                    <p className="text-xs text-zinc-400">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Email input (optional) */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-zinc-400 mb-1">Receipt & Account Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="creator@yourbrand.com"
                  className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            {/* CTA Button */}
            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Unlock Lifetime Access via Dodo Payments</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            <p className="text-center text-[11px] text-zinc-500 mt-3">
              Encrypted 256-bit checkout via Dodo Payments. Apple Pay, Google Pay, Cards & UPI accepted.
            </p>
          </div>
        ) : (
          /* Restore via Anti-Exploitation Email OTP */
          <div>
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs mb-5 flex items-start gap-2.5">
              <KeyRound className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
              <span>
                Enter the email address you used during purchase. We will dispatch a 6-digit verification code to your inbox to securely unlock this device.
              </span>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Purchase Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="email"
                    value={email}
                    disabled={otpSent}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="buyer@gmail.com"
                    className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 disabled:opacity-60"
                  />
                </div>
              </div>

              {otpSent && (
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">6-Digit Email Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.trim())}
                    placeholder="123456"
                    className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 py-2.5 text-center text-lg tracking-widest font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}
            </div>

            {!otpSent ? (
              <button
                onClick={handleRequestOtp}
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send 6-Digit Code'}
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={handleVerifyOtp}
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify Code & Unlock Device'}
                </button>
                <button
                  onClick={() => setOtpSent(false)}
                  className="w-full text-center text-xs text-zinc-400 hover:text-white py-1"
                >
                  Change Email Address
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
