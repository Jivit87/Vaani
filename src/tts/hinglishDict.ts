// Romanised Hindi → Devanagari for the TTS front end. The prompt already asks the model for Devanagari, but
// models slip into Roman Hinglish, and espeak-ng (via Kokoro, lang "hi") reads Devanagari far better.
//
// Rules for this list: Hindi-origin words only. English loanwords (alarm, reminder, meeting) stay Latin so
// the English lexicon reads them. Words that are also common English ("do", "main", "par", "hum", "is",
// "to", "hi", "me", "us", "din", "teen", "char") are deliberately left out: converting them would corrupt
// English replies.
const PAIRS = `
kal कल|aaj आज|parso परसों|subah सुबह|savere सवेरे|dopahar दोपहर|shaam शाम|raat रात|baje बजे|ghanta घंटा
ghante घंटे|hafta हफ़्ता|mahina महीना|saal साल|abhi अभी|jaldi जल्दी|der देर|pehle पहले|baad बाद|phir फिर
somvar सोमवार|mangalvar मंगलवार|budhvar बुधवार|guruvar गुरुवार|shukravar शुक्रवार|shanivar शनिवार|ravivar रविवार
saat सात|paanch पाँच|panch पाँच|chhe छह|chhah छह|aath आठ|nau नौ|das दस|gyarah ग्यारह|barah बारह|ek एक
sawa सवा|dedh डेढ़|dhai ढाई|saadhe साढ़े|paune पौने
karo करो|karna करना|karein करें|kiya किया|karenge करेंगे|batao बताओ|bata बता|bataiye बताइए|lagao लगाओ
laga लगा|lagana लगाना|lagaya लगाया|hatao हटाओ|suno सुनो|dekho देखो|dikhao दिखाओ|chalo चलो|ruko रुको
bolo बोलो|bolna बोलना|sunao सुनाओ|jao जाओ|aao आओ|dena देना|lena लेना|rakho रखो|yaad याद|jagao जगाओ
uthao उठाओ|samajh समझ|samjha समझा|chahiye चाहिए|chahta चाहता|chahti चाहती|sakta सकता|sakti सकती
milega मिलेगा|hoga होगा|hogi होगी|rahega रहेगा|rahegi रहेगी|gaya गया|gayi गई|hua हुआ|hui हुई
ho हो|hai है|hain हैं|tha था|thi थी|raha रहा|rahi रही|rahe रहे|boliye बोलिए|kijiye कीजिए|dijiye दीजिए|ji जी
haan हाँ|nahi नहीं|nahin नहीं|theek ठीक|accha अच्छा|achha अच्छा|shukriya शुक्रिया|dhanyavaad धन्यवाद
namaste नमस्ते|kripya कृपया|maaf माफ़
kya क्या|kaise कैसे|kaisa कैसा|kaisi कैसी|kab कब|kahan कहाँ|kaun कौन|kitna कितना|kitne कितने|kitni कितनी
kyun क्यों|kyon क्यों|konsa कौनसा
mausam मौसम|barish बारिश|garmi गर्मी|sardi सर्दी|dhoop धूप|badal बादल|hawa हवा|tapman तापमान|thanda ठंडा
garam गरम|nami नमी
mujhe मुझे|mujhko मुझको|mera मेरा|meri मेरी|mere मेरे|tumhara तुम्हारा|tumhe तुम्हें|aap आप|aapka आपका
aapki आपकी|aapke आपके|tum तुम|humara हमारा|yeh यह|ye ये|woh वो|wo वो|isse इससे|usse उससे|yahan यहाँ
wahan वहाँ|idhar इधर|udhar उधर|aur और|ya या|lekin लेकिन|magar मगर|toh तो|ki की|ka का|ke के|ko को|se से
mein में|pe पे|tak तक|bhi भी|sirf सिर्फ़|bas बस|sab सब|kuch कुछ|koi कोई|har हर|dono दोनों|zyada ज़्यादा
jyada ज़्यादा|kam कम|bahut बहुत|thoda थोड़ा|bilkul बिल्कुल|zaroor ज़रूर|shayad शायद|ab अब
ghar घर|kaam काम|log लोग|dost दोस्त|paani पानी|khana खाना|dawai दवाई|dawa दवा|naam नाम|pata पता
shehar शहर|desh देश
`;

export const ROMAN_TO_DEVANAGARI: ReadonlyMap<string, string> = new Map(
  PAIRS.split(/[\n|]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const [roman, deva] = p.split(/\s+/);
      return [roman, deva] as [string, string];
    }),
);

/** Replaces whole Latin words that are Hindi with their Devanagari spelling; everything else is untouched. */
export function romanizedHindiToDevanagari(text: string): string {
  return text.replace(/\b[A-Za-z]+\b/g, (w) => ROMAN_TO_DEVANAGARI.get(w.toLowerCase()) ?? w);
}
