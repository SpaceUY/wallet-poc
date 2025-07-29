import { ENV } from '@/config/env';
import { ethers } from 'ethers';
import { secureStorage } from '@/utils/secureStorage';

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

  async createWallet(): Promise<{ address: string }> {
    try {
      // Generate key pair in secure hardware
      const { address } = await secureStorage.generateKeyPair('primary');
      return { address };
    } catch (error) {
      console.error('Error creating wallet:', error);
      throw new Error('Failed to create wallet securely');
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
      const balance = await this.provider.getBalance(address);
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
}

export const walletService = WalletService.getInstance(); 