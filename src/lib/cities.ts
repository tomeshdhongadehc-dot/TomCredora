import { countryByIso } from "./countries";

/**
 * Cities for the "start typing and pick" boxes. Loaded only when a city box is first used, so it costs the rest of the
 * site nothing. Format: City|State or region|country code. Earlier lines rank higher when several match.
 */
const RAW = `Mumbai|Maharashtra|IN|Bombay
Delhi|Delhi|IN
Bengaluru|Karnataka|IN|Bangalore
Hyderabad|Telangana|IN
Chennai|Tamil Nadu|IN|Madras
Pune|Maharashtra|IN|Poona
Kolkata|West Bengal|IN|Calcutta
Ahmedabad|Gujarat|IN
Gurugram|Haryana|IN|Gurgaon
Noida|Uttar Pradesh|IN
Jaipur|Rajasthan|IN
Surat|Gujarat|IN
Lucknow|Uttar Pradesh|IN
Kochi|Kerala|IN|Cochin
Chandigarh|Chandigarh|IN
Indore|Madhya Pradesh|IN
Nagpur|Maharashtra|IN
Coimbatore|Tamil Nadu|IN
Bhopal|Madhya Pradesh|IN
Thiruvananthapuram|Kerala|IN|Trivandrum
Visakhapatnam|Andhra Pradesh|IN|Vizag
Vadodara|Gujarat|IN|Baroda
Patna|Bihar|IN
Mysuru|Karnataka|IN|Mysore
Mangaluru|Karnataka|IN|Mangalore
Nashik|Maharashtra|IN
Navi Mumbai|Maharashtra|IN
Thane|Maharashtra|IN
Faridabad|Haryana|IN
Ghaziabad|Uttar Pradesh|IN
Kanpur|Uttar Pradesh|IN
Varanasi|Uttar Pradesh|IN|Benares
Agra|Uttar Pradesh|IN
Prayagraj|Uttar Pradesh|IN|Allahabad
Meerut|Uttar Pradesh|IN
Dehradun|Uttarakhand|IN
Ludhiana|Punjab|IN
Amritsar|Punjab|IN
Jalandhar|Punjab|IN
Ranchi|Jharkhand|IN
Jamshedpur|Jharkhand|IN
Bhubaneswar|Odisha|IN
Cuttack|Odisha|IN
Raipur|Chhattisgarh|IN
Guwahati|Assam|IN
Jodhpur|Rajasthan|IN
Udaipur|Rajasthan|IN
Kota|Rajasthan|IN
Rajkot|Gujarat|IN
Gandhinagar|Gujarat|IN
Aurangabad|Maharashtra|IN
Kolhapur|Maharashtra|IN
Solapur|Maharashtra|IN
Pimpri-Chinchwad|Maharashtra|IN|Pimpri Chinchwad
Panaji|Goa|IN
Margao|Goa|IN
Madurai|Tamil Nadu|IN
Tiruchirappalli|Tamil Nadu|IN
Salem|Tamil Nadu|IN
Vijayawada|Andhra Pradesh|IN
Guntur|Andhra Pradesh|IN
Tirupati|Andhra Pradesh|IN
Warangal|Telangana|IN
Hubballi|Karnataka|IN|Hubli
Belagavi|Karnataka|IN|Belgaum
Kozhikode|Kerala|IN
Thrissur|Kerala|IN
Puducherry|Puducherry|IN|Pondicherry
Srinagar|Jammu and Kashmir|IN
Jammu|Jammu and Kashmir|IN
Shimla|Himachal Pradesh|IN
Gangtok|Sikkim|IN
Imphal|Manipur|IN
Shillong|Meghalaya|IN
Siliguri|West Bengal|IN
Howrah|West Bengal|IN
Durgapur|West Bengal|IN
Gwalior|Madhya Pradesh|IN
Jabalpur|Madhya Pradesh|IN
Ujjain|Madhya Pradesh|IN
Bareilly|Uttar Pradesh|IN
Aligarh|Uttar Pradesh|IN
Moradabad|Uttar Pradesh|IN
Gorakhpur|Uttar Pradesh|IN
New York|New York|US
San Francisco|California|US
Los Angeles|California|US
San Jose|California|US
Seattle|Washington|US
Austin|Texas|US
Dallas|Texas|US
Houston|Texas|US
Chicago|Illinois|US
Boston|Massachusetts|US
Washington|District of Columbia|US
Atlanta|Georgia|US
Miami|Florida|US
Denver|Colorado|US
San Diego|California|US
Phoenix|Arizona|US
Philadelphia|Pennsylvania|US
Minneapolis|Minnesota|US
Portland|Oregon|US
Raleigh|North Carolina|US
Charlotte|North Carolina|US
Pittsburgh|Pennsylvania|US
Detroit|Michigan|US
Salt Lake City|Utah|US
Las Vegas|Nevada|US
London|England|GB
Manchester|England|GB
Birmingham|England|GB
Leeds|England|GB
Bristol|England|GB
Edinburgh|Scotland|GB
Glasgow|Scotland|GB
Cambridge|England|GB
Oxford|England|GB
Cardiff|Wales|GB
Belfast|Northern Ireland|GB
Toronto|Ontario|CA
Vancouver|British Columbia|CA
Montreal|Quebec|CA
Calgary|Alberta|CA
Ottawa|Ontario|CA
Edmonton|Alberta|CA
Mississauga|Ontario|CA
Sydney|New South Wales|AU
Melbourne|Victoria|AU
Brisbane|Queensland|AU
Perth|Western Australia|AU
Adelaide|South Australia|AU
Canberra|Australian Capital Territory|AU
Dubai|Dubai|AE
Abu Dhabi|Abu Dhabi|AE
Sharjah|Sharjah|AE
Singapore||SG
Berlin||DE
Munich|Bavaria|DE
Frankfurt|Hesse|DE
Hamburg||DE
Stuttgart|Baden-Wurttemberg|DE
Cologne|North Rhine-Westphalia|DE
Dusseldorf|North Rhine-Westphalia|DE
Paris|Ile-de-France|FR
Lyon|Auvergne-Rhone-Alpes|FR
Marseille|Provence|FR
Toulouse|Occitanie|FR
Amsterdam|North Holland|NL
Rotterdam|South Holland|NL
Eindhoven|North Brabant|NL
The Hague|South Holland|NL
Dublin|Leinster|IE
Cork|Munster|IE
Madrid||ES
Barcelona|Catalonia|ES
Valencia||ES
Milan|Lombardy|IT
Rome|Lazio|IT
Turin|Piedmont|IT
Stockholm||SE
Gothenburg||SE
Zurich||CH
Geneva||CH
Basel||CH
Tokyo||JP
Osaka||JP
Yokohama||JP
Shanghai||CN
Beijing||CN
Shenzhen|Guangdong|CN
Guangzhou|Guangdong|CN
Hong Kong||HK
Seoul||KR
Busan||KR
Kuala Lumpur||MY
Penang||MY
Jakarta||ID
Bangkok||TH
Manila||PH
Cebu||PH
Ho Chi Minh City||VN|Saigon
Hanoi||VN
Karachi|Sindh|PK
Lahore|Punjab|PK
Islamabad||PK
Dhaka||BD
Colombo||LK
Kathmandu||NP
Riyadh||SA
Jeddah||SA
Doha||QA
Kuwait City||KW
Muscat||OM
Manama||BH
Johannesburg|Gauteng|ZA
Cape Town|Western Cape|ZA
Lagos||NG
Abuja||NG
Nairobi||KE
Cairo||EG
Sao Paulo||BR|Sao Paulo
Rio de Janeiro||BR
Mexico City||MX
Buenos Aires||AR
Bogota||CO
Santiago||CL
Auckland||NZ
Wellington||NZ
Moscow||RU
Istanbul||TR
Ankara||TR
Warsaw||PL
Krakow||PL
Lisbon||PT
Porto||PT
Oslo||NO
Copenhagen||DK
Helsinki||FI
Brussels||BE
Vienna||AT
Tel Aviv||IL
Kyiv||UA|Kiev`;

