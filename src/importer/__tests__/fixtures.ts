// Fictional documents in the shapes real ones come in. No real people.
export const LAB_US = `QUEST-LIKE LABORATORY SERVICES
Patient: Demo, Alex          DOB: 04/12/1990
Collected: 09/30/2024 08:15    Reported: 10/01/2024
Ordering Physician: Dr Rachel Moore
Test Name                 Result   Flag   Units    Reference Range
C-Reactive Protein        9.1      H      mg/L     0.0 - 5.0
Erythrocyte Sed Rate      12              mm/h     0 - 20
Ferritin                  13       L      ng/mL    15 - 150
TSH                       4.3      H      mIU/L    0.40 - 4.00
Hemoglobin                12.4            g/dL     12.0 - 15.5
HLA-B27                   Positive                 Negative
Vitamin D, 25-Hydroxy     18       L      ng/mL    30 - 100
Page 1 of 1`;

export const MRI = `CITY IMAGING CENTRE
MRI SACROILIAC JOINTS WITHOUT CONTRAST
Exam date: 14 March 2025
Clinical history: Inflammatory back pain, HLA-B27 positive.
Technique: Coronal STIR and T1 sequences.
Findings:
There is bone marrow oedema in the right iliac side of the sacroiliac joint with small erosions.
The left sacroiliac joint is normal.
Impression:
1. Active right sacroiliitis with erosions, in keeping with axial spondyloarthritis.
2. Rheumatology review recommended.
Reported by: Dr Sam Patel, FRCR`;

export const RHEUM_LETTER = `Department of Rheumatology
Royal General Hospital
Clinic date: 12/06/2025

Dear Dr Allen,

Re: Alex Demo, DOB 12/04/1990

Thank you for referring this 35-year-old woman with 14 years of back pain.

Diagnosis:
1. Axial spondyloarthritis (M45.9) – probable
2. Hypermobility spectrum disorder
3. Query mast cell activation syndrome

History:
Low back pain since age 20 with morning stiffness lasting over an hour, better with exercise. Previous anterior uveitis in 2013. Scalp psoriasis.

Examination:
Tender over both sacroiliac joints. Beighton score 6/9.

Plan:
- Start naproxen 500 mg twice daily with omeprazole 20 mg daily
- Stop amitriptyline as it has not helped
- MRI of the sacroiliac joints has been requested
- Refer to physiotherapy for an exercise programme
- Review in 3 months with results

Current medications:
Cetirizine 10 mg twice daily
Amitriptyline 10 mg at night

Allergies: Codeine (vomiting)

Yours sincerely,

Dr Priya Shah
Consultant Rheumatologist`;

export const AVS = `After Visit Summary
Alex Demo   DOB: 04/12/1990
Visit date: 03/05/2025   Provider: Jordan Lee, NP   Family Medicine Clinic
Reason for Visit
Fatigue; Dizziness on standing
Diagnoses This Visit
Fatigue, unspecified type (R53.83)
Postural orthostatic tachycardia syndrome, possible (G90.A)
Iron deficiency
Medications Started
ferrous sulfate 325 mg tablet - take 1 tablet daily
Instructions
Increase salt and fluid intake. Return in 6 weeks.
Orders Placed
CBC with differential; Ferritin; Tilt table test`;

export const DISCHARGE = `DISCHARGE SUMMARY
St Mary's Hospital
Date of admission: 2023-02-10    Date of discharge: 2023-02-14
Reason for admission: Severe abdominal pain and vomiting
Discharge diagnoses:
1. Acute pancreatitis, gallstone related
2. Hypokalaemia - resolved
Hospital course:
Managed with IV fluids and analgesia. Ultrasound showed gallstones. Potassium replaced.
Discharge medications:
Paracetamol 1 g four times daily as needed
Ondansetron 4 mg as needed
Follow-up: General surgery clinic in 6 weeks for consideration of cholecystectomy.`;

// ---- US portal / lab layouts (fictional content) ----

export const MYCHART_LAB = `MyChart
Test Results
CBC W/ DIFFERENTIAL
Collected on Sep 30, 2024 8:15 AM
Results
Hemoglobin
Normal range: 12.0 - 15.5 g/dL
12.4
WBC
Normal range: 4.0 - 11.0 K/uL
3.2 Low
Platelet Count
Normal range: 150 - 400 K/uL
210
C-REACTIVE PROTEIN
Collected on Sep 30, 2024 8:15 AM
Results
C-Reactive Protein
Normal range: 0.0 - 5.0 mg/L
9.1 High
HLA-B27 ANTIGEN
Collected on Sep 30, 2024 8:15 AM
Results
HLA-B27
Value
Positive
Abnormal
Printed on 11/24/2026 10:02 AM
MyChart® licensed from Epic Systems Corporation © 1999 - 2024
Page 1 of 1`;

