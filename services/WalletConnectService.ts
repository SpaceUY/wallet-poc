import { ethers } from 'ethers';
import { ENV } from '../config/env';
import { secureStorage } from '../utils/secureStorage';

export interface WalletConnectSession {
  topic: string;
  chainId: string;
  accounts: string[];
}

export interface WalletConnectTransaction {
  to: string;
  value: string;
  data?: string;
  gasLimit?: string;
  gasPrice?: string;
}

export class SoftwareWalletService {
  private static instance: SoftwareWalletService;
  private signClient: any = null;
  private projectId = ENV.WALLETCONNECT_PROJECT_ID;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): SoftwareWalletService {
    if (!SoftwareWalletService.instance) {
      SoftwareWalletService.instance = new SoftwareWalletService();
    }
    return SoftwareWalletService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Verify device security before initializing WalletConnect
      const { isSecure } = await secureStorage.verifyDeviceSecurity();
      if (!isSecure) {
        throw new Error('Device security requirements not met');
      }

      // For now, we'll use a simplified WalletConnect implementation
      // that works with Expo Go without AsyncStorage
      console.log('WalletConnect service initialized (Expo Go compatible mode)');
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize WalletConnect:', error);
      throw new Error('Failed to initialize WalletConnect service');
    }
  }

  async createWallet(): Promise<{ address: string; type: 'walletconnect'; mnemonic: string }> {
    try {
      await this.initialize();

      // Use our existing secure storage to create a wallet
      // This avoids the ethers.js crypto issue in Expo Go
      const { address } = await secureStorage.generateKeyPair('walletconnect', true);
      
      // Get the mnemonic for backup
      const mnemonic = await secureStorage.getMnemonic('walletconnect');
      if (!mnemonic) {
        throw new Error('Failed to get mnemonic for backup');
      }

      return { 
        address, 
        type: 'walletconnect' as const,
        mnemonic
      };
    } catch (error) {
      console.error('Failed to create Multi-Network wallet:', error);
      throw new Error('Failed to create Multi-Network wallet');
    }
  }

  async getWallet(): Promise<{ address: string; type: 'walletconnect' } | null> {
    try {
      const existingWallet = await secureStorage.getExistingWallet('walletconnect');
      if (!existingWallet) return null;

      return {
        address: existingWallet.address,
        type: 'walletconnect' as const
      };
    } catch (error) {
      console.error('Failed to get WalletConnect wallet:', error);
      return null;
    }
  }

  async getMnemonic(): Promise<string | null> {
    try {
      const encryptedMnemonic = await secureStorage.getItem('walletconnect_mnemonic');
      if (!encryptedMnemonic) return null;

      return await this.decryptData(encryptedMnemonic);
    } catch (error) {
      console.error('Failed to retrieve mnemonic:', error);
      throw new Error('Failed to access mnemonic');
    }
  }

  async recoverFromMnemonic(mnemonic: string): Promise<{ address: string; type: 'walletconnect' }> {
    try {
      await this.initialize();

      // Create wallet from mnemonic
      const wallet = ethers.Wallet.fromPhrase(mnemonic);
      
      // Store the wallet info securely
      await this.storeWalletInfo(wallet.address, wallet.privateKey, mnemonic);

      return { 
        address: wallet.address, 
        type: 'walletconnect' as const 
      };
    } catch (error) {
      console.error('Failed to recover wallet from mnemonic:', error);
      throw new Error('Failed to recover wallet from mnemonic');
    }
  }

  async sendTransaction(
    chainId: string, 
    transaction: WalletConnectTransaction
  ): Promise<{ hash: string }> {
    try {
      await this.initialize();

      // For now, we'll use ethers.js for transaction signing
      // In a full implementation, you'd use WalletConnect's signing
      const walletInfo = await this.getStoredWalletInfo();
      if (!walletInfo) {
        throw new Error('No wallet found');
      }

      const wallet = new ethers.Wallet(walletInfo.privateKey);
      
      // Create transaction
      const tx = {
        to: transaction.to,
        value: ethers.parseEther(transaction.value),
        data: transaction.data || '0x',
        gasLimit: transaction.gasLimit ? BigInt(transaction.gasLimit) : undefined,
        gasPrice: transaction.gasPrice ? BigInt(transaction.gasPrice) : undefined
      };

      // Sign and send transaction
      const signedTx = await wallet.signTransaction(tx);
      
      // For now, return a mock hash
      // In full implementation, you'd broadcast the transaction
      return { hash: '0x' + '0'.repeat(64) };
    } catch (error) {
      console.error('Failed to send WalletConnect transaction:', error);
      throw new Error('Failed to send transaction');
    }
  }

  async getBalance(address: string, chainId: string): Promise<string> {
    try {
      // For now, we'll use ethers.js for balance checking
      // In a full implementation, you'd use WalletConnect's RPC calls
      const provider = new ethers.JsonRpcProvider(
        `https://${chainId === '1' ? 'mainnet' : 'sepolia'}.infura.io/v3/YOUR_INFURA_ID`
      );
      
      const balance = await provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      console.error('Failed to get balance:', error);
      throw new Error('Failed to get balance');
    }
  }

  async connectToDApp(uri: string): Promise<WalletConnectSession> {
    try {
      await this.initialize();
      
      // In Expo Go, we'll use a mock implementation
      // In a full build, this would use actual WalletConnect
      console.log('Connecting to dApp (Expo Go mode):', uri);
      
      // Parse the URI to extract connection info
      const url = new URL(uri);
      const topic = url.searchParams.get('topic') || 'mock-topic';
      
      return {
        topic: topic,
        chainId: 'eip155:1', // Default to Ethereum mainnet
        accounts: ['0x' + '0'.repeat(40)] // Mock account
      };
    } catch (error) {
      console.error('Failed to connect to dApp:', error);
      throw new Error('Failed to connect to dApp');
    }
  }

  async disconnectFromDApp(sessionTopic: string): Promise<void> {
    try {
      console.log('Mock dApp disconnection for topic:', sessionTopic);
      // In full implementation, this would disconnect from actual dApps
    } catch (error) {
      console.error('Failed to disconnect from dApp:', error);
    }
  }

  private async storeWalletInfo(address: string, privateKey: string, mnemonic: string): Promise<void> {
    try {
      // Store wallet info securely using our existing secure storage
      await secureStorage.setItem(
        'walletconnect_address',
        address
      );

      // Encrypt and store private key
      const encryptedKey = await this.encryptData(privateKey);
      await secureStorage.setItem(
        'walletconnect_private_key',
        encryptedKey
      );

      // Encrypt and store mnemonic
      const encryptedMnemonic = await this.encryptData(mnemonic);
      await secureStorage.setItem(
        'walletconnect_mnemonic',
        encryptedMnemonic
      );
    } catch (error) {
      console.error('Failed to store wallet info:', error);
      throw new Error('Failed to store wallet information');
    }
  }

  private async getStoredWalletInfo(): Promise<{ address: string; privateKey: string; mnemonic?: string } | null> {
    try {
      const address = await secureStorage.getItem('walletconnect_address');
      const encryptedKey = await secureStorage.getItem('walletconnect_private_key');
      const encryptedMnemonic = await secureStorage.getItem('walletconnect_mnemonic');

      if (!address || !encryptedKey) return null;

      const privateKey = await this.decryptData(encryptedKey);
      const mnemonic = encryptedMnemonic ? await this.decryptData(encryptedMnemonic) : undefined;
      
      return { address, privateKey, mnemonic };
    } catch (error) {
      console.error('Failed to get stored wallet info:', error);
      return null;
    }
  }

  private isExpoGo(): boolean {
    return typeof global !== 'undefined' && (global as any).__EXPO_GO__ === true;
  }

  private generateSimpleMnemonic(privateKey: string): string {
    // Simple mnemonic generation for demo purposes
    // In production, use proper BIP39 mnemonic generation
    const words = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse',
      'access', 'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act',
      'action', 'actor', 'actual', 'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult',
      'advance', 'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent', 'agree'
    ];
    
    // Use private key hash to generate deterministic mnemonic
    const hash = ethers.keccak256(privateKey);
    const indices = [];
    for (let i = 0; i < 12; i++) {
      const index = parseInt(hash.slice(2 + i * 2, 4 + i * 2), 16) % words.length;
      indices.push(index);
    }
    
    return indices.map(i => words[i]).join(' ');
  }

  private async encryptData(data: string): Promise<string> {
    // Simple encryption for now - in production, use proper encryption
    // Use btoa for base64 encoding (works in React Native)
    return btoa(data);
  }

  private async decryptData(encryptedData: string): Promise<string> {
    // Simple decryption for now - in production, use proper decryption
    // Use atob for base64 decoding (works in React Native)
    return atob(encryptedData);
  }

  async deleteWallet(): Promise<void> {
    try {
      await secureStorage.removeItem('walletconnect_address');
      await secureStorage.removeItem('walletconnect_private_key');
      await secureStorage.removeItem('walletconnect_mnemonic');
      
      console.log('WalletConnect wallet deleted');
    } catch (error) {
      console.error('Failed to delete WalletConnect wallet:', error);
      throw new Error('Failed to delete wallet');
    }
  }
}

export const softwareWalletService = SoftwareWalletService.getInstance(); 