import { Stack } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SettingsLayout() {
  return (
    <Stack>
      <Stack.Screen 
        name="index" 
        options={{ 
          title: 'Settings',
          headerShown: false 
        }} 
      />
      <Stack.Screen 
        name="security" 
        options={{ 
          title: 'Security Settings',
          headerShown: true
        }} 
      />
    </Stack>
  );
} 