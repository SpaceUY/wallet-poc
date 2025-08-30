import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
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

export default function AppLockScreen({ onUnlock }: AppLockScreenProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = createTheme(colorScheme ?? 'light');

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [securityStatus, setSecurityStatus] = useState<any>(null);
  
  // Use ref to track current PIN value without state update delays
  const currentPinRef = React.useRef('');

  const inputRefs = [
    React.useRef<TextInput>(null),
    React.useRef<TextInput>(null),
    React.useRef<TextInput>(null),
    React.useRef<TextInput>(null),
  ];

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
    const currentPin = currentPinRef.current;
    if (!currentPin || currentPin.length < 4) {
      setError('Please enter a valid PIN');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const success = await appSecurityService.unlockWithPIN(currentPin);
      if (success) {
        onUnlock();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Authentication failed');
      setPin('');
      currentPinRef.current = '';
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinChange = (text: string, index: number) => {
    if (text.length <= 1 && /^\d*$/.test(text)) {
      // Update PIN at the specified index
      let newPin = '';
      for (let i = 0; i < 4; i++) {
        if (i === index) {
          newPin += text;
        } else {
          newPin += currentPinRef.current[i] || '';
        }
      }

      // Update both ref and state
      currentPinRef.current = newPin;
      setPin(newPin);
      setError('');

      // Handle auto-focus and submit
      if (text) {
        if (index < 3) {
          inputRefs[index + 1].current?.focus();
        } else if (index === 3) {
          setTimeout(() => {
            if (currentPinRef.current.length === 4) {
              handlePINUnlock();
            }
          }, 50);
        }
      }
    }
  };

  const handleSubmitPin = () => {
    if (currentPinRef.current.length === 4) {
      handlePINUnlock();
    } else {
      setError('Please enter a 4-digit PIN');
    }
  };

  // TODO: Remove this method DEBUG ONLY
  const handleResetSecurity = async () => {
    try {
      await appSecurityService.resetSecurityState();
      onUnlock();
      Alert.alert('Success', 'Security state has been reset.');
    } catch (error) {
      console.error('Error resetting security:', error);
      Alert.alert('Error', 'Failed to reset security state.');
    }
  };

  const formatLockoutTime = (milliseconds: number) => {
    const minutes = Math.ceil(milliseconds / 1000 / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  };

  if (!securityStatus) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ThemedText style={styles.loadingText}>Loading...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ThemedView style={styles.content}>
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

        {/* PIN Input Fields */}
        <View style={styles.pinContainer}>
          <View style={styles.pinInputRow}>
            {[0, 1, 2, 3].map((index) => (
              <TextInput
                key={index}
                ref={inputRefs[index]}
                style={[
                  styles.pinInput,
                  {
                    backgroundColor: theme.colors.inputBackground,
                    borderColor: pin.length === index ? theme.colors.primary : theme.colors.border,
                  },
                ]}
                value={pin[index] || ''}
                onChangeText={(text) => handlePinChange(text, index)}
                keyboardType="number-pad"
                maxLength={1}
                secureTextEntry
                autoFocus={index === 0}
                clearTextOnFocus
                selectTextOnFocus
                editable={!isLoading && securityStatus.lockoutRemaining === 0}
              />
            ))}
          </View>
          <TouchableOpacity
            style={[
              styles.submitButton,
              {
                backgroundColor: theme.colors.buttonPrimary,
                opacity: isLoading || securityStatus.lockoutRemaining > 0 ? 0.6 : 1,
              },
            ]}
            onPress={handleSubmitPin}
            disabled={isLoading || securityStatus.lockoutRemaining > 0}
          >
            <Ionicons name="enter-outline" size={24} color="white" />
            <ThemedText style={styles.submitButtonText}>Enter</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Authentication Options */}
        <View style={styles.authOptions}>
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
        </View>

        <View style={styles.securityInfo}>
          <ThemedText style={[styles.securityText, { color: theme.colors.textSecondary }]}>
            Auto-lock: {Math.ceil(securityStatus.autoLockTimeout / 1000 / 60)} minutes
          </ThemedText>
          {securityStatus.attemptsRemaining > 0 && (
            <ThemedText style={[styles.securityText, { color: theme.colors.textSecondary }]}>
              Attempts remaining: {securityStatus.attemptsRemaining}
            </ThemedText>
          )}
          
        {/* TODO: Remove this button DEBUG ONLY*/}
          <TouchableOpacity
            style={[styles.resetButton, { backgroundColor: theme.colors.buttonDanger }]}
            onPress={() => {
              Alert.alert(
                'Reset Security',
                'This will reset all security settings. Are you sure?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Reset', style: 'destructive', onPress: handleResetSecurity }
                ]
              );
            }}
          >
            <ThemedText style={styles.resetButtonText}>Reset Security (Debug)</ThemedText>
          </TouchableOpacity>
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
    marginVertical: 30,
    alignItems: 'center',
  },
  pinInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pinInput: {
    width: 50,
    height: 50,
    borderRadius: 8,
    borderWidth: 2,
    fontSize: 24,
    textAlign: 'center',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
    gap: 8,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
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
  resetButton: {
    marginTop: 20,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});