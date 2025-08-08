import { JsonRpcProvider, ethers, formatEther, keccak256, parseEther } from 'ethers';

import { ENV } from '../config/env';
import SecureWallet from '../utils/nativeSecureWallet';
import { secureStorage } from '../utils/secureStorage';
import { softwareWalletService } from './SoftwareWalletService';

export class WalletService {
  private static instance: WalletService;
  private provider: JsonRpcProvider;
  
  private constructor() {
    this.provider = new JsonRpcProvider(
      `https://${ENV.NETWORK}.infura.io/v3/${ENV.INFURA_PROJECT_ID}`
    );
  }

  static getInstance(): WalletService {
    if (!WalletService.instance) {
      WalletService.instance = new WalletService();
    }
    return WalletService.instance;
  }

  async isSecureEnvironmentAvailable(): Promise<boolean> {
    const { isSecure } = await secureStorage.verifyDeviceSecurity();
    return isSecure;
  }

  async createWallet(useSoftware = false): Promise<{ address: string; type: 'hardware' | 'software'; mnemonic?: string }> {
    if (useSoftware) {
      // User requested a software wallet (multi-network support)
      const { address, type, mnemonic } = await softwareWalletService.createWallet();
      return { address, type, mnemonic };
    } else {
      // User requested a hardware wallet, do not fallback to software
      try {
        const { address } = await secureStorage.generateKeyPair('primary', false);
        return { address, type: 'hardware' as const };
      } catch (error) {
        throw new Error(
          'Hardware wallet creation failed: Device does not meet security requirements (Secure Enclave and biometrics required). ' +
          (error instanceof Error ? error.message : error)
        );
      }
    }
  }

  async getBalance(address: string): Promise<string> {
    try {
      console.log('WalletService: Getting balance for address:', address);
      if (!address) {
        throw new Error('Address is null or undefined');
      }
      const balance = await this.provider.getBalance(address);
      console.log('WalletService: Raw balance result:', balance);
      return formatEther(balance);
    } catch (error) {
      console.error('Error getting balance:', error);
      throw new Error('Failed to get balance');
    }
  }

  async sendTransaction(to: string, amount: string): Promise<ethers.TransactionResponse> {
    try {
      // For now, we'll use a simplified approach with ethers v6
      // This will need to be updated for hardware wallet support
      const wallet = await this.getWallet();
      if (!wallet) {
        throw new Error('No wallet found');
      }

      const tx = await wallet.sendTransaction({
        to: to,
        value: parseEther(amount)
      });

      return tx;
    } catch (error) {
      console.error('Error sending transaction:', error);
      throw error;
    }
  }

  async getWallet(): Promise<ethers.Wallet | null> {
    try {
      // First check if we have a hardware wallet
      const isSecure = await this.isSecureEnvironmentAvailable();
      if (isSecure) {
        try {
          const hardwareWallet = await SecureWallet.checkForExistingWallet();
          if (hardwareWallet) {
            console.log('Found hardware wallet, but cannot return private key (it\'s in Secure Enclave)');
            // For hardware wallets, we can't return the private key
            // We'll need to handle signing differently
            return null;
          }
        } catch (e) {
          console.log('No hardware wallet found, checking software wallet');
        }
      }

      // Check for software wallet
      const softwareWallet = await softwareWalletService.getWallet();
      if (softwareWallet) {
        // For software wallets, we need to get the private key for signing
        const walletInfo = await softwareWalletService['getStoredWalletInfo']();
        if (walletInfo) {
          const wallet = new ethers.Wallet(walletInfo.privateKey);
          return wallet.connect(this.provider);
        }
      }

      return null;
    } catch (error) {
      console.error('Error getting wallet:', error);
      throw new Error('Failed to access wallet');
    }
  }

  async estimateGas(to: string, amount: string): Promise<string> {
    try {
      // Get wallet address (works for both hardware and software wallets)
      const address = await this.getWalletAddress();
      if (!address) throw new Error('No wallet found');

      const tx = {
        to: to,
        value: parseEther(amount)
      };

      const gasEstimate = await this.provider.estimateGas({
        ...tx,
        from: address
      });

      const gasPrice = await this.provider.getFeeData();
      const totalGasCost = gasEstimate * gasPrice.gasPrice!;
      
      return formatEther(totalGasCost);
    } catch (error) {
      console.error('Error estimating gas:', error);
      throw new Error('Failed to estimate gas');
    }
  }

  async deleteWallet(): Promise<void> {
    try {
      // Delete software wallet if it exists
      try {
        await softwareWalletService.deleteWallet();
      } catch (error) {
        console.log('No software wallet to delete or error deleting software wallet:', error);
      }
      
      // Delete hardware wallet from Secure Enclave and Keychain
      try {
        const result = await SecureWallet.deleteWallet();
        console.log('Hardware wallet deletion result:', result);
      } catch (error) {
        console.log('No hardware wallet to delete or error deleting hardware wallet:', error);
      }
      
      console.log('Wallet deletion completed');
    } catch (error) {
      console.error('Error deleting wallet:', error);
      throw new Error('Failed to delete wallet');
    }
  }

