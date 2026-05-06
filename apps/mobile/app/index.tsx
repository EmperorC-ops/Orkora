import { Redirect } from 'expo-router';

export default function Index() {
  // On launch, route to the event code entry screen.
  // Later: check for a cached session and skip to (event)/home if present.
  return <Redirect href="/(auth)/code" />;
}
