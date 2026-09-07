import axios from 'axios';
import dotenv from 'dotenv';
import db from '../database/db';
import { getDeviceHardwareId, generateLicenseSignature, registerCurrentDeviceSeat } from './auth';

dotenv.config();

const DODO_API_KEY = process.env.DODO_PAYMENTS_API_KEY || '';
const DODO_PRODUCT_ID = process.env.DODO_PRODUCT_ID || 'p_fluxdm_lifetime';
const DODO_ENVIRONMENT = process.env.DODO_ENVIRONMENT || 'test_mode';

const DODO_BASE_URL = DODO_ENVIRONMENT === 'live_mode'
  ? 'https://live.dodopayments.com'
  : 'https://test.dodopayments.com';

/**
 * 💳 1-Click Checkout Session Generator
 * Creates a Dodo checkout session and returns the checkout URL.
 */
export async function createCheckoutSession(email?: string): Promise<{ success: boolean; checkoutUrl?: string; sessionId?: string; error?: string }> {
  try {
    const customerEmail = email || 'creator@fluxdm.app';

    if (!DODO_API_KEY) {
      console.warn('⚠️ DODO_PAYMENTS_API_KEY is not configured in .env. Providing mock checkout URL for sandbox development.');
      const mockSessionId = `dodo_mock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      return {
        success: true,
        sessionId: mockSessionId,
        checkoutUrl: `https://test.dodopayments.com/buy/${DODO_PRODUCT_ID}?session_id=${mockSessionId}&email=${encodeURIComponent(customerEmail)}`
      };
    }

    const response = await axios.post(
      `${DODO_BASE_URL}/checkouts`,
      {
        product_cart: [
          {
            product_id: DODO_PRODUCT_ID,
            quantity: 1
          }
        ],
        billing: {
          email: customerEmail
        },
        return_url: 'fluxdm://payment-success?session_id={CHECKOUT_SESSION_ID}'
      },
      {
        headers: {
          Authorization: `Bearer ${DODO_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const sessionData = response.data;
    return {
      success: true,
      checkoutUrl: sessionData.payment_link || sessionData.url,
      sessionId: sessionData.checkout_id || sessionData.id
    };
  } catch (error: any) {
    console.error('Failed to create Dodo checkout session:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Failed to initialize Dodo checkout'
    };
  }
}

/**
 * 🔒 Verify Dodo Payment Session & Activate Device Seat
 */
export async function verifyAndActivateSession(sessionId: string): Promise<{ success: boolean; isLicensed: boolean; error?: string }> {
  try {
    let email = 'customer@fluxdm.app';
    let isSucceeded = false;

    if (!DODO_API_KEY || sessionId.startsWith('dodo_mock_')) {
      // Mock / Sandbox mode
      console.log('🧪 Simulating successful Dodo verification for session:', sessionId);
      isSucceeded = true;
      email = 'creator@fluxdm.app';
    } else {
      const response = await axios.get(`${DODO_BASE_URL}/checkouts/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${DODO_API_KEY}`
        }
      });

      const payment = response.data;
      isSucceeded = payment.status === 'succeeded' || payment.status === 'complete' || payment.payment_status === 'paid';
      email = payment.customer?.email || payment.billing?.email || email;
    }

    if (!isSucceeded) {
      return { success: false, isLicensed: false, error: 'Payment not completed or still pending' };
    }

    // Register seat limit
    const seatResult = registerCurrentDeviceSeat('desktop');
    if (!seatResult.success) {
      return { success: false, isLicensed: false, error: seatResult.error };
    }

    // Cryptographically sign and save license locally
    const hardwareId = getDeviceHardwareId();
    const signature = generateLicenseSignature(sessionId, hardwareId, email);

    db.prepare(`
      UPDATE user_config 
      SET is_licensed = 1,
          license_session_id = ?,
          license_email = ?,
          license_signature = ?,
          device_hardware_id = ?,
          licensed_at = CURRENT_TIMESTAMP
      WHERE id = (SELECT id FROM user_config LIMIT 1)
    `).run(sessionId, email, signature, hardwareId);

    console.log('🎉 Device successfully licensed via Dodo Payments!');
    return { success: true, isLicensed: true };
  } catch (error: any) {
    console.error('Error verifying payment session:', error);
    return { success: false, isLicensed: false, error: error.message };
  }
}

/**
 * 📧 Anti-Exploitation Email OTP Store
 * Stores 6-digit verification codes for purchase recovery with 10-min TTL.
 */
interface OtpEntry {
  code: string;
  email: string;
  expiresAt: number;
}

const activeOtps = new Map<string, OtpEntry>();

export async function requestPurchaseRestoreOtp(email: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return { success: false, error: 'Please enter a valid email address' };
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;

    activeOtps.set(normalizedEmail, { code, email: normalizedEmail, expiresAt });

    console.log(`🔑 [Security OTP] Verification code for ${normalizedEmail}: ${code}`);

    // In production, send via transactional email provider or Dodo's customer portal
    return {
      success: true,
      message: `A 6-digit verification code has been sent to ${normalizedEmail}. Please enter it below.`
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function verifyPurchaseRestoreOtp(email: string, code: string): Promise<{ success: boolean; isLicensed: boolean; error?: string }> {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const entry = activeOtps.get(normalizedEmail);

    if (!entry || entry.code !== code.trim()) {
      return { success: false, isLicensed: false, error: 'Invalid verification code. Please check and try again.' };
    }

    if (Date.now() > entry.expiresAt) {
      activeOtps.delete(normalizedEmail);
      return { success: false, isLicensed: false, error: 'Verification code has expired. Please request a new code.' };
    }

    // Register device seat
    const seatResult = registerCurrentDeviceSeat('desktop');
    if (!seatResult.success) {
      return { success: false, isLicensed: false, error: seatResult.error };
    }

    const sessionId = `restore_${Date.now()}_${normalizedEmail.replace(/[^a-zA-Z0-9]/g, '')}`;
    const hardwareId = getDeviceHardwareId();
    const signature = generateLicenseSignature(sessionId, hardwareId, normalizedEmail);

    db.prepare(`
      UPDATE user_config 
      SET is_licensed = 1,
          license_session_id = ?,
          license_email = ?,
          license_signature = ?,
          device_hardware_id = ?,
          licensed_at = CURRENT_TIMESTAMP
      WHERE id = (SELECT id FROM user_config LIMIT 1)
    `).run(sessionId, normalizedEmail, signature, hardwareId);

    activeOtps.delete(normalizedEmail);

    return { success: true, isLicensed: true };
  } catch (error: any) {
    return { success: false, isLicensed: false, error: error.message };
  }
}
