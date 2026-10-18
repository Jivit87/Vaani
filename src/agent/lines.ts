import type { Lang } from './types';

// a fixed line the app says itself. `show` is for the screen, `say` is what the voice reads.
export interface Line {
  show: string;
  say: string;
}

export const LINES = {
  // used only when the model said nothing. "done" is claimed only if a tool really worked
  done: {
    en: { show: 'Done.', say: 'Done.' },
    hi: { show: 'हो गया।', say: 'हो गया।' },
  },
  noAnswer: {
    en: {
      show: "Sorry, I didn't get that. Could you say it again?",
      say: "Sorry, I didn't get that. Could you say it again?",
    },
    hi: {
      show: 'माफ़ कीजिए, मैं समझ नहीं पाया। क्या आप फिर से बोल सकते हैं?',
      say: 'माफ़ कीजिए, मैं समझ नहीं पाया। क्या आप फिर से बोल सकते हैं?',
    },
  },
  // played while a tool runs so the wait isn't silent
  filler: {
    en: { show: 'One second, let me check.', say: 'One second, let me check.' },
    hi: { show: 'एक second, मैं check करता हूँ।', say: 'एक सेकंड, मैं चेक करता हूँ।' },
  },
  offline: {
    en: {
      show: "I can't reach the internet right now, but I can still hear you.",
      say: "I can't reach the internet right now, but I can still hear you.",
    },
    hi: {
      show: 'अभी internet नहीं है, पर मैं सुन सकता हूँ।',
      say: 'अभी इंटरनेट नहीं है, पर मैं सुन सकता हूँ।',
    },
  },
  error: {
    en: {
      show: 'Sorry, something went wrong. Please try again.',
      say: 'Sorry, something went wrong. Please try again.',
    },
    hi: {
      show: 'माफ़ कीजिए, कुछ गड़बड़ हो गई। फिर से कोशिश कीजिए।',
      say: 'माफ़ कीजिए, कुछ गड़बड़ हो गई। फिर से कोशिश कीजिए।',
    },
  },
  rateLimit: {
    en: {
      show: "I've used up my free thinking quota for a bit. Please try again in a few minutes.",
      say: "I've used up my free thinking quota for a bit. Please try again in a few minutes.",
    },
    hi: {
      show: 'मेरा free कोटा अभी ख़त्म हो गया है। कुछ मिनट बाद फिर कोशिश कीजिए।',
      say: 'मेरा फ़्री कोटा अभी ख़त्म हो गया है। कुछ मिनट बाद फिर कोशिश कीजिए।',
    },
  },
} satisfies Record<string, Record<Lang, Line>>;
