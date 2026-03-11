# Column 13 Update - Ligos baigtis (Outcome)

## What Changed

The **Ligos baigtis** (Outcome) column now intelligently shows either:
1. **Manual outcome text** if entered (e.g., "Pasveiko", "Gydomas")
2. **Last completed visit date** if no outcome text is specified

## Logic

```sql
CASE
    WHEN outcome IS NOT NULL AND outcome != '' 
        THEN outcome  -- Show manual outcome text
    WHEN has future planned visits
        THEN NULL  -- Leave blank (treatment ongoing)
    ELSE 
        COALESCE(
            last completed visit date,
            treatment registration date  -- Fallback
        )
END
```

## Example Scenarios

### Scenario 1: Manual Outcome Entered
```
Treatment Date: 2026-02-01
Outcome Field: "Pasveiko"
Last Visit: 2026-02-07

Column 13 Shows: "Pasveiko"
```

### Scenario 2: Future Visits Planned (Treatment Ongoing)
```
Treatment Date: 2026-02-02
Outcome Field: (empty)
Future Planned Visit: 2026-02-15 (status: Planuojamas)

Column 13 Shows: (blank)
```
This indicates treatment is still ongoing with future visits scheduled.

### Scenario 3: No Future Visits, Has Completed Visit
```
Treatment Date: 2026-02-01
Outcome Field: (empty)
Last Completed Visit: 2026-02-07 (status: Baigtas)
Future Visits: None

Column 13 Shows: "2026-02-07"
```
This indicates the last visit was on Feb 7th, treatment is complete.

### Scenario 4: No Outcome, No Visits at All
```
Treatment Date: 2026-02-02
Outcome Field: (empty)
Visits: None

Column 13 Shows: "2026-02-02"
```
Falls back to treatment date (one-time treatment, no follow-up needed).

## Why This Makes Sense

When you look at an animal's treatment record:
- If the **last visit was on Feb 7th** and there are **no more planned visits**
- This means the animal is **healthy/recovered**
- The **date of the last visit** is the effective "recovery date"

## How It Works

The query finds:
1. All visits for this animal
2. That have status = **'Baigtas'** (Completed)
3. That happened **after or on the treatment registration date**
4. Takes the **most recent one** (ORDER BY visit_datetime DESC LIMIT 1)
5. Formats it as **'YYYY-MM-DD'**

## Visual Example

Looking at the report:

```
┌─────┬────────────┬──────────────┬─────────────┬────────────┐
│ ... │    10.     │     11.      │     12.     │    13.     │
│     │ Diagnozė   │  Paslaugos   │   Išlauka   │   Baigtis  │
├─────┼────────────┼──────────────┼─────────────┼────────────┤
│ ... │ Gimdos     │ Gydymas      │ 🥩 2026-02-03│ 2026-02-07 │ ← Last visit date!
│     │ atonija    │ 💊 BIOTROPINA│             │            │
│     │            │ METRICURE    │             │            │
└─────┴────────────┴──────────────┴─────────────┴────────────┘
```

## Benefits

1. **Automatic completion tracking** - No need to manually enter outcome
2. **Shows when treatment finished** - The last visit date is the recovery date
3. **Still allows manual outcomes** - Can override with text like "Pasveiko", "Nugaišo", etc.
4. **Clear for inspectors** - Date shows when animal was last treated/checked

## Default Values Summary

| Column | Field | Default Value |
|--------|-------|---------------|
| 3 | Owner | ŽŪB Berčiūnai |
| 7 | First Symptoms Date | Registration Date |
| 13 | Outcome | Last Completed Visit Date |
| 14 | Veterinarian | Artūras Abromaitis |

All these defaults make the report more complete and professional! ✅
