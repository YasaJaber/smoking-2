// ============================================================
// App Configuration - New Place POS
// ============================================================

export const APP_CONFIG = {
  name: 'New Place POS',
  version: '1.0.0',
  defaultCurrency: 'EGP',
  defaultTaxRate: 0.14,
  defaultLowStockThreshold: 5,
  maxPinLength: 4,
  invoiceNumberPrefix: 'INV',
  syncIntervalMs: 30000, // 30 seconds
  animationEnabled: true,
} as const;

export const STORAGE_KEYS = {
  settings: 'pos_settings',
  authToken: 'auth_token',
  lastSync: 'last_sync',
  theme: 'theme_mode',
} as const;

export const DB_NAME = 'new_place_pos.db';

export const DEFAULT_SERVER_URL =
  process.env.EXPO_PUBLIC_SYNC_SERVER_URL || 'https://new-place.vercel.app';

export const DEFAULT_SYNC_TOKEN =
  process.env.EXPO_PUBLIC_SYNC_TOKEN ||
  'dfffde6eebdf54036df3594be03695d9f8878ca4c037715e58e12b9566be8a04';
