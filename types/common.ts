export interface PINState {
  value: string;
  confirm?: string;
}

export type PINModalType = 'setup' | 'change' | 'remove' | null;
