import * as Calendar from 'expo-calendar';
import * as Notifications from 'expo-notifications';
import { PermissionsAndroid, Platform } from 'react-native';

// RECORD_AUDIO is a runtime permission on android 6+, the manifest entry alone isn't enough
export async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const p = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(p)) return true;
  return (await PermissionsAndroid.request(p)) === PermissionsAndroid.RESULTS.GRANTED;
}

// ask for the tool permissions at launch, not on first use. a system dialog can stay open
// longer than a tool's timeout (3-4 s), which made the first reminder or calendar request
// fail. best effort: if the user says no, the tool reports permission_denied when they
// actually ask for that feature.
export async function ensureToolPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.requestPermissionsAsync().catch(() => undefined);
  await Calendar.requestCalendarPermissions().catch(() => undefined);
}
