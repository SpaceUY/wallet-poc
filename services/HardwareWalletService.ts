import { JsonRpcProvider, ethers, keccak256 } from 'ethers';

import { HardwareSignature, TransactionRequest, TransactionSignature } from '@/types/wallet';
import { ENV } from '../config/env';
import SecureWallet from '../utils/nativeSecureWallet';
import { secureStorage } from '../utils/secureStorage';

export class HardwareWalletService {
  private static instance: HardwareWalletService;
  private provider: JsonRpcProvider;
  
  private constructor() {
    this.provider = new JsonRpcProvider(
      `https://${ENV.NETWORK}.infura.io/v3/${ENV.INFURA_PROJECT_ID}`
    );
  }

  static getInstance(): HardwareWalletService {
    if (!HardwareWalletService.instance) {
      HardwareWalletService.instance = new HardwareWalletService();
    }
    return HardwareWalletService.instance;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const { isSecure } = await secureStorage.verifyDeviceSecurity();
      return isSecure;
    } catch (error) {
      console.error('Hardware wallet availability check failed:', error);
      return false;
    }
  }

  async createWallet(): Promise<{ address: string; type: 'hardware' }> {
    try {
      const isAvailable = await this.isAvailable();
      if (!isAvailable) {
        throw new Error(
          'Hardware wallet creation failed: Device does not meet security requirements (Secure Enclave and biometrics required)'
        );
      }

      const { address } = await secureStorage.generateKeyPair('primary', false);
      console.log('Hardware wallet created successfully:', address);
      
      return { address, type: 'hardware' as const };
    } catch (error) {
      console.error('Failed to create hardware wallet:', error);
      throw new Error(
        'Hardware wallet creation failed: ' + (error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getWallet(): Promise<{ address: string; type: 'hardware' } | null> {
    try {
      const isAvailable = await this.isAvailable();
      if (!isAvailable) {
        console.log('Hardware wallet not available - device security requirements not met');
        return null;
      }

      const wallet = await SecureWallet.checkForExistingWallet();
      if (!wallet) {
        console.log('No hardware wallet found');
        return null;
      }

      console.log('Found existing hardware wallet with public key:', wallet.publicKey);
      
      // Get the actual signing address (may differ from stored public key)
      const actualAddress = await this.getActualSigningAddress();
      if (!actualAddress) {
        console.log('Could not determine actual signing address');
        return null;
      }

      return { address: actualAddress, type: 'hardware' as const };
    } catch (error) {
      console.error('Error getting hardware wallet:', error);
      return null;
    }
  }

  async getActualSigningAddress(): Promise<string | null> {
    try {
      const isAvailable = await this.isAvailable();
      if (!isAvailable) return null;

      // Create a dummy transaction hash to get the actual signing key
      const dummyHash = keccak256('0x1234567890abcdef');
      console.log('Getting actual signing address via test signature...');
      
      const signature = await SecureWallet.signTransactionHash(dummyHash);
      const actualAddress = this.deriveAddressFromPublicKey(signature.publicKey);
      
      console.log('Actual signing address determined:', actualAddress);
      return actualAddress;
    } catch (error) {
      console.error('Error getting actual signing address:', error);
      return null;
    }
  }

  async signTransaction(to: string, amount: string): Promise<ethers.TransactionResponse> {
    try {
      const isAvailable = await this.isAvailable();
      if (!isAvailable) {
        throw new Error('Hardware wallet not available');
      }

      console.log('Using hardware wallet for transaction signing');
      return await this.sendTransactionWithHybridApproach(to, amount);
    } catch (error) {
      console.error('Error signing transaction with hardware wallet:', error);
      throw error;
    }
  }

  async signMessage(message: string): Promise<string> {
    try {
      const isAvailable = await this.isAvailable();
      if (!isAvailable) {
        throw new Error('Hardware wallet not available');
      }

      // Create message hash
      const messageHash = ethers.hashMessage(message);
      
      // Sign with hardware wallet
      const signature = await SecureWallet.signTransactionHash(messageHash);
      
      // Convert to hex signature format
      const hexSignature = signature.r + signature.s.slice(2) + signature.v.toString(16);
      
      return '0x' + hexSignature;
    } catch (error) {
      console.error('Error signing message with hardware wallet:', error);
      throw new Error('Failed to sign message with hardware wallet');
    }
  }

  async deleteWallet(): Promise<void> {
    try {
      const result = await SecureWallet.deleteWallet();
      console.log('Hardware wallet deletion result:', result);
    } catch (error) {
      console.error('Error deleting hardware wallet:', error);
      throw new Error('Failed to delete hardware wallet');
    }
  }

  // Private methods for hardware-specific operations
  private async sendTransactionWithHybridApproach(to: string, amount: string): Promise<ethers.TransactionResponse> {
    try {
      // Validate transaction parameters
      this.validateTransactionParameters(to, amount);
      
      // Get the actual signing address
      const actualSigningAddress = await this.getActualSigningAddress();
      if (!actualSigningAddress) {
        throw new Error('Could not determine signing address');
      }
      
      // Get gas price and estimate gas first
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice!;
      
      // Estimate gas
      const gasLimit = await this.provider.estimateGas({
        from: actualSigningAddress,
        to: to,
        value: ethers.parseEther(amount)
      });

      // Get current nonce for the signing address
      const nonce = await this.provider.getTransactionCount(actualSigningAddress);
      if (__DEV__) {
        console.log('Current nonce for address:', actualSigningAddress, 'is:', nonce);
      }

      // Create unsigned transaction object (use legacy format for compatibility)
      const unsignedTx: TransactionRequest = {
        to: to,
        value: ethers.parseEther(amount),
        nonce: nonce,
        gasLimit: gasLimit,
        gasPrice: gasPrice,
        data: '0x',
        chainId: Number(await this.provider.getNetwork().then(net => net.chainId)),
        type: 0 // Legacy transaction type
      };

      if (__DEV__) {
        console.log('Creating unsigned transaction:', unsignedTx);
      }
      
      // Create the transaction hash that needs to be signed
      const transactionHash = ethers.keccak256(ethers.Transaction.from(unsignedTx).unsignedSerialized);
      if (__DEV__) {
        console.log('Transaction hash (Keccak-256):', transactionHash);
      }
      
      // Send hash to Secure Enclave for signing
      if (__DEV__) {
        console.log('Sending transaction hash to Secure Enclave for signing...');
      }
      const signature: HardwareSignature = await SecureWallet.signTransactionHash(transactionHash);
      if (__DEV__) {
        console.log('Received signature from Secure Enclave:', signature);
      }
      
      // Verify and reconstruct signature
      const validSignature: TransactionSignature = {
        r: signature.r.startsWith('0x') ? signature.r : '0x' + signature.r,
        s: signature.s.startsWith('0x') ? signature.s : '0x' + signature.s,
        v: signature.v
      };
      
      // Verify the signature recovery
      let recoveredAddress: string | null = null;
      let correctV: number | null = null;
      
      try {
        const signingPublicKey = signature.publicKey;
        console.log('Public key used for signing:', signingPublicKey);
        
        const signatureAddress = this.deriveAddressFromPublicKey(signingPublicKey);
        console.log('Address from signing public key:', signatureAddress);
        
        // Try both recovery IDs (v=27 and v=28) to find the correct one
        for (let v = 27; v <= 28; v++) {
          try {
            const testSignature = {
              r: validSignature.r,
              s: validSignature.s,
              v: v
            };
            
            const testRecoveredAddress = ethers.recoverAddress(transactionHash, testSignature);
            console.log(`Testing v=${v}, recovered address:`, testRecoveredAddress);
            
            if (testRecoveredAddress.toLowerCase() === signatureAddress.toLowerCase()) {
              console.log(`Found correct recovery ID: v=${v}`);
              recoveredAddress = testRecoveredAddress;
              correctV = v;
              break;
            }
          } catch (error) {
            console.log(`v=${v} failed:`, error instanceof Error ? error.message : 'Unknown error');
          }
        }
        
        if (!recoveredAddress || !correctV) {
          throw new Error('Could not find valid recovery ID for signature');
        }
        
        console.log('Signature verification successful!');
        validSignature.v = correctV;
      } catch (error) {
        console.error('Signature verification failed:', error);
        throw new Error('Invalid signature from Secure Enclave');
      }
      
      // Reconstruct the signed transaction
      const signedTx = {
        ...unsignedTx,
        signature: validSignature
      };
      
      const transaction = ethers.Transaction.from(signedTx);
      
      console.log('Reconstructed signed transaction:', transaction.serialized);
      console.log('Transaction from address:', transaction.from);
      
      // Broadcast the transaction with retry logic for nonce issues
      let txResponse: ethers.TransactionResponse;
      try {
        txResponse = await this.provider.broadcastTransaction(transaction.serialized);
        if (__DEV__) {
          console.log('Transaction broadcasted:', txResponse.hash);
        }
      } catch (error) {
        // If it's a nonce error, try once more with a fresh nonce
        if (error instanceof Error && error.message.includes('nonce')) {
          if (__DEV__) {
            console.log('Nonce error detected, retrying with fresh nonce...');
          }
          
          const freshNonce = await this.provider.getTransactionCount(actualSigningAddress);
          const retryTx = { ...unsignedTx, nonce: freshNonce };
          
          const retryHash = ethers.keccak256(ethers.Transaction.from(retryTx).unsignedSerialized);
          const retrySignature = await SecureWallet.signTransactionHash(retryHash);
          
          const retryValidSignature = {
            r: retrySignature.r.startsWith('0x') ? retrySignature.r : '0x' + retrySignature.r,
            s: retrySignature.s.startsWith('0x') ? retrySignature.s : '0x' + retrySignature.s,
            v: retrySignature.v
          };
          
          const retrySignedTx = { ...retryTx, signature: retryValidSignature };
          const retryTransaction = ethers.Transaction.from(retrySignedTx);
          txResponse = await this.provider.broadcastTransaction(retryTransaction.serialized);
          
          if (__DEV__) {
            console.log('Retry transaction broadcasted:', txResponse.hash);
          }
        } else {
          throw error;
        }
      }
      
      return txResponse;
      
    } catch (error) {
      console.error('Error with hardware wallet transaction signing:', error);
      throw new Error('Failed to send transaction with hardware wallet');
    }
  }

  private validateTransactionParameters(to: string, amount: string): void {
    if (!to || !ethers.isAddress(to)) {
      throw new Error('Invalid recipient address');
    }
    
    const amountWei = ethers.parseEther(amount);
    if (amountWei <= 0n) {
      throw new Error('Amount must be greater than 0');
    }
    
    const maxAmount = ethers.parseEther('1000'); // 1000 ETH max
    if (amountWei > maxAmount) {
      throw new Error('Amount exceeds maximum allowed (1000 ETH)');
    }
  }

  private deriveAddressFromPublicKey(publicKey: string): string {
    const keyWithoutPrefix = publicKey.startsWith('04') ? publicKey.slice(2) : publicKey;
    const hash = keccak256('0x' + keyWithoutPrefix);
    const address = '0x' + hash.slice(-40);
    return ethers.getAddress(address);
  }
}

export const hardwareWalletService = HardwareWalletService.getInstance();