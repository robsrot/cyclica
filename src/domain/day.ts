/**
 * Per-day views over the records: what was recorded on a day, the day's timeline, and one-line descriptions.
 * Pure functions, no storage access.
 */
import {
  CYCLE_SYMPTOM_LABEL,
  DAY_STATUS_LABEL,
  FLOW_LABEL,
  HEAD_LOCATION_LABEL,
  INTENSITY_LABEL,
  KIND_LABEL,
  LIFESTYLE_LABEL,
  LH_LABEL,
  MEAL_TYPE_LABEL,
  MUCUS_LABEL,
  QUALITY5_LABEL,
  SEVERITY4_LABEL,
  SLOT_LABEL,
} from './model/labels';
import type {
  AnyRecord,
  BleedingRec,
  CheckInRec,
  CycleSymptomsRec,
  DayStatusRec,
  DigestionRec,
  FertilityObsRec,
  FoodItemRec,
  HeadacheRec,
  MedicationRec,
  SleepRec,
} from './model/records';
import { formatMinutes, instant, wallDate, wallTime, type LocalDate } from './time';

export interface DayData {
  date: LocalDate;
  bleeding?: BleedingRec;
  cycleSymptoms?: CycleSymptomsRec;
  fertility?: FertilityObsRec;
  sleep?: SleepRec;
  none: Partial<Record<DayStatusRec['area'], DayStatusRec>>;
  headaches: HeadacheRec[];
  digestion: DigestionRec[];
  checkIns: CheckInRec[];
  /** Every record belonging to the day, except reusable food items. */
  all: AnyRecord[];
}

export function dayData(records: readonly AnyRecord[], date: LocalDate): DayData {
  const d: DayData = { date, none: {}, headaches: [], digestion: [], checkIns: [], all: [] };
  for (const r of records) {
    if (r.kind === 'foodItem' || !('date' in r) || r.date !== date) continue;
    d.all.push(r);
    switch (r.kind) {
      case 'bleeding':
        d.bleeding = r;
        break;
      case 'cycleSymptoms':
        d.cycleSymptoms = r;
        break;
      case 'fertilityObs':
        d.fertility = r;
        break;
      case 'sleep':
        d.sleep = r;
        break;
      case 'dayStatus':
        d.none[r.area] = r;
        break;
      case 'headache':
        d.headaches.push(r);
        break;
      case 'digestion':
        d.digestion.push(r);
        break;
      case 'checkIn':
        d.checkIns.push(r);
        break;
    }
  }
  const byTime = (a: { occurredAt: string }, b: { occurredAt: string }) => instant(a.occurredAt) - instant(b.occurredAt);
  d.headaches.sort(byTime);
  d.digestion.sort(byTime);
  d.checkIns.sort(byTime);
  return d;
}

/** Sleep duration: entered directly, or calculated from bed and wake times. Null when neither is available. */
export function sleepDuration(s: SleepRec): { minutes: number; calculated: boolean } | null {
  if (s.durationMinutes !== undefined) return { minutes: s.durationMinutes, calculated: false };
  if (s.bedtime && s.wakeTime) {
    const m = Math.round((instant(s.wakeTime) - instant(s.bedtime)) / 60_000);
    if (m > 0 && m <= 24 * 60) return { minutes: m, calculated: true };
  }
  return null;
}

/** Headache duration: entered directly, or calculated from start and end. */
export function headacheDuration(h: HeadacheRec): { minutes: number; calculated: boolean } | null {
  if (h.durationMinutes !== undefined) return { minutes: h.durationMinutes, calculated: false };
  if (h.endAt) {
    const m = Math.round((instant(h.endAt) - instant(h.occurredAt)) / 60_000);
    if (m > 0) return { minutes: m, calculated: true };
  }
  return null;
}

export interface Lookups {
  food: Map<string, FoodItemRec>;
  meds: Map<string, MedicationRec>;
}

export function lookups(records: readonly AnyRecord[]): Lookups {
  const food = new Map<string, FoodItemRec>();
  const meds = new Map<string, MedicationRec>();
  for (const r of records) {
    if (r.kind === 'foodItem') food.set(r.id, r);
    else if (r.kind === 'medication') meds.set(r.id, r);
  }
  return { food, meds };
}

const join = (parts: (string | number | undefined | false | null)[]) => parts.filter(Boolean).join(' · ');
const sev4 = (name: string, v: number | undefined) => (v === undefined ? undefined : `${name} ${SEVERITY4_LABEL[v]!.toLowerCase()}`);
const label = (key: string) => CYCLE_SYMPTOM_LABEL[key] ?? key;

