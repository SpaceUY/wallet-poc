import React, { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleProp, StyleSheet, TextInput, TouchableOpacity, TouchableWithoutFeedback, ViewStyle } from 'react-native';
import { useAccount, useDisconnect } from "wagmi";

import { ThemedText as Text } from '@/components/ThemedText';
import { ThemedView as View } from '@/components/ThemedView';
import { createTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/useColorScheme';
import { walletOrchestrator } from '@/services/WalletOrchestrator';
import { WalletInfo } from '@/types/wallet';
import Clipboard from '@react-native-clipboard/clipboard';
import { useAppKit } from "@reown/appkit-wagmi-react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface TxInfo {
  to: string;
  amount: string;
}

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

function WalletScreen() {
  const insets = useSafeAreaInsets();
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  
  const colorScheme = useColorScheme();
  const theme = createTheme(colorScheme ?? 'light');
  
  // State
  const [status, setStatus] = useState('Ready');
  const [walletInfo, setWalletInfo] = useState<WalletInfo>({} as WalletInfo);
  const [txInfo, setTxInfo] = useState<TxInfo>({ to: '', amount: '0.001' });
  const [isSendModalVisible, setIsSendModalVisible] = useState(false);
  const [isSuccessModalVisible, setIsSuccessModalVisible] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingWallet, setIsCheckingWallet] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const updateStatus = useCallback((message: string) => {
    console.log('Status:', message);
    setStatus(message);
  }, []);

  const handleError = useCallback((error: unknown, context: string) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`${context}:`, error);
    updateStatus(`${context}: ${message}`);
    return message;
  }, [updateStatus]);

  const copyToClipboard = (text: string, successMessage: string) => {
    Clipboard.setString(text);
    updateStatus(successMessage);
  };

  // Wallet Operations
  const getBalance = useCallback(async () => {
    if (!walletInfo.address) {
      updateStatus('No wallet address available');
      return;
    }
    
    try {
      setIsLoading(true);
      updateStatus('Getting balance...');
      const balance = await walletOrchestrator.getBalance(walletInfo.address);
      setWalletInfo(prev => ({ ...prev, balance }));
      updateStatus('Balance updated!');
    } catch (error) {
      handleError(error, 'Error getting balance');
    } finally {
      setIsLoading(false);
    }
  }, [handleError, updateStatus, walletInfo.address]);

  const createWallet = async (isSoftware: boolean) => {
    try {
      setIsLoading(true);
      updateStatus(`Creating ${isSoftware ? 'software' : 'hardware'} wallet...`);
      
      const result = await walletOrchestrator.createWallet(isSoftware);
      setWalletInfo({ address: result.address, type: result.type });
      updateStatus(`${isSoftware ? 'Software' : 'Hardware'} wallet created successfully!`);
      
      await getBalance();
      
      if (isSoftware && result.mnemonic) {
        Alert.alert(
          '🔐 Backup Your Wallet',
          `Your wallet has been created!\n\nMnemonic: ${result.mnemonic}\n\n⚠️ Write this down and keep it safe. You'll need it to recover your wallet.`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      handleError(error, 'Error creating wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteWallet = async () => {
    Alert.alert(
      'Delete Wallet',
      'Are you sure you want to delete your wallet? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              updateStatus('Deleting wallet...');
              await walletOrchestrator.deleteWallet();
              setWalletInfo({} as WalletInfo);
              updateStatus('Wallet deleted successfully');
            } catch (error) {
              handleError(error, 'Error deleting wallet');
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  const connectExternalWallet = async () => {
    try {
      updateStatus('Opening WalletConnect modal...');
      setIsConnecting(true);
      
      // Set timeout for connection
      const connectionTimeout = setTimeout(() => {
        if (isConnecting && !isConnected) {
          setIsConnecting(false);
          updateStatus('Connection timed out - please try again');
        }
      }, 30000);

      await open();
      updateStatus('Modal opened - select a wallet to connect');
      
      // Clean up on successful connection
      if (isConnected && address) {
        clearTimeout(connectionTimeout);
        setIsConnecting(false);
      }
      
    } catch (error) {
      setIsConnecting(false);
      const errorMessage = handleError(error, 'Error opening WalletConnect modal');
      
      Alert.alert(
        'Connection Error',
        `Failed to open wallet connection modal:\n\n${errorMessage}\n\nPlease make sure you have a compatible wallet app installed.`,
        [{ text: 'OK' }]
      );
    }
  };

  const disconnectExternalWallet = async () => {
    try {
      setIsLoading(true);
      updateStatus('Disconnecting WalletConnect...');
      await disconnect();
      setWalletInfo({} as WalletInfo);
      updateStatus('WalletConnect disconnected');
    } catch (error) {
      handleError(error, 'Error disconnecting WalletConnect');
    } finally {
      setIsLoading(false);
    }
  };

  const sendTransaction = async () => {
    if (!walletInfo.address) {
      Alert.alert('No Wallet', 'Please create or connect a wallet first.');
      return;
    }

    if (!txInfo.to || !txInfo.amount) {
      Alert.alert('Invalid Input', 'Please enter a valid recipient address and amount.');
      return;
    }

    try {
      updateStatus('Estimating gas...');
      const gasEstimate = await walletOrchestrator.estimateGas(txInfo.to, txInfo.amount);

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
                setIsLoading(true);
                updateStatus('Sending transaction...');
                
                const tx = await walletOrchestrator.sendTransaction(txInfo.to, txInfo.amount);
                setLastTxHash(tx.hash);
                setIsSendModalVisible(false);
                setIsSuccessModalVisible(true);
                
                updateStatus('Waiting for confirmation...');
                await tx.wait(1);
                updateStatus('Transaction confirmed!');
                await getBalance();
              } catch (error) {
                handleError(error, 'Transaction failed');
                Alert.alert('Transaction Failed', 'The transaction could not be completed. Please try again.');
              } finally {
                setIsLoading(false);
              }
            }
          }
        ]
      );
    } catch (error) {
      handleError(error, 'Error sending transaction');
    }
  };

  const viewPrivateKey = async () => {
    if (walletInfo.type !== 'software') {
      Alert.alert('Not Available', 'Private key viewing is only available for software wallets.');
      return;
    }

    try {
      updateStatus('Retrieving private key...');
      const { softwareWalletService } = await import('@/services/SoftwareWalletService');
      const storedWalletInfo = await softwareWalletService['getStoredWalletInfo']();
      
      if (storedWalletInfo) {
        Alert.alert(
          '🔐 Private Key',
          `Your wallet's private key:\n\n${storedWalletInfo.privateKey}\n\nKeep this safe and never share it!`,
          [
            {
              text: 'Copy to Clipboard',
              onPress: () => copyToClipboard(storedWalletInfo.privateKey, 'Private key copied to clipboard!')
            },
            { text: 'Close' }
          ]
        );
      } else {
        updateStatus('Could not retrieve private key');
      }
    } catch (error) {
      handleError(error, 'Error viewing private key');
    }
  };

  const viewSeedPhrase = async () => {
    try {
      updateStatus('Retrieving mnemonic...');
      const { softwareWalletService } = await import('@/services/SoftwareWalletService');
      const mnemonic = await softwareWalletService.getMnemonic();
      
      if (mnemonic) {
        Alert.alert(
          '🔐 Seed Phrase',
          `Your wallet's seed phrase:\n\n${mnemonic}\n\nKeep this safe and never share it!`,
          [
            {
              text: 'Copy to Clipboard',
              onPress: () => copyToClipboard(mnemonic, 'Seed phrase copied to clipboard!')
            },
            { text: 'Close' }
          ]
        );
      } else {
        updateStatus('No mnemonic found');
        Alert.alert('No Mnemonic', 'No mnemonic found for this wallet.');
      }
    } catch (error) {
      handleError(error, 'Error getting mnemonic');
    }
  };

  // Effects
  useEffect(() => {
    if (isConnected && address) {
      setIsConnecting(false);
      updateStatus('WalletConnect connected successfully!');
      setWalletInfo({ address, type: 'external' });
      // Auto-refresh balance when connected
      getBalance();
    } else if (!isConnected && walletInfo.type === 'external') {
      setIsConnecting(false);
      setWalletInfo({} as WalletInfo);
      updateStatus('WalletConnect disconnected');
    }
  }, [isConnected, address, getBalance, walletInfo.type, updateStatus]);

  useEffect(() => {
    if (!isConnected && !isCheckingWallet && isConnecting) {
      setIsConnecting(false);
    }
  }, [isConnected, isCheckingWallet, isConnecting]);

  useEffect(() => {
    const checkWallet = async () => {
      try {
        updateStatus('Checking for existing wallet...');
        setIsCheckingWallet(true);
        
        // Check WalletConnect first
        if (isConnected && address) {
          setWalletInfo({ address, type: 'external' });
          updateStatus('WalletConnect wallet connected, getting balance...');
          const balance = await walletOrchestrator.getBalance(address);
          setWalletInfo(prev => ({ ...prev, balance }));
          updateStatus('WalletConnect wallet restored successfully!');
          return;
        }
        
        // Check for local wallet
        const actualAddress = await walletOrchestrator.getActualSigningAddress();
        if (actualAddress) {
          const existingWallet = await walletOrchestrator.checkExistingWallet();
          if (!existingWallet) {
            updateStatus('No existing wallet found');
            return;
          }
          setWalletInfo({ address: actualAddress, type: existingWallet?.type });
          updateStatus('Found existing wallet, getting balance...');
          
          const balance = await walletOrchestrator.getBalance(actualAddress);
          setWalletInfo(prev => ({ ...prev, balance }));
          updateStatus('Wallet restored successfully!');
        } else {
          updateStatus('No existing wallet found');
        }
      } catch (error) {
        handleError(error, 'Error checking wallet');
      } finally {
        setIsCheckingWallet(false);
      }
    };
    
    checkWallet();
  }, [isConnected, address, handleError, updateStatus]);

  const renderWalletInfo = () => (
    <View style={[styles.card, { backgroundColor: theme.colors.cardBackground, borderColor: theme.colors.border }]}>
      <InfoRow label="Status" value={status} />
      
      {/* TODO: can be removed in production */}
      <InfoRow label="WalletConnect Debug" value={`Connected: ${isConnected ? 'Yes' : 'No'}`} />
      <InfoRow label="" value={`Address: ${address || 'None'}`} />
      
      {walletInfo.address && (
        <>
          <Text style={styles.label}>Address:</Text>
          <TouchableOpacity onPress={() => copyToClipboard(walletInfo.address!, 'Address copied to clipboard!')}>
            <Text style={[styles.value, styles.address]} numberOfLines={1} ellipsizeMode="middle">
              {walletInfo.address}
            </Text>
          </TouchableOpacity>
          
          <InfoRow label="Balance" value={`${walletInfo.balance || '0.0'} ETH`} />
          
          {walletInfo.type && <InfoRow label="Type" value={walletInfo.type} />}
        </>
      )}
    </View>
  );

  const renderNoWalletButtons = () => (
    <>
      <ActionButton
        title={isCheckingWallet ? 'Checking Wallet...' : 'Create Hardware Wallet'}
        onPress={() => createWallet(false)}
        disabled={isCheckingWallet || isLoading}
        backgroundColor={theme.colors.buttonPrimary}
      />
      <ActionButton
        title={isCheckingWallet ? 'Checking Wallet...' : 'Create Software Wallet'}
        onPress={() => createWallet(true)}
        disabled={isCheckingWallet || isLoading}
        backgroundColor={theme.colors.buttonSuccess}
      />
      <ActionButton
        title={isCheckingWallet ? 'Checking Wallet...' : isConnecting ? 'Connecting...' : 'Connect External Wallet'}
        onPress={connectExternalWallet}
        disabled={isCheckingWallet || isConnecting || isLoading}
        backgroundColor={theme.colors.buttonPrimary}
      />
    </>
  );

  const renderWalletButtons = () => (
    <>
      <ActionButton
        title="Refresh Balance"
        onPress={getBalance}
        disabled={isLoading}
        backgroundColor={theme.colors.buttonSecondary}
      />
      <ActionButton
        title="Send Transaction"
        onPress={() => setIsSendModalVisible(true)}
        disabled={isLoading}
        backgroundColor={theme.colors.buttonPrimary}
      />
      
      {walletInfo.type === 'software' && (
        <>
          <ActionButton
            title="View Private Key"
            onPress={viewPrivateKey}
            disabled={isLoading}
            backgroundColor={theme.colors.buttonWarning}
          />
          <ActionButton
            title="View Seed Phrase"
            onPress={viewSeedPhrase}
            disabled={isLoading}
            backgroundColor={theme.colors.buttonWarning}
          />
        </>
      )}
      
      <ActionButton
        title={walletInfo.type === 'external' ? 'Disconnect Wallet' : 'Delete Wallet'}
        onPress={walletInfo.type === 'external' ? disconnectExternalWallet : deleteWallet}
        disabled={isLoading}
        backgroundColor={theme.colors.buttonDanger}
        style={styles.deleteButton}
      />
    </>
  );

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
              {renderWalletInfo()}
              
              <View style={styles.buttonContainer}>
                {!walletInfo.address ? renderNoWalletButtons() : renderWalletButtons()}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>

      {/* Send Transaction Modal */}
      <TransactionModal
        visible={isSendModalVisible}
        onClose={() => setIsSendModalVisible(false)}
        onSend={sendTransaction}
        txInfo={txInfo}
        setTxInfo={setTxInfo}
        isLoading={isLoading}
        theme={theme}
        insets={insets}
      />

      {/* Success Modal */}
      <SuccessModal
        visible={isSuccessModalVisible}
        onClose={() => setIsSuccessModalVisible(false)}
        txHash={lastTxHash}
        isConfirming={isLoading}
        theme={theme}
        insets={insets}
      />
    </ErrorBoundary>
  );
}

