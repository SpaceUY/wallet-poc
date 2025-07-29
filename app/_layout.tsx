import { SafeAreaProvider } from 'react-native-safe-area-context';
import WalletScreen from './wallet';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <WalletScreen />
    </SafeAreaProvider>
  );
}