  async checkExistingWallet(): Promise<{ address: string; type?: 'hardware' | 'software' } | null> {
    try {
      // First verify device security
      const isSecure = await this.isSecureEnvironmentAvailable();
      
      // First check hardware wallet if device is secure
      if (isSecure) {
        try {
          console.log('Device is secure, checking for hardware wallet...');
          const wallet = await SecureWallet.checkForExistingWallet();
          if (wallet) {
            console.log('Found existing hardware wallet with public key:', wallet.publicKey);
            
            // For hardware wallets, we need to get the actual signing address
            // Since the stored public key might not match the signing key, we'll use a placeholder
            // and let the transaction signing reveal the actual address
            const derivedAddress = this.deriveAddressFromPublicKey(wallet.publicKey);
            console.log('Derived address from public key:', derivedAddress);
            
            // Note: This might not be the actual signing address due to key mismatch
            // The actual address will be revealed during transaction signing
            return { address: derivedAddress, type: 'hardware' as const };
          }
        } catch (e) {
          console.log('No hardware wallet found, checking software wallet');
        }
      } else {
        console.log('Device security check failed, checking software wallet only');
      }

      // Then check software wallet
      const softwareWallet = await softwareWalletService.getWallet();
      if (softwareWallet) {
        console.log('Found existing software wallet:', softwareWallet.address);
        return { address: softwareWallet.address, type: 'software' as const };
      }

      console.log('No existing wallet found');
      return null;
    } catch (error) {
      console.error('Error checking for existing wallet:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
      }
      return null;
    }
  }

  async getActualSigningAddress(): Promise<string | null> {
    try {
      const isSecure = await this.isSecureEnvironmentAvailable();
      if (!isSecure) {
        // For software wallets, use the normal method
        const wallet = await this.checkExistingWallet();
        return wallet?.address || null;
      }

      // For hardware wallets, we need to determine the actual signing key
      // We'll create a dummy transaction hash and get the signature to reveal the public key
      const dummyHash = keccak256('0x1234567890abcdef');
      console.log('Getting actual signing address via test signature...');
      
      const signature = await SecureWallet.signTransactionHash(dummyHash);
      const actualAddress = this.deriveAddressFromPublicKey(signature.publicKey);
      
      console.log('Actual signing address determined:', actualAddress);
      return actualAddress;
    } catch (error) {
      console.error('Error getting actual signing address:', error);
      // Fall back to the stored address
      const wallet = await this.checkExistingWallet();
      return wallet?.address || null;
    }
  }

  private async getWalletAddress(): Promise<string | null> {
    try {
      // For hardware wallets, use the actual signing address
      const isSecure = await this.isSecureEnvironmentAvailable();
      if (isSecure) {
        return await this.getActualSigningAddress();
      }
      
      // For software wallets, use the stored address
      const existingWallet = await this.checkExistingWallet();
      return existingWallet?.address || null;
    } catch (error) {
      console.error('Error getting wallet address:', error);
      return null;
    }
  }

  private deriveAddressFromPublicKey(publicKey: string): string {
    // Remove '04' prefix if present (uncompressed public key format)
    const keyWithoutPrefix = publicKey.startsWith('04') ? publicKey.slice(2) : publicKey;
    
    // Use ethers.js to compute Keccak-256 hash
    const hash = keccak256('0x' + keyWithoutPrefix);
    
    // Take last 20 bytes
    const address = '0x' + hash.slice(-40);
    
    return ethers.getAddress(address); // Checksum address
  }

  async debugWalletCreation(): Promise<{
    secureEnclaveAvailable: boolean;
    secureStorageAvailable: boolean;
    existingWallet: { address: string; type?: 'hardware' | 'software' } | null;
    testWalletCreation: { success: boolean; error?: string };
  }> {
    try {
      // Check secure environment
      const secureEnclaveAvailable = await this.isSecureEnvironmentAvailable();
      
      // Check secure storage
      const { isSecure: secureStorageAvailable } = await secureStorage.verifyDeviceSecurity();
      
      // Check existing wallet
      const existingWallet = await this.checkExistingWallet();
      
      // Test wallet creation
      let testWalletCreation = { success: false, error: undefined as string | undefined };
      try {
        const testWallet = await this.createWallet(true); // Use software wallet for testing
        testWalletCreation = { success: true, error: undefined };
        // Clean up test wallet
        await this.deleteWallet();
      } catch (error) {
        testWalletCreation = { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
      
      return {
        secureEnclaveAvailable,
        secureStorageAvailable,
        existingWallet,
        testWalletCreation
      };
    } catch (error) {
      console.error('Error in debug wallet creation:', error);
      throw error;
    }
  }
}

export const walletService = WalletService.getInstance(); 