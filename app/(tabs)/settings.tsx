import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText as Text } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { createTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/useColorScheme';
import { appSecurityService } from '@/services/AppSecurityService';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const theme = createTheme(colorScheme ?? 'light');
  
  const [securityStatus, setSecurityStatus] = useState<any>(null);

  React.useEffect(() => {
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

  const handleSecurityPress = () => {
    router.push('/(tabs)/security');
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 20 }
        ]}
      >
        <View style={styles.content}>          
          <View style={[styles.section, { backgroundColor: theme.colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="shield-checkmark" size={24} color={theme.colors.primary} />
              <Text style={styles.sectionTitle}>Security</Text>
            </View>
            
            <TouchableOpacity
              style={[styles.settingRow, { borderBottomColor: theme.colors.border }]}
              onPress={handleSecurityPress}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>App Security</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  Configure PIN, biometric authentication, and auto-lock
                </Text>
              </View>
              <View style={styles.settingStatus}>
                {securityStatus && (
                  <View style={styles.statusIndicators}>
                    {securityStatus.useBiometric && (
                      <Ionicons name="finger-print" size={16} color={theme.colors.success} />
                    )}
                    {securityStatus.usePIN && (
                      <Ionicons name="keypad" size={16} color={theme.colors.success} />
                    )}
                    {!securityStatus.useBiometric && !securityStatus.usePIN && (
                      <Text style={[styles.statusText, { color: theme.colors.error }]}>Disabled</Text>
                    )}
                  </View>
                )}
                <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Wallet Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="wallet" size={24} color={theme.colors.primary} />
              <Text style={styles.sectionTitle}>Wallet</Text>
            </View>
            
            <TouchableOpacity
              style={[styles.settingRow, { borderBottomColor: theme.colors.border }]}
              onPress={() => Alert.alert('Coming Soon', 'Wallet backup and recovery features will be available soon.')}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Backup & Recovery</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  Export wallet data and recovery phrases
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingRow, { borderBottomColor: theme.colors.border }]}
              onPress={() => Alert.alert('Coming Soon', 'Wallet import features will be available soon.')}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Import Wallet</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  Import existing wallet using mnemonic or private key
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Network Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="globe" size={24} color={theme.colors.primary} />
              <Text style={styles.sectionTitle}>Network</Text>
            </View>
            
            <TouchableOpacity
              style={[styles.settingRow, { borderBottomColor: theme.colors.border }]}
              onPress={() => Alert.alert('Coming Soon', 'Network configuration will be available soon.')}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Network Settings</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  Configure RPC endpoints and network preferences
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingRow, { borderBottomColor: theme.colors.border }]}
              onPress={() => Alert.alert('Coming Soon', 'Gas settings will be available soon.')}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Gas Settings</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  Configure default gas limits and prices
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* App Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="settings" size={24} color={theme.colors.primary} />
              <Text style={styles.sectionTitle}>App</Text>
            </View>
            
            <TouchableOpacity
              style={[styles.settingRow, { borderBottomColor: theme.colors.border }]}
              onPress={() => Alert.alert('Coming Soon', 'Theme settings will be available soon.')}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Theme</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  Light, dark, or automatic theme selection
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingRow, { borderBottomColor: theme.colors.border }]}
              onPress={() => Alert.alert('Coming Soon', 'Language settings will be available soon.')}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Language</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  Choose your preferred language
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingRow, { borderBottomColor: theme.colors.border }]}
              onPress={() => Alert.alert('Coming Soon', 'Notifications settings will be available soon.')}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Notifications</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  Configure transaction and security notifications
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* About Section */}
          <View style={[styles.section, { backgroundColor: theme.colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="information-circle" size={24} color={theme.colors.primary} />
              <Text style={styles.sectionTitle}>About</Text>
            </View>
            
            <TouchableOpacity
              style={[styles.settingRow, { borderBottomColor: theme.colors.border }]}
              onPress={() => Alert.alert('Version', 'Wallet POC v1.0.3\n\nA secure hardware wallet implementation with iOS Secure Enclave integration.')}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Version</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  v1.0.3
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingRow, { borderBottomColor: theme.colors.border }]}
              onPress={() => Alert.alert('Coming Soon', 'Privacy policy will be available soon.')}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Privacy Policy</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  Read our privacy policy
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingRow, { borderBottomColor: theme.colors.border }]}
              onPress={() => Alert.alert('Coming Soon', 'Terms of service will be available soon.')}
            >
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Terms of Service</Text>
                <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
                  Read our terms of service
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    paddingTop: 20,
    marginBottom: 20,
  },
  section: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
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
    padding: 16,
    borderBottomWidth: 1,
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
  settingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicators: {
    flexDirection: 'row',
    gap: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
}); 