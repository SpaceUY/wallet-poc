import { NativeModules } from 'react-native';

interface SecureWalletInterface {
  isSecureEnclaveAvailable(): Promise<boolean>;
  checkForExistingWallet(): Promise<{
    publicKey: string;
    address: string;
  } | null>;
  generateSecureWallet(config: {
    requireBiometric?: boolean;
    label?: string;
  }): Promise<{
    publicKey: string;
    address: string;
  }>;
  signTransactionHash(transactionHash: string): Promise<{
    r: string;
    s: string;
    v: number;
    publicKey: string;
  }>;
  signTransaction(txData: {
    to: string;
    value: string;
    nonce: number;
    gasLimit: string;
    gasPrice: string;
    data?: string;
  }): Promise<{
    r: string;
    s: string;
    v: number;
    publicKey: string;
  }>;
  deleteWallet(): Promise<boolean>;
}

const { SecureWallet } = NativeModules;

console.log('NativeModules:', Object.keys(NativeModules));
console.log('SecureWallet module:', SecureWallet);

// Create a fallback implementation if the native module is not available
const createFallbackSecureWallet = (): SecureWalletInterface => {
  console.warn('SecureWallet native module not found, using fallback implementation');
  
  return {
    isSecureEnclaveAvailable: async () => false,
    checkForExistingWallet: async () => null,
    generateSecureWallet: async () => {
      throw new Error('SecureWallet native module not available');
    },
    signTransactionHash: async () => {
      throw new Error('SecureWallet native module not available');
    },
    signTransaction: async () => {
      throw new Error('SecureWallet native module not available');
    },
    deleteWallet: async () => false,
  };
};

export default (SecureWallet || createFallbackSecureWallet()) as SecureWalletInterface;