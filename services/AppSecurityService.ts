import * as SecureStore from 'expo-secure-store';

import { AppState, AppStateStatus } from 'react-native';

export interface AppSecurityConfig {
  requireAuthentication: boolean;
  useBiometric: boolean;
  usePIN: boolean;
  autoLockTimeout: number; // in milliseconds
  maxPINAttempts: number;
  lockoutDuration: number; // in milliseconds
}

export interface PINConfig {
  pin: string;
  salt: string;
  iterations: number;
}

export class AppSecurityService {
  private static instance: AppSecurityService;
  private config: AppSecurityConfig;
  private isLocked: boolean = false;
  private lastActiveTime: number = Date.now();
  private pinAttempts: number = 0;
  private lockoutUntil: number = 0;
  private appStateListener: any;

  private constructor() {
    this.config = {
      requireAuthentication: false, // Disabled by default
      useBiometric: false, // Disabled by default
      usePIN: false, // Disabled by default
      autoLockTimeout: 5 * 60 * 1000, // 5 minutes
      maxPINAttempts: 5,
      lockoutDuration: 15 * 60 * 1000, // 15 minutes
    };
    this.setupAppStateListener();
  }

  static getInstance(): AppSecurityService {
    if (!AppSecurityService.instance) {
      AppSecurityService.instance = new AppSecurityService();
    }
    return AppSecurityService.instance;
  }

  private setupAppStateListener() {
    this.appStateListener = AppState.addEventListener('change', this.handleAppStateChange.bind(this));
  }

  private handleAppStateChange(nextAppState: AppStateStatus) {
    if (nextAppState === 'active') {
      this.lastActiveTime = Date.now();
    } else if (nextAppState === 'background' || nextAppState === 'inactive') {
      // App going to background - will check timeout on next active
    }
  }

  async initialize(): Promise<void> {
    try {
      // Load saved configuration
      const savedConfig = await this.getStoredConfig();
      if (savedConfig) {
        this.config = { ...this.config, ...savedConfig };
      }

      // Check if PIN is configured but usePIN is false (fix for existing setups)
      const pinConfigured = await this.getStoredPINConfig() !== null;
      if (pinConfigured && !this.config.usePIN) {
        this.config.usePIN = true;
        await this.saveConfig();
      }

      // Check if app should be locked
      await this.checkAutoLock();
    } catch (error) {
      console.error('Error initializing app security:', error);
    }
  }

  async isAppLocked(): Promise<boolean> {
    // Check if we're in lockout period
    if (Date.now() < this.lockoutUntil) {
      return true;
    }

    // Check if security is enabled
    const securityEnabled = this.config.useBiometric || this.config.usePIN;
    if (!securityEnabled) {
      return false; // No security enabled, never locked
    }

    // If PIN is enabled, check if it's actually configured
    if (this.config.usePIN) {
      const pinConfigured = await this.getStoredPINConfig() !== null;
      if (!pinConfigured) {
        // PIN is enabled but not configured, disable it
        this.config.usePIN = false;
        await this.saveConfig();
        return false;
      }
    }

    // Check auto-lock timeout
    if (this.config.autoLockTimeout > 0) {
      const timeSinceLastActive = Date.now() - this.lastActiveTime;
      if (timeSinceLastActive > this.config.autoLockTimeout) {
        this.isLocked = true;
      }
    }

    return this.isLocked;
  }

  async checkAutoLock(): Promise<void> {
    if (await this.isAppLocked()) {
      this.isLocked = true;
    }
  }

