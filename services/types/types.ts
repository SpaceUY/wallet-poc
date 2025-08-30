export interface AppSecurityConfig {
  requireAuthentication: boolean;
  useBiometric: boolean;
  usePIN: boolean;
  autoLockTimeout: number; // in milliseconds
  maxPINAttempts: number;
  lockoutDuration: number; // in milliseconds
}

export interface PINConfig {
  pin: string;
  salt: string;
  iterations: number;
}

export interface SecurityStatus {
  isLocked: boolean;
  useBiometric: boolean;
  usePIN: boolean;
  biometricAvailable: boolean;
  pinConfigured: boolean;
  lockoutRemaining: number;
  attemptsRemaining: number;
  autoLockTimeout: number;
}
