// English words that are normal in Hinglish, respelled in Devanagari for a Hindi-only voice. Piper's Hindi
// voice reads Latin letters with Hindi sounds (or spells them out), so "alarm" must become "अलार्म". This is
// NOT applied for English voices or for Kokoro, which read Latin text with an English lexicon.
const PAIRS = `
alarm अलार्म|timer टाइमर|reminder रिमाइंडर|set सेट|calendar कैलेंडर|meeting मीटिंग|schedule शेड्यूल
weather वेदर|temperature टेम्परेचर|degrees डिग्री|degree डिग्री|celsius सेल्सियस|rain रेन|cloudy क्लाउडी
overcast ओवरकास्ट|sunny सनी|forecast फोरकास्ट|humidity ह्यूमिडिटी|okay ओके|ok ओके|time टाइम|today टुडे
phone फ़ोन|mobile मोबाइल|message मैसेज|call कॉल|internet इंटरनेट|wifi वाई-फाई|app ऐप|battery बैटरी
google गूगल|notification नोटिफ़िकेशन|minute मिनट|minutes मिनट|second सेकंड|seconds सेकंड|hour घंटा|hours घंटे
sorry सॉरी|thanks थैंक्स|thank थैंक|please प्लीज़|hello हेलो|bye बाय|good गुड|morning मॉर्निंग|night नाइट
evening ईवनिंग|afternoon आफ़्टरनून|news न्यूज़|music म्यूज़िक|song सॉन्ग|video वीडियो|photo फ़ोटो
camera कैमरा|email ईमेल|password पासवर्ड|friend फ़्रेंड|family फ़ैमिली|doctor डॉक्टर|hospital हॉस्पिटल
school स्कूल|office ऑफ़िस|exam एग्ज़ाम|study स्टडी|sleep स्लीप|health हेल्थ|healthy हेल्दी
exercise एक्सरसाइज़|breakfast ब्रेकफ़ास्ट|lunch लंच|dinner डिनर|recipe रेसिपी|story स्टोरी|joke जोक
fact फ़ैक्ट|question क्वेश्चन|answer आंसर|problem प्रॉब्लम|help हेल्प|idea आइडिया|plan प्लान|trip ट्रिप
travel ट्रैवल|ticket टिकट|train ट्रेन|flight फ़्लाइट|cab कैब|traffic ट्रैफ़िक|water वॉटर|coffee कॉफ़ी
sandwich सैंडविच|salad सलाद|oats ओट्स|apple एप्पल|egg एग|lemon लेमन|green ग्रीन|chicken चिकन|boiled बॉइल्ड
free फ़्री|quota कोटा|limit लिमिट|result रिज़ल्ट|calculate कैलकुलेट|total टोटल|plus प्लस|minus माइनस
done डन|yes यस|no नो|sure श्योर|great ग्रेट|nice नाइस|cool कूल|wow वाह|english इंग्लिश|hindi हिंदी
hinglish हिंग्लिश|spanish स्पेनिश|french फ़्रेंच|german जर्मन|translate ट्रांसलेट|word वर्ड
wikipedia विकिपीडिया|search सर्च|online ऑनलाइन|offline ऑफ़लाइन|download डाउनलोड|update अपडेट
`;

export const LOANWORDS: ReadonlyMap<string, string> = new Map(
  PAIRS.split(/[\n|]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [latin, deva] = p.split(/\s+/);
      return [latin, deva] as [string, string];
    }),
);

/** "5 PM" is spoken as the letters, in the Hindi style: पी एम. Lowercase "am" is the English verb, left alone. */
const MERIDIEM: Record<string, string> = { AM: 'ए एम', PM: 'पी एम' };

export function loanwordsToDevanagari(text: string): string {
  return text.replace(/\b[A-Za-z]+\b/g, (w) => MERIDIEM[w] ?? LOANWORDS.get(w.toLowerCase()) ?? w);
}
