# Pain Chronicle

A private, local-first app that keeps a long, complicated medical history in one place: appointments, scan reports, diagnoses, lab results, medications and a daily pain diary, all on one timeline. It also looks for patterns across specialists and years, the clues that get missed when each doctor only sees one piece.

> **Not a diagnostic tool.** Pattern hints come from keyword matching and simple statistics on what you've entered. Treat them as questions to bring to a clinician, not as conclusions.

## What it does

| Area | What you get |
|---|---|
| **Overview** | Years since the first problem, specialties involved, abnormal labs, recent pain, top patterns, active diagnoses, current meds |
| **Timeline** | A swimlane view of the whole history, with a monthly pain heat strip, medication bars and abnormal labs. You can **re-group by body system, body area or specialty** to see how problems spread. Below it is a year-by-year list with the patient's age |
| **Records & scans** | Every event (symptom onset, diagnosis with status *suspected/ruled out*, visit, imaging, procedure, injury, infection, life event), with verbatim report text, body areas, systems, tags and attached PDFs or images. Full-text search with highlighting |
| **Pain diary** | Daily check-in with a front/back body map (intensity and pain quality per area), sleep, fatigue, stress, mood, activity, function, symptoms, triggers and menstrual cycle. Includes charts, a heat map and CSV import |
| **Medications** | Everything tried, with dose, reason, dates, effect rating, side effects and stop reason. A treatment-history chart grouped by drug class shows diary pain before and after each start |
| **Lab results** | Results grouped across labs and name variants, with trend charts and a reference band. You can **paste lines straight from a lab report** (`CRP 9.1 mg/L 0-5 H`) or import a CSV |
| **Patterns** | See below. You can pin, dismiss or add any pattern to the question list |
| **Doctor summary** | A printable one-page summary: problem list, ruled-out diagnoses, key timeline, imaging, abnormal labs, current and previously tried medications, diary summary, patterns to discuss and questions for the appointment |
| **Data & privacy** | Encrypted backup/restore (AES-256-GCM, PBKDF2 600k), multiple patients, a demo patient, delete |

### Pattern engine (`src/analysis/`)

- **Unifying-condition clusters** (`knowledge.ts`): 17 multi-system conditions that are often missed or diagnosed late in chronic pain, including axial spondyloarthritis, hypermobility/hEDS, POTS, MCAS, lupus/CTD, Sjögren's, small-fiber neuropathy, celiac, thyroid, parathyroid, hemochromatosis, myositis, PMR, endometriosis, sleep apnea, MS and Chiari/CCI. For each one it shows:
  - which features were found and where (with quotes)
  - which features are missing and worth asking about
  - which confirming tests have **never been done**
  - how many *different specialties* recorded the clues
- **Negation-aware matching**: "no evidence of sacroiliitis" and "SI joints unremarkable" don't count as evidence.
- **Labs**: repeatedly abnormal results, abnormal results never re-checked, slow drifts toward a limit, "normal but low" values (ferritin, B12, vitamin D) and missing baseline tests.
- **Loose ends**: report wording such as "clinical correlation recommended" or "incidental", referrals with no later visit, and suspected diagnoses never confirmed or excluded.
- **What started when**: clusters of new problems within a year after an infection, injury, surgery, pregnancy or other trigger.
- **Recurring findings**: the same imaging finding (e.g. bone-marrow oedema, enthesitis) across scans of *different body areas*, degenerative changes before age 40, and the same body area coming back over many years with different specialists.
- **Treatment response**: diary pain before and after each medication, many failed treatments (a sign the working diagnosis may be incomplete), strong responders as clues (NSAID → inflammatory, antihistamine → mast cell), and new symptoms after starting a drug.
- **Diary statistics**: same-day and *next-day* correlations, trigger effects (including triggers that **don't** matter), menstrual-cycle effect, symptoms that cluster on flare days, seasonality and recent trend.

## Privacy

- All data lives in the browser's IndexedDB on the device. There is no server and no account.
- The production build ships a Content-Security-Policy with `connect-src 'none'`, so the app *cannot* send data anywhere.
- Clearing browser data erases the records, so **export encrypted backups regularly**.
- Don't use incognito/private windows for real records.

## Running it

```bash
npm install
npm run dev        # development server
npm test           # analysis & parser tests
npm run build      # static build in dist/
npm run preview    # serve the build at http://localhost:4173
```

The `dist/` folder is a fully static site. You can host it anywhere static (GitHub Pages, Netlify, a local web server). Opening `index.html` straight from the file system isn't supported, because browsers restrict storage and modules on `file://`.

Click **"Explore with a fictional demo patient"** on first launch to see a 20-year example record and the patterns it produces.

## Tips for the best results

1. **Paste report wording verbatim** into *Findings*. The pattern engine reads the words.
2. Rough dates are fine (month or year precision).
3. Mark diagnoses as *suspected* or *ruled out* when that's what was said.
4. Tag body areas and body systems. The timeline regroups by them.
5. Keep the diary for at least 2–3 weeks before reading the correlations.
6. Record treatments that *didn't* work. They're as informative as the ones that did.

## Code layout

```
src/
  analysis/    pattern engine (pure functions, unit-tested)
  db/          Dexie schema, encrypted backup, demo patient
  lib/         dates, CSV / pasted-lab parsing, taxonomy, router
  components/  charts (line, swimlane), body map, UI primitives
  views/       one file per screen
```
