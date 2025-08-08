import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText as Text } from '@/components/ThemedText';
import { ThemedView as View } from '@/components/ThemedView';
import { createTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/useColorScheme';
import { appSecurityService } from '@/services/AppSecurityService';
import { walletService } from '@/services/WalletService';
import { secureStorage } from '@/utils/secureStorage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TestingScreen() {
  const insets = useSafeAreaInsets();
  
  const colorScheme = useColorScheme();
  const theme = createTheme(colorScheme ?? 'light');
  
  const [status, setStatus] = useState('Testing tools ready');

  const testCheckExistingWallet = async () => {
    try {
      setStatus('Checking for existing wallet...');
      const wallet = await walletService.checkExistingWallet();
      if (wallet) {
        setStatus(`Found wallet: ${wallet.address}`);
        Alert.alert('Wallet Found', `Address: ${wallet.address}\nType: ${wallet.type}`);
      } else {
        setStatus('No existing wallet found');
        Alert.alert('No Wallet', 'No existing wallet found');
      }
    } catch (error) {
      console.error('Error checking wallet:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert('Error', `Failed to check wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testGetActualSigningAddress = async () => {
    try {
      setStatus('Getting actual signing address...');
      const address = await walletService.getActualSigningAddress();
      if (address) {
        setStatus(`Actual signing address: ${address}`);
        Alert.alert('Signing Address', `Address: ${address}`);
      } else {
        setStatus('No signing address found');
        Alert.alert('No Address', 'No signing address found');
      }
    } catch (error) {
      console.error('Error getting signing address:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert('Error', `Failed to get signing address: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testSoftwareWalletService = async () => {
    try {
      setStatus('Testing software wallet service...');
      const { softwareWalletService } = await import('@/services/SoftwareWalletService');
      
      // Test wallet creation
      const wallet = await softwareWalletService.createWallet();
      setStatus(`Software wallet created: ${wallet.address}`);
      
      // Test wallet retrieval
      const retrievedWallet = await softwareWalletService.getWallet();
      setStatus(`Wallet retrieved: ${retrievedWallet?.address}`);
      
      // Test balance
      const balance = await softwareWalletService.getBalance(wallet.address, '11155111');
      setStatus(`Balance: ${balance} ETH`);
      
      // Clean up
      await softwareWalletService.deleteWallet();
      setStatus('Test completed and cleaned up');
      
      Alert.alert('Test Completed', 
        `✅ Software wallet service test successful!\n\n` +
        `Created: ${wallet.address}\n` +
        `Retrieved: ${retrievedWallet?.address}\n` +
        `Balance: ${balance} ETH\n` +
        `Cleaned up: ✅`
      );
    } catch (error) {
      console.error('Error testing software wallet service:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert('Error', `Failed to test software wallet service: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testCreateSoftwareWalletDebug = async () => {
    try {
      setStatus('Creating test software wallet...');
      const { softwareWalletService } = await import('@/services/SoftwareWalletService');
      
      const wallet = await softwareWalletService.createWallet();
      setStatus(`Test software wallet created: ${wallet.address}`);
      
      Alert.alert('Success', 
        `Test software wallet created!\n\nAddress: ${wallet.address}\nMnemonic: ${wallet.mnemonic}\n\n⚠️ This is a test wallet - save the mnemonic!`
      );
    } catch (error) {
      console.error('Error creating test software wallet:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert('Error', `Failed to create test software wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testSoftwareWalletRetrieval = async () => {
    try {
      setStatus('Testing software wallet retrieval...');
      const { softwareWalletService } = await import('@/services/SoftwareWalletService');
      
      const wallet = await softwareWalletService.getWallet();
      if (wallet) {
        setStatus(`Software wallet retrieved: ${wallet.address}`);
        Alert.alert('Success', 
          `Software wallet retrieved!\n\nAddress: ${wallet.address}`
        );
      } else {
        setStatus('No software wallet found');
        Alert.alert('No Wallet', 'No software wallet found. Create one first.');
      }
    } catch (error) {
      console.error('Error testing software wallet retrieval:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert('Error', `Failed to test software wallet retrieval: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testDebugWalletCreation = async () => {
    try {
      setStatus('Running wallet creation debug...');
      const debugInfo = await walletService.debugWalletCreation();
      setStatus('Debug completed');
      
      Alert.alert('Debug Info', 
        `Secure Enclave: ${debugInfo.secureEnclaveAvailable ? '✅' : '❌'}\n` +
        `Secure Storage: ${debugInfo.secureStorageAvailable ? '✅' : '❌'}\n` +
        `Existing Wallet: ${debugInfo.existingWallet ? '✅' : '❌'}\n` +
        `Test Creation: ${debugInfo.testWalletCreation?.success ? '✅' : '❌'}\n\n` +
        `Details:\n` +
        `- Existing: ${debugInfo.existingWallet?.address || 'None'}\n` +
        `- Test Error: ${debugInfo.testWalletCreation?.error || 'None'}`
      );
    } catch (error) {
      console.error('Error in debug:', error);
      setStatus(`Debug error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert('Debug Error', `Failed to run debug: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testSecureStorage = async () => {
    try {
      setStatus('Testing secure storage...');
      const { isSecure, risks } = await secureStorage.verifyDeviceSecurity();
      setStatus(`Security check: ${isSecure ? 'Passed' : 'Failed'}`);
      
      Alert.alert('Security Check', 
        `Device Secure: ${isSecure ? '✅' : '❌'}\n\n` +
        `Risks:\n${risks.length > 0 ? risks.join('\n') : 'None detected'}`
      );
    } catch (error) {
      console.error('Error testing secure storage:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert('Error', `Failed to test secure storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testDeleteWallet = async () => {
    try {
      Alert.alert(
        'Delete Wallet',
        'Are you sure you want to delete your wallet? This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setStatus('Deleting wallet...');
              await walletService.deleteWallet();
              setStatus('Wallet deleted successfully');
              Alert.alert('Success', 'Wallet deleted successfully');
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error deleting wallet:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert('Error', `Failed to delete wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testForceLockApp = async () => {
    try {
      setStatus('Forcing app lock...');
      await appSecurityService.forceLock();
      setStatus('App locked - restart app to see lock screen');
      Alert.alert('App Locked', 'The app has been locked. Restart the app to see the lock screen.');
    } catch (error) {
      console.error('Error forcing app lock:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert('Error', `Failed to lock app: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testSecurityStatus = async () => {
    try {
      setStatus('Checking security status...');
      const status = await appSecurityService.getSecurityStatus();
      const pinEnabled = await appSecurityService.isPINEnabled();
      const isLocked = await appSecurityService.isAppLocked();
      
      setStatus('Security status checked');
      Alert.alert('Security Status', 
        `App Locked: ${isLocked ? '✅' : '❌'}\n` +
        `PIN Enabled: ${pinEnabled ? '✅' : '❌'}\n` +
        `PIN Configured: ${status.pinConfigured ? '✅' : '❌'}\n` +
        `usePIN Flag: ${status.usePIN ? '✅' : '❌'}\n` +
        `Biometric Available: ${status.biometricAvailable ? '✅' : '❌'}\n` +
        `Biometric Enabled: ${status.useBiometric ? '✅' : '❌'}\n` +
        `Auto-lock Timeout: ${Math.ceil(status.autoLockTimeout / 1000 / 60)} minutes\n` +
        `Attempts Remaining: ${status.attemptsRemaining}\n` +
        `Lockout Remaining: ${status.lockoutRemaining > 0 ? Math.ceil(status.lockoutRemaining / 1000 / 60) + ' minutes' : 'None'}`
      );
    } catch (error) {
      console.error('Error checking security status:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert('Error', `Failed to check security status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testSetupPIN = async () => {
    try {
      setStatus('Setting up test PIN...');
      await appSecurityService.setupPIN('1234');
      setStatus('Test PIN setup complete');
      Alert.alert('PIN Setup', 'Test PIN (1234) has been set up successfully. The app should now show the lock screen on restart.');
    } catch (error) {
      console.error('Error setting up PIN:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert('Error', `Failed to setup PIN: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testResetSecurityState = async () => {
    try {
      setStatus('Resetting security state...');
      await appSecurityService.resetSecurityState();
      setStatus('Security state reset');
      Alert.alert('Security Reset', 'Security state has been reset. The app should now be unlocked.');
    } catch (error) {
      console.error('Error resetting security state:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      Alert.alert('Error', `Failed to reset security state: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 20 }
        ]}
      >
        <View style={styles.content}>
          {/* Header */}
            <Text style={styles.title}>Testing & Development</Text>
            <Text style={styles.subtitle}>{status}</Text> 

          {/* Testing Buttons */}
          <View style={styles.buttonContainer}>
            <Text style={styles.sectionTitle}>Wallet Testing</Text>
            
            <TouchableOpacity 
              style={[styles.button, { backgroundColor: theme.colors.buttonSuccess }]} 
              onPress={testCreateSoftwareWalletDebug}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Create Test Software Wallet</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Wallet Management</Text>
            
            <TouchableOpacity 
              style={[styles.button, { backgroundColor: theme.colors.buttonWarning }]} 
              onPress={testCheckExistingWallet}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Check Existing Wallet</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, { backgroundColor: theme.colors.buttonWarning }]} 
              onPress={testGetActualSigningAddress}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Get Actual Signing Address</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, { backgroundColor: theme.colors.buttonWarning }]} 
              onPress={testSoftwareWalletRetrieval}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Test Software Wallet Retrieval</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>System Testing</Text>
            
            <TouchableOpacity 
              style={[styles.button, { backgroundColor: theme.colors.buttonSecondary }]} 
              onPress={testSoftwareWalletService}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Test Software Wallet Service</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, { backgroundColor: theme.colors.buttonSecondary }]} 
              onPress={testDebugWalletCreation}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Debug Wallet Creation</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, { backgroundColor: theme.colors.buttonSecondary }]} 
              onPress={testSecureStorage}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Test Secure Storage</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, { backgroundColor: theme.colors.buttonWarning }]} 
              onPress={testForceLockApp}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Force Lock App</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, { backgroundColor: theme.colors.buttonSecondary }]} 
              onPress={testSecurityStatus}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Check Security Status</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, { backgroundColor: theme.colors.buttonSuccess }]} 
              onPress={testSetupPIN}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Setup Test PIN (1234)</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, { backgroundColor: theme.colors.buttonSecondary }]} 
              onPress={testResetSecurityState}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Reset Security State</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Danger Zone</Text>
            
            <TouchableOpacity 
              style={[styles.button, { backgroundColor: theme.colors.buttonDanger }]} 
              onPress={testDeleteWallet}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Delete Wallet</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginTop: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingTop: 20,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
  buttonContainer: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 8,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
}); 