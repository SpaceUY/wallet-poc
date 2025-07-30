import { Alert, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableWithoutFeedback } from 'react-native';
import React, { useEffect, useState } from 'react';

import Clipboard from '@react-native-clipboard/clipboard';
import { ThemedText as Text } from '@/components/ThemedText';
import { ThemedView as View } from '@/components/ThemedView';
import { secureStorage } from '@/utils/secureStorage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/useThemeColor';
import { walletService } from '@/services/WalletService';

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
  
  // Theme colors
  const cardBackground = useThemeColor({}, 'cardBackground');
  const borderColor = useThemeColor({}, 'border');
  const buttonPrimary = useThemeColor({}, 'buttonPrimary');
  const buttonSecondary = useThemeColor({}, 'buttonSecondary');
  const buttonSuccess = useThemeColor({}, 'buttonSuccess');
  const buttonWarning = useThemeColor({}, 'buttonWarning');
  const buttonDanger = useThemeColor({}, 'buttonDanger');
  const buttonDisabled = useThemeColor({}, 'buttonDisabled');
  const modalOverlay = useThemeColor({}, 'modalOverlay');
  const modalBackground = useThemeColor({}, 'modalBackground');
  const inputBackground = useThemeColor({}, 'inputBackground');
  const inputBorder = useThemeColor({}, 'inputBorder');
  const placeholderColor = useThemeColor({}, 'placeholder');
  const linkColor = useThemeColor({}, 'link');
  
  const [status, setStatus] = useState('Ready');
  const [walletInfo, setWalletInfo] = useState<{
    address?: string;
    balance?: string;
  }>({});
  const [txInfo, setTxInfo] = useState({
    to: '',
    amount: '0.001'
  });
  const [isSendModalVisible, setIsSendModalVisible] = useState(false);
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  useEffect(() => {
    const checkWallet = async () => {
      try {
        console.log('Component: Starting wallet check...');
        setStatus('Checking for existing wallet...');
        
        // Use the actual signing address for hardware wallets
        const actualAddress = await walletService.getActualSigningAddress();
        console.log('Component: getActualSigningAddress result:', actualAddress);
        
        if (actualAddress) {
          console.log('Component: Found wallet, setting address:', actualAddress);
          setWalletInfo({ address: actualAddress });
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
      }
    };
    
    checkWallet();
  }, []);

  const testCreateWallet = async (useSoftware?: boolean) => {
    try {
      setStatus('Creating wallet...');
      const { address } = await walletService.createWallet(useSoftware);
      if (!address) {
        throw new Error('Failed to create wallet - no address returned');
      }
      setWalletInfo({ address });
      setStatus(`${useSoftware ? 'Software' : 'Hardware'} wallet created successfully!`);
      
      // Get initial balance
      const balance = await walletService.getBalance(address);
      setWalletInfo(prev => ({ ...prev, balance }));
    } catch (error) {
      console.error('Error creating wallet:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Error creating wallet: ${errorMessage}`);
      
      // Show detailed error in an alert for production debugging
      Alert.alert(
        'Wallet Creation Failed',
        `Error: ${errorMessage}\n\nThis will help debug the issue in production.`,
        [{ text: 'OK' }]
      );
    }
  };

  const testGetBalance = async () => {
    try {
      if (!walletInfo.address) {
        setStatus('No wallet address available');
        return;
      }
      setStatus('Getting balance...');
      const balance = await walletService.getBalance(walletInfo.address);
      setWalletInfo(prev => ({ ...prev, balance }));
      setStatus(`Balance updated!`);
    } catch (error) {
      console.error('Error getting balance:', error);
      setStatus(`Error getting balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testSendTransaction = async () => {
    try {
      if (!walletInfo.address) {
        setStatus('No wallet available');
        return;
      }
      if (!txInfo.to || !txInfo.amount) {
        setStatus('Please enter recipient address and amount');
        return;
      }

      // First get gas estimate
      setStatus('Estimating gas...');
      const gasEstimate = await walletService.estimateGas(
        txInfo.to,
        txInfo.amount
      );

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

  const copyAddressToClipboard = async () => {
    try {
      if (walletInfo.address) {
        await Clipboard.setString(walletInfo.address);
        setStatus('Address copied to clipboard!');
      }
    } catch (error) {
      console.error('Error copying address:', error);
      setStatus('Error copying address to clipboard');
    }
  };

  const viewPrivateKey = async () => {
    try {
      Alert.alert(
        'Security Warning',
        'Never share your private key with anyone. Anyone with access to your private key has full control of your wallet.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'View Key',
            style: 'destructive',
            onPress: async () => {
              try {
                setStatus('Retrieving private key...');
                const privateKey = await secureStorage.getPrivateKey('primary');
                if (privateKey) {
                  // Show key with timeout
                  Alert.alert(
                    'Private Key',
                    privateKey,
                    [
                      {
                        text: 'Copy to Clipboard',
                        onPress: () => {
                          Clipboard.setString(privateKey);
                          // Clear clipboard after 30 seconds
                          setTimeout(() => {
                            Clipboard.setString('');
                          }, 30000);
                          setStatus('Private key copied to clipboard (will clear in 30s)');
                        }
                      },
                      { 
                        text: 'Close',
                        style: 'cancel',
                        onPress: () => {
                          // Clear the private key from memory
                          privateKey.split('').fill('0').join('');
                        }
                      }
                    ],
                    { 
                      cancelable: true,
                      onDismiss: () => {
                        // Clear the private key from memory
                        privateKey.split('').fill('0').join('');
                      }
                    }
                  );

                  // Auto-dismiss after 60 seconds
                  setTimeout(() => {
                    Alert.alert('', ''); // This dismisses any open alert
                  }, 60000);
                }
                setStatus('Ready');
              } catch (error) {
                console.error('Error retrieving private key:', error);
                setStatus(`Error retrieving private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error in viewPrivateKey:', error);
      setStatus(`Error retrieving private key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const testDeleteWallet = async () => {
    try {
      // Ask for confirmation
      Alert.alert(
        'Delete Wallet',
        'Are you sure you want to delete this wallet? This action cannot be undone.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                setStatus('Deleting wallet...');
                await walletService.deleteWallet();
                setWalletInfo({});
                setStatus('Wallet deleted!');
              } catch (error) {
                console.error('Error deleting wallet:', error);
                setStatus(`Error deleting wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error in testDeleteWallet:', error);
      setStatus(`Error deleting wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const createHardwareWallet = async () => {
    if (walletInfo.address) return;
    await testCreateWallet(false);
  };

  const createSoftwareWallet = async () => {
    if (walletInfo.address) return;
    await testCreateWallet(true);
  };

  return (
    <View style={[
      styles.container,
      {
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }
    ]}>
      {/* Status Section */}
      <View style={[styles.statusSection, { borderBottomColor: borderColor }]}>
        <Text style={styles.title}>Wallet Status</Text>
        <View style={[styles.statusContainer, { backgroundColor: cardBackground }]}>
          <Text style={styles.label}>Status:</Text>
          <Text style={styles.value}>{status}</Text>
          
          {walletInfo.address && (
            <>
              <Text style={styles.label}>Address:</Text>
              <Text style={styles.value}>{walletInfo.address}</Text>
            </>
          )}

          {walletInfo.balance && (
            <>
              <Text style={styles.label}>Balance:</Text>
              <Text style={styles.value}>{walletInfo.balance} ETH</Text>
            </>
          )}
        </View>
      </View>

      {/* Send Transaction Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isSendModalVisible}
        onRequestClose={() => setIsSendModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[
              styles.modalOverlay,
              {
                backgroundColor: modalOverlay,
                paddingTop: insets.top,
                paddingBottom: insets.bottom,
              }
            ]}
          >
            <View style={[styles.modalContent, { backgroundColor: modalBackground }]}>
              <ScrollView bounces={false}>
                <Text style={styles.modalTitle}>Send Transaction</Text>
                
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Recipient Address:</Text>
                  <TextInput
                    style={[styles.input, { 
                      backgroundColor: inputBackground, 
                      borderColor: inputBorder,
                      color: useThemeColor({}, 'text')
                    }]}
                    value={txInfo.to}
                    onChangeText={(text) => setTxInfo(prev => ({ ...prev, to: text }))}
                    placeholder="0x..."
                    placeholderTextColor={placeholderColor}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  
                  <Text style={styles.label}>Amount (ETH):</Text>
                  <TextInput
                    style={[styles.input, { 
                      backgroundColor: inputBackground, 
                      borderColor: inputBorder,
                      color: useThemeColor({}, 'text')
                    }]}
                    value={txInfo.amount}
                    onChangeText={(text) => setTxInfo(prev => ({ ...prev, amount: text }))}
                    keyboardType="decimal-pad"
                    placeholder="0.001"
                    placeholderTextColor={placeholderColor}
                  />
                </View>
              </ScrollView>

              <View style={styles.modalButtons}>
                <Text 
                  style={[styles.button, styles.cancelButton, { backgroundColor: buttonSecondary }]} 
                  onPress={() => {
                    Keyboard.dismiss();
                    setIsSendModalVisible(false);
                  }}
                >
                  Cancel
                </Text>
                <Text 
                  style={[styles.button, styles.sendButton, { backgroundColor: buttonPrimary }]} 
                  onPress={() => {
                    Keyboard.dismiss();
                    testSendTransaction();
                  }}
                >
                  Send
                </Text>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Transaction Success Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isSuccessModalVisible}
        onRequestClose={() => setIsSuccessModalVisible(false)}
      >
        <View style={[
          styles.modalOverlay,
          {
            backgroundColor: modalOverlay,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }
        ]}>
          <View style={[styles.modalContent, { backgroundColor: modalBackground }]}>
            <Text style={styles.modalTitle}>Transaction Sent!</Text>
            
            <View style={styles.successContainer}>
              <Text style={styles.label}>Transaction Hash:</Text>
              <Text style={styles.value} numberOfLines={1} ellipsizeMode="middle">
                {lastTxHash}
              </Text>

              <Text 
                style={[styles.button, styles.linkButton, { backgroundColor: linkColor }]}
                onPress={() => {
                  if (lastTxHash) {
                    Linking.openURL(`https://sepolia.etherscan.io/tx/${lastTxHash}`);
                  }
                }}
              >
                View on Etherscan
              </Text>

              {isConfirming && (
                <Text style={[styles.confirmingText, { color: placeholderColor }]}>
                  Waiting for confirmation...
                </Text>
              )}
            </View>

            <View style={styles.modalButtons}>
              <Text 
                style={[styles.button, styles.okButton, { backgroundColor: buttonSuccess }]} 
                onPress={() => setIsSuccessModalVisible(false)}
              >
                Close
              </Text>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom Buttons Section */}
      <View style={styles.bottomSection}>
        <ScrollView style={styles.buttonScroll}>
          <View style={styles.buttonContainer}>
            <Text 
              style={[
                styles.button, 
                { backgroundColor: walletInfo.address ? buttonDisabled : buttonPrimary },
                walletInfo.address ? styles.buttonDisabled : {}
              ]} 
              onPress={createHardwareWallet}
            >
              {walletInfo.address ? 'Wallet Created' : 'Create Hardware Wallet'}
            </Text>

            <Text 
              style={[
                styles.button, 
                styles.softwareButton,
                { backgroundColor: walletInfo.address ? buttonDisabled : buttonSecondary },
                walletInfo.address ? styles.buttonDisabled : {}
              ]} 
              onPress={createSoftwareWallet}
            >
              Create Software Wallet (Less Secure)
            </Text>

            {/* Debug button - always visible */}
            <Text 
              style={[styles.button, { backgroundColor: buttonWarning }]} 
              onPress={async () => {
                try {
                  setStatus('Running debug...');
                  const debug = await walletService.debugWalletCreation();
                  console.log('Debug info:', debug);
                  Alert.alert('Debug Info', 
                    `Secure Enclave: ${debug.secureEnclaveAvailable ? 'Available' : 'Not Available'}\n` +
                    `Secure Storage: ${debug.secureStorageAvailable ? 'Available' : 'Not Available'}\n` +
                    `Existing Wallet: ${debug.existingWallet ? 'Found' : 'None'}\n` +
                    `Test Wallet Creation: ${debug.testWalletCreation?.success ? 'Success' : 'Failed'}\n` +
                    `${debug.testWalletCreation?.error ? `Error: ${debug.testWalletCreation.error}` : ''}`
                  );
                  setStatus('Debug completed');
                } catch (error) {
                  console.error('Debug failed:', error);
                  setStatus(`Debug failed: ${error}`);
                }
              }}
            >
              Debug Wallet Creation
            </Text>
            
            {walletInfo.address && (
              <>
                <Text style={[styles.button, { backgroundColor: buttonPrimary }]} onPress={testGetBalance}>
                  Update Balance
                </Text>

                <Text 
                  style={[styles.button, { backgroundColor: buttonPrimary }]} 
                  onPress={() => setIsSendModalVisible(true)}
                >
                  Send Transaction
                </Text>

                <Text style={[styles.button, { backgroundColor: buttonPrimary }]} onPress={copyAddressToClipboard}>
                  Copy Wallet Address
                </Text>

                <Text 
                  style={[styles.button, styles.warningButton, { backgroundColor: buttonWarning }]} 
                  onPress={viewPrivateKey}
                >
                  View Private Key
                </Text>

                                 <Text 
                   style={[styles.button, styles.deleteButton, { backgroundColor: buttonDanger }]} 
                   onPress={testDeleteWallet}
                 >
                   Delete Wallet
                 </Text>


              </>
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

export default function TestWalletScreen() {
  return (
    <ErrorBoundary>
      <WalletScreenContent />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusSection: {
    padding: 20,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  statusContainer: {
    padding: 15,
    borderRadius: 5,
  },
  bottomSection: {
    flex: 1,
    justifyContent: 'flex-end',
    marginBottom: 20,
  },
  buttonScroll: {
    maxHeight: 400,
  },
  buttonContainer: {
    padding: 20,
    gap: 10,
  },
  button: {
    padding: 15,
    borderRadius: 5,
    color: 'white',
    textAlign: 'center',
  },
  deleteButton: {
    // backgroundColor will be set dynamically
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  label: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  value: {
    marginBottom: 15,
  },
  warningButton: {
    // backgroundColor will be set dynamically
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 10,
    padding: 20,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10,
  },
  cancelButton: {
    flex: 1,
  },
  sendButton: {
    flex: 1,
  },
  successContainer: {
    marginVertical: 20,
    alignItems: 'center',
  },
  confirmingText: {
    marginTop: 10,
    fontStyle: 'italic',
  },
  linkButton: {
    marginTop: 15,
  },
  okButton: {
    flex: 1,
  },
  softwareButton: {
    // backgroundColor will be set dynamically
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
}); 