import "@walletconnect/react-native-compat";

import {
  AppKit,
  createAppKit,
  defaultWagmiConfig,
} from "@reown/appkit-wagmi-react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mainnet, sepolia } from "@wagmi/core/chains";
import { useEffect, useState } from 'react';

import AppLockScreen from '@/components/AppLockScreen';
import { appSecurityService } from '@/services/AppSecurityService';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { WagmiProvider } from "wagmi";

// 0. Setup queryClient
const queryClient = new QueryClient();

// 1. Get projectId from https://dashboard.reown.com
const projectId = "83fa8948796c41d3d7a881757da2a28f";

// 2. Create config
const metadata = {
  name: "Secure Wallet",
  description: "A secure multi-chain wallet",
  url: "https://reown.com/appkit",
  icons: ["https://avatars.githubusercontent.com/u/179229932"],
  redirect: {
    native: "wallet-poc://",
    universal: "https://wallet-poc.vercel.app", // Add a universal link
  },
};

const chains = [mainnet, sepolia] as const;

const wagmiConfig = defaultWagmiConfig({ chains, projectId, metadata });

// 3. Create modal
createAppKit({
  projectId,
  metadata,
  wagmiConfig,
  defaultChain: sepolia, // Use Sepolia as default for testing
  enableAnalytics: true,
});

export default function RootLayout() {
  const [isAppLocked, setIsAppLocked] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    initializeAppSecurity();
  }, []);

  const initializeAppSecurity = async () => {
    try {
      await appSecurityService.initialize();
      const locked = await appSecurityService.isAppLocked();
      setIsAppLocked(locked);
    } catch (error) {
      console.error('Error initializing app security:', error);
      setIsAppLocked(true);
    } finally {
      setIsInitialized(true);
    }
  };

  const handleUnlock = () => {
    setIsAppLocked(false);
  };

  if (!isInitialized) {
    return null; 
  }

  if (isAppLocked) {
    return (
      <SafeAreaProvider>
        <AppLockScreen onUnlock={handleUnlock} />
      </SafeAreaProvider>
    );
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
          <AppKit />
        </SafeAreaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
