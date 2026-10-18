import type { Lang } from './types';

// a fixed line the app says itself. `show` is for the screen, `say` is what the (hindi) voice reads,
// already written in devanagari as it sounds, same as the model's replies.
export interface Line {
  show: string;
  say: string;
}

export const LINES = {
  // used only when the model said nothing. "done" is claimed only if a tool really worked
  done: {
    en: { show: 'Done.', say: 'डन।' },
    hi: { show: 'हो गया।', say: 'हो गया।' },
  },
  noAnswer: {
    en: {
      show: "Sorry, I didn't get that. Could you say it again?",
      say: 'सॉरी, आई डिडन्ट गेट दैट। कुड यू से इट अगेन?',
    },
    hi: {
      show: 'माफ़ कीजिए, मैं समझ नहीं पाई। क्या आप फिर से बोल सकते हैं?',
      say: 'माफ़ कीजिए, मैं समझ नहीं पाई। क्या आप फिर से बोल सकते हैं?',
    },
  },
  // played while a tool runs so the wait isn't silent
  filler: {
    en: { show: 'One second, let me check.', say: 'वन सेकंड, लेट मी चेक।' },
    hi: { show: 'एक second, मैं check करती हूँ।', say: 'एक सेकंड, मैं चेक करती हूँ।' },
  },
  offline: {
    en: {
      show: "I can't reach the internet right now, but I can still hear you.",
      say: 'आई कांट रीच द इंटरनेट राइट नाउ, बट आई कैन स्टिल हियर यू।',
    },
    hi: {
      show: 'अभी internet नहीं है, पर मैं सुन सकती हूँ।',
      say: 'अभी इंटरनेट नहीं है, पर मैं सुन सकती हूँ।',
    },
  },
  error: {
    en: {
      show: 'Sorry, something went wrong. Please try again.',
      say: 'सॉरी, समथिंग वेंट रॉन्ग। प्लीज़ ट्राई अगेन।',
    },
    hi: {
      show: 'माफ़ कीजिए, कुछ गड़बड़ हो गई। फिर से कोशिश कीजिए।',
      say: 'माफ़ कीजिए, कुछ गड़बड़ हो गई। फिर से कोशिश कीजिए।',
    },
  },
  rateLimit: {
    en: {
      show: "I've used up my free thinking quota for a bit. Please try again in a few minutes.",
      say: 'आई हैव यूज़्ड अप माई फ़्री थिंकिंग कोटा फॉर अ बिट। प्लीज़ ट्राई अगेन इन अ फ़्यू मिनट्स।',
    },
    hi: {
      show: 'मेरा free कोटा अभी ख़त्म हो गया है। कुछ मिनट बाद फिर कोशिश कीजिए।',
      say: 'मेरा फ़्री कोटा अभी ख़त्म हो गया है। कुछ मिनट बाद फिर कोशिश कीजिए।',
    },
  },
} satisfies Record<string, Record<Lang, Line>>;
