import { JsonRpcProvider, ethers, formatEther, parseEther } from 'ethers';

import { WalletInfo, WalletType } from '@/types/wallet';
import { ENV } from '../config/env';
import { hardwareWalletService } from './HardwareWalletService';
import { softwareWalletService } from './SoftwareWalletService';
import { walletConnectService } from './WalletConnectService';

export class WalletOrchestrator {
  private static instance: WalletOrchestrator;
  private provider: JsonRpcProvider;
  
  private constructor() {
    this.provider = new JsonRpcProvider(
      `https://${ENV.NETWORK}.infura.io/v3/${ENV.INFURA_PROJECT_ID}`
    );
  }

  static getInstance(): WalletOrchestrator {
    if (!WalletOrchestrator.instance) {
      WalletOrchestrator.instance = new WalletOrchestrator();
    }
    return WalletOrchestrator.instance;
  }

  // Wallet Creation Methods
  async createHardwareWallet(): Promise<{ address: string; type: 'hardware' }> {
    try {
      console.log('Creating hardware wallet...');
      return await hardwareWalletService.createWallet();
    } catch (error) {
      console.error('Failed to create hardware wallet:', error);
      throw error;
    }
  }

  async createSoftwareWallet(): Promise<{ address: string; type: 'software'; mnemonic: string }> {
    try {
      console.log('Creating software wallet...');
      return await softwareWalletService.createWallet();
    } catch (error) {
      console.error('Failed to create software wallet:', error);
      throw error;
    }
  }

  // For backwards compatibility with your existing UI
  async createWallet(useSoftware: boolean): Promise<{ address: string; type: WalletType; mnemonic?: string }> {
    if (useSoftware) {
      return await this.createSoftwareWallet();
    } else {
      return await this.createHardwareWallet();
    }
  }

  // Wallet Detection and Management
  async checkExistingWallet(): Promise<WalletInfo | null> {
    try {
      // First check for hardware wallet (if device supports it)
      const hardwareWallet = await hardwareWalletService.getWallet();
      if (hardwareWallet) {
        return {
          address: hardwareWallet.address,
          type: 'hardware'
        };
      }

      // Then check for software wallet
      const softwareWallet = await softwareWalletService.getWallet();
      if (softwareWallet) {
        return {
          address: softwareWallet.address,
          type: 'software'
        };
      }

      // Check for external wallet connections (WalletConnect)
      const externalWallet = await walletConnectService.getConnectedWallet();
      if (externalWallet) {
        return {
          address: externalWallet.address,
          type: 'external'
        };
      }

      return null;
    } catch (error) {
      console.error('Error checking for existing wallet:', error);
      return null;
    }
  }

  async getActualSigningAddress(): Promise<string | null> {
    try {
      const wallet = await this.checkExistingWallet();
      if (!wallet) return null;

      // For hardware wallets, get the actual signing address
      if (wallet.type === 'hardware') {
        return await hardwareWalletService.getActualSigningAddress();
      }

      // For software wallets, the stored address is the signing address
      return wallet.address;
    } catch (error) {
      console.error('Error getting actual signing address:', error);
      return null;
    }
  }

  // Balance and Network Operations
  async getBalance(address?: string): Promise<string> {
    try {
      let targetAddress: string | undefined | null = address;
      
      if (!targetAddress) {
        targetAddress = await this.getActualSigningAddress();
        if (!targetAddress) {
          throw new Error('No wallet address available');
        }
      }

      console.log('Getting balance for address:', targetAddress);
      const balance = await this.provider.getBalance(targetAddress);
      console.log('Raw balance result:', balance);
      return formatEther(balance);
    } catch (error) {
      console.error('Error getting balance:', error);
      throw new Error('Failed to get balance');
    }
  }