/** A short, factual description of a record: what was entered, nothing interpreted. */
export function describe(r: AnyRecord, l: Lookups): { title: string; detail: string } {
  switch (r.kind) {
    case 'bleeding':
      return { title: `Period: ${FLOW_LABEL[r.flow].toLowerCase()} flow`, detail: join([r.unusual && 'marked unusual', r.notes]) };
    case 'cycleSymptoms':
      return {
        title: 'Cycle symptoms',
        detail: join([r.symptoms.map((s) => label(s.key) + (s.intensity ? ` (${['', 'mild', 'moderate', 'strong'][s.intensity]})` : '')).join(', '), r.notes]),
      };
    case 'fertilityObs':
      return {
        title: 'Fertility observations',
        detail: join([
          r.mucus && `Mucus: ${MUCUS_LABEL[r.mucus].toLowerCase()}`,
          r.bbtCelsius !== undefined && `BBT ${r.bbtCelsius.toFixed(2)} °C${r.bbtTime ? ` at ${r.bbtTime}` : ''}`,
          r.lhTest && `LH test: ${LH_LABEL[r.lhTest].toLowerCase()}`,
          r.notes,
        ]),
      };
    case 'headache': {
      const dur = headacheDuration(r);
      return {
        title: `Headache${r.severity !== undefined ? ` ${r.severity}/10` : ''}`,
        detail: join([
          dur && `${formatMinutes(dur.minutes)}${dur.calculated ? '' : ' (entered)'}`,
          r.locations?.map((x) => HEAD_LOCATION_LABEL[x].toLowerCase()).join(', '),
          r.medicationIds?.length && `took ${r.medicationIds.map((id) => l.meds.get(id)?.name ?? 'medication').join(', ')}`,
          r.notes,
        ]),
      };
    }
    case 'digestion':
      return {
        title: 'Digestion',
        detail: join([
          sev4('bloating', r.bloating),
          sev4('discomfort', r.discomfort),
          sev4('pain', r.pain),
          r.gas && 'gas',
          r.constipation && 'constipation',
          r.diarrhoea && 'diarrhoea',
          r.comfort !== undefined && `comfort ${QUALITY5_LABEL[r.comfort]!.toLowerCase()}`,
          r.bristol !== undefined && `Bristol type ${r.bristol}`,
          r.notes,
        ]) || 'No details',
      };
    case 'checkIn':
      return {
        title: r.slot ? `${SLOT_LABEL[r.slot]} check-in` : 'Energy check-in',
        detail: join([
          r.energy !== undefined && `energy ${r.energy}/10`,
          r.sleepiness !== undefined && `sleepiness ${r.sleepiness}/10`,
          r.clarity !== undefined && `clarity ${r.clarity}/10`,
          r.motivation !== undefined && `motivation ${r.motivation}/10`,
          r.notes,
        ]),
      };
    case 'sleep': {
      const dur = sleepDuration(r);
      return {
        title: `Sleep${dur ? `: ${formatMinutes(dur.minutes)}` : ''}`,
        detail: join([
          r.bedtime && r.wakeTime && `${wallTime(r.bedtime)}–${wallTime(r.wakeTime)}`,
          r.quality !== undefined && `quality ${QUALITY5_LABEL[r.quality]!.toLowerCase()}`,
          r.awakenings !== undefined && `${r.awakenings} awakening${r.awakenings === 1 ? '' : 's'}`,
          r.rested && `rested: ${r.rested}`,
          r.notes,
        ]),
      };
    }
    case 'meal':
      return {
        title: r.mealType ? MEAL_TYPE_LABEL[r.mealType] : 'Meal',
        detail: join([
          r.foodItemIds?.map((id) => l.food.get(id)?.name ?? 'item').join(', '),
          r.description,
          r.categories?.length && r.categories.join(', '),
          r.notes,
        ]),
      };
    case 'lifestyle':
      return {
        title: LIFESTYLE_LABEL[r.type] + (r.label ? `: ${r.label}` : ''),
        detail: join([
          r.amount !== undefined && `${r.amount}${r.unit ? ` ${r.amount === 1 && r.unit.endsWith('s') ? r.unit.slice(0, -1) : r.unit}` : ''}`,
          r.durationMinutes !== undefined && formatMinutes(r.durationMinutes),
          r.intensity && INTENSITY_LABEL[r.intensity].toLowerCase(),
          r.level !== undefined && `level ${r.level}/10`,
          r.notes,
        ]),
      };
    case 'medication':
      return { title: `${r.medType === 'supplement' ? 'Supplement' : 'Medication'}: ${r.name}`, detail: join([r.dose, r.notes]) };
    case 'note':
      return { title: 'Note', detail: r.text };
    case 'dayStatus':
      return { title: DAY_STATUS_LABEL[r.area], detail: 'Recorded as none for this day' };
    case 'foodItem':
      return { title: r.name, detail: join([r.ingredients?.join(', '), r.categories?.join(', ')]) };
    default:
      return { title: KIND_LABEL[(r as { kind: string }).kind] ?? 'Entry', detail: '' };
  }
}

export interface TimelineItem {
  record: AnyRecord;
  /** "HH:mm", a range "HH:mm–HH:mm", or null for all-day entries. */
  time: string | null;
  sortKey: number;
}

/**
 * The day in order: all-day entries first, then everything with a time, ordered by real instant.
 * Sleep appears at its wake-up time when known.
 */
export function timeline(day: DayData): TimelineItem[] {
  const allDay: TimelineItem[] = [];
  const timed: TimelineItem[] = [];
  for (const r of day.all) {
    const occurredAt = (r as { occurredAt?: string }).occurredAt;
    if (occurredAt) {
      let time = wallTime(occurredAt);
      if (r.kind === 'headache' && r.endAt) time += `–${wallDate(r.endAt) === r.date ? wallTime(r.endAt) : `${wallTime(r.endAt)} (+1)`}`;
      timed.push({ record: r, time, sortKey: instant(occurredAt) });
    } else if (r.kind === 'sleep' && r.wakeTime) {
      timed.push({ record: r, time: wallTime(r.wakeTime), sortKey: instant(r.wakeTime) });
    } else {
      allDay.push({ record: r, time: null, sortKey: 0 });
    }
  }
  const order = ['bleeding', 'dayStatus', 'cycleSymptoms', 'fertilityObs', 'sleep'];
  allDay.sort((a, b) => order.indexOf(a.record.kind) - order.indexOf(b.record.kind));
  timed.sort((a, b) => a.sortKey - b.sortKey);
  return [...allDay, ...timed];
}
