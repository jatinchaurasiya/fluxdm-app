import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import db from '../database/db';

const APP_INTERNAL_SALT = 'fluxdm_internal_hardware_salt_v1_secure';

/**
 * 🔒 Cryptographic Device Hardware Fingerprinting
 * Produces a stable, unique SHA-256 identifier for the host machine.
 */
export function getDeviceHardwareId(): string {
  try {
    let rawId = '';

    if (process.platform === 'linux') {
      if (fs.existsSync('/etc/machine-id')) {
        rawId = fs.readFileSync('/etc/machine-id', 'utf8').trim();
      } else if (fs.existsSync('/var/lib/dbus/machine-id')) {
        rawId = fs.readFileSync('/var/lib/dbus/machine-id', 'utf8').trim();
      }
    }

    if (!rawId) {
      // Cross-platform fallback: CPU model + network interface MAC + hostname
      const cpus = os.cpus();
      const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown_cpu';
      const networkInterfaces = os.networkInterfaces();
      let mac = '';
      for (const name of Object.keys(networkInterfaces)) {
        const net = networkInterfaces[name];
        if (net) {
          for (const item of net) {
            if (!item.internal && item.mac && item.mac !== '00:00:00:00:00:00') {
              mac = item.mac;
              break;
            }
          }
        }
        if (mac) break;
      }
      rawId = `${os.hostname()}_${os.platform()}_${cpuModel}_${mac}_${os.userInfo().username}`;
    }

    return crypto.createHash('sha256').update(rawId + APP_INTERNAL_SALT).digest('hex');
  } catch (err) {
    console.error('Failed to compute machine fingerprint, using fallback:', err);
    return crypto.createHash('sha256').update(os.hostname() + APP_INTERNAL_SALT).digest('hex');
  }
}

/**
 * 🔏 Generate HMAC-SHA256 signature for tamper-proof local license storage
 */
export function generateLicenseSignature(sessionId: string, hardwareId: string, email: string): string {
  const payload = `${sessionId}:${hardwareId}:${email.toLowerCase().trim()}`;
  return crypto.createHmac('sha256', APP_INTERNAL_SALT).update(payload).digest('hex');
}

/**
 * 🛡️ Verify if local license state has been tampered with
 */