  async estimateGas(to: string, amount: string): Promise<string> {
    try {
      const address = await this.getActualSigningAddress();
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

  // Transaction Operations
  async sendTransaction(to: string, amount: string): Promise<ethers.TransactionResponse> {
    try {
      const wallet = await this.checkExistingWallet();
      if (!wallet) {
        throw new Error('No wallet found');
      }

      switch (wallet.type) {
        case 'hardware':
          console.log('Using hardware wallet for transaction signing');
          return await hardwareWalletService.signTransaction(to, amount);
          
        case 'software':
          console.log('Using software wallet for transaction signing');
          return await this.sendSoftwareWalletTransaction(to, amount);
          
        case 'external':
          console.log('Using external wallet for transaction signing');
          return await walletConnectService.sendTransaction(to, amount);
          
        default:
          throw new Error(`Unsupported wallet type: ${wallet.type}`);
      }
    } catch (error) {
      console.error('Error sending transaction:', error);
      throw error;
    }
  }

  // Message Signing
  async signMessage(message: string): Promise<string> {
    try {
      const wallet = await this.checkExistingWallet();
      if (!wallet) {
        throw new Error('No wallet found');
      }

      switch (wallet.type) {
        case 'hardware':
          return await hardwareWalletService.signMessage(message);
          
        case 'software':
          return await softwareWalletService.signMessage(message);
          
        case 'external':
          return await walletConnectService.signMessage(message);
          
        default:
          throw new Error(`Unsupported wallet type: ${wallet.type}`);
      }
    } catch (error) {
      console.error('Error signing message:', error);
      throw error;
    }
  }

  // Wallet Deletion
  async deleteWallet(): Promise<void> {
    try {
      const wallet = await this.checkExistingWallet();
      if (!wallet) {
        console.log('No wallet found to delete');
        return;
      }

      switch (wallet.type) {
        case 'hardware':
          await hardwareWalletService.deleteWallet();
          console.log('Hardware wallet deleted');
          break;
          
        case 'software':
          await softwareWalletService.deleteWallet();
          console.log('Software wallet deleted');
          break;
          
        case 'external':
          await walletConnectService.disconnect();
          console.log('External wallet disconnected');
          break;
      }
    } catch (error) {
      console.error('Error deleting wallet:', error);
      throw new Error('Failed to delete wallet');
    }
  }

  // Utility Methods
  async isHardwareWalletAvailable(): Promise<boolean> {
    return await hardwareWalletService.isAvailable();
  }

  async getWalletInfo(): Promise<WalletInfo | null> {
    try {
      const wallet = await this.checkExistingWallet();
      if (!wallet) return null;

      // Get balance for the wallet
      const balance = await this.getBalance(wallet.address);
      
      return {
        ...wallet,
        balance
      };
    } catch (error) {
      console.error('Error getting wallet info:', error);
      return null;
    }
  }

  // Private helper methods
  private async sendSoftwareWalletTransaction(to: string, amount: string): Promise<ethers.TransactionResponse> {
    try {
      // Get software wallet info to create ethers wallet
      const walletInfo = await softwareWalletService.getStoredWalletInfo();
      if (!walletInfo) {
        throw new Error('Software wallet not accessible');
      }

      // Create ethers wallet connected to provider
      const wallet = new ethers.Wallet(walletInfo.privateKey);
      const connectedWallet = wallet.connect(this.provider);

      // Send transaction
      const tx = await connectedWallet.sendTransaction({
        to: to,
        value: parseEther(amount)
      });

      return tx;
    } catch (error) {
      console.error('Error sending software wallet transaction:', error);
      throw error;
    }
  }

  // Debug and Development Methods
  async debugWalletInfo(): Promise<{
    hardwareAvailable: boolean;
    existingWallet: WalletInfo | null;
    signingAddress: string | null;
  }> {
    try {
      const hardwareAvailable = await this.isHardwareWalletAvailable();
      const existingWallet = await this.checkExistingWallet();
      const signingAddress = await this.getActualSigningAddress();

      return {
        hardwareAvailable,
        existingWallet,
        signingAddress
      };
    } catch (error) {
      console.error('Error in debug wallet info:', error);
      throw error;
    }
  }
}

export const walletOrchestrator = WalletOrchestrator.getInstance();