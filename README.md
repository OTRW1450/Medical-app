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
| **Reports & printouts** | **Written summary**: a plain-language history (brief or detailed) assembled sentence by sentence from the record. Filter it by dates, body system or body area, then print it, save it as PDF, copy it as text or download it as .txt. **Timetable of events**: a clean, printable chronological table (date, age, type, event, who, details) with year headings, filters, medication starts/stops, lab results, portrait or landscape printing and CSV export for spreadsheets. **Doctor one-pager**: problem list, key timeline, imaging, abnormal labs, medications, diary summary, patterns and questions. **Emergency card**: allergies, current meds and diagnoses on a small printable card |
| **Data & privacy** | Passcode and auto-lock settings, install instructions, encrypted backup/restore, multiple patients, a demo patient, delete |

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

## Privacy & security

- **Encrypted at rest.** On first launch you choose a passcode. A random 256-bit key encrypts every record and every attached file (AES-256-GCM) before it's written to the device. That key is itself encrypted with a key derived from the passcode (PBKDF2-SHA256, 600,000 iterations). Only random IDs are stored unencrypted. The passcode itself is never stored.
- **Auto-lock.** The app locks after a period of inactivity (1/5/15/60 minutes, or never) and when it's left in the background too long. There's also a **Lock** button. Locking discards the key from memory.
- **No network.** There's no server and no account. The production build ships a Content-Security-Policy with `connect-src 'none'`, and the service worker only serves the app's own cached files.
- **Offline & installable.** Once it has been opened from its hosted address it can be installed (Install button, *Add to Home Screen* on iPhone) and then runs with no internet at all.
- **Forgotten passcode = lost data**, unless you have an encrypted backup. Export backups regularly (*Data & privacy*).
- Remaining risks: someone who knows the passcode, malware on the device, browser extensions that can read pages, and unencrypted exports. Use the encrypted backup option.

## Running it

```bash
npm install
npm run dev        # development server
npm test           # analysis & parser tests
npm run build      # static build in dist/
npm run preview    # serve the build at http://localhost:4173
```

The `dist/` folder is a fully static site. You can host it anywhere static (GitHub Pages, Netlify, a local web server). Installing it as an app and using it offline require **HTTPS** (or `localhost`). Opening `index.html` straight from the file system isn't supported.

Hosting the app does not expose any records: the host only serves the app's code. Records are created and encrypted on each user's device.

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
  db/          Dexie schema, passcode/key management, encrypted store, backups, demo patient
  reports/     written summaries & timetable builders (pure functions, unit-tested)
  lib/         dates, CSV / pasted-lab parsing, taxonomy, router
  components/  charts (line, swimlane), body map, UI primitives
  views/       one file per screen
```
