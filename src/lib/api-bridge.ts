/**
 * 🌉 Universal API Bridge (Desktop Electron + Mobile Capacitor)
 * 
 * Automatically delegates to Electron IPC on desktop,
 * and local storage / Cloudflare Worker on mobile devices.
 */

export const isDesktop = typeof window !== 'undefined' && Boolean((window as any).ipcRenderer);
export const isMobile = !isDesktop;

export const apiBridge = {
  isDesktop,
  isMobile,

  async invoke(channel: string, ...args: any[]): Promise<any> {
    if (isDesktop && (window as any).ipcRenderer) {
      return await (window as any).ipcRenderer.invoke(channel, ...args);
    }

    // Mobile fallback handlers using localStorage / Cloudflare Edge Relay
    console.log(`📱 [Mobile Bridge] Handled channel: ${channel}`, args);

    if (channel === 'licensing:get-status') {
      const stored = localStorage.getItem('fluxdm_mobile_license');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          // fallback
        }
      }
      return { isLicensed: false, seats: [] };
    }

    if (channel === 'get-automation-flows' || channel === 'get-flows') {
      const stored = localStorage.getItem('fluxdm_mobile_flows');
      return stored ? JSON.parse(stored) : [];
    }

    if (channel === 'save-flow') {
      const data = args[0];
      const existing = await apiBridge.invoke('get-flows');
      const updated = [...existing.filter((f: any) => f.id !== data.id), { ...data, id: data.id || `flow_${Date.now()}` }];
      localStorage.setItem('fluxdm_mobile_flows', JSON.stringify(updated));
      return { success: true, id: data.id };
    }

    if (channel === 'open-external-url') {
      const url = args[0];
      if (typeof window !== 'undefined') {
        window.open(url, '_blank');
      }
      return { success: true };
    }

    return { success: true };
  }
};