type InfoRowProps = {
  label: string;
  value: string;
};

const InfoRow = ({ label, value }: InfoRowProps) => (
  <>
    {label && <Text style={styles.label}>{label}:</Text>}
    <Text style={styles.value}>{value}</Text>
  </>
);

type ActionButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  backgroundColor: string;
  style?: StyleProp<ViewStyle>;
};

const ActionButton = ({ title, onPress, disabled = false, backgroundColor, style }: ActionButtonProps) => (
  <TouchableOpacity 
    style={[
      styles.button, 
      { backgroundColor: disabled ? '#ccc' : backgroundColor },
      style
    ]} 
    onPress={onPress}
    activeOpacity={0.7}
    disabled={disabled}
  >
    <Text style={styles.buttonText}>{title}</Text>
  </TouchableOpacity>
);

type TransactionModalProps = {
  visible: boolean;
  onClose: () => void;
  onSend: () => void;
  txInfo: TxInfo;
  setTxInfo: React.Dispatch<React.SetStateAction<TxInfo>>;
  isLoading: boolean;
  theme: any;
  insets: any;
};

const TransactionModal = ({ visible, onClose, onSend, txInfo, setTxInfo, isLoading, theme, insets }: TransactionModalProps) => (
  <Modal
    animationType="slide"
    transparent={true}
    visible={visible}
    onRequestClose={onClose}
  >
    <TouchableWithoutFeedback onPress={onClose}>
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
                style={[styles.input, { 
                  backgroundColor: theme.colors.inputBackground, 
                  borderColor: theme.colors.inputBorder 
                }]}
                value={txInfo.to}
                onChangeText={(text) => setTxInfo(prev => ({ ...prev, to: text }))}
                placeholder="0x..."
                placeholderTextColor={theme.colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
              />
              
              <Text style={styles.label}>Amount (ETH):</Text>
              <TextInput
                style={[styles.input, { 
                  backgroundColor: theme.colors.inputBackground, 
                  borderColor: theme.colors.inputBorder 
                }]}
                value={txInfo.amount}
                onChangeText={(text) => setTxInfo(prev => ({ ...prev, amount: text }))}
                placeholder="0.001"
                placeholderTextColor={theme.colors.placeholder}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.modalButtons}>
              <ActionButton
                title="Cancel"
                onPress={onClose}
                backgroundColor={theme.colors.buttonSecondary}
                style={styles.cancelButton}
              />
              <ActionButton
                title={isLoading ? 'Sending...' : 'Send'}
                onPress={onSend}
                disabled={isLoading}
                backgroundColor={theme.colors.buttonPrimary}
              />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  </Modal>
);

type SuccessModalProps = {
  visible: boolean;
  onClose: () => void;
  txHash: string | null;
  isConfirming: boolean;
  theme: any;
  insets: any;
};

const SuccessModal = ({ visible, onClose, txHash, isConfirming, theme, insets }: SuccessModalProps) => (
  <Modal
    animationType="slide"
    transparent={true}
    visible={visible}
    onRequestClose={onClose}
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
          <InfoRow label="Transaction Hash" value={txHash || ''} />

          {txHash && (
            <ActionButton
              title="View on Etherscan"
              onPress={() => Linking.openURL(`https://sepolia.etherscan.io/tx/${txHash}`)}
              backgroundColor={theme.colors.link}
              style={styles.linkButton}
            />
          )}

          {isConfirming && (
            <Text style={[styles.confirmingText, { color: theme.colors.placeholder }]}>
              Waiting for confirmation...
            </Text>
          )}
        </View>

        <View style={styles.modalButtons}>
          <ActionButton
            title="Close"
            onPress={onClose}
            backgroundColor={theme.colors.buttonSuccess}
            style={styles.okButton}
          />
        </View>
      </View>
    </View>
  </Modal>
);

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
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
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
});export default WalletScreen;

