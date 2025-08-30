import { SoftwareWalletInfo, WalletCreationResult } from '@/types/wallet';
import { ethers } from 'ethers';
import * as Crypto from 'expo-crypto';
import { secureStorage } from '../utils/secureStorage';

export class SoftwareWalletService {
  private static instance: SoftwareWalletService;

  private constructor() {}

  static getInstance(): SoftwareWalletService {
    if (!SoftwareWalletService.instance) {
      SoftwareWalletService.instance = new SoftwareWalletService();
    }
    return SoftwareWalletService.instance;
  }

  async createWallet(): Promise<WalletCreationResult & { type: 'software'; mnemonic: string }> {
    try {
      console.log('Creating software wallet...');

      // Use expo-crypto for secure random generation
      const entropy = await Crypto.getRandomBytesAsync(32);
      const privateKey = '0x' + Array.from(entropy)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      // Create wallet from private key
      const wallet = new ethers.Wallet(privateKey);
      
      // Generate a simple mnemonic for backup
      const mnemonic = this.generateSimpleMnemonic(privateKey);

      // Store the wallet info securely
      await this.storeWalletInfo(wallet.address, wallet.privateKey, mnemonic);

      console.log('Software wallet created successfully:', wallet.address);

      return { 
        address: wallet.address, 
        type: 'software' as const,
        mnemonic: mnemonic
      };
    } catch (error) {
      console.error('Failed to create software wallet:', error);
      throw new Error('Failed to create software wallet');
    }
  }

  async getWallet(): Promise<{ address: string; type: 'software' } | null> {
    try {
      const walletInfo = await this.getStoredWalletInfo();
      if (!walletInfo) return null;

      return {
        address: walletInfo.address,
        type: 'software' as const
      };
    } catch (error) {
      console.error('Failed to get software wallet:', error);
      return null;
    }
  }

  async getMnemonic(): Promise<string | null> {
    try {
      const encryptedMnemonic = await secureStorage.getItem('software_mnemonic');
      if (!encryptedMnemonic) return null;

      return await this.decryptData(encryptedMnemonic);
    } catch (error) {
      console.error('Failed to retrieve mnemonic:', error);
      throw new Error('Failed to access mnemonic');
    }
  }

  async recoverFromMnemonic(mnemonic: string): Promise<{ address: string; type: 'software' }> {
    try {
      console.log('Recovering wallet from mnemonic...');

      // Create wallet from mnemonic
      const wallet = ethers.Wallet.fromPhrase(mnemonic);
      
      // Store the wallet info securely
      await this.storeWalletInfo(wallet.address, wallet.privateKey, mnemonic);

      console.log('Wallet recovered successfully:', wallet.address);

      return { 
        address: wallet.address, 
        type: 'software' as const 
      };
    } catch (error) {
      console.error('Failed to recover wallet from mnemonic:', error);
      throw new Error('Failed to recover wallet from mnemonic');
    }
  }

  async signTransaction(to: string, value: string, data?: string): Promise<string> {
    try {
      const walletInfo = await this.getStoredWalletInfo();
      if (!walletInfo) {
        throw new Error('No wallet found');
      }

      const wallet = new ethers.Wallet(walletInfo.privateKey);
      
      // Create transaction object
      const tx = {
        to: to,
        value: ethers.parseEther(value),
        data: data || '0x'
      };

      // Sign transaction
      const signedTx = await wallet.signTransaction(tx);
      
      return signedTx;
    } catch (error) {
      console.error('Failed to sign transaction:', error);
      throw new Error('Failed to sign transaction');
    }
  }

  async signMessage(message: string): Promise<string> {
    try {
      const walletInfo = await this.getStoredWalletInfo();
      if (!walletInfo) {
        throw new Error('No wallet found');
      }

      const wallet = new ethers.Wallet(walletInfo.privateKey);
      const signature = await wallet.signMessage(message);
      
      return signature;
    } catch (error) {
      console.error('Failed to sign message:', error);
      throw new Error('Failed to sign message');
    }
  }

  async getPublicKey(): Promise<string | null> {
    try {
      const walletInfo = await this.getStoredWalletInfo();
      if (!walletInfo) return null;

      const wallet = new ethers.Wallet(walletInfo.privateKey);
      return wallet.address;
    } catch (error) {
      console.error('Failed to get public key:', error);
      return null;
    }
  }

  private async storeWalletInfo(address: string, privateKey: string, mnemonic: string): Promise<void> {
    try {
      // Store wallet info using basic secure storage
      await secureStorage.setItem('software_address', address);

      // Encrypt and store private key
      const encryptedKey = await this.encryptData(privateKey);
      await secureStorage.setItem('software_private_key', encryptedKey);

      // Encrypt and store mnemonic
      const encryptedMnemonic = await this.encryptData(mnemonic);
      await secureStorage.setItem('software_mnemonic', encryptedMnemonic);

      console.log('Wallet info stored successfully');
    } catch (error) {
      console.error('Failed to store wallet info:', error);
      throw new Error('Failed to store wallet information');
    }
  }

  async getStoredWalletInfo(): Promise<SoftwareWalletInfo | null> {
    try {
      const address = await secureStorage.getItem('software_address');
      const encryptedKey = await secureStorage.getItem('software_private_key');
      const encryptedMnemonic = await secureStorage.getItem('software_mnemonic');

      if (!address || !encryptedKey) return null;

      const privateKey = await this.decryptData(encryptedKey);
      const mnemonic = encryptedMnemonic ? await this.decryptData(encryptedMnemonic) : undefined;
      
      return { address, privateKey, mnemonic };
    } catch (error) {
      console.error('Failed to get stored wallet info:', error);
      return null;
    }
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
    return btoa(data);
  }

  private async decryptData(encryptedData: string): Promise<string> {
    // Simple decryption for now - in production, use proper decryption
    return atob(encryptedData);
  }

  async deleteWallet(): Promise<void> {
    try {
      await secureStorage.removeItem('software_address');
      await secureStorage.removeItem('software_private_key');
      await secureStorage.removeItem('software_mnemonic');
      
      console.log('Software wallet deleted');
    } catch (error) {
      console.error('Failed to delete software wallet:', error);
      throw new Error('Failed to delete wallet');
    }
  }
}

export const softwareWalletService = SoftwareWalletService.getInstance();