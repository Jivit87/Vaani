// coordinates for the cities people ask about, so a weather question needs one network call instead of two
// (looking the city up first took about 1.5-2 s on the phone). anything not listed still goes through geocoding.
export interface City {
  name: string;
  latitude: number;
  longitude: number;
}

const LIST: [string, number, number, string[]?][] = [
  ['Mumbai', 19.076, 72.8777, ['bombay']],
  ['Delhi', 28.6139, 77.209, ['new delhi']],
  ['Bangalore', 12.9716, 77.5946, ['bengaluru', 'banglore', 'bangaluru']],
  ['Hyderabad', 17.385, 78.4867],
  ['Chennai', 13.0827, 80.2707, ['madras']],
  ['Kolkata', 22.5726, 88.3639, ['calcutta']],
  ['Pune', 18.5204, 73.8567, ['poona']],
  ['Ahmedabad', 23.0225, 72.5714],
  ['Jaipur', 26.9124, 75.7873],
  ['Surat', 21.1702, 72.8311],
  ['Lucknow', 26.8467, 80.9462],
  ['Kanpur', 26.4499, 80.3319],
  ['Nagpur', 21.1458, 79.0882],
  ['Indore', 22.7196, 75.8577],
  ['Bhopal', 23.2599, 77.4126],
  ['Visakhapatnam', 17.6868, 83.2185, ['vizag']],
  ['Patna', 25.5941, 85.1376],
  ['Vadodara', 22.3072, 73.1812, ['baroda']],
  ['Ludhiana', 30.901, 75.8573],
  ['Agra', 27.1767, 78.0081],
  ['Nashik', 19.9975, 73.7898],
  ['Varanasi', 25.3176, 82.9739, ['banaras', 'benares']],
  ['Srinagar', 34.0837, 74.7973],
  ['Amritsar', 31.634, 74.8723],
  ['Prayagraj', 25.4358, 81.8463, ['allahabad']],
  ['Ranchi', 23.3441, 85.3096],
  ['Coimbatore', 11.0168, 76.9558],
  ['Jodhpur', 26.2389, 73.0243],
  ['Madurai', 9.9252, 78.1198],
  ['Raipur', 21.2514, 81.6296],
  ['Chandigarh', 30.7333, 76.7794],
  ['Guwahati', 26.1445, 91.7362],
  ['Mysore', 12.2958, 76.6394, ['mysuru']],
  ['Thiruvananthapuram', 8.5241, 76.9366, ['trivandrum']],
  ['Kochi', 9.9312, 76.2673, ['cochin']],
  ['Bhubaneswar', 20.2961, 85.8245],
  ['Dehradun', 30.3165, 78.0322],
  ['Goa', 15.4909, 73.8278, ['panaji', 'panjim']],
  ['Shimla', 31.1048, 77.1734],
  ['Noida', 28.5355, 77.391],
  ['Gurgaon', 28.4595, 77.0266, ['gurugram']],
  ['Mangalore', 12.9141, 74.856, ['mangaluru']],
  ['Udaipur', 24.5854, 73.7125],
  ['Manali', 32.2396, 77.1887],
  ['London', 51.5074, -0.1278],
  ['New York', 40.7128, -74.006, ['nyc', 'new york city']],
  ['Dubai', 25.2048, 55.2708],
  ['Singapore', 1.3521, 103.8198],
  ['Tokyo', 35.6762, 139.6503],
  ['Paris', 48.8566, 2.3522],
  ['Sydney', -33.8688, 151.2093],
  ['Toronto', 43.6532, -79.3832],
  ['San Francisco', 37.7749, -122.4194],
  ['Los Angeles', 34.0522, -118.2437],
  ['Berlin', 52.52, 13.405],
  ['Hong Kong', 22.3193, 114.1694],
  ['Bangkok', 13.7563, 100.5018],
  ['Dhaka', 23.8103, 90.4125],
  ['Kathmandu', 27.7172, 85.324],
  ['Colombo', 6.9271, 79.8612],
  ['Karachi', 24.8607, 67.0011],
];

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const INDEX = new Map<string, City>();
for (const [name, latitude, longitude, aliases = []] of LIST)
  for (const key of [name, ...aliases]) INDEX.set(normalize(key), { name, latitude, longitude });

/** The city if it is one of the built-in ones, in any usual spelling. */
export function knownCity(input: string): City | undefined {
  return INDEX.get(normalize(input));
}
