import React, { useEffect, useState } from 'react';
import {
    Alert,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import { createTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/useColorScheme';
import { appSecurityService } from '@/services/AppSecurityService';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

interface AppLockScreenProps {
  onUnlock: () => void;
}

const { width } = Dimensions.get('window');

export default function AppLockScreen({ onUnlock }: AppLockScreenProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = createTheme(colorScheme ?? 'light');

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [securityStatus, setSecurityStatus] = useState<any>(null);
  const [showPIN, setShowPIN] = useState(false);

  useEffect(() => {
    loadSecurityStatus();
  }, []);

  const loadSecurityStatus = async () => {
    try {
      const status = await appSecurityService.getSecurityStatus();
      setSecurityStatus(status);
    } catch (error) {
      console.error('Error loading security status:', error);
    }
  };

  const handleBiometricUnlock = async () => {
    if (!securityStatus?.biometricAvailable) {
      Alert.alert('Biometric Not Available', 'Face ID/Touch ID is not available on this device.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const success = await appSecurityService.unlockWithBiometric();
      if (success) {
        onUnlock();
      } else {
        setError('Biometric authentication failed');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePINUnlock = async () => {
    if (!pin || pin.length < 4) {
      setError('Please enter a valid PIN');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const success = await appSecurityService.unlockWithPIN(pin);
      if (success) {
        onUnlock();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Authentication failed');
      setPin('');
    } finally {
      setIsLoading(false);
    }
  };

  const addPinDigit = (digit: string) => {
    if (pin.length < 8) {
      const newPin = pin + digit;
      setPin(newPin);
      setError('');

      // Auto-submit when PIN is complete
      if (newPin.length >= 4) {
        setTimeout(() => {
          handlePINUnlock();
        }, 100);
      }
    }
  };

  const removePinDigit = () => {
    setPin(pin.slice(0, -1));
    setError('');
  };

  const formatLockoutTime = (milliseconds: number) => {
    const minutes = Math.ceil(milliseconds / 1000 / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  };

  if (!securityStatus) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={[styles.loadingText, { color: theme.colors.text }]}>Loading...</Text>
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ThemedView style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Ionicons 
            name="lock-closed" 
            size={48} 
            color={theme.colors.primary} 
          />
          <ThemedText style={styles.title}>App Locked</ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
            Authenticate to continue
          </ThemedText>
        </View>

        {/* Lockout Warning */}
        {securityStatus.lockoutRemaining > 0 && (
          <View style={[styles.lockoutContainer, { backgroundColor: theme.colors.errorBackground }]}>
            <Ionicons name="time-outline" size={24} color={theme.colors.error} />
            <ThemedText style={[styles.lockoutText, { color: theme.colors.error }]}>
              Account locked. Try again in {formatLockoutTime(securityStatus.lockoutRemaining)}
            </ThemedText>
          </View>
        )}

        {/* Error Message */}
        {error && (
          <View style={[styles.errorContainer, { backgroundColor: theme.colors.errorBackground }]}>
            <Ionicons name="alert-circle-outline" size={20} color={theme.colors.error} />
            <ThemedText style={[styles.errorText, { color: theme.colors.error }]}>
              {error}
            </ThemedText>
          </View>
        )}

        {/* PIN Display */}
        <View style={styles.pinContainer}>
          <View style={styles.pinDots}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
              <View
                key={index}
                style={[
                  styles.pinDot,
                  {
                    backgroundColor: index < pin.length ? theme.colors.primary : theme.colors.border,
                    borderColor: theme.colors.border,
                  },
                ]}
              />
            ))}
          </View>
        </View>

        {/* Authentication Options */}
        <View style={styles.authOptions}>
          {/* Biometric Button */}
          {securityStatus.biometricAvailable && securityStatus.useBiometric && (
            <TouchableOpacity
              style={[
                styles.biometricButton,
                {
                  backgroundColor: theme.colors.buttonPrimary,
                  opacity: isLoading ? 0.6 : 1,
                },
              ]}
              onPress={handleBiometricUnlock}
              disabled={isLoading || securityStatus.lockoutRemaining > 0}
            >
              <Ionicons 
                name={Platform.OS === 'ios' ? 'finger-print' : 'finger-print'} 
                size={24} 
                color="white" 
              />
              <ThemedText style={styles.biometricText}>
                {Platform.OS === 'ios' ? 'Face ID / Touch ID' : 'Fingerprint'}
              </ThemedText>
            </TouchableOpacity>
          )}

          {/* PIN Toggle */}
          {securityStatus.pinConfigured && securityStatus.usePIN && (
            <TouchableOpacity
              style={[
                styles.pinToggleButton,
                {
                  backgroundColor: showPIN ? theme.colors.buttonSecondary : theme.colors.buttonPrimary,
                  opacity: isLoading ? 0.6 : 1,
                },
              ]}
              onPress={() => setShowPIN(!showPIN)}
              disabled={isLoading || securityStatus.lockoutRemaining > 0}
            >
              <Ionicons 
                name={showPIN ? 'keypad' : 'keypad'} 
                size={24} 
                color="white" 
              />
              <ThemedText style={styles.pinToggleText}>
                {showPIN ? 'Hide PIN' : 'Enter PIN'}
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>

        {/* PIN Keypad */}
        {showPIN && securityStatus.pinConfigured && securityStatus.usePIN && (
          <View style={styles.keypadContainer}>
            <View style={styles.keypad}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <TouchableOpacity
                  key={digit}
                  style={[
                    styles.keypadButton,
                    {
                      backgroundColor: theme.colors.buttonSecondary,
                      opacity: isLoading || securityStatus.lockoutRemaining > 0 ? 0.6 : 1,
                    },
                  ]}
                  onPress={() => addPinDigit(digit.toString())}
                  disabled={isLoading || securityStatus.lockoutRemaining > 0}
                >
                  <ThemedText style={[styles.keypadText, { color: 'white' }]}>
                    {digit}
                  </ThemedText>
                </TouchableOpacity>
              ))}
              
              <TouchableOpacity
                style={[
                  styles.keypadButton,
                  {
                    backgroundColor: theme.colors.buttonSecondary,
                    opacity: isLoading || securityStatus.lockoutRemaining > 0 ? 0.6 : 1,
                  },
                ]}
                onPress={() => addPinDigit('0')}
                disabled={isLoading || securityStatus.lockoutRemaining > 0}
              >
                <ThemedText style={[styles.keypadText, { color: 'white' }]}>0</ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.keypadButton,
                  {
                    backgroundColor: theme.colors.buttonDanger,
                    opacity: isLoading || securityStatus.lockoutRemaining > 0 ? 0.6 : 1,
                  },
                ]}
                onPress={removePinDigit}
                disabled={isLoading || securityStatus.lockoutRemaining > 0}
              >
                <Ionicons name="backspace-outline" size={24} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Security Info */}
        <View style={styles.securityInfo}>
          <ThemedText style={[styles.securityText, { color: theme.colors.textSecondary }]}>
            Auto-lock: {Math.ceil(securityStatus.autoLockTimeout / 1000 / 60)} minutes
          </ThemedText>
          {securityStatus.attemptsRemaining > 0 && (
            <ThemedText style={[styles.securityText, { color: theme.colors.textSecondary }]}>
              Attempts remaining: {securityStatus.attemptsRemaining}
            </ThemedText>
          )}
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  lockoutContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    width: '100%',
  },
  lockoutText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
  },
  errorText: {
    marginLeft: 8,
    fontSize: 14,
    flex: 1,
  },
  pinContainer: {
    marginBottom: 30,
  },
  pinDots: {
    flexDirection: 'row',
    gap: 12,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  authOptions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 30,
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  biometricText: {
    color: 'white',
    fontWeight: '600',
  },
  pinToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  pinToggleText: {
    color: 'white',
    fontWeight: '600',
  },
  keypadContainer: {
    marginBottom: 30,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    maxWidth: width * 0.8,
  },
  keypadButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  securityInfo: {
    alignItems: 'center',
  },
  securityText: {
    fontSize: 12,
    marginBottom: 4,
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
  },
}); 