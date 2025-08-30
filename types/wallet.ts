export type WalletType = 'hardware' | 'software' | 'external';

export interface WalletInfo {
  address: string;
  type: WalletType;
  balance?: string;
}

export interface SoftwareWalletInfo {
  address: string;
  privateKey: string;
  mnemonic?: string;
}

export interface HardwareSignature {
  r: string;
  s: string;
  v: number;
  publicKey: string;
}

export interface WalletDebugInfo {
  hardwareAvailable: boolean;
  existingWallet: WalletInfo | null;
  signingAddress: string | null;
}

export interface WalletCreationResult {
  address: string;
  type: WalletType;
  mnemonic?: string;
}

export interface TransactionRequest {
  to: string;
  value: bigint;
  data?: string;
  nonce?: number;
  gasLimit?: bigint;
  gasPrice?: bigint;
  chainId?: number;
  type?: number;
}

export interface TransactionSignature {
  r: string;
  s: string;
  v: number;
}

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
