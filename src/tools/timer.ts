import * as IntentLauncher from 'expo-intent-launcher';

/** Android's AlarmClock timer intent; the countdown lives in the system Clock app and rings there. */
export async function setTimer(t: { seconds: number; label?: string }): Promise<void> {
  await IntentLauncher.startActivityAsync('android.intent.action.SET_TIMER', {
    extra: {
      'android.intent.extra.alarm.LENGTH': t.seconds,
      'android.intent.extra.alarm.MESSAGE': t.label ?? 'Voice assistant timer',
      'android.intent.extra.alarm.SKIP_UI': true,
    },
  });
}
