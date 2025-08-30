import { AppSecurityConfig, PINConfig } from '@/types/services';
import * as SecureStore from 'expo-secure-store';
import { AppState, AppStateStatus } from 'react-native';
// TODO: Audit properly and remove console logs when ready
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
      requireAuthentication: false, // Start with auth disabled until configured
      useBiometric: false, // Start with biometric disabled until verified
      usePIN: false, // Start with PIN disabled until configured
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

  private async handleAppStateChange(nextAppState: AppStateStatus) {
    try {
      if (nextAppState === 'active') {
        this.lastActiveTime = Date.now();
        
        const shouldBeLocked = await this.isAppLocked();
        if (shouldBeLocked) {
          this.isLocked = true;
        }
        
        console.log('App became active:', { 
          isLocked: this.isLocked, 
          lastActiveTime: this.lastActiveTime 
        });
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Always lock when going to background if security is enabled
        if (this.config.requireAuthentication) {
          this.isLocked = true;
          console.log('App going to background - locked');
        }
      }
    } catch (error) {
      console.error('Error in app state change:', error);
      // On error, lock for safety
      this.isLocked = true;
    }
  }

  async initialize(): Promise<void> {
    try {
      // Start with app locked
      this.isLocked = true;

      // Load saved configuration
      const savedConfig = await this.getStoredConfig();
      if (savedConfig) {
        this.config = { ...this.config, ...savedConfig };
      } else {
        // If no config exists, save the default config
        await this.saveConfig();
      }

      // Check if PIN is configured
      const pinConfigured = await this.getStoredPINConfig() !== null;
      
      // If PIN is configured, ensure it's enabled
      if (pinConfigured) {
        this.config.usePIN = true;
        await this.saveConfig();
      }

      // Check biometric availability
      const biometricAvailable = await SecureStore.canUseBiometricAuthentication();
      if (biometricAvailable) {
        this.config.useBiometric = true;
        await this.saveConfig();
      }

      // Ensure we're locked if authentication is required
      if (this.config.requireAuthentication && (pinConfigured || biometricAvailable)) {
        this.isLocked = true;
      }

      console.log('App security initialized:', {
        isLocked: this.isLocked,
        config: this.config,
        pinConfigured,
        biometricAvailable
      });
    } catch (error) {
      console.error('Error initializing app security:', error);
      // On error, keep app locked for safety
      this.isLocked = true;
    }
  }

  async isAppLocked(): Promise<boolean> {
    try {
      // Check if any security method is enabled and configured
      const pinConfigured = await this.getStoredPINConfig() !== null;
      const biometricAvailable = await SecureStore.canUseBiometricAuthentication();
      
      const hasActiveSecurity = (this.config.useBiometric && biometricAvailable) || 
                              (this.config.usePIN && pinConfigured);
      
      // If no security is configured, app should never be locked
      if (!hasActiveSecurity) {
        this.isLocked = false;
        return false;
      }

      // Now check the current lock state
      if (this.isLocked) {
        return true;
      }

      // Check if we're in lockout period
      if (Date.now() < this.lockoutUntil) {
        this.isLocked = true;
        return true;
      }

      // If authentication is not required, app is never locked
      if (!this.config.requireAuthentication) {
        return false;
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
    } catch (error) {
      console.error('Error checking app lock state:', error);
      return true; // Default to locked on error
    }
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
      console.log('Attempting to unlock with PIN:', { pin, pinLength: pin.length });
      
      if (!this.config.usePIN) {
        console.log('PIN authentication not enabled');
        return false;
      }

      // Check lockout
      if (Date.now() < this.lockoutUntil) {
        const remainingTime = Math.ceil((this.lockoutUntil - Date.now()) / 1000 / 60);
        throw new Error(`Account locked. Try again in ${remainingTime} minutes.`);
      }

      const storedPINConfig = await this.getStoredPINConfig();
      console.log('Retrieved stored PIN config:', { 
        hasConfig: !!storedPINConfig,
        salt: storedPINConfig?.salt 
      });
      
      if (!storedPINConfig) {
        console.log('No PIN configuration found');
        throw new Error('No PIN configured');
      }

      // Ensure we're working with a fresh PIN value
      const pinToVerify = pin.slice(0);
      console.log('Verifying PIN:', { pinToVerify });
      
      const isValid = await this.verifyPIN(pinToVerify, storedPINConfig);
      console.log('PIN verification completed:', { isValid, pinToVerify });
      
      if (isValid) {
        this.pinAttempts = 0;
        this.isLocked = false; // Explicitly unlock
        this.lastActiveTime = Date.now();
        console.log('App unlocked successfully');
        return true;
      } else {
        this.pinAttempts++;
        console.log('Failed PIN attempt:', { 
          attempts: this.pinAttempts, 
          max: this.config.maxPINAttempts,
          inputPin: pinToVerify 
        });
        
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
      console.log('Setting up new PIN...');
      
      if (pin.length !== 4) {
        throw new Error('PIN must be exactly 4 digits');
      }

      if (!/^\d{4}$/.test(pin)) {
        throw new Error('PIN must contain only digits');
      }

      // Generate salt and hash PIN
      const salt = await this.generateSalt();
      console.log('Generated new salt');
      
      const hashedPIN = await this.hashPIN(pin, salt);
      console.log('Generated PIN hash');

      const pinConfig: PINConfig = {
        pin: hashedPIN,
        salt,
        iterations: 10000,
      };

      await this.storePINConfig(pinConfig);
      console.log('Stored PIN configuration');
      
      this.config.usePIN = true;
      await this.saveConfig();
      console.log('Updated security config');

      // Verify the PIN was stored correctly
      const storedConfig = await this.getStoredPINConfig();
      const canVerify = await this.verifyPIN(pin, storedConfig!);
      console.log('Verified new PIN setup:', { canVerify });
      
      if (!canVerify) {
        throw new Error('PIN verification failed after setup');
      }
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

  // TODO: REMOVE! Method to reset security state (for testing)
  async resetSecurityState(): Promise<void> {
    try {
      console.log('Resetting security state...');
      
      // Reset all security flags
      this.isLocked = false;
      this.lastActiveTime = Date.now();
      this.pinAttempts = 0;
      this.lockoutUntil = 0;

      // Remove PIN configuration
      await SecureStore.deleteItemAsync('app_security_pin_config');
      
      // Reset config to defaults
      this.config = {
        requireAuthentication: false,
        useBiometric: false,
        usePIN: false,
        autoLockTimeout: 5 * 60 * 1000,
        maxPINAttempts: 5,
        lockoutDuration: 15 * 60 * 1000,
      };
      await this.saveConfig();

      console.log('Security state reset successfully');
    } catch (error) {
      console.error('Error resetting security state:', error);
      throw error;
    }
  }

  private unlockApp(): void {
    this.isLocked = false;
    this.lastActiveTime = Date.now();
    this.pinAttempts = 0;
    this.lockoutUntil = 0;
  }

  private async generateSalt(): Promise<string> {
    // Simple salt generation for React Native
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let salt = '';
    for (let i = 0; i < 16; i++) {
      salt += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return salt;
  }

  private async hashPIN(pin: string, salt: string): Promise<string> {
    // Super simple hash for testing - in production use a proper crypto library
    const combined = pin + salt;
    let hash = 0;
    
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) + hash) + combined.charCodeAt(i);
      hash = hash >>> 0; // Convert to unsigned 32-bit
    }
    
    return hash.toString(16);
  }

  private async verifyPIN(pin: string, pinConfig: PINConfig): Promise<boolean> {
    try {
      console.log('Verifying PIN...', {
        inputPin: pin,
        salt: pinConfig.salt
      });
      const hashedInput = await this.hashPIN(pin, pinConfig.salt);
      const isValid = hashedInput === pinConfig.pin;
      console.log('PIN verification details:', {
        hashedInput,
        storedHash: pinConfig.pin,
        isValid
      });
      return isValid;
    } catch (error) {
      console.error('Error verifying PIN:', error);
      return false;
    }
  }

  // Method to reset PIN configuration (for debugging)
  async resetPINConfiguration(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync('app_security_pin_config');
      this.config.usePIN = false;
      await this.saveConfig();
      console.log('PIN configuration reset successfully');
    } catch (error) {
      console.error('Error resetting PIN configuration:', error);
      throw error;
    }
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
    } catch { 
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
    } catch {
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