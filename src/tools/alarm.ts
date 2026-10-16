import * as IntentLauncher from 'expo-intent-launcher';

// uses the android AlarmClock intent, so the alarm lives in the system Clock app.
// needs com.android.alarm.permission.SET_ALARM in the merged manifest (see app.json).
export async function setAlarm(a: { hour: number; minute: number; label?: string }): Promise<void> {
  await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
    extra: {
      'android.intent.extra.alarm.HOUR': a.hour,
      'android.intent.extra.alarm.MINUTES': a.minute,
      'android.intent.extra.alarm.MESSAGE': a.label ?? 'Voice assistant alarm',
      'android.intent.extra.alarm.SKIP_UI': true,
    },
  });
}
