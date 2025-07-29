import { NativeModules } from 'react-native';

interface SecureWalletInterface {
  isSecureEnclaveAvailable(): Promise<boolean>;
  generateSecureWallet(config: {
    requireBiometric?: boolean;
    label?: string;
  }): Promise<{
    publicKey: string;
    address: string;
  }>;
  signTransaction(txData: {
    to: string;
    value: string;
    nonce: number;
    gasLimit: string;
    gasPrice: string;
    data?: string;
  }): Promise<string>;
}

const { SecureWallet } = NativeModules;

if (!SecureWallet) {
  throw new Error(
    'SecureWallet native module not found. Make sure you have run pod install and rebuilt your app.'
  );
}

export default SecureWallet as SecureWalletInterface;