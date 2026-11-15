/** Display labels. Kept separate from the schemas so wording can change without touching stored data. */

export const KIND_LABEL: Record<string, string> = {
  bleeding: 'Period',
  cycleSymptoms: 'Cycle symptoms',
  fertilityObs: 'Fertility observations',
  headache: 'Headache',
  digestion: 'Digestion',
  checkIn: 'Energy & sleepiness',
  sleep: 'Sleep',
  meal: 'Meal',
  foodItem: 'Food item',
  lifestyle: 'Context',
  medication: 'Medication',
  note: 'Note',
  dayStatus: 'None today',
  experiment: 'Experiment',
};

export const FLOW_LABEL = { spotting: 'Spotting', light: 'Light', medium: 'Medium', heavy: 'Heavy' } as const;

export const CYCLE_SYMPTOM_LABEL: Record<string, string> = {
  cramps: 'Cramps',
  breastTenderness: 'Breast tenderness',
  bloating: 'Bloating',
  moodChanges: 'Mood changes',
  skinChanges: 'Skin changes',
  acne: 'Acne',
  fatigue: 'Fatigue',
  appetiteChanges: 'Appetite changes',
};

export const MUCUS_LABEL = { dry: 'Dry', sticky: 'Sticky', creamy: 'Creamy', watery: 'Watery', eggWhite: 'Egg-white' } as const;
export const LH_LABEL = { negative: 'Negative', positive: 'Positive', invalid: 'Invalid' } as const;

export const HEAD_LOCATION_LABEL = {
  forehead: 'Forehead',
  temples: 'Temples',
  leftSide: 'Left side',
  rightSide: 'Right side',
  top: 'Top of head',
  back: 'Back of head',
  behindEyes: 'Behind the eyes',
  neck: 'Neck',
  wholeHead: 'Whole head',
} as const;

export const HEAD_CHARACTER_LABEL = {
  throbbing: 'Throbbing',
  pressing: 'Pressing / tight',
  stabbing: 'Stabbing',
  dull: 'Dull',
  burning: 'Burning',
} as const;

export const HEAD_ASSOCIATED_LABEL = {
  nausea: 'Nausea',
  lightSensitivity: 'Sensitive to light',
  soundSensitivity: 'Sensitive to sound',
  visualDisturbance: 'Visual disturbance',
  dizziness: 'Dizziness',
  neckTension: 'Neck tension',
} as const;

export const IMPACT_LABEL = { none: 'Not affected', some: 'Somewhat limited', unable: 'Unable to do usual activities' } as const;
export const MED_HELPED_LABEL = { yes: 'Yes', partly: 'Partly', no: 'No', unsure: 'Not sure' } as const;

export const SEVERITY4_LABEL = ['None', 'Mild', 'Moderate', 'Severe'] as const;

/**
 * Bristol Stool Form Scale descriptions, paraphrased.
 * Source: Lewis SJ, Heaton KW. Stool form scale as a useful guide to intestinal transit time.
 * Scand J Gastroenterol. 1997;32(9):920–924. doi:10.3109/00365529709011203
 */
export const BRISTOL_LABEL = [
  '',
  'Type 1: separate hard lumps',
  'Type 2: lumpy, sausage-shaped',
  'Type 3: sausage-shaped with cracks',
  'Type 4: smooth, soft sausage',
  'Type 5: soft blobs with clear edges',
  'Type 6: fluffy, mushy pieces',
  'Type 7: entirely liquid',
] as const;

export const SLOT_LABEL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' } as const;
export const RESTED_LABEL = { yes: 'Yes', somewhat: 'Somewhat', no: 'No' } as const;
export const QUALITY5_LABEL = ['', 'Very poor', 'Poor', 'OK', 'Good', 'Very good'] as const;

export const MEAL_TYPE_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', drink: 'Drink' } as const;
export const PORTION_LABEL = { small: 'Small', medium: 'Medium', large: 'Large' } as const;

export const LIFESTYLE_LABEL = {
  water: 'Water',
  caffeine: 'Caffeine',
  alcohol: 'Alcohol',
  exercise: 'Exercise',
  stress: 'Stress',
  workload: 'Workload',
  travel: 'Travel',
  illness: 'Illness',
  event: 'Event / other',
} as const;
export const INTENSITY_LABEL = { light: 'Light', moderate: 'Moderate', vigorous: 'Vigorous' } as const;

export const DAY_STATUS_LABEL = {
  bleeding: 'No bleeding',
  headache: 'No headache',
  digestion: 'No digestive symptoms',
} as const;
