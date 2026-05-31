import crypto from 'crypto';

// In production, this should be an environment variable
const ENCRYPTION_KEY = process.env.PII_ENCRYPTION_KEY || '12345678901234567890123456789012'; // 32 bytes for AES-256
const IV_LENGTH = 16;

/**
 * Utility class for handling PII (Personally Identifiable Information)
 * Provides Encryption at rest and Data masking capabilities.
 */
export const privacyUtils = {
  /**
   * Deterministic encryption for fields that need to be searchable (like email, phone).
   * It uses a fixed IV to ensure the same plaintext always produces the same ciphertext.
   */
  encryptDeterministic: (text: string | null | undefined): string | undefined => {
    if (!text) return undefined;
    try {
      // Use a fixed IV for deterministic encryption (allows exact match querying)
      const iv = Buffer.alloc(IV_LENGTH, 0); 
      const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return encrypted;
    } catch (e) {
      return text; // Fallback
    }
  },

  /**
   * Decrypt data encrypted with encryptDeterministic
   */
  decrypt: (encryptedText: string | null | undefined): string | undefined => {
    if (!encryptedText) return undefined;
    try {
      const iv = Buffer.alloc(IV_LENGTH, 0);
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (e) {
      // If decryption fails (e.g. legacy plain text data), return original
      return encryptedText;
    }
  },

  /**
   * Mask email address (e.g., jo***@gmail.com)
   */
  maskEmail: (email: string | null | undefined): string | undefined => {
    if (!email) return undefined;
    const parts = email.split('@');
    if (parts.length !== 2) return '***';
    const name = parts[0];
    const domain = parts[1];
    if (name.length <= 2) return `***@${domain}`;
    return `${name.substring(0, 2)}***@${domain}`;
  },

  /**
   * Mask phone number (e.g., ***-***-1234)
   */
  maskPhone: (phone: string | null | undefined): string | undefined => {
    if (!phone) return undefined;
    if (phone.length < 4) return '***';
    return `***-***-${phone.slice(-4)}`;
  },

  /**
   * Mask name (e.g., J*** D***)
   */
  maskName: (name: string | null | undefined): string | undefined => {
    if (!name) return undefined;
    return name.charAt(0) + '***';
  }
};
