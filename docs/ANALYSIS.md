# Cyclica: analysis methodology

How the **My Patterns** tab turns your entries into numbers. These are the rules the code follows (`src/domain/analysis/`, `src/domain/cycle/`), and the tests that check them are in `tests/unit/analysis.test.ts` and `tests/unit/cycle-time.test.ts`.

**Guiding principle:** report what the records show, with sample sizes and uncertainty. Never explain why.

---

## 1. Unit of analysis: the calendar day

Each day becomes one row (`buildDays`). Several entries on one day are combined:

| Measure | Rule for a day | Missing when |
|---|---|---|
| Headache day | yes if ≥1 headache entry; **no** only if marked "No headache" | neither |
| Headache severity | highest severity that day | no severity entered |
| Headache minutes | sum of known durations (entered, or end − start) | no duration known |
| Bloating / discomfort / pain | highest rating that day (0–3); "No symptoms" counts as 0 | not rated and not marked |
| Digestive symptom (yes/no) | yes if any rating ≥ mild, or gas/constipation/diarrhoea = yes; no if measures were recorded and none was present, or the day was marked "No symptoms" | no digestion information |
| Energy, sleepiness | mean of that day's check-ins that include the measure | none recorded |
| Energy by part of day | as above, per slot. A check-in without a chosen slot is assigned by time: before 12:00 morning, before 17:00 afternoon, otherwise evening | |
| Sleep duration / quality | the night that **ended** that day. Duration = your estimate if entered, else bed→wake time | no sleep entry, or no times/estimate |
| Caffeine, alcohol, exercise | "recorded" yes/no | — (**no** means *not recorded*, never *didn't happen*) |
| Water | sum of ml entries | none recorded |
| Stress, workload | highest level that day | none recorded |
| Meal categories | union of tags on that day's meals | — |

Why: five entries on one bad day are not five independent observations. Combining per day stops one day from dominating a result.

## 2. Missing data is never zero

- Each statistic uses only days where that measure has a value.
- Headline numbers state their denominator ("6 of 20 days"). Days left out are counted and shown ("12 days with no headache information are not counted either way").
- Context factors (caffeine, alcohol, exercise) can only be compared as "recorded vs not recorded". Every such result includes the caveat that unrecorded days may still have included the factor.

## 3. Cycles

- **Period day:** a recorded day with light, medium or heavy flow. Spotting alone is not a period day.
- **New period:** starts on a period day after at least 2 days without a period day. Shorter gaps (one unrecorded day mid-period) are the same period. The gap is a parameter (`minGapDays`).
- **Cycle length:** days from one recorded start to the next. Only *completed* cycles have a length.
- **Cycle day:** days since the most recent recorded start, +1. Before any recorded start it is "insufficient data".
- **No assumptions.** There is no 28-day default and no day-14 ovulation. Phases other than "during a recorded period" are **not** estimated from the calendar.
- **Windows used in comparisons** (`periodWindow`):
  - `period`: within a recorded period.
  - `prePeriod`: 1–7 days before a *recorded* period start.
  - `other`: any other day of a cycle whose next start is recorded.
  - Days in the current cycle after the period (next start unknown) and days before the first recorded period are **not classified**. This is retrospective, so nothing is predicted.
- **Next-period estimate:** shown only with ≥ `minCycles` completed cycles. It is the date range between your shortest and longest recorded cycle length, added to the last start, and labelled as an estimate with its limitation.

## 4. Descriptive statistics

- Averages, counts and shares of days, each with its basis ("based on 23 days").
- Averages are withheld below `minDays` values. Cycle variability and the next-period estimate are withheld below `minCycles` completed cycles. Average cycle length needs 2 completed cycles; average period length needs 2 finished periods (a period whose last recorded day is today or yesterday may still be going on and is excluded).
- Charts:
  - Value axes start at zero.
  - Buckets without data are drawn as "no data", not zero.
  - Each bar has its n.
  - Each chart has a table alternative.
  - Weekly buckets are used for periods up to 70 days, monthly beyond that.

## 5. Comparisons ("Explore a question")

A fixed, curated list of questions, each defined in advance with:
- an **outcome** (e.g. share of days with a headache)
- two **groups of days** (e.g. the 7 days before a recorded period start vs other non-period days)
- an explicit **time relation**: same day / the day after the night / the following day

**Computation.** For each group: number of days, number of distinct calendar weeks, mean (for yes/no outcomes the mean is the share of days). The difference (group 1 − group 2) comes with a **95% interval from a weekly block bootstrap**: whole Monday-to-Sunday weeks are resampled with replacement (2000 resamples, percentile interval). Weeks are resampled rather than days because neighbouring days from one person are correlated. The random generator is seeded from the data, so the same data always gives the same interval.

**Verdicts.**
- *Insufficient:* either group has fewer than `minDays` days or fewer than `minWeeks` distinct weeks, or a cycle question has fewer than `minCycles` completed cycles. The app says exactly what is missing.
- *No clear difference:* the interval includes zero.
- *Difference:* the interval excludes zero. This is still worded as an observation ("In your records, … was higher on … than on …").

No p-values are shown.

**Splits use your own median.** For numeric factors (sleep duration, sleep quality, stress, water) days are split at the median of your own values in the selected period, never at a general cut-off. The value used is shown.

**Other recorded factors.** For each comparison, other measures are shown for both groups: sleep duration and quality, stress, energy, headache days, period days, caffeine and alcohol recorded. A factor is marked **"differs"** when its means differ by ≥ 0.5 pooled standard deviations, or its shares by ≥ 20 percentage points, with at least 3 values per group. This makes visible the most obvious way a comparison can mislead: confounding by something else that changed together.

**Multiple comparisons.**
- There is no automatic feed of "discoveries". You choose a question.
- Every result is labelled exploratory.
- The screen counts how many comparisons you've opened in the session and states that the more you look at, the more likely one shows a difference by chance.
- Under the null, roughly 1 in 20 comparisons will show a "difference" at the 95% level. The test suite checks this on data with no built-in effects (observed ≤ 15% across 30 comparisons).

**Food categories** compare days with a meal tagged with the category against days with meals recorded but none tagged, on the same day and the next day. The caveat states that this cannot establish an intolerance.

## 6. Personal experiments

You define the change, the start date, an optional planned end, and the outcomes to compare, **before** looking at results. The experiment period (start → end, planned end, or today) is compared with the **same number of days immediately before** the start, using the same engine and thresholds. Fixed limitations are shown: no comparison group, no blinding, expectations, seasons, cycle phase and other simultaneous changes. Creating an experiment shows a notice not to change prescribed medication or follow restrictive diets without professional advice.

## 7. Minimum-data rules (configurable in My Patterns → "How Cyclica analyses your data")

| Setting | Default | Rationale |
|---|---|---|
| `minDays`: days per group, and per average | 7 | Below about a week of values, one unusual day moves an average a lot. Seven also matches the length of the bootstrap block. |
| `minWeeks`: distinct weeks per group | 3 | The block bootstrap resamples weeks. With fewer than 3 weeks it has almost nothing to resample, and a result could reflect a single unusual week. |
| `minCycles`: completed cycles for cycle patterns, variability and the estimate | 3 | The brief requires observations across multiple cycles before calling something recurring. Three is the smallest number where a spread can be described and "recurring" means more than "happened twice". |

These are cautious defaults, not universal standards. Lowering them gives earlier and less reliable results, and the app says so.

## 8. Wording rules

Generated text (`src/domain/analysis/wording.ts`) describes records, includes numbers and sample sizes, and never uses causal language. The test suite fails if any generated headline, caveat, limitation or question title matches *cause(s/d), because, trigger(s), due to, lead(s) to, affect(s), result(s) in, make(s) you*.

## 9. Known limitations of the method

- Recording habits can differ between groups (e.g. you may record more on bad days). This cannot be detected from the data.
- The "other factors" check covers recorded factors only, and is a screen, not an adjustment. No regression or causal model is fitted, on purpose: with one person's data and many possible factors, such models would look more certain than they are.
- Calendar-week blocks are a simple choice. Patterns with longer memory (e.g. month-long stress) are not fully captured by the interval.
- Medians are recomputed per selected period, so the split value can change when you change the period.
