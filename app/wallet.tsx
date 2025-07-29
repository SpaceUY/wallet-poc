import { useEffect, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableWithoutFeedback } from 'react-native';

import { ThemedText as Text } from '@/components/ThemedText';
import { ThemedView as View } from '@/components/ThemedView';
import { walletService } from '@/services/WalletService';
import { secureStorage } from '@/utils/secureStorage';
import Clipboard from '@react-native-clipboard/clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TestWalletScreen() {
  const insets = useSafeAreaInsets();
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

  // Check for existing wallet on mount
  useEffect(() => {
    const checkExistingWallet = async () => {
      try {
        const existing = await secureStorage.getExistingWallet('primary');
        if (existing) {
          console.log('Found wallet with address:', existing.address);
          setWalletInfo({ address: existing.address });
          setStatus('Restored existing wallet');
          
          // Get initial balance
          const balance = await walletService.getBalance(existing.address);
          setWalletInfo(prev => ({ ...prev, balance }));
        } else {
          console.log('No existing wallet found in secure storage');
        }
      } catch (error) {
        console.error('Error checking existing wallet:', error);
      }
    };

    checkExistingWallet();
  }, []);

  const testCreateWallet = async (useSoftware?: boolean) => {
    try {
      setStatus('Creating wallet...');
      const { address } = await walletService.createWallet(useSoftware);
      setWalletInfo({ address });
      setStatus(`${useSoftware ? 'Software' : 'Hardware'} wallet created successfully!`);
      
      // Get initial balance
      const balance = await walletService.getBalance(address);
      setWalletInfo(prev => ({ ...prev, balance }));
    } catch (error) {
      setStatus(`Error creating wallet: ${error}`);
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
      setStatus(`Error getting balance: ${error}`);
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
                setStatus(`Transaction failed: ${error}`);
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
      setStatus(`Error sending transaction: ${error}`);
    }
  };

  const copyAddressToClipboard = async () => {
    if (walletInfo.address) {
      await Clipboard.setString(walletInfo.address);
      setStatus('Address copied to clipboard!');
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
            },
          },
        ]
      );
    } catch (error) {
      setStatus(`Error retrieving private key: ${error}`);
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
              setStatus('Deleting wallet...');
              await walletService.deleteWallet();
              setWalletInfo({});
              setStatus('Wallet deleted!');
            },
          },
        ]
      );
    } catch (error) {
      setStatus(`Error deleting wallet: ${error}`);
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
      <View style={styles.statusSection}>
        <Text style={styles.title}>Wallet Status</Text>
        <View style={styles.statusContainer}>
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
                paddingTop: insets.top,
                paddingBottom: insets.bottom,
              }
            ]}
          >
            <View style={styles.modalContent}>
              <ScrollView bounces={false}>
                <Text style={styles.modalTitle}>Send Transaction</Text>
                
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Recipient Address:</Text>
                  <TextInput
                    style={styles.input}
                    value={txInfo.to}
                    onChangeText={(text) => setTxInfo(prev => ({ ...prev, to: text }))}
                    placeholder="0x..."
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  
                  <Text style={styles.label}>Amount (ETH):</Text>
                  <TextInput
                    style={styles.input}
                    value={txInfo.amount}
                    onChangeText={(text) => setTxInfo(prev => ({ ...prev, amount: text }))}
                    keyboardType="decimal-pad"
                    placeholder="0.001"
                  />
                </View>
              </ScrollView>

              <View style={styles.modalButtons}>
                <Text 
                  style={[styles.button, styles.cancelButton]} 
                  onPress={() => {
                    Keyboard.dismiss();
                    setIsSendModalVisible(false);
                  }}
                >
                  Cancel
                </Text>
                <Text 
                  style={[styles.button, styles.sendButton]} 
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
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          }
        ]}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Transaction Sent!</Text>
            
            <View style={styles.successContainer}>
              <Text style={styles.label}>Transaction Hash:</Text>
              <Text style={styles.value} numberOfLines={1} ellipsizeMode="middle">
                {lastTxHash}
              </Text>

              <Text 
                style={[styles.button, styles.linkButton]}
                onPress={() => {
                  if (lastTxHash) {
                    Linking.openURL(`https://sepolia.etherscan.io/tx/${lastTxHash}`);
                  }
                }}
              >
                View on Etherscan
              </Text>

              {isConfirming && (
                <Text style={styles.confirmingText}>
                  Waiting for confirmation...
                </Text>
              )}
            </View>

            <View style={styles.modalButtons}>
              <Text 
                style={[styles.button, styles.okButton]} 
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
                walletInfo.address ? styles.buttonDisabled : {}
              ]} 
              onPress={createSoftwareWallet}
            >
              Create Software Wallet (Less Secure)
            </Text>
            
            {walletInfo.address && (
              <>
                <Text style={styles.button} onPress={testGetBalance}>
                  Update Balance
                </Text>

                <Text 
                  style={styles.button} 
                  onPress={() => setIsSendModalVisible(true)}
                >
                  Send Transaction
                </Text>

                <Text style={styles.button} onPress={copyAddressToClipboard}>
                  Copy Wallet Address
                </Text>

                <Text 
                  style={[styles.button, styles.warningButton]} 
                  onPress={viewPrivateKey}
                >
                  View Private Key
                </Text>

                <Text 
                  style={[styles.button, styles.deleteButton]} 
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  statusContainer: {
    backgroundColor: '#f5f5f5',
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
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 5,
    color: 'white',
    textAlign: 'center',
  },
  deleteButton: {
    backgroundColor: '#ff4444',
  },
  buttonDisabled: {
    backgroundColor: '#cccccc',
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
    backgroundColor: '#ff9800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%', // Add this to prevent modal from taking full height
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
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    marginBottom: 10,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10, // Add some space above buttons
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#999',
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
    color: '#666',
    fontStyle: 'italic',
  },
  linkButton: {
    backgroundColor: '#2196F3',
    marginTop: 15,
  },
  okButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
  },
  softwareButton: {
    backgroundColor: '#666',
  },
}); 