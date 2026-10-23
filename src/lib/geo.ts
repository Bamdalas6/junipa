// Countries and sub-national regions for market targeting.
// Names come from Intl.DisplayNames so there's no big data file to ship.

export interface Market {
  scope: "worldwide" | "country";
  country?: string; // ISO 3166-1 alpha-2
  region?: string; // state, region, county, province or city
}

export const WORLDWIDE: Market = { scope: "worldwide" };

// Inhabited ISO 3166-1 alpha-2 codes.
const CODES =
  "AF AX AL DZ AS AD AO AI AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UY UZ VU VE VN VG VI WF EH YE ZM ZW".split(
    " ",
  );

// Shown first in the picker: the markets most Junia users sell into.
export const POPULAR = ["NG", "GH", "KE", "ZA", "GB", "US", "CA", "AE"];

let names: Intl.DisplayNames | undefined;
export function countryName(code?: string) {
  if (!code) return "";
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function flagEmoji(code?: string) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "🌍";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function allCountries() {
  return CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name));
}

export const isCountry = (code: unknown): code is string => typeof code === "string" && CODES.includes(code.toUpperCase());

/** Curated sub-national lists for the main markets; other countries take free text. */
export const REGIONS: Record<string, { label: string; items: string[] }> = {
  NG: {
    label: "State",
    items: [
      "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu",
      "FCT (Abuja)", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo",
      "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
    ],
  },
  GH: {
    label: "Region",
    items: ["Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra", "North East", "Northern", "Oti", "Savannah", "Upper East", "Upper West", "Volta", "Western", "Western North"],
  },
  KE: {
    label: "County",
    items: [
      "Baringo", "Bomet", "Bungoma", "Busia", "Elgeyo-Marakwet", "Embu", "Garissa", "Homa Bay", "Isiolo", "Kajiado", "Kakamega", "Kericho", "Kiambu", "Kilifi",
      "Kirinyaga", "Kisii", "Kisumu", "Kitui", "Kwale", "Laikipia", "Lamu", "Machakos", "Makueni", "Mandera", "Marsabit", "Meru", "Migori", "Mombasa",
      "Murang'a", "Nairobi", "Nakuru", "Nandi", "Narok", "Nyamira", "Nyandarua", "Nyeri", "Samburu", "Siaya", "Taita-Taveta", "Tana River", "Tharaka-Nithi",
      "Trans-Nzoia", "Turkana", "Uasin Gishu", "Vihiga", "Wajir", "West Pokot",
    ],
  },
  ZA: { label: "Province", items: ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"] },
  US: {
    label: "State",
    items: [
      "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia", "Hawaii",
      "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
      "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma",
      "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
      "West Virginia", "Wisconsin", "Wyoming",
    ],
  },
  GB: { label: "Region", items: ["England", "Greater London", "Scotland", "Wales", "Northern Ireland"] },
  CA: {
    label: "Province",
    items: ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Northwest Territories", "Nova Scotia", "Nunavut", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Yukon"],
  },
  AU: { label: "State", items: ["Australian Capital Territory", "New South Wales", "Northern Territory", "Queensland", "South Australia", "Tasmania", "Victoria", "Western Australia"] },
  IN: {
    label: "State",
    items: [
      "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh",
      "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
      "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    ],
  },
  AE: { label: "Emirate", items: ["Abu Dhabi", "Ajman", "Dubai", "Fujairah", "Ras Al Khaimah", "Sharjah", "Umm Al Quwain"] },
};

export function regionLabel(country?: string) {
  return (country && REGIONS[country]?.label) || "State / city";
}

/** Human description used in prompts and UI, e.g. "Lagos State, Nigeria" or "worldwide". */
export function describeMarket(m?: Market | null) {
  if (!m || m.scope === "worldwide" || !m.country) return "any country worldwide";
  const country = countryName(m.country);
  if (!m.region) return country;
  const label = REGIONS[m.country]?.label;
  const region = label === "State" && m.country === "NG" && !/abuja/i.test(m.region) ? `${m.region} State` : m.region;
  return `${region}, ${country}`;
}

export function shortMarket(m?: Market | null) {
  if (!m || m.scope === "worldwide" || !m.country) return "Worldwide";
  return m.region ? `${m.region}, ${m.country}` : countryName(m.country);
}

/** Clean up a market that came from a URL or request body. */
export function sanitizeMarket(raw: unknown): Market | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (r.scope === "worldwide") return WORLDWIDE;
  const country = typeof r.country === "string" ? r.country.toUpperCase() : "";
  if (!isCountry(country)) return undefined;
  const region = typeof r.region === "string" ? r.region.replace(/[^\p{L}\p{N} ,.'()-]/gu, "").trim().slice(0, 60) : "";
  return { scope: "country", country, region: region || undefined };
}
