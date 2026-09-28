import Kenat, { getHoliday, getHolidaysForYear, HolidayTags, toGC } from "kenat";
import { DateTime } from "luxon";
import { workDateFromKey } from "./work-date.js";

export type CatalogHoliday = {
  key: string;
  nameAm: string;
  nameEn: string;
  description: string | null;
  tags: string[];
  movable: boolean;
  ethiopian: { year: number; month: number; day: number };
  gregorian: { year: number; month: number; day: number };
  gregorianDate: string;
};

const ENGLISH_NAMES: Record<string, string> = {
  enkutatash: "Ethiopian New Year",
  meskel: "Meskel",
  gena: "Genna (Ethiopian Christmas)",
  timket: "Timket (Epiphany)",
  adwa: "Adwa Victory Day",
  labour: "International Workers' Day",
  patriots: "Patriots' Victory Day",
  fasika: "Fasika (Ethiopian Easter)",
  siklet: "Siklet (Good Friday)",
  hosanna: "Hosanna (Palm Sunday)",
  erget: "Erget (Ascension)",
  paraclete: "Paraclete (Pentecost)",
  nineveh: "Nineveh",
  abiyTsome: "Abiy Tsome (Great Lent)",
  rikbeKahnat: "Rikbe Kahnat",
  tsomeHawaryat: "Tsome Hawaryat",
  tsomeDihnet: "Tsome Dihnet",
  moulid: "Mawlid",
  eidFitr: "Eid al-Fitr",
  eidAdha: "Eid al-Adha",
  martyrsDay: "Martyrs' Day",
  beherbehereseb: "Nations, Nationalities and Peoples' Day",
  debreZeit: "Debre Zeit"
};

function titleCaseKey(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function gregorianOf(holiday: {
  ethiopian: { year: number; month: number; day: number };
  gregorian?: { year: number; month: number; day: number };
}) {
  if (holiday.gregorian) return holiday.gregorian;
  const g = toGC(holiday.ethiopian.year, holiday.ethiopian.month, holiday.ethiopian.day) as {
    year: number;
    month: number;
    day: number;
  };
  return g;
}

function toIsoDate(g: { year: number; month: number; day: number }) {
  return DateTime.utc(g.year, g.month, g.day).toISODate()!;
}

function mapHoliday(raw: {
  key: string;
  name: string;
  description?: string;
  tags: string[];
  movable?: boolean;
  ethiopian: { year: number; month: number; day: number };
  gregorian?: { year: number; month: number; day: number };
}): CatalogHoliday {
  const gregorian = gregorianOf(raw);
  return {
    key: raw.key,
    nameAm: raw.name,
    nameEn: ENGLISH_NAMES[raw.key] ?? titleCaseKey(raw.key),
    description: raw.description ?? null,
    tags: raw.tags ?? [],
    movable: !!raw.movable,
    ethiopian: raw.ethiopian,
    gregorian,
    gregorianDate: toIsoDate(gregorian)
  };
}

export function currentEthiopianYear() {
  return new Kenat().getEthiopian().year;
}

export function listCatalogHolidays(
  ethiopianYear: number,
  options?: { filter?: string | string[] | null }
): CatalogHoliday[] {
  const rawFilter = options?.filter;
  const rows = (
    rawFilter == null
      ? getHolidaysForYear(ethiopianYear)
      : getHolidaysForYear(ethiopianYear, { filter: rawFilter })
  ) as Array<{
    key: string;
    name: string;
    description?: string;
    tags: string[];
    movable?: boolean;
    ethiopian: { year: number; month: number; day: number };
    gregorian?: { year: number; month: number; day: number };
  }>;
  return rows.map(mapHoliday).sort((a, b) => a.gregorianDate.localeCompare(b.gregorianDate));
}

export function getCatalogHoliday(key: string, ethiopianYear: number): CatalogHoliday | null {
  try {
    const raw = getHoliday(key, ethiopianYear) as {
      key: string;
      name: string;
      description?: string;
      tags: string[];
      movable?: boolean;
      ethiopian: { year: number; month: number; day: number };
      gregorian?: { year: number; month: number; day: number };
    } | null;
    if (!raw) return null;
    return mapHoliday(raw);
  } catch {
    return null;
  }
}

export function workDateForCatalogHoliday(holiday: CatalogHoliday) {
  return workDateFromKey(holiday.gregorianDate);
}

export { HolidayTags };
