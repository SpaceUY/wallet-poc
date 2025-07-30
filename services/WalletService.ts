import * as SecureStore from 'expo-secure-store';

import { ENV } from '../config/env';
import SecureWallet from '../utils/nativeSecureWallet';
import { ethers } from 'ethers';
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
    if (useSoftware) {
      // User explicitly requested a software wallet (show warning in UI if needed)
      const { address } = await secureStorage.generateKeyPair('primary', true);
      return { address };
    } else {
      // User requested a hardware wallet, do not fallback to software
      try {
        const { address } = await secureStorage.generateKeyPair('primary', false);
        return { address };
      } catch (error) {
        throw new Error(
          'Hardware wallet creation failed: Device does not meet security requirements (Secure Enclave and biometrics required). ' +
          (error instanceof Error ? error.message : error)
        );
      }
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

      // Fall back to software wallet
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
      // Check if we have a hardware wallet
      const isSecure = await this.isSecureEnvironmentAvailable();
      if (isSecure) {
        try {
          const hardwareWallet = await SecureWallet.checkForExistingWallet();
          if (hardwareWallet) {
            console.log('Using hardware wallet for transaction signing');
            return await this.sendTransactionWithHybridApproach(to, amount);
          }
        } catch (e) {
          // Only catch errors related to hardware wallet availability, not transaction errors
          if (e instanceof Error && (e.message.includes('hardware wallet') || e.message.includes('SecureWallet'))) {
            console.log('Hardware wallet not available:', e);
          } else {
            // Re-throw transaction-related errors
            throw e;
          }
        }
      }

      throw new Error('No hardware wallet found');
    } catch (error) {
      console.error('Error sending transaction:', error);
      // Re-throw the original error instead of wrapping it
      throw error;
    }
  }

  /**
   * Hybrid Approach Implementation:
   * 1. JavaScript side creates unsigned transaction with all fields
   * 2. RLP encodes it and creates Keccak-256 hash
   * 3. Sends only the hash to native module for signing
   * 4. Receives signature and reconstructs signed transaction
   * 5. Broadcasts the transaction
   */
  private async sendTransactionWithHybridApproach(to: string, amount: string): Promise<ethers.TransactionResponse> {
    try {
      // Validate transaction parameters
      this.validateTransactionParameters(to, amount);
      
      // First, we need to get the public key that will be used for signing
      // We'll get this from the native module to ensure we're using the correct key
      const hardwareWallet = await SecureWallet.checkForExistingWallet();
      if (!hardwareWallet) throw new Error('No hardware wallet found');
      
      // For hardware wallets, we need to determine the actual signing address
      // We'll do a test signature to get the real public key first
      const dummyHash = ethers.keccak256('0x1234567890abcdef');
      const testSignature = await SecureWallet.signTransactionHash(dummyHash);
      const actualSigningAddress = this.deriveAddressFromPublicKey(testSignature.publicKey);
      
      if (__DEV__) {
        console.log('Actual signing address determined:', actualSigningAddress);
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

      // Get current nonce for the signing address (get this right before creating transaction)
      const nonce = await this.provider.getTransactionCount(actualSigningAddress);
      if (__DEV__) {
        console.log('Current nonce for address:', actualSigningAddress, 'is:', nonce);
      }

      // Create unsigned transaction object (use legacy format for compatibility)
      const unsignedTx = {
        to: to,
        value: ethers.parseEther(amount),
        nonce: nonce,
        gasLimit: gasLimit,
        gasPrice: gasPrice,
        data: '0x',
        chainId: await this.provider.getNetwork().then(net => net.chainId),
        type: 0 // Legacy transaction type
      };

      if (__DEV__) {
        console.log('Creating unsigned transaction:', unsignedTx);
      }
      
      // Step 1: Create the transaction hash that needs to be signed
      const transactionHash = ethers.keccak256(ethers.Transaction.from(unsignedTx).unsignedSerialized);
      if (__DEV__) {
        console.log('Transaction hash (Keccak-256):', transactionHash);
      }
      
      // Step 2: Send only the hash to native module for signing
      if (__DEV__) {
        console.log('Sending transaction hash to Secure Enclave for signing...');
      }
      const signature = await SecureWallet.signTransactionHash(transactionHash);
      if (__DEV__) {
        console.log('Received signature from Secure Enclave:', signature);
      }
      
      // Step 3: The signature is already in the correct format (object with r, s, v)
      if (__DEV__) {
        console.log('Using signature components:', signature);
      }
      
      // Step 4: Use the v value from the native module (it's already calculated correctly)
      const validSignature = {
        r: signature.r.startsWith('0x') ? signature.r : '0x' + signature.r,
        s: signature.s.startsWith('0x') ? signature.s : '0x' + signature.s,
        v: signature.v
      };
      
      // Step 5: Verify the signature using the public key from the native module
      let recoveredAddress: string | null = null;
      let correctV: number | null = null;
      
      try {
        // Get the public key that was used for signing
        const signingPublicKey = signature.publicKey;
        console.log('Public key used for signing:', signingPublicKey);
        
        // Derive the address from this public key
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
              console.log(`✅ Found correct recovery ID: v=${v}`);
              recoveredAddress = testRecoveredAddress;
              correctV = v;
              break;
            }
          } catch (error) {
            console.log(`v=${v} failed:`, error instanceof Error ? error.message : 'Unknown error');
          }
        }
        
        if (!recoveredAddress) {
          throw new Error('Could not find valid recovery ID for signature');
        }
        
        console.log('✅ Signature verification successful!');
        console.log('Correct recovery ID:', correctV);
        console.log('Recovered address:', recoveredAddress);
        console.log('Signing address:', signatureAddress);
        
        // Update the signature with the correct v value
        validSignature.v = correctV!;
      } catch (error) {
        console.error('Signature verification failed:', error);
        throw new Error('Invalid signature from Secure Enclave');
      }
      
      if (!validSignature || !recoveredAddress) {
        throw new Error('Could not find valid signature recovery');
      }
      
      // Step 6: Reconstruct the signed transaction using ethers.js
      // Create a transaction object with the signature
      const signedTx = {
        ...unsignedTx,
        signature: validSignature
      };
      
      // Use ethers.js to create the signed transaction
      const transaction = ethers.Transaction.from(signedTx);
      
      console.log('Reconstructed signed transaction:', transaction.serialized);
      console.log('Transaction from address:', transaction.from);
      console.log('Transaction to address:', transaction.to);
      console.log('Transaction value:', ethers.formatEther(transaction.value));
      console.log('Transaction nonce:', transaction.nonce);
      console.log('Transaction gas price:', ethers.formatUnits(transaction.gasPrice!, 'wei'));
      console.log('Transaction gas limit:', transaction.gasLimit.toString());
      
      // Verify the transaction is from the correct address using the signing public key
      // Since the signature proves which key was used, we should trust the recovered address
      const signatureAddress = this.deriveAddressFromPublicKey(signature.publicKey);
      console.log('Signing address from public key:', signatureAddress);
      console.log('Recovered address from signature:', recoveredAddress);
      console.log('Transaction from address:', transaction.from);
      
      // All three addresses should match
      if (transaction.from?.toLowerCase() !== signatureAddress.toLowerCase() || 
          recoveredAddress.toLowerCase() !== signatureAddress.toLowerCase()) {
        throw new Error(`Address mismatch: signing=${signatureAddress}, recovered=${recoveredAddress}, transaction=${transaction.from}`);
      }
      
      // Step 7: Broadcast the transaction with retry logic for nonce issues
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
          
          // Get fresh nonce and retry
          const freshNonce = await this.provider.getTransactionCount(actualSigningAddress);
          if (__DEV__) {
            console.log('Fresh nonce for retry:', freshNonce);
          }
          const retryTx = {
            ...unsignedTx,
            nonce: freshNonce
          };
          
          const retryHash = ethers.keccak256(ethers.Transaction.from(retryTx).unsignedSerialized);
          const retrySignature = await SecureWallet.signTransactionHash(retryHash);
          
          // Reconstruct with fresh nonce
          const retryValidSignature = {
            r: retrySignature.r.startsWith('0x') ? retrySignature.r : '0x' + retrySignature.r,
            s: retrySignature.s.startsWith('0x') ? retrySignature.s : '0x' + retrySignature.s,
            v: retrySignature.v
          };
          
          const retrySignedTx = {
            ...retryTx,
            signature: retryValidSignature
          };
          
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
      console.error('Error with hybrid transaction signing:', error);
      throw new Error('Failed to send transaction with hybrid approach');
    }
  }



  /**
   * Parse DER format signature and extract r, s, v components
   * DER format: 0x30 + length + 0x02 + r_length + r + 0x02 + s_length + s
   */
  private parseDERSignature(signatureHex: string): { r: string; s: string; v: number } {
    // Remove '0x' prefix if present
    const cleanSignature = signatureHex.startsWith('0x') ? signatureHex.slice(2) : signatureHex;
    
    // Convert hex to bytes
    const signatureBytes = new Uint8Array(cleanSignature.length / 2);
    for (let i = 0; i < cleanSignature.length; i += 2) {
      signatureBytes[i / 2] = parseInt(cleanSignature.substr(i, 2), 16);
    }
    
    let offset = 0;
    
    // Check for 0x30 marker
    if (signatureBytes[offset] !== 0x30) {
      throw new Error('Invalid DER signature: missing 0x30 marker');
    }
    offset++;
    
    // Get total length
    const totalLength = signatureBytes[offset];
    offset++;
    
    // Skip to r component
    if (signatureBytes[offset] !== 0x02) {
      throw new Error('Invalid DER signature: missing 0x02 marker for r');
    }
    offset++;
    
    const rLength = signatureBytes[offset];
    offset++;
    const rBytes = signatureBytes.slice(offset, offset + rLength);
    offset += rLength;
    
    // Skip to s component
    if (signatureBytes[offset] !== 0x02) {
      throw new Error('Invalid DER signature: missing 0x02 marker for s');
    }
    offset++;
    
    const sLength = signatureBytes[offset];
    offset++;
    const sBytes = signatureBytes.slice(offset, offset + sLength);
    
    // Handle r and s components (remove leading zeros and pad to 32 bytes)
    const rClean = rBytes[0] === 0 ? rBytes.slice(1) : rBytes;
    const sClean = sBytes[0] === 0 ? sBytes.slice(1) : sBytes;
    
    // Pad to 32 bytes
    const rPadded = new Uint8Array(32);
    const sPadded = new Uint8Array(32);
    rPadded.set(rClean, 32 - rClean.length);
    sPadded.set(sClean, 32 - sClean.length);
    
    // Convert to hex strings
    const r = '0x' + Array.from(rPadded).map(b => b.toString(16).padStart(2, '0')).join('');
    const s = '0x' + Array.from(sPadded).map(b => b.toString(16).padStart(2, '0')).join('');
    
    // For EIP-1559 transactions, we need to determine the correct v value
    // Try both recovery bytes and let ethers.js handle the recovery
    const v = 27; // This will be adjusted by ethers.js if needed
    
    return { r, s, v };
  }

  private async sendTransactionWithHardwareWallet(to: string, amount: string): Promise<ethers.TransactionResponse> {
    try {
      // Get current nonce
      const address = await this.getWalletAddress();
      if (!address) throw new Error('No wallet address found');
      
      const nonce = await this.provider.getTransactionCount(address);
      
      // Get gas price
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice!;
      
      // Estimate gas
      const gasLimit = await this.provider.estimateGas({
        from: address,
        to: to,
        value: ethers.parseEther(amount)
      });

      // Create transaction data for signing
      const txData = {
        to: to,
        value: ethers.parseEther(amount).toString(),
        nonce: nonce,
        gasLimit: gasLimit.toString(),
        gasPrice: gasPrice.toString(),
        data: '0x'
      };

      console.log('Signing transaction with hardware wallet:', txData);
      
      // Sign with hardware wallet
      const signature = await SecureWallet.signTransaction(txData);
      console.log('Got signature from hardware wallet:', signature);
      
      // Parse the signature components
      // The signature is in DER format, we need to extract r and s
      const signatureBytes = ethers.getBytes('0x' + signature);
      
      console.log('Signature bytes length:', signatureBytes.length);
      console.log('Signature bytes:', Array.from(signatureBytes).map(b => b.toString(16).padStart(2, '0')).join(''));
      
      // Parse DER format: 0x30 + length + 0x02 + r_length + r + 0x02 + s_length + s
      let offset = 0;
      
      // Check for 0x30 marker
      if (signatureBytes[offset] !== 0x30) {
        throw new Error('Invalid DER signature: missing 0x30 marker');
      }
      offset++;
      
      // Get total length
      const totalLength = signatureBytes[offset];
      offset++;
      
      // Skip to r component
      if (signatureBytes[offset] !== 0x02) {
        throw new Error('Invalid DER signature: missing 0x02 marker for r');
      }
      offset++;
      
      const rLength = signatureBytes[offset];
      offset++;
      const r = signatureBytes.slice(offset, offset + rLength);
      offset += rLength;
      
      // Skip to s component
      if (signatureBytes[offset] !== 0x02) {
        throw new Error('Invalid DER signature: missing 0x02 marker for s');
      }
      offset++;
      
      const sLength = signatureBytes[offset];
      offset++;
      const s = signatureBytes.slice(offset, offset + sLength);
      
      console.log('Parsed r length:', rLength, 's length:', sLength);
      console.log('r:', ethers.hexlify(r));
      console.log('s:', ethers.hexlify(s));
      
      // Handle r and s components (they might have leading zeros)
      // Remove leading zero if present and ensure 32 bytes
      const rClean = r[0] === 0 ? r.slice(1) : r;
      const sClean = s[0] === 0 ? s.slice(1) : s;
      
      console.log('Cleaned r length:', rClean.length, 's length:', sClean.length);
      console.log('Cleaned r:', ethers.hexlify(rClean));
      console.log('Cleaned s:', ethers.hexlify(sClean));
      
      // Pad to 32 bytes if needed
      const rPadded = new Uint8Array(32);
      const sPadded = new Uint8Array(32);
      rPadded.set(rClean, 32 - rClean.length);
      sPadded.set(sClean, 32 - sClean.length);
      
            // Skip transaction creation and go straight to signature verification
      console.log('Skipping transaction creation - going straight to signature verification');
      
      // Try both recovery bytes for signature verification
      let v = 27;
      let signatureValid = false;
      
      for (let recoveryByte = 27; recoveryByte <= 28; recoveryByte++) {
        try {
          console.log(`Testing signature with v=${recoveryByte}...`);
          
          // Recreate the same data that was signed in the native module
          const txString = `${to}${ethers.parseEther(amount).toString()}${nonce}${gasLimit.toString()}${gasPrice.toString()}0x`;
          
          // Create SHA256 hash (same as native module)
          const txDataBytes = new TextEncoder().encode(txString);
          const hashBuffer = await crypto.subtle.digest('SHA-256', txDataBytes);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          
          // Verify the signature using ethers.js
          const recoveredAddress = ethers.recoverAddress(hashHex, {
            r: ethers.hexlify(rPadded),
            s: ethers.hexlify(sPadded),
            v: recoveryByte
          });
          
          console.log(`Recovered address with v=${recoveryByte}:`, recoveredAddress);
          console.log('Expected address:', address);
          
          if (recoveredAddress.toLowerCase() === address.toLowerCase()) {
            console.log(`✅ Signature verification successful with v=${recoveryByte}!`);
            v = recoveryByte;
            signatureValid = true;
            break;
          }
        } catch (error) {
          console.log(`v=${recoveryByte} failed:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }
      
      if (!signatureValid) {
        throw new Error('Signature verification failed for both recovery bytes');
      }
      
      console.log('✅ Hardware wallet signing is working correctly!');
      console.log('Note: Full transaction broadcasting requires proper RLP encoding implementation.');
      
      // For testing purposes, let's create a mock transaction response
      const mockTx = {
        hash: '0x' + '0'.repeat(64), // Placeholder hash
        wait: async () => ({ hash: '0x' + '0'.repeat(64) })
      };
      
      console.log('Mock transaction created for testing');
      return mockTx as ethers.TransactionResponse;
      
    } catch (error) {
      console.error('Error with hardware wallet transaction:', error);
      throw new Error('Failed to send transaction with hardware wallet');
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



  async estimateGas(to: string, amount: string): Promise<string> {
    try {
      // Get wallet address (works for both hardware and software wallets)
      const address = await this.getWalletAddress();
      if (!address) throw new Error('No wallet found');

      const tx = {
        to: to,
        value: ethers.parseEther(amount)
      };

      const gasEstimate = await this.provider.estimateGas({
        ...tx,
        from: address
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
      // Delete software wallet if it exists
      try {
        await secureStorage.removeWallet('primary');
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

  /**
   * Check for existing wallet - NOTE: For hardware wallets, this may return an incorrect address
   * due to key mismatch issues. Use getActualSigningAddress() for hardware wallets instead.
   */
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
            
            // For hardware wallets, we need to get the actual signing address
            // Since the stored public key might not match the signing key, we'll use a placeholder
            // and let the transaction signing reveal the actual address
            const derivedAddress = this.deriveAddressFromPublicKey(wallet.publicKey);
            console.log('Derived address from public key:', derivedAddress);
            
            // Note: This might not be the actual signing address due to key mismatch
            // The actual address will be revealed during transaction signing
            return { address: derivedAddress };
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

  /**
   * Get the actual signing address for hardware wallets
   * This method attempts to get the real address by doing a test signature
   */
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
      const dummyHash = ethers.keccak256('0x1234567890abcdef');
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

  /**
   * Debug method to help troubleshoot wallet creation issues
   */
  async debugWalletCreation(): Promise<{
    secureEnclaveAvailable: boolean;
    secureStorageAvailable: boolean;
    existingWallet: { address: string } | null;
    testWalletCreation?: { success: boolean; error?: string };
  }> {
    try {
      console.log('🔍 Starting wallet creation debug...');
      
      // Check Secure Enclave availability
      let secureEnclaveAvailable = false;
      try {
        secureEnclaveAvailable = await SecureWallet.isSecureEnclaveAvailable();
        console.log('Secure Enclave available:', secureEnclaveAvailable);
      } catch (error) {
        console.error('Error checking Secure Enclave:', error);
      }
      
      // Check secure storage availability
      let secureStorageAvailable = false;
      try {
        secureStorageAvailable = await SecureStore.isAvailableAsync();
        console.log('Secure storage available:', secureStorageAvailable);
      } catch (error) {
        console.error('Error checking secure storage:', error);
      }
      
      // Check for existing wallet
      const existingWallet = await this.checkExistingWallet();
      console.log('Existing wallet found:', existingWallet);
      
      // Test wallet creation (but don't actually create one)
      let testWalletCreation = { success: false, error: 'Not tested' };
      try {
        // Just test the key generation process without storing anything
        await secureStorage.generateKeyPair('debug_test', true);
        testWalletCreation = { success: true, error: '' };
      } catch (error) {
        testWalletCreation = { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        };
      }
      
      const debugInfo = {
        secureEnclaveAvailable,
        secureStorageAvailable,
        existingWallet,
        testWalletCreation
      };
      
      console.log('🔍 Debug info:', debugInfo);
      return debugInfo;
      
    } catch (error) {
      console.error('Error during debug:', error);
      throw error;
    }
  }



  private validateTransactionParameters(to: string, amount: string): void {
    // Validate recipient address
    if (!to || !ethers.isAddress(to)) {
      throw new Error('Invalid recipient address');
    }
    
    // Validate amount
    const amountWei = ethers.parseEther(amount);
    if (amountWei <= 0n) {
      throw new Error('Amount must be greater than 0');
    }
    
    // Check for reasonable amount (prevent accidental large transfers)
    const maxAmount = ethers.parseEther('1000'); // 1000 ETH max
    if (amountWei > maxAmount) {
      throw new Error('Amount exceeds maximum allowed (1000 ETH)');
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