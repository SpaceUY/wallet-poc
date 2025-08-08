import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { useAccount, useDisconnect } from "wagmi";

import { ThemedText as Text } from '@/components/ThemedText';
import { ThemedView as View } from '@/components/ThemedView';
import { createTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/useColorScheme';
import { walletService } from '@/services/WalletService';
import Clipboard from '@react-native-clipboard/clipboard';
import { useAppKit } from "@reown/appkit-wagmi-react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Wallet Error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorText}>Please restart the app</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function WalletScreenContent() {
  const insets = useSafeAreaInsets();
  const { open } = useAppKit();
  const { address, isConnected, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  
  // Theme
  const colorScheme = useColorScheme();
  const theme = createTheme(colorScheme ?? 'light');
  
  const [status, setStatus] = useState('Ready');
  const [walletInfo, setWalletInfo] = useState<{
    address?: string;
    balance?: string;
    type?: 'hardware' | 'software' | 'external';
  }>({});
  const [txInfo, setTxInfo] = useState({
    to: '',
    amount: '0.001'
  });
  const [isSendModalVisible, setIsSendModalVisible] = useState(false);
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCheckingWallet, setIsCheckingWallet] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const testGetBalance = useCallback(async () => {
    try {
      if (!walletInfo.address) {
        setStatus('No wallet address available');
        return;
      }
      
      setStatus('Getting balance...');
      const balance = await walletService.getBalance(walletInfo.address);
      setWalletInfo(prev => ({ ...prev, balance }));
      setStatus('Balance updated!');
    } catch (error) {
      console.error('Error getting balance:', error);
      setStatus(`Error getting balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [walletInfo.address]);

  // Handle WalletConnect connection state changes
  useEffect(() => {
    console.log('Connection state changed:', { isConnected, address, chainId });
    
    if (isConnected && address) {
      console.log('WalletConnect connected with address:', address);
      setIsConnecting(false);
      setStatus('WalletConnect connected successfully!');
      
      // Update wallet info
      setWalletInfo({ 
        address: address, 
        type: 'external' 
      });
      
      // Get initial balance
      testGetBalance();
    } else if (!isConnected) {
      console.log('WalletConnect disconnected');
      setIsConnecting(false);
      // Only clear wallet info if we don't have a local wallet
      if (walletInfo.type === 'external') {
        setWalletInfo({});
        setStatus('WalletConnect disconnected');
      }
    }
  }, [isConnected, address, chainId, testGetBalance, walletInfo.type]);

  useEffect(() => {
    const checkWallet = async () => {
      try {
        console.log('Component: Starting wallet check...');
        setStatus('Checking for existing wallet...');
        setIsCheckingWallet(true);
        
        // Check if WalletConnect is connected first
        if (isConnected && address) {
          console.log('Component: WalletConnect is connected with address:', address);
          setWalletInfo({ 
            address: address, 
            type: 'external' 
          });
          setStatus('WalletConnect wallet connected, getting balance...');
          
          // Get initial balance
          console.log('Component: Getting balance for address:', address);
          const balance = await walletService.getBalance(address);
          console.log('Component: Got balance:', balance);
          
          setWalletInfo(prev => ({ ...prev, balance }));
          setStatus('WalletConnect wallet restored successfully!');
          return;
        }
        
        // Use the actual signing address for hardware wallets
        const actualAddress = await walletService.getActualSigningAddress();
        console.log('Component: getActualSigningAddress result:', actualAddress);
        
        if (actualAddress) {
          console.log('Component: Found wallet, setting address:', actualAddress);
          // Check wallet type
          const existingWallet = await walletService.checkExistingWallet();
          setWalletInfo({ 
            address: actualAddress, 
            type: existingWallet?.type 
          });
          setStatus('Found existing wallet, getting balance...');
          
          // Get initial balance
          console.log('Component: Getting balance for address:', actualAddress);
          const balance = await walletService.getBalance(actualAddress);
          console.log('Component: Got balance:', balance);
          
          setWalletInfo(prev => ({ ...prev, balance }));
          setStatus('Wallet restored successfully!');
        } else {
          console.log('Component: No wallet found');
          setStatus('No existing wallet found');
        }
      } catch (error) {
        console.error('Component: Error in checkWallet:', error);
        if (error instanceof Error) {
          console.error('Component: Error details:', error.message);
          console.error('Component: Error stack:', error.stack);
          setStatus(`Error checking wallet: ${error.message}`);
        } else {
          setStatus('Error checking for existing wallet');
        }
      } finally {
        setIsCheckingWallet(false);
      }
    };
    
    checkWallet();
  }, [isConnected, address]);



  const testSendTransaction = async () => {
    try {
      if (!walletInfo.address) {
        Alert.alert('No Wallet', 'Please create or connect a wallet first.');
        return;
      }

      if (!txInfo.to || !txInfo.amount) {
        Alert.alert('Invalid Input', 'Please enter a valid recipient address and amount.');
        return;
      }

      // Estimate gas first
      setStatus('Estimating gas...');
      const gasEstimate = await walletService.estimateGas(txInfo.to, txInfo.amount);

      // Show transaction confirmation
      Alert.alert(
        'Confirm Transaction',
        `Send ${txInfo.amount} ETH to:\n${txInfo.to}\n\nEstimated Gas: ${gasEstimate} ETH`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => setIsSendModalVisible(false)
          },
          {
            text: 'Confirm',
            style: 'destructive',
            onPress: async () => {
              try {
                setStatus('Sending transaction...');
                setIsConfirming(true);
                const tx = await walletService.sendTransaction(
                  txInfo.to,
                  txInfo.amount
                );
                setLastTxHash(tx.hash);
                setIsSendModalVisible(false);
                setIsSuccessModalVisible(true);
                
                // Wait for transaction confirmation
                setStatus('Waiting for confirmation...');
                await tx.wait(1); // Wait for 1 confirmation
                
                setStatus('Transaction confirmed!');
                // Update balance after confirmation
                await testGetBalance();
              } catch (error) {
                console.error('Transaction failed:', error);
                setStatus(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                Alert.alert(
                  'Transaction Failed',
                  'The transaction could not be completed. Please try again.'
                );
              } finally {
                setIsConfirming(false);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error sending transaction:', error);
      setStatus(`Error sending transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const copyAddress = () => {
    if (walletInfo.address) {
      Clipboard.setString(walletInfo.address);
      setStatus('Address copied to clipboard!');
    }
  };

  const viewPrivateKey = async () => {
    try {
      if (walletInfo.type === 'software') {
        setStatus('Retrieving private key...');
        const { softwareWalletService } = await import('@/services/SoftwareWalletService');
        const walletInfo = await softwareWalletService['getStoredWalletInfo']();
        
        if (walletInfo) {
          Alert.alert(
            '🔐 Private Key',
            `Your wallet's private key:\n\n${walletInfo.privateKey}\n\nKeep this safe and never share it!`,
            [
              {
                text: 'Copy to Clipboard',
                onPress: () => {
                  Clipboard.setString(walletInfo.privateKey);
                  setStatus('Private key copied to clipboard!');
                }
              },
              { text: 'Close' }
            ]
          );
        } else {
          setStatus('Could not retrieve private key');
        }
      } else {
        Alert.alert('Not Available', 'Private key viewing is only available for software wallets.');
      }
    } catch (error) {
      console.error('Error viewing private key:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
              setWalletInfo({});
              setStatus('Wallet deleted successfully');
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error deleting wallet:', error);
      setStatus(`Error deleting wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const connectExternalWallet = async () => {
    try {
      setStatus('Opening WalletConnect modal...');
      setIsConnecting(true);
      console.log('Attempting to open WalletConnect modal...');
      
      await open();
      console.log('WalletConnect modal opened successfully');
      
      setStatus('Modal opened - select a wallet to connect');
      console.log('Modal opened, waiting for user selection...');
      
      // Add a timeout to reset connecting state if no connection happens
      setTimeout(() => {
        if (isConnecting && !isConnected) {
          console.log('Connection timeout - resetting state');
          setIsConnecting(false);
          setStatus('Connection timed out - please try again');
        }
      }, 30000); // 30 second timeout
      
    } catch (error) {
      console.error('Error opening WalletConnect modal:', error);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsConnecting(false);
      
      Alert.alert(
        'Connection Error',
        `Failed to open wallet connection modal:\n\n${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease make sure you have a compatible wallet app installed.`,
        [{ text: 'OK' }]
      );
    }
  };

  const disconnectExternalWallet = async () => {
    try {
      setStatus('Disconnecting WalletConnect...');
      await disconnect();
      setWalletInfo({});
      setStatus('WalletConnect disconnected');
    } catch (error) {
      console.error('Error disconnecting WalletConnect:', error);
      setStatus(`Error disconnecting: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };



  return (
    <ErrorBoundary>
      <View style={styles.container}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + 20 }
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.content}>
              <View style={[styles.card, { backgroundColor: theme.colors.cardBackground, borderColor: theme.colors.border }]}>
                <Text style={styles.label}>Status:</Text>
                <Text style={styles.value}>{status}</Text>
                
                {/* Debug Info */}
                <Text style={styles.label}>WalletConnect Debug:</Text>
                <Text style={styles.value}>Connected: {isConnected ? 'Yes' : 'No'}</Text>
                <Text style={styles.value}>Address: {address || 'None'}</Text>
                
                {walletInfo.address && (
                  <>
                    <Text style={styles.label}>Address:</Text>
                    <TouchableOpacity onPress={copyAddress}>
                      <Text style={[styles.value, styles.address]} numberOfLines={1} ellipsizeMode="middle">
                        {walletInfo.address}
                      </Text>
                    </TouchableOpacity>
                    
                    <Text style={styles.label}>Balance:</Text>
                    <Text style={styles.value}>{walletInfo.balance || '0.0'} ETH</Text>
                    
                    {walletInfo.type && (
                      <>
                        <Text style={styles.label}>Type:</Text>
                        <Text style={styles.value}>{walletInfo.type}</Text>
                      </>
                    )}
                  </>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.buttonContainer}>
                {!walletInfo.address ? (
                  // No wallet - show creation options
                  <>
                    <TouchableOpacity 
                      style={[
                        styles.button, 
                        { 
                          backgroundColor: isCheckingWallet ? theme.colors.buttonDisabled : theme.colors.buttonPrimary 
                        }
                      ]} 
                      onPress={async () => {
                        try {
                          setStatus('Creating hardware wallet...');
                          const { address, type } = await walletService.createWallet(false);
                          setWalletInfo({ address, type });
                          setStatus('Hardware wallet created successfully!');
                          await testGetBalance();
                        } catch (error) {
                          console.error('Error creating hardware wallet:', error);
                          setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                        }
                      }}
                      activeOpacity={0.7}
                      disabled={isCheckingWallet}
                    >
                      <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
                        {isCheckingWallet ? 'Checking Wallet...' : 'Create Hardware Wallet'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[
                        styles.button, 
                        { 
                          backgroundColor: isCheckingWallet ? theme.colors.buttonDisabled : theme.colors.buttonSuccess 
                        }
                      ]} 
                      onPress={async () => {
                        try {
                          setStatus('Creating software wallet...');
                          const { address, type, mnemonic } = await walletService.createWallet(true);
                          setWalletInfo({ address, type });
                          setStatus('Software wallet created successfully!');
                          await testGetBalance();
                          
                          Alert.alert(
                            '🔐 Backup Your Wallet',
                            `Your wallet has been created!\n\nMnemonic: ${mnemonic}\n\n⚠️ Write this down and keep it safe. You'll need it to recover your wallet.`,
                            [{ text: 'OK' }]
                          );
                        } catch (error) {
                          console.error('Error creating software wallet:', error);
                          setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                        }
                      }}
                      activeOpacity={0.7}
                      disabled={isCheckingWallet}
                    >
                      <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
                        {isCheckingWallet ? 'Checking Wallet...' : 'Create Software Wallet'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[
                        styles.button, 
                        { 
                          backgroundColor: isCheckingWallet || isConnecting ? theme.colors.buttonDisabled : theme.colors.buttonPrimary 
                        }
                      ]} 
                      onPress={connectExternalWallet}
                      disabled={isCheckingWallet || isConnecting}
                    >
                      <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
                        {isCheckingWallet ? 'Checking Wallet...' : 
                         isConnecting ? 'Connecting...' : 'Connect External Wallet'}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  // Has wallet - show wallet actions
                  <>
                    <TouchableOpacity 
                      style={[styles.button, { backgroundColor: theme.colors.buttonSecondary }]} 
                      onPress={testGetBalance}
                    >
                      <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Refresh Balance</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[styles.button, { backgroundColor: theme.colors.buttonPrimary }]} 
                      onPress={() => setIsSendModalVisible(true)}
                    >
                      <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Send Transaction</Text>
                    </TouchableOpacity>

                    {walletInfo.type === 'software' && (
                      <>
                        <TouchableOpacity 
                          style={[styles.button, { backgroundColor: theme.colors.buttonWarning }]} 
                          onPress={viewPrivateKey}
                        >
                          <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>View Private Key</Text>
                        </TouchableOpacity>

                        <TouchableOpacity 
                          style={[styles.button, { backgroundColor: theme.colors.buttonWarning }]} 
                          onPress={async () => {
                            try {
                              setStatus('Retrieving mnemonic...');
                              const { softwareWalletService } = await import('@/services/SoftwareWalletService');
                              const mnemonic = await softwareWalletService.getMnemonic();
                              
                              if (mnemonic) {
                                Alert.alert(
                                  '🔐 Seed Phrase',
                                  `Your wallet's seed phrase:\n\n${mnemonic}\n\nKeep this safe and never share it!`,
                                  [
                                    {
                                      text: 'Copy to Clipboard',
                                      onPress: () => {
                                        Clipboard.setString(mnemonic);
                                        setStatus('Seed phrase copied to clipboard!');
                                      }
                                    },
                                    { text: 'Close' }
                                  ]
                                );
                              } else {
                                setStatus('No mnemonic found');
                                Alert.alert('No Mnemonic', 'No mnemonic found for this wallet.');
                              }
                            } catch (error) {
                              console.error('Error getting mnemonic:', error);
                              setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
                            }
                          }}
                        >
                          <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>View Seed Phrase</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {walletInfo.type === 'external' ? (
                      <TouchableOpacity 
                        style={[styles.button, styles.deleteButton, { backgroundColor: theme.colors.buttonDanger }]} 
                        onPress={disconnectExternalWallet}
                      >
                        <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Disconnect Wallet</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity 
                        style={[styles.button, styles.deleteButton, { backgroundColor: theme.colors.buttonDanger }]} 
                        onPress={testDeleteWallet}
                      >
                        <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Delete Wallet</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* Send Transaction Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isSendModalVisible}
        onRequestClose={() => setIsSendModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setIsSendModalVisible(false)}>
          <View style={[
            styles.modalOverlay,
            {
              backgroundColor: theme.colors.modalOverlay,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            }
          ]}>
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={[styles.modalContent, { backgroundColor: theme.colors.modalBackground }]}>
                <Text style={styles.modalTitle}>Send Transaction</Text>
                
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>To Address:</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]}
                    value={txInfo.to}
                    onChangeText={(text) => setTxInfo(prev => ({ ...prev, to: text }))}
                    placeholder="0x..."
                    placeholderTextColor={theme.colors.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  
                  <Text style={styles.label}>Amount (ETH):</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.colors.inputBackground, borderColor: theme.colors.inputBorder }]}
                    value={txInfo.amount}
                    onChangeText={(text) => setTxInfo(prev => ({ ...prev, amount: text }))}
                    placeholder="0.001"
                    placeholderTextColor={theme.colors.placeholder}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.modalButtons}>
                  <TouchableOpacity 
                    style={[styles.button, styles.cancelButton, { backgroundColor: theme.colors.buttonSecondary }]} 
                    onPress={() => setIsSendModalVisible(false)}
                  >
                    <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Cancel</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.button, { backgroundColor: theme.colors.buttonPrimary }]} 
                    onPress={testSendTransaction}
                    disabled={isConfirming}
                  >
                    <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
                      {isConfirming ? 'Sending...' : 'Send'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Success Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isSuccessModalVisible}
        onRequestClose={() => setIsSuccessModalVisible(false)}
      >
        <View style={[
          styles.modalOverlay,
          {
            backgroundColor: theme.colors.modalOverlay,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }
        ]}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.modalBackground }]}>
            <Text style={styles.modalTitle}>Transaction Sent!</Text>
            
            <View style={styles.successContainer}>
              <Text style={styles.label}>Transaction Hash:</Text>
              <Text style={styles.value} numberOfLines={1} ellipsizeMode="middle">
                {lastTxHash}
              </Text>

              <TouchableOpacity 
                style={[styles.button, styles.linkButton, { backgroundColor: theme.colors.link }]}
                onPress={() => {
                  if (lastTxHash) {
                    Linking.openURL(`https://sepolia.etherscan.io/tx/${lastTxHash}`);
                  }
                }}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
                  View on Etherscan
                </Text>
              </TouchableOpacity>

              {isConfirming && (
                <Text style={[styles.confirmingText, { color: theme.colors.placeholder }]}>
                  Waiting for confirmation...
                </Text>
              )}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.button, styles.okButton, { backgroundColor: theme.colors.buttonSuccess }]} 
                onPress={() => setIsSuccessModalVisible(false)}
              >
                <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
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
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingTop: 20,
    marginBottom: 8,
  },
  card: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    marginBottom: 8,
  },
  address: {
    fontFamily: 'monospace',
    fontSize: 14,
  },
  buttonContainer: {
    gap: 12,
  },
  button: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    marginTop: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
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
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
  },
  successContainer: {
    marginBottom: 20,
  },
  linkButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  okButton: {
    flex: 1,
  },
  confirmingText: {
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
});

export default WalletScreenContent; 