  async unlockWithBiometric(): Promise<boolean> {
    try {
      if (!this.config.useBiometric) {
        return false;
      }

      const canUseBiometric = await SecureStore.canUseBiometricAuthentication();
      if (!canUseBiometric) {
        return false;
      }

      // Try to access a secure item to trigger biometric authentication
      const testKey = 'app_security_biometric_test';
      await SecureStore.setItemAsync(testKey, 'test', {
        requireAuthentication: true,
        authenticationPrompt: 'Authenticate to unlock the app',
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });

      const result = await SecureStore.getItemAsync(testKey, {
        requireAuthentication: true,
        authenticationPrompt: 'Authenticate to unlock the app',
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });

      if (result === 'test') {
        await SecureStore.deleteItemAsync(testKey);
        this.unlockApp();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Biometric authentication failed:', error);
      return false;
    }
  }

  async unlockWithPIN(pin: string): Promise<boolean> {
    try {
      if (!this.config.usePIN) {
        return false;
      }

      // Check lockout
      if (Date.now() < this.lockoutUntil) {
        const remainingTime = Math.ceil((this.lockoutUntil - Date.now()) / 1000 / 60);
        throw new Error(`Account locked. Try again in ${remainingTime} minutes.`);
      }

      const storedPINConfig = await this.getStoredPINConfig();
      if (!storedPINConfig) {
        throw new Error('No PIN configured');
      }

      const isValid = await this.verifyPIN(pin, storedPINConfig);
      
      if (isValid) {
        this.pinAttempts = 0;
        this.unlockApp();
        return true;
      } else {
        this.pinAttempts++;
        
        if (this.pinAttempts >= this.config.maxPINAttempts) {
          this.lockoutUntil = Date.now() + this.config.lockoutDuration;
          throw new Error(`Too many failed attempts. Account locked for ${Math.ceil(this.config.lockoutDuration / 1000 / 60)} minutes.`);
        } else {
          const remainingAttempts = this.config.maxPINAttempts - this.pinAttempts;
          throw new Error(`Invalid PIN. ${remainingAttempts} attempts remaining.`);
        }
      }
    } catch (error) {
      console.error('PIN authentication failed:', error);
      throw error;
    }
  }

  async setupPIN(pin: string): Promise<void> {
    try {
      if (pin.length < 4) {
        throw new Error('PIN must be at least 4 digits');
      }

      if (pin.length > 8) {
        throw new Error('PIN must be no more than 8 digits');
      }

      // Generate salt and hash PIN
      const salt = await this.generateSalt();
      const hashedPIN = await this.hashPIN(pin, salt);

      const pinConfig: PINConfig = {
        pin: hashedPIN,
        salt,
        iterations: 10000,
      };

      await this.storePINConfig(pinConfig);
      this.config.usePIN = true;
      await this.saveConfig();
    } catch (error) {
      console.error('Error setting up PIN:', error);
      throw error;
    }
  }

  async changePIN(currentPIN: string, newPIN: string): Promise<void> {
    try {
      // Verify current PIN
      const isValid = await this.unlockWithPIN(currentPIN);
      if (!isValid) {
        throw new Error('Current PIN is incorrect');
      }

      // Set up new PIN
      await this.setupPIN(newPIN);
    } catch (error) {
      console.error('Error changing PIN:', error);
      throw error;
    }
  }

  async removePIN(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync('app_security_pin_config');
      this.config.usePIN = false;
      await this.saveConfig();
    } catch (error) {
      console.error('Error removing PIN:', error);
      throw error;
    }
  }

  async getSecurityStatus(): Promise<{
    isLocked: boolean;
    useBiometric: boolean;
    usePIN: boolean;
    biometricAvailable: boolean;
    pinConfigured: boolean;
    lockoutRemaining: number;
    attemptsRemaining: number;
    autoLockTimeout: number;
  }> {
    const biometricAvailable = await SecureStore.canUseBiometricAuthentication();
    const pinConfigured = await this.getStoredPINConfig() !== null;
    const lockoutRemaining = Math.max(0, this.lockoutUntil - Date.now());
    const attemptsRemaining = Math.max(0, this.config.maxPINAttempts - this.pinAttempts);

    return {
      isLocked: await this.isAppLocked(),
      useBiometric: this.config.useBiometric,
      usePIN: this.config.usePIN,
      biometricAvailable,
      pinConfigured,
      lockoutRemaining,
      attemptsRemaining,
      autoLockTimeout: this.config.autoLockTimeout,
    };
  }

  async updateConfig(newConfig: Partial<AppSecurityConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    await this.saveConfig();
  }

  // Method to force lock the app (for testing)
  async forceLock(): Promise<void> {
    this.isLocked = true;
  }

  // Method to check if PIN is properly configured and enabled
  async isPINEnabled(): Promise<boolean> {
    const pinConfigured = await this.getStoredPINConfig() !== null;
    return this.config.usePIN && pinConfigured;
  }

  // Method to reset security state (for testing)
  async resetSecurityState(): Promise<void> {
    this.isLocked = false;
    this.lastActiveTime = Date.now();
    this.pinAttempts = 0;
    this.lockoutUntil = 0;
  }

  private unlockApp(): void {
    this.isLocked = false;
    this.lastActiveTime = Date.now();
    this.pinAttempts = 0;
    this.lockoutUntil = 0;
  }

  private async generateSalt(): Promise<string> {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private async hashPIN(pin: string, salt: string): Promise<string> {
    // Simple hash for now - in production you'd want a proper crypto library
    const combined = pin + salt;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private async verifyPIN(pin: string, pinConfig: PINConfig): Promise<boolean> {
    const hashedInput = await this.hashPIN(pin, pinConfig.salt);
    return hashedInput === pinConfig.pin;
  }

  private async storePINConfig(pinConfig: PINConfig): Promise<void> {
    await SecureStore.setItemAsync('app_security_pin_config', JSON.stringify(pinConfig), {
      requireAuthentication: false,
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });
  }

  private async getStoredPINConfig(): Promise<PINConfig | null> {
    try {
      const stored = await SecureStore.getItemAsync('app_security_pin_config', {
        requireAuthentication: false,
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  private async saveConfig(): Promise<void> {
    await SecureStore.setItemAsync('app_security_config', JSON.stringify(this.config), {
      requireAuthentication: false,
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });
  }

  private async getStoredConfig(): Promise<Partial<AppSecurityConfig> | null> {
    try {
      const stored = await SecureStore.getItemAsync('app_security_config', {
        requireAuthentication: false,
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  cleanup(): void {
    if (this.appStateListener) {
      this.appStateListener.remove();
    }
  }
}

export const appSecurityService = AppSecurityService.getInstance(); 