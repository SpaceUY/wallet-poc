import { AppSecurityConfig, appSecurityService } from '@/services/AppSecurityService';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SecuritySettingsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = createTheme(colorScheme ?? 'light');

  const [securityStatus, setSecurityStatus] = useState<any>(null);
  const [config, setConfig] = useState<AppSecurityConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPINSetup, setShowPINSetup] = useState(false);
  const [showPINChange, setShowPINChange] = useState(false);
  const [currentPIN, setCurrentPIN] = useState('');
  const [newPIN, setNewPIN] = useState('');
  const [confirmPIN, setConfirmPIN] = useState('');

  useEffect(() => {
    loadSecurityData();
  }, []);

  const loadSecurityData = async () => {
    try {
      const status = await appSecurityService.getSecurityStatus();
      setSecurityStatus(status);
      
      // Get current config
      const currentConfig = await appSecurityService.getSecurityStatus();
      setConfig({
        requireAuthentication: currentConfig.useBiometric || currentConfig.usePIN,
        useBiometric: currentConfig.useBiometric,
        usePIN: currentConfig.usePIN,
        autoLockTimeout: currentConfig.autoLockTimeout,
        maxPINAttempts: 5,
        lockoutDuration: 15 * 60 * 1000, // 15 minutes
      });
    } catch (error) {
      console.error('Error loading security data:', error);
    }
  };

  const handleToggleBiometric = async (enabled: boolean) => {
    try {
      if (!securityStatus?.biometricAvailable && enabled) {
        Alert.alert('Biometric Not Available', 'Face ID/Touch ID is not available on this device.');
        return;
      }

      if (enabled) {
        // Test biometric authentication when enabling
        const success = await appSecurityService.unlockWithBiometric();
        if (!success) {
          Alert.alert('Biometric Test Failed', 'Please try again or check your Face ID/Touch ID settings.');
          return;
        }
      }

      await appSecurityService.updateConfig({ useBiometric: enabled });
      await loadSecurityData();
      
      if (enabled) {
        Alert.alert('Success', 'Biometric authentication has been enabled.');
      }
    } catch (error) {
      console.error('Error toggling biometric:', error);
      Alert.alert('Error', 'Failed to update biometric settings.');
    }
  };

  const handleTogglePIN = async (enabled: boolean) => {
    if (enabled && !securityStatus?.pinConfigured) {
      setShowPINSetup(true);
    } else if (!enabled) {
      Alert.alert(
        'Remove PIN',
        'Are you sure you want to remove PIN protection?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                await appSecurityService.removePIN();
                await loadSecurityData();
              } catch (error) {
                console.error('Error removing PIN:', error);
                Alert.alert('Error', 'Failed to remove PIN.');
              }
            },
          },
        ]
      );
    }
  };

  const handleSetupPIN = async () => {
    if (!newPIN || newPIN.length < 4) {
      Alert.alert('Invalid PIN', 'PIN must be at least 4 digits.');
      return;
    }

    if (newPIN !== confirmPIN) {
      Alert.alert('PIN Mismatch', 'PINs do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await appSecurityService.setupPIN(newPIN);
      await loadSecurityData();
      setShowPINSetup(false);
      setNewPIN('');
      setConfirmPIN('');
      Alert.alert('Success', 'PIN has been set up successfully.');
    } catch (error) {
      console.error('Error setting up PIN:', error);
      Alert.alert('Error', 'Failed to set up PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePIN = async () => {
    if (!currentPIN || !newPIN || newPIN.length < 4) {
      Alert.alert('Invalid Input', 'Please enter valid PINs.');
      return;
    }

    if (newPIN !== confirmPIN) {
      Alert.alert('PIN Mismatch', 'New PINs do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await appSecurityService.changePIN(currentPIN, newPIN);
      await loadSecurityData();
      setShowPINChange(false);
      setCurrentPIN('');
      setNewPIN('');
      setConfirmPIN('');
      Alert.alert('Success', 'PIN has been changed successfully.');
    } catch (error) {
      console.error('Error changing PIN:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to change PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimeout = (milliseconds: number) => {
    const minutes = Math.ceil(milliseconds / 1000 / 60);
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      if (remainingMinutes === 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''}`;
      } else {
        return `${hours}h ${remainingMinutes}m`;
      }
    }
  };

  const updateAutoLockTimeout = async (timeout: number) => {
    try {
      await appSecurityService.updateConfig({ autoLockTimeout: timeout });
      await loadSecurityData();
    } catch (error) {
      console.error('Error updating auto-lock timeout:', error);
    }
  };

  if (!securityStatus || !config) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <ThemedText style={[styles.loadingText, { color: theme.colors.text }]}>Loading...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Security Status */}
        {!securityStatus.useBiometric && !securityStatus.usePIN && (
          <View style={[styles.section, { backgroundColor: theme.colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="shield-outline" size={24} color={theme.colors.primary} />
              <ThemedText style={styles.sectionTitle}>Enable App Security</ThemedText>
            </View>
            
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <ThemedText style={styles.settingLabel}>App Protection</ThemedText>
                <ThemedText style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  Enable PIN or biometric authentication to protect your wallet
                </ThemedText>
              </View>
            </View>
            
            <ThemedText style={[styles.warningText, { color: theme.colors.textSecondary }]}>
              Currently, your app is not protected. Enable security features below to secure your wallet.
            </ThemedText>
          </View>
        )}

        {/* Biometric Authentication */}
        <View style={[styles.section, { backgroundColor: theme.colors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="finger-print" size={24} color={theme.colors.primary} />
            <ThemedText style={styles.sectionTitle}>Biometric Authentication</ThemedText>
          </View>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <ThemedText style={styles.settingLabel}>Face ID / Touch ID</ThemedText>
              <ThemedText style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                Use biometric authentication to unlock the app
              </ThemedText>
            </View>
            <Switch
              value={securityStatus.useBiometric}
              onValueChange={handleToggleBiometric}
              disabled={!securityStatus.biometricAvailable}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={securityStatus.biometricAvailable ? 'white' : theme.colors.textSecondary}
            />
          </View>
          
          {!securityStatus.biometricAvailable && (
            <ThemedText style={[styles.warningText, { color: theme.colors.error }]}>
              Biometric authentication not available on this device
            </ThemedText>
          )}
        </View>

        {/* PIN Authentication */}
        <View style={[styles.section, { backgroundColor: theme.colors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="keypad" size={24} color={theme.colors.primary} />
            <ThemedText style={styles.sectionTitle}>PIN Authentication</ThemedText>
          </View>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <ThemedText style={styles.settingLabel}>PIN Protection</ThemedText>
              <ThemedText style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                Use a PIN to unlock the app
              </ThemedText>
            </View>
            <Switch
              value={securityStatus.usePIN}
              onValueChange={handleTogglePIN}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor="white"
            />
          </View>
          
          {!securityStatus.pinConfigured && securityStatus.usePIN && (
            <ThemedText style={[styles.warningText, { color: theme.colors.primary }]}>
              PIN is enabled but not configured. Set up your PIN below.
            </ThemedText>
          )}
          
          {securityStatus.pinConfigured && (
            <>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: theme.colors.buttonSecondary }]}
                onPress={() => setShowPINChange(true)}
              >
                <Ionicons name="create-outline" size={20} color="white" />
                <ThemedText style={styles.actionButtonText}>Change PIN</ThemedText>
              </TouchableOpacity>
              
              <View style={styles.settingRow}>
                <ThemedText style={styles.settingLabel}>Failed Attempts</ThemedText>
                <ThemedText style={[styles.settingValue, { color: theme.colors.textSecondary }]}>
                  {securityStatus.attemptsRemaining} remaining
                </ThemedText>
              </View>
            </>
          )}
        </View>

        {/* Auto-Lock Settings */}
        <View style={[styles.section, { backgroundColor: theme.colors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time-outline" size={24} color={theme.colors.primary} />
            <ThemedText style={styles.sectionTitle}>Auto-Lock</ThemedText>
          </View>
          
          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <ThemedText style={styles.settingLabel}>Auto-lock Timeout</ThemedText>
              <ThemedText style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                Automatically lock the app after inactivity
              </ThemedText>
            </View>
          </View>
          
          <View style={styles.timeoutOptions}>
            {[
              { label: 'Immediately', value: 0 },
              { label: '1 minute', value: 60 * 1000 },
              { label: '5 minutes', value: 5 * 60 * 1000 },
              { label: '15 minutes', value: 15 * 60 * 1000 },
              { label: '1 hour', value: 60 * 60 * 1000 },
            ].map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.timeoutOption,
                  {
                    backgroundColor: config.autoLockTimeout === option.value ? theme.colors.primary : theme.colors.buttonSecondary,
                  },
                ]}
                onPress={() => updateAutoLockTimeout(option.value)}
              >
                <ThemedText style={[styles.timeoutOptionText, { color: 'white' }]}>
                  {option.label}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Security Status */}
        <View style={[styles.section, { backgroundColor: theme.colors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-checkmark" size={24} color={theme.colors.primary} />
            <ThemedText style={styles.sectionTitle}>Security Status</ThemedText>
          </View>
          
          <View style={styles.statusRow}>
            <ThemedText style={styles.statusLabel}>App Locked:</ThemedText>
            <ThemedText style={[styles.statusValue, { color: securityStatus.isLocked ? theme.colors.error : theme.colors.success }]}>
              {securityStatus.isLocked ? 'Yes' : 'No'}
            </ThemedText>
          </View>
          
          <View style={styles.statusRow}>
            <ThemedText style={styles.statusLabel}>Current Timeout:</ThemedText>
            <ThemedText style={[styles.statusValue, { color: theme.colors.textSecondary }]}>
              {formatTimeout(config.autoLockTimeout)}
            </ThemedText>
          </View>
          
          {securityStatus.lockoutRemaining > 0 && (
            <View style={styles.statusRow}>
              <ThemedText style={styles.statusLabel}>Lockout Remaining:</ThemedText>
              <ThemedText style={[styles.statusValue, { color: theme.colors.error }]}>
                {formatTimeout(securityStatus.lockoutRemaining)}
              </ThemedText>
            </View>
          )}
        </View>
      </ScrollView>

      {/* PIN Setup Modal */}
      {showPINSetup && (
        <View style={[styles.modalOverlay, { backgroundColor: theme.colors.modalOverlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.modalBackground }]}>
            <ThemedText style={styles.modalTitle}>Set Up PIN</ThemedText>
            
            <View style={styles.inputContainer}>
              <ThemedText style={styles.inputLabel}>Enter PIN (4-8 digits):</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]}
                value={newPIN}
                onChangeText={setNewPIN}
                placeholder="Enter PIN"
                placeholderTextColor={theme.colors.placeholder}
                keyboardType="numeric"
                secureTextEntry
                maxLength={8}
              />
              
              <ThemedText style={styles.inputLabel}>Confirm PIN:</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]}
                value={confirmPIN}
                onChangeText={setConfirmPIN}
                placeholder="Confirm PIN"
                placeholderTextColor={theme.colors.placeholder}
                keyboardType="numeric"
                secureTextEntry
                maxLength={8}
              />
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.colors.buttonSecondary }]}
                onPress={() => {
                  setShowPINSetup(false);
                  setNewPIN('');
                  setConfirmPIN('');
                }}
              >
                <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.colors.buttonPrimary }]}
                onPress={handleSetupPIN}
                disabled={isLoading}
              >
                <ThemedText style={styles.modalButtonText}>
                  {isLoading ? 'Setting Up...' : 'Set PIN'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* PIN Change Modal */}
      {showPINChange && (
        <View style={[styles.modalOverlay, { backgroundColor: theme.colors.modalOverlay }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.modalBackground }]}>
            <ThemedText style={styles.modalTitle}>Change PIN</ThemedText>
            
            <View style={styles.inputContainer}>
              <ThemedText style={styles.inputLabel}>Current PIN:</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]}
                value={currentPIN}
                onChangeText={setCurrentPIN}
                placeholder="Current PIN"
                placeholderTextColor={theme.colors.placeholder}
                keyboardType="numeric"
                secureTextEntry
                maxLength={8}
              />
              
              <ThemedText style={styles.inputLabel}>New PIN (4-8 digits):</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]}
                value={newPIN}
                onChangeText={setNewPIN}
                placeholder="New PIN"
                placeholderTextColor={theme.colors.placeholder}
                keyboardType="numeric"
                secureTextEntry
                maxLength={8}
              />
              
              <ThemedText style={styles.inputLabel}>Confirm New PIN:</ThemedText>
              <TextInput
                style={[styles.input, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]}
                value={confirmPIN}
                onChangeText={setConfirmPIN}
                placeholder="Confirm New PIN"
                placeholderTextColor={theme.colors.placeholder}
                keyboardType="numeric"
                secureTextEntry
                maxLength={8}
              />
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.colors.buttonSecondary }]}
                onPress={() => {
                  setShowPINChange(false);
                  setCurrentPIN('');
                  setNewPIN('');
                  setConfirmPIN('');
                }}
              >
                <ThemedText style={styles.modalButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.colors.buttonPrimary }]}
                onPress={handleChangePIN}
                disabled={isLoading}
              >
                <ThemedText style={styles.modalButtonText}>
                  {isLoading ? 'Changing...' : 'Change PIN'}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
  },
  settingValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  warningText: {
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '600',
    marginLeft: 8,
  },
  timeoutOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  timeoutOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  timeoutOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    padding: 20,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
  },
}); 