export const QUEST = `Quest Diagnostics
Patient Information        Specimen Information        Client Information
DEMO, ALEX                 Specimen: AB123456C         Client #: 12345
DOB: 04/12/1990 AGE: 34    Collected: 09/30/2024 / 08:15 EDT
Gender: F                  Received: 09/30/2024 / 12:00 EDT
                           Reported: 10/01/2024 / 06:30 EDT
Test Name                         In Range    Out Of Range    Reference Range    Lab
C-REACTIVE PROTEIN                            9.1 H           <8.0 mg/L          EN
FERRITIN                                      13 L            16-232 ng/mL       EN
TSH                               2.10                        0.40-4.50 mIU/L    EN
VITAMIN D,25-OH,TOTAL,IA                      18 L            30-100 ng/mL       EN
HLA-B27 ANTIGEN                   NEGATIVE                    NEGATIVE           EN`;

export const LABCORP = `LabCorp
Patient Report
Specimen ID: 123-456-7890-0   Control ID: 12345678
Date Collected: 09/30/2024    Date Received: 09/30/2024    Date Reported: 10/01/2024
TESTS                       RESULT       FLAG    UNITS     REFERENCE INTERVAL    LAB
C-Reactive Protein, Quant   9.1          High    mg/L      0.0-4.9               01
Ferritin, Serum             13           Low     ng/mL     15-150                01
Vitamin B12                 290                  pg/mL     232-1245              01
Sed Rate (ESR)              12                   mm/hr     0-32                  01
Hemoglobin A1c              5.4                  %         4.8-5.6               01`;

export const EPIC_NOTE = `Progress Notes
Jordan Lee, NP at 3/5/2025 10:15 AM
Status: Signed
Family Medicine
Office Visit
Date of Service: 3/5/2025

Chief Complaint
Patient presents with
• Fatigue
• Dizziness

HPI
Alex is a 34 y.o. female who presents with 6 months of fatigue and lightheadedness on standing. Denies chest pain. Heavy periods.

Current Outpatient Medications on File Prior to Visit
Medication Sig
cetirizine (ZYRTEC) 10 MG tablet Take 10 mg by mouth 2 (two) times daily.
naproxen (NAPROSYN) 500 MG tablet Take 1 tablet (500 mg total) by mouth 2 (two) times daily with meals.

Allergies
Allergen Reactions
• Codeine Nausea And Vomiting

Physical Exam
BP 104/68 | Pulse 112 | Temp 36.8 °C
General: tired appearing.
Orthostatic vitals: HR 78 lying, 118 standing.

Assessment & Plan
1. Fatigue, unspecified type
- CBC with Differential; Future
- Ferritin; Future
2. Orthostatic tachycardia
Suspect POTS. Ordered tilt table test. Increase fluids and salt.
- Referral to Cardiology
3. Iron deficiency anemia, unspecified iron deficiency anemia type
- Start ferrous sulfate 325 (65 FE) MG tablet; Take 1 tablet by mouth daily.

Encounter Diagnoses
Name Primary?
Fatigue, unspecified type Yes
Orthostatic tachycardia
Iron deficiency anemia, unspecified iron deficiency anemia type

Orders Placed This Encounter
Procedures
• CBC with Differential
• Ferritin
• Tilt table test
• Ambulatory referral to Cardiology
Medications
• ferrous sulfate 325 (65 FE) MG tablet

Return in about 6 weeks (around 4/16/2025).

Electronically signed by Jordan Lee, NP at 3/5/2025 10:40 AM`;

export const EPIC_AVS = `AFTER VISIT SUMMARY
Alex Demo  MRN: 12345678
3/5/2025  Family Medicine Clinic  555-555-0100

Instructions from Jordan Lee, NP
Drink 2-3 liters of fluid per day and increase salt intake.
Return in about 6 weeks (around 4/16/2025).

Today's Visit
You saw Jordan Lee, NP on Wednesday March 5, 2025.
Reason for visit
Fatigue
Dizziness

Diagnoses
Fatigue, unspecified type
Orthostatic tachycardia
Iron deficiency anemia

Done Today
CBC with Differential
Ferritin

Your Medication List
START taking:
ferrous sulfate 325 (65 FE) MG tablet
Take 1 tablet (325 mg total) by mouth daily.

CHANGE how you take:
naproxen 500 MG tablet
Commonly known as: NAPROSYN
Take 1 tablet (500 mg total) by mouth 2 (two) times daily with meals as needed.
What changed: when to take this

STOP taking:
amitriptyline 10 MG tablet
Commonly known as: ELAVIL

CONTINUE taking:
cetirizine 10 MG tablet
Take 10 mg by mouth 2 (two) times daily.

MyChart® licensed from Epic Systems Corporation © 1999 - 2024
Printed on 11/24/2026 10:02 AM    Page 1 of 2`;