export interface City {
  city: string;
  region: string;
  iso: string;
  /** an older or common other name, searched but not written, e.g. Bangalore for Bengaluru */
  alias: string;
}

export const CITIES: readonly City[] = RAW.split("\n").map((l) => {
  const [city, region, iso, alias] = l.split("|");
  return { city, region, iso, alias: alias ?? "" };
});

/** What gets written into the box when a city is picked. */
export function formatCity(c: City, withRegion: boolean): string {
  const country = countryByIso(c.iso)?.name ?? c.iso;
  return [c.city, withRegion && c.region ? c.region : "", country].filter(Boolean).join(", ");
}

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** The best matches for what has been typed: names that start with it first, then words, regions, countries. */
export function searchCities(query: string, limit = 8): City[] {
  const q = plain(query.split(",")[0] ?? "");
  if (q.length < 1) return [];
  const scored: { c: City; score: number; order: number }[] = [];
  CITIES.forEach((c, order) => {
    const name = plain(c.city);
    const country = plain(countryByIso(c.iso)?.name ?? "");
    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (name.split(/[\s-]+/).some((w) => w.startsWith(q)) || (c.alias && plain(c.alias).startsWith(q))) score = 1;
    else if (plain(c.region).startsWith(q)) score = 2;
    else if (country.startsWith(q)) score = 3;
    else if (q.length >= 3 && name.includes(q)) score = 4;
    if (score >= 0) scored.push({ c, score, order });
  });
  return scored.sort((a, b) => a.score - b.score || a.order - b.order).slice(0, limit).map((s) => s.c);
}
