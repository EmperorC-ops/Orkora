import { Stack } from 'expo-router';

export default function EventLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="register" />
      <Stack.Screen name="ticket" />
    </Stack>
  );
}
