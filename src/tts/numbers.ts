const EN_ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function numberToEnglish(n: number): string {
  if (!Number.isInteger(n) || n < 0) return String(n);
  if (n < 20) return EN_ONES[n];
  if (n < 100) return EN_TENS[Math.floor(n / 10)] + (n % 10 ? ` ${EN_ONES[n % 10]}` : '');
  if (n < 1000) {
    const rest = n % 100;
    return `${EN_ONES[Math.floor(n / 100)]} hundred${rest ? ` ${numberToEnglish(rest)}` : ''}`;
  }
  if (n < 1_000_000) {
    const rest = n % 1000;
    return `${numberToEnglish(Math.floor(n / 1000))} thousand${rest ? ` ${numberToEnglish(rest)}` : ''}`;
  }
  return String(n)
    .split('')
    .map((d) => EN_ONES[Number(d)])
    .join(' ');
}

// Hindi number names are irregular up to 100, so they are listed rather than generated.
const HI_0_100 = (
  'शून्य एक दो तीन चार पाँच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस ' +
  'बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस ' +
  'पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस चालीस इकतालीस बयालीस तैंतालीस चौवालीस पैंतालीस छियालीस ' +
  'सैंतालीस अड़तालीस उनचास पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ ' +
  'इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर ' +
  'पचहत्तर छिहत्तर सतहत्तर अठहत्तर उनासी अस्सी इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी ' +
  'अट्ठासी नवासी नब्बे इक्यानवे बानवे तिरानवे चौरानवे पंचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे सौ'
).split(' ');

export function numberToHindi(n: number): string {
  if (Number.isInteger(n) && n >= 0 && n <= 100) return HI_0_100[n];
  return numberToEnglish(n); // larger numbers are rare in replies; English words are still speakable
}
