import { ethers } from 'ethers';
import { ENV } from '../config/env';
import SecureWallet from '../utils/nativeSecureWallet';
import { secureStorage } from '../utils/secureStorage';

export class WalletService {
  private static instance: WalletService;
  private provider: ethers.JsonRpcProvider;
  
  private constructor() {
    this.provider = new ethers.JsonRpcProvider(
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

  async createWallet(useSoftware = false): Promise<{ address: string }> {
    try {
      // Check if hardware security is available when not explicitly using software
      if (!useSoftware) {
        const isSecure = await this.isSecureEnvironmentAvailable();
        if (!isSecure) {
          throw new Error('Hardware security not available. Use software wallet or check device security.');
        }
      }

      const { address } = await secureStorage.generateKeyPair('primary', useSoftware);
      return { address };
    } catch (error) {
      console.error('Error creating wallet:', error);
      throw error;
    }
  }

  async getWallet(): Promise<ethers.Wallet | null> {
    try {
      const wallet = await secureStorage.getWallet('primary');
      if (!wallet) return null;
      
      // Connect wallet to provider
      return wallet.connect(this.provider);
    } catch (error) {
      console.error('Error getting wallet:', error);
      throw new Error('Failed to access wallet');
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
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('Error getting balance:', error);
      throw new Error('Failed to get balance');
    }
  }

  async sendTransaction(to: string, amount: string): Promise<ethers.TransactionResponse> {
    try {
      const wallet = await this.getWallet();
      if (!wallet) throw new Error('No wallet found');

      const tx = await wallet.sendTransaction({
        to: to,
        value: ethers.parseEther(amount)
      });

      return tx;
    } catch (error) {
      console.error('Error sending transaction:', error);
      throw new Error('Failed to send transaction');
    }
  }

  async estimateGas(to: string, amount: string): Promise<string> {
    try {
      const wallet = await this.getWallet();
      if (!wallet) throw new Error('No wallet found');

      const tx = {
        to: to,
        value: ethers.parseEther(amount)
      };

      const gasEstimate = await this.provider.estimateGas({
        ...tx,
        from: wallet.address
      });

      const gasPrice = await this.provider.getFeeData();
      const totalGasCost = gasEstimate * gasPrice.gasPrice!;
      
      return ethers.formatEther(totalGasCost);
    } catch (error) {
      console.error('Error estimating gas:', error);
      throw new Error('Failed to estimate gas');
    }
  }

  async deleteWallet(): Promise<void> {
    try {
      await secureStorage.removeWallet('primary');
    } catch (error) {
      console.error('Error deleting wallet:', error);
      throw new Error('Failed to delete wallet');
    }
  }

  async checkExistingWallet(): Promise<{ address: string } | null> {
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
            
            // Derive address from public key if it's a placeholder
            if (wallet.address === '0x0000000000000000000000000000000000000000') {
              const derivedAddress = this.deriveAddressFromPublicKey(wallet.publicKey);
              console.log('Derived address from public key:', derivedAddress);
              return { address: derivedAddress };
            }
            
            return { address: wallet.address };
          }
        } catch (e) {
          console.log('No hardware wallet found, checking software wallet');
        }
      } else {
        console.log('Device security check failed, checking software wallet only');
      }

      // Then check software wallet
      const existingWallet = await secureStorage.getExistingWallet('primary');
      if (existingWallet) {
        console.log('Found existing software wallet:', existingWallet.address);
        return existingWallet;
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

  private deriveAddressFromPublicKey(publicKey: string): string {
    // Remove '04' prefix if present (uncompressed public key format)
    const keyWithoutPrefix = publicKey.startsWith('04') ? publicKey.slice(2) : publicKey;
    
    // Use ethers.js to compute Keccak-256 hash
    const hash = ethers.keccak256('0x' + keyWithoutPrefix);
    
    // Take last 20 bytes
    const address = '0x' + hash.slice(-40);
    
    return ethers.getAddress(address); // Checksum address
  }
}

export const walletService = WalletService.getInstance(); 