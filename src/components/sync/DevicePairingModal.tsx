import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Laptop, 
  X, 
  RefreshCw, 
  Trash2, 
  Loader2,
  Copy,
  Check,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';
import QRCode from 'qrcode';

interface DevicePairingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DevicePairingModal: React.FC<DevicePairingModalProps> = ({ isOpen, onClose }) => {
  const [tab, setTab] = useState<'share' | 'enter' | 'seats'>('share');
  const [pin, setPin] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [inputPin, setInputPin] = useState<string>('');
  const [seats, setSeats] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadPairingCode();
      loadSeats();
    }
  }, [isOpen]);

  useEffect(() => {
    if (pin) {
      // Universal URL that works on both native phone cameras (iOS / Android) and in-app scanners
      const universalUrl = `https://fluxdm.space/pair?pin=${pin}`;
      QRCode.toDataURL(universalUrl, {
        width: 320,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('Failed to generate QR Code:', err));
    }
  }, [pin]);

  const loadPairingCode = async () => {
    try {
      // @ts-ignore
      const res = await window.ipcRenderer?.invoke('licensing:generate-pairing-code');
      if (res?.success && res.pin) {
        setPin(res.pin);
      }
    } catch (e: any) {
      console.error('Failed to generate pairing code:', e);
    }
  };

  const loadSeats = async () => {
    try {
      // @ts-ignore
      const res = await window.ipcRenderer?.invoke('licensing:get-device-seats');
      if (res?.success) {
        setSeats(res.seats || []);
      }
    } catch (e: any) {
      console.error('Failed to load device seats:', e);
    }
  };

  const handleCopyPin = () => {
    if (!pin) return;
    navigator.clipboard.writeText(pin);
    setCopiedPin(true);
    toast.success(`Pairing PIN ${pin} copied to clipboard!`);
    setTimeout(() => setCopiedPin(false), 2000);
  };

  const handleCopyLink = () => {
    if (!pin) return;
    const universalUrl = `https://fluxdm.space/pair?pin=${pin}`;
    navigator.clipboard.writeText(universalUrl);
    setCopiedLink(true);
    toast.success('Pairing link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleRedeemPin = async () => {
    if (!inputPin || inputPin.length < 6) {
      toast.error('Please enter a 6-digit pairing PIN');
      return;
    }
    setLoading(true);
    try {
      // @ts-ignore
      const res = await window.ipcRenderer?.invoke('licensing:redeem-pairing-code', {
        pin: inputPin,
        deviceType: 'desktop',
        deviceName: 'Linked Laptop/Desktop'
      });

      if (res?.success) {
        toast.success('🎉 Device successfully paired and unlocked!');
        onClose();
      } else {
        toast.error(res?.error || 'Invalid or expired pairing PIN');
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeauthorizeSeat = async (seatId: number) => {
    try {
      // @ts-ignore
      const res = await window.ipcRenderer?.invoke('licensing:deauthorize-seat', { seatId });
      if (res?.success) {
        toast.success('Device seat released');
        loadSeats();
      } else {
        toast.error(res?.error || 'Failed to remove seat');
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-6 text-white animate-in zoom-in-95 duration-200">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-2 text-orange-400 text-sm font-semibold">
          <Smartphone className="w-4 h-4" />
          <span>Multi-Device Sync & Pairing</span>
        </div>

        <h3 className="text-xl font-bold mb-1">Connect Mobile or Laptop</h3>
        <p className="text-xs text-zinc-400 mb-5">
          Link your mobile phone or secondary computer to run 24/7 automations without paying twice.
        </p>

        {/* Tab switcher */}
        <div className="flex gap-1.5 p-1 bg-zinc-800/80 rounded-xl mb-6 text-xs font-medium">
          <button
            onClick={() => setTab('share')}
            className={`flex-1 py-2 rounded-lg transition-all ${
              tab === 'share' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Pair New Device
          </button>
          <button
            onClick={() => setTab('enter')}
            className={`flex-1 py-2 rounded-lg transition-all ${
              tab === 'enter' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Enter Code
          </button>
          <button
            onClick={() => setTab('seats')}
            className={`flex-1 py-2 rounded-lg transition-all ${
              tab === 'seats' ? 'bg-zinc-700 text-white shadow' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Active Seats ({seats.length}/2)
          </button>
        </div>

        {tab === 'share' && (
          <div className="text-center">
            {/* Real Dynamic Scannable QR Code */}
            <div className="inline-flex p-3.5 bg-white rounded-2xl shadow-2xl mb-4 ring-4 ring-black/20">
              {qrDataUrl ? (
                <img 
                  src={qrDataUrl} 
                  alt="FluxDM Pairing QR Code" 
                  className="w-48 h-48 rounded-lg block" 
                />
              ) : (
                <div className="w-48 h-48 flex flex-col items-center justify-center text-zinc-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-2 text-orange-500" />
                  <span className="text-xs">Generating QR Code...</span>
                </div>
              )}
            </div>

            <p className="text-xs text-zinc-300 font-medium mb-2">
              Scan with your iPhone/Android Camera or enter PIN:
            </p>
            
            {/* PIN Display with 1-Click Copy */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="px-6 py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-2xl font-mono font-bold tracking-widest text-orange-400 shadow-inner">
                {pin || '...'}
              </div>
              <button
                onClick={handleCopyPin}
                className="p-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 hover:text-white transition-colors"
                title="Copy PIN"
              >
                {copiedPin ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center justify-center gap-4 text-xs text-zinc-400 mb-2">
              <button 
                onClick={handleCopyLink}
                className="hover:text-orange-400 flex items-center gap-1.5 transition-colors"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-green-400" /> : <ExternalLink className="w-3.5 h-3.5" />}
                <span>Copy Link</span>
              </button>

              <span className="text-zinc-600">•</span>

              <button 
                onClick={loadPairingCode}
                className="hover:text-orange-400 flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>New Code</span>
              </button>
            </div>

            <p className="text-[11px] text-zinc-500">
              Code valid for 10 minutes. Works with any mobile camera app.
            </p>
          </div>
        )}

        {tab === 'enter' && (
          <div>
            <div className="p-3.5 rounded-xl bg-zinc-800/60 border border-zinc-700 text-xs text-zinc-300 mb-4">
              Enter the 6-digit PIN displayed on your primary device to link this computer.
            </div>

            <label className="block text-xs font-medium text-zinc-400 mb-2">6-Digit Pairing PIN</label>
            <input
              type="text"
              maxLength={6}
              value={inputPin}
              onChange={(e) => setInputPin(e.target.value.trim())}
              placeholder="654321"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-center text-xl tracking-widest font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-orange-500 mb-5"
            />

            <button
              onClick={handleRedeemPin}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-orange-500/20"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Pair & Activate License'}
            </button>
          </div>
        )}

        {tab === 'seats' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 pb-2 border-b border-zinc-800">
              <span>Authorized Hardware Seats</span>
              <span>{seats.length}/2 Active</span>
            </div>

            {seats.length === 0 ? (
              <p className="text-center py-6 text-xs text-zinc-500">No active seats registered yet.</p>
            ) : (
              seats.map((seat) => (
                <div key={seat.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/60">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-zinc-700 text-zinc-300">
                      {seat.device_type === 'mobile' ? <Smartphone className="w-4 h-4" /> : <Laptop className="w-4 h-4" />}
                    </div>
                    <div>
                      <h5 className="text-xs font-semibold text-white">{seat.device_name}</h5>
                      <span className="text-[10px] text-zinc-400">
                        {seat.device_type.toUpperCase()} • Added {new Date(seat.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeauthorizeSeat(seat.id)}
                    className="p-1.5 text-zinc-400 hover:text-red-400 rounded-lg hover:bg-zinc-700/50 transition-colors"
                    title="Deauthorize Seat"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}

            <p className="text-[11px] text-zinc-500 pt-2">
              Each license allows up to 2 active devices (1 Computer + 1 Mobile). Deauthorize an old device to free a seat.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
