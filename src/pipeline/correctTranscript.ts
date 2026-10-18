// the speech model reliably mishears a few city names that matter for weather. these are fixed on the transcript
// before the model sees it. a rule only applies in a weather question, so "capital of Bangladesh" is left alone.
const WEATHER_WORDS =
  /\b(weather|forecast|temperature|rain|raining|humid|mausam|barish|garmi|sardi|hot|cold)\b/i;

const CITY_FIXES: [RegExp, string][] = [
  // heard 3 times out of 3 on a real phone for "Bangalore"
  [/\bban(?:g|gla|gal)desh\b/gi, 'Bangalore'],
  [/\bbangal(?:ore|oor|ur)u?\b/gi, 'Bangalore'],
];

export function correctTranscript(text: string): string {
  if (!WEATHER_WORDS.test(text)) return text;
  return CITY_FIXES.reduce((t, [re, to]) => t.replace(re, to), text);
}
