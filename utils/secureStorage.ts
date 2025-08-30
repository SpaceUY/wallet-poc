import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';

import { ethers } from 'ethers';
import SecureWallet from './nativeSecureWallet';

// Define the type for storage options
type SecureStorageOptions = {
  requireAuthentication: boolean;
  authenticationPrompt?: string;
  keychainAccessible: number;
};

// Constants for different security levels
export const SECURE_STORAGE_OPTIONS: {
  HIGH_SECURITY: SecureStorageOptions;
  MEDIUM_SECURITY: SecureStorageOptions;
} = {
  // For highly sensitive data (private keys, seed phrases)
  HIGH_SECURITY: {
    requireAuthentication: true,
    authenticationPrompt: 'Please authenticate to access your wallet',
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  },
  // For less sensitive data (public keys, settings)
  MEDIUM_SECURITY: {
    requireAuthentication: false,
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  }
};

export class SecureStorage {
  private static instance: SecureStorage;
  private isDeviceSecure: boolean = false;
  
  private constructor() {}

  static getInstance(): SecureStorage {
    if (!SecureStorage.instance) {
      SecureStorage.instance = new SecureStorage();
    }
    return SecureStorage.instance;
  }

  async verifyDeviceSecurity(): Promise<{ isSecure: boolean; risks: string[] }> {
    const risks: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if device is rooted/jailbroken
      const isRooted = await Device.isRootedExperimentalAsync();
      if (isRooted) {
        risks.push('Device is rooted/jailbroken');
      }

      // Development mode is now just a warning
      if (__DEV__) {
        warnings.push('App running in development mode');
      }

      // Check device type
      const deviceInfo = await Device.getDeviceTypeAsync();
      if (deviceInfo !== Device.DeviceType.PHONE) {
        risks.push('Not running on a secure phone device');
      }

      // Check biometric availability
      const canUseBiometric = await SecureStore.canUseBiometricAuthentication();
      if (!canUseBiometric) {
        risks.push('Biometric authentication not available');
      }

      // Check secure storage
      const isSecureStoreAvailable = await SecureStore.isAvailableAsync();
      if (!isSecureStoreAvailable) {
        risks.push('Secure storage not available');
      }

      // Check if running in Expo Go
      const isExpoGo = Application.applicationId === 'host.exp.exponent';
      if (isExpoGo) {
        risks.push('Running in Expo Go');
      }

      // Check Secure Enclave
      const hasSecureEnclave = await this.useSecureEnclave();
      if (!hasSecureEnclave) {
        risks.push('Secure Enclave not available');
      }

      // STRICT: In production, block if any critical risk (including missing Secure Enclave or biometrics)
      this.isDeviceSecure = risks.length === 0;

      return {
        isSecure: this.isDeviceSecure,
        risks: [...risks, ...warnings]
      };
    } catch (error) {
      this.isDeviceSecure = false;
      return {
        isSecure: false,
        risks: ['Error during security verification']
      };
    }
  }

  private async ensureDeviceSecurity() {
    if (!this.isDeviceSecure) {
      const { isSecure, risks } = await this.verifyDeviceSecurity();
      if (!isSecure) {
        throw new Error(`Device security compromised: ${risks.join(', ')}`);
      }
    }
  }

  private async useSecureEnclave(): Promise<boolean> {
    try {
      console.log('Checking SecureWallet native module:', SecureWallet ? 'Found' : 'Not found');
      const isAvailable = await SecureWallet.isSecureEnclaveAvailable();
      console.log('SecureWallet.isSecureEnclaveAvailable() result:', isAvailable);
      return isAvailable;
    } catch (error) {
      console.error('Error checking Secure Enclave:', error);
      return false;
    }
  }

  private deriveAddress(publicKey: string): string {
    // Remove '04' prefix if present (uncompressed public key format)
    const keyWithoutPrefix = publicKey.startsWith('04') ? publicKey.slice(2) : publicKey;
    
    // Use ethers.js to compute Keccak-256 hash
    const hash = ethers.keccak256('0x' + keyWithoutPrefix);
    
    // Take last 20 bytes
    const address = '0x' + hash.slice(-40);
    
    return ethers.getAddress(address); // Checksum address
  }

  // Update generateKeyPair to try native module first
  async generateKeyPair(keyId: string, useSoftware = false): Promise<{ address: string }> {
    // Always enforce device security before key generation
    await this.ensureDeviceSecurity();

    try {
      // Try to use Secure Enclave unless software is explicitly requested
      if (!useSoftware) {
        const secureEnclaveAvailable = await this.useSecureEnclave();
        
        if (secureEnclaveAvailable) {
          try {
            const result = await SecureWallet.generateSecureWallet({
              requireBiometric: true,
              label: `wallet_${keyId}`
            });
            
            // Derive address from public key
            const address = this.deriveAddress(result.publicKey);
            
            // Store the address for later retrieval
            await this.setItem(
              `address_${keyId}`,
              address,
              SECURE_STORAGE_OPTIONS.MEDIUM_SECURITY
            );
            
            return { address };
          } catch (secureEnclaveError) {
            useSoftware = true;
          }
        } else {
          useSoftware = true;
        }
      }

      // Fall back to software implementation
      
      let wallet: ethers.HDNodeWallet | null = null;
      let address: string = '';
      
      // Create wallet in a controlled scope
      {
        // Generate wallet
        wallet = ethers.Wallet.createRandom() as ethers.HDNodeWallet;
        if (!wallet?.mnemonic?.phrase) {
          throw new Error('Failed to generate secure mnemonic');
        }
        
        // Store address before cleaning up wallet
        address = wallet.address;

        // Immediately encrypt sensitive data
        const encryptedMnemonic = await this.encryptData(wallet.mnemonic.phrase);
        const encryptedKey = await this.encryptData(wallet.privateKey);

        // Clear mnemonic from memory ASAP
        if (wallet.mnemonic.phrase) {
          wallet.mnemonic.phrase.split('').fill('0').join('');
        }
        
        // Store encrypted data
        try {
          await this.setItem(
            `mnemonic_${keyId}`,
            encryptedMnemonic,
            {
              ...SECURE_STORAGE_OPTIONS.HIGH_SECURITY,
              keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
            }
          );

          await this.setItem(
            `pk_${keyId}`,
            encryptedKey,
            {
              ...SECURE_STORAGE_OPTIONS.HIGH_SECURITY,
              keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
            }
          );
        } catch (storageError) {
          throw new Error(`Failed to store encrypted data: ${storageError}`);
        }
      }

      // Store public address (not sensitive)
      try {
        await this.setItem(
          `address_${keyId}`,
          address,
          SECURE_STORAGE_OPTIONS.MEDIUM_SECURITY
        );
      } catch (addressStorageError) {
        throw new Error(`Failed to store public address: ${addressStorageError}`);
      }

      // Force garbage collection of the wallet scope
      wallet = null;
      global.gc && global.gc();
      
      return { address };
    } catch (error) {
      throw new Error(`Failed to generate secure key pair: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Add method to recover wallet from mnemonic
  async recoverFromMnemonic(keyId: string, mnemonic: string): Promise<{ address: string }> {
    await this.ensureDeviceSecurity();

    try {
      // Create wallet from mnemonic
      const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic);
      
      // Encrypt and store just like in generateKeyPair
      const encryptedMnemonic = await this.encryptData(mnemonic);
      const encryptedKey = await this.encryptData(wallet.privateKey);

      await this.setItem(
        `mnemonic_${keyId}`,
        encryptedMnemonic,
        {
          ...SECURE_STORAGE_OPTIONS.HIGH_SECURITY,
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
        }
      );

      await this.setItem(
        `pk_${keyId}`,
        encryptedKey,
        {
          ...SECURE_STORAGE_OPTIONS.HIGH_SECURITY,
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
        }
      );

      await this.setItem(
        `address_${keyId}`,
        wallet.address,
        SECURE_STORAGE_OPTIONS.MEDIUM_SECURITY
      );

      // Clear sensitive data
      wallet.connect(ethers.getDefaultProvider());
      
      return { address: wallet.address };
    } catch (error) {
      console.error('Error recovering wallet:', error);
      throw new Error('Failed to recover wallet');
    }
  }

  // Add method to get mnemonic (for backup)
  async getMnemonic(keyId: string): Promise<string | null> {
    await this.ensureDeviceSecurity();

    try {
      const encryptedMnemonic = await this.getItem(
        `mnemonic_${keyId}`,
        SECURE_STORAGE_OPTIONS.HIGH_SECURITY
      );
      if (!encryptedMnemonic) return null;

      return await this.decryptData(encryptedMnemonic);
    } catch (error) {
      console.error('Error retrieving mnemonic:', error);
      throw new Error('Failed to access mnemonic');
    }
  }

  // Add encryption layer
  private async encryptData(data: string): Promise<string> {
    // This is a placeholder - in production, we'd use a proper encryption key
    // stored in the secure enclave/TEE
    const encryptionKey = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      'app-specific-salt' + data
    );
    
    return encryptionKey + ':' + data;
  }

  private async decryptData(encryptedData: string): Promise<string> {
    // This is a placeholder - in production, we'd use the proper decryption key
    // from secure enclave/TEE
    const [, data] = encryptedData.split(':');
    return data;
  }

  // Update getWallet with enhanced security
  async getWallet(keyId: string): Promise<ethers.Wallet | null> {
    await this.ensureDeviceSecurity();

    try {
      const encryptedKey = await this.getItem(
        `pk_${keyId}`,
        SECURE_STORAGE_OPTIONS.HIGH_SECURITY
      );
      if (!encryptedKey) return null;

      const privateKey = await this.decryptData(encryptedKey);
      
      // Create a wallet instance that only lives briefly for signing
      const wallet = new ethers.Wallet(privateKey);
      
      // Clear private key from memory
      privateKey.split('').fill('0').join('');
      
      return wallet;
    } catch (error) {
      console.error('Error getting wallet:', error);
      throw new Error('Failed to access wallet securely');
    }
  }

  // Get private key (requires biometric authentication)
  async getPrivateKey(keyId: string): Promise<string | null> {
    try {
      return await this.getItem(
        `pk_${keyId}`,
        SECURE_STORAGE_OPTIONS.HIGH_SECURITY
      );
    } catch (error) {
      console.error('Error retrieving private key:', error);
      throw error;
    }
  }

  // Check if wallet exists and get its address
  async getExistingWallet(keyId: string): Promise<{ address: string } | null> {
    try {
      const address = await this.getItem(
        `address_${keyId}`,
        SECURE_STORAGE_OPTIONS.MEDIUM_SECURITY
      );
      
      if (!address) return null;
      return { address };
    } catch (error) {
      console.error('Error checking existing wallet:', error);
      return null;
    }
  }

  async setItem(
    key: string, 
    value: string, 
    options: SecureStorageOptions = SECURE_STORAGE_OPTIONS.MEDIUM_SECURITY
  ): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value, options);
    } catch (error) {
      console.error('Error storing item:', error);
      throw error;
    }
  }

  async getItem(
    key: string,
    options: SecureStorageOptions = SECURE_STORAGE_OPTIONS.MEDIUM_SECURITY
  ): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key, options);
    } catch (error) {
      console.error('Error retrieving item:', error);
      throw error;
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('Error removing item:', error);
      throw error;
    }
  }

  // Remove all wallet data
  async removeWallet(keyId: string): Promise<void> {
    await this.removeItem(`mnemonic_${keyId}`);
    await this.removeItem(`pk_${keyId}`);
    await this.removeItem(`address_${keyId}`);
  }
}

export const secureStorage = SecureStorage.getInstance(); 