export function verifyLicenseSignature(sessionId: string, hardwareId: string, email: string, signature: string): boolean {
  if (!signature) return false;
  const expected = generateLicenseSignature(sessionId, hardwareId, email);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * 🪑 Seat Management (Strict 2-Seat Policy: 1 Computer + 1 Mobile Device)
 */
export interface DeviceSeat {
  id: number;
  device_hardware_id: string;
  device_name: string;
  device_type: 'desktop' | 'mobile';
  is_active: number;
  created_at: string;
  last_seen: string;
}

export function registerCurrentDeviceSeat(deviceType: 'desktop' | 'mobile' = 'desktop', deviceName?: string): { success: boolean; error?: string; seats?: DeviceSeat[] } {
  const hardwareId = getDeviceHardwareId();
  const name = deviceName || `${os.hostname()} (${os.type()})`;

  try {
    const activeSeats = db.prepare(`SELECT * FROM device_seats WHERE is_active = 1`).all() as DeviceSeat[];

    // Check if this device is already registered
    const existing = activeSeats.find(s => s.device_hardware_id === hardwareId);
    if (existing) {
      db.prepare(`UPDATE device_seats SET last_seen = CURRENT_TIMESTAMP WHERE id = ?`).run(existing.id);
      return { success: true, seats: getActiveDeviceSeats() };
    }

    // Check if seats are full (Maximum 2 seats: 1 desktop + 1 mobile)
    const sameTypeSeats = activeSeats.filter(s => s.device_type === deviceType);
    if (sameTypeSeats.length >= 1) {
      return {
        success: false,
        error: `Seat limit reached for ${deviceType}. An active ${deviceType} seat is already assigned (${sameTypeSeats[0].device_name}). Please deauthorize it first.`,
        seats: activeSeats
      };
    }

    if (activeSeats.length >= 2) {
      return {
        success: false,
        error: 'All 2 license seats (1 Computer + 1 Mobile) are currently in use. Please deauthorize an old device.',
        seats: activeSeats
      };
    }

    // Insert new seat
    db.prepare(`
      INSERT INTO device_seats (device_hardware_id, device_name, device_type, is_active, last_seen)
      VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(device_hardware_id) DO UPDATE SET is_active = 1, last_seen = CURRENT_TIMESTAMP, device_name = excluded.device_name
    `).run(hardwareId, name, deviceType);

    return { success: true, seats: getActiveDeviceSeats() };
  } catch (error: any) {
    console.error('Error registering device seat:', error);
    return { success: false, error: error.message };
  }
}

export function getActiveDeviceSeats(): DeviceSeat[] {
  try {
    return db.prepare(`SELECT * FROM device_seats WHERE is_active = 1 ORDER BY created_at ASC`).all() as DeviceSeat[];
  } catch (error) {
    return [];
  }
}

export function deauthorizeSeat(seatId: number): { success: boolean; error?: string } {
  try {
    const seat = db.prepare(`SELECT * FROM device_seats WHERE id = ?`).get(seatId) as DeviceSeat | undefined;
    if (!seat) return { success: false, error: 'Seat not found' };

    db.prepare(`UPDATE device_seats SET is_active = 0 WHERE id = ?`).run(seatId);

    // If deauthorizing current device, revoke local license
    const currentHardwareId = getDeviceHardwareId();
    if (seat.device_hardware_id === currentHardwareId) {
      db.prepare(`
        UPDATE user_config 
        SET is_licensed = 0, license_session_id = NULL, license_signature = NULL 
        WHERE id = (SELECT id FROM user_config LIMIT 1)
      `).run();
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 📲 Ephemeral Device Pairing Store (In-Memory with 10-Minute TTL)
 */
interface PairingSession {
  pin: string;
  payload: {
    sessionId: string;
    email: string;
    accounts: any[];
    activeAccountId: number | null;
  };
  expiresAt: number;
}

const activePairingSessions = new Map<string, PairingSession>();

export function generatePairingCode(): { pin: string; expiresAt: number } {
  // Clean up expired sessions
  const now = Date.now();
  for (const [key, session] of activePairingSessions.entries()) {
    if (session.expiresAt <= now) {
      activePairingSessions.delete(key);
    }
  }

  // Generate a friendly 6-digit numeric PIN
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  const config = db.prepare(`SELECT * FROM user_config LIMIT 1`).get() as any;
  const accounts = db.prepare(`SELECT id, instagram_business_id, username, profile_picture_url, access_token FROM accounts WHERE is_active = 1`).all() as any[];

  const expiresAt = now + 10 * 60 * 1000; // 10 minutes

  activePairingSessions.set(pin, {
    pin,
    payload: {
      sessionId: config?.license_session_id || '',
      email: config?.license_email || '',
      accounts,
      activeAccountId: config?.active_account_id || null
    },
    expiresAt
  });

  return { pin, expiresAt };
}

export function redeemPairingCode(pin: string, deviceType: 'desktop' | 'mobile' = 'mobile', deviceName?: string): { success: boolean; error?: string; payload?: any } {
  const session = activePairingSessions.get(pin.trim());
  if (!session) {
    return { success: false, error: 'Invalid or expired pairing code. Please generate a new one on your device.' };
  }

  if (Date.now() > session.expiresAt) {
    activePairingSessions.delete(pin.trim());
    return { success: false, error: 'Pairing code expired. Please request a new code.' };
  }

  // Enforce seat registration
  const seatResult = registerCurrentDeviceSeat(deviceType, deviceName);
  if (!seatResult.success) {
    return { success: false, error: seatResult.error };
  }

  // Apply license to this device
  const hardwareId = getDeviceHardwareId();
  const signature = generateLicenseSignature(session.payload.sessionId, hardwareId, session.payload.email);

  db.prepare(`
    UPDATE user_config 
    SET is_licensed = 1,
        license_session_id = ?,
        license_email = ?,
        license_signature = ?,
        device_hardware_id = ?,
        licensed_at = CURRENT_TIMESTAMP
    WHERE id = (SELECT id FROM user_config LIMIT 1)
  `).run(session.payload.sessionId, session.payload.email, signature, hardwareId);

  // Sync accounts into local database
  if (session.payload.accounts && session.payload.accounts.length > 0) {
    const insertAccount = db.prepare(`
      INSERT INTO accounts (instagram_business_id, username, profile_picture_url, access_token, is_active)
      VALUES (@instagram_business_id, @username, @profile_picture_url, @access_token, 1)
      ON CONFLICT(instagram_business_id) DO UPDATE SET 
        access_token = excluded.access_token,
        username = excluded.username,
        profile_picture_url = excluded.profile_picture_url
    `);

    for (const acc of session.payload.accounts) {
      insertAccount.run(acc);
    }
  }

  // Burn PIN after successful pairing
  activePairingSessions.delete(pin.trim());

  return {
    success: true,
    payload: {
      sessionId: session.payload.sessionId,
      email: session.payload.email
    }
  };
}
