// Knowledge base of multi-system conditions that are frequently missed or
// diagnosed late in people with complex, long-standing pain. Each one is a set
// of features that are often spread across different specialists' notes.
//
// This is a *pattern prompt* for discussion with clinicians – not a diagnostic
// tool. Matching is keyword-based and will have false positives/negatives.
import type { LabStatus } from './corpus';

export interface Feature {
  label: string;
  text?: RegExp;
  lab?: { test: RegExp; when: LabStatus[] };
}

export interface Condition {
  id: string;
  name: string;
  summary: string;
  specialty: string;
  minMatches: number;
  features: Feature[];
  /** Tests that help confirm/exclude; `test` matched against lab names & event text to see if done. */
  workup: { label: string; test: RegExp }[];
  /** Optional demographic gate. */
  minAge?: number;
}

const r = (s: string) => new RegExp(s, 'i');

export const CONDITIONS: Condition[] = [
  {
    id: 'heds',
    name: 'Hypermobility spectrum / Ehlers-Danlos (hEDS/HSD)',
    summary:
      'Connective-tissue laxity can link joint pain from a young age, subluxations, soft-tissue injuries that heal poorly, early "wear and tear", gut dysmotility and dizziness on standing.',
    specialty: 'Rheumatology / clinical genetics',
    minMatches: 3,
    features: [
      { label: 'Joint hypermobility / "double-jointed"', text: r('\\b(hyper-?mobil\\w*|double[- ]jointed|joint laxity|ligament(ous)? laxity|beighton)') },
      { label: 'Dislocations or subluxations', text: r('\\b(sublux\\w*|dislocat\\w*|partial dislocation|joint (gives|giving) way|unstable (joint|shoulder|knee|ankle)|instability)') },
      { label: 'Frequent sprains / soft-tissue injuries', text: r('\\b(recurrent|frequent|multiple)\\s+(ankle\\s+)?sprains?|\\bsprains?\\b') },
      { label: 'Easy bruising', text: r('\\b(easy bruising|bruises? easily|unexplained bruis\\w*)') },
      { label: 'Soft/stretchy skin or poor wound healing', text: r('\\b(stretchy|hyperextensible|velvety) skin|\\b(poor|slow|delayed) (wound )?healing|atrophic scar|widened scar|stretch marks|striae') },
      { label: 'Temporomandibular (jaw) problems', text: r('\\b(tmj|tmd|temporomandibular|jaw (pain|clicking|locking))') },
      { label: 'Pain or injuries starting in childhood/teens', text: r('\\b(since (childhood|a child)|as a (child|teen)|growing pains|childhood (joint )?pain|juvenile)') },
      { label: 'Early degenerative change / disc problems at a young age', text: r('\\b(premature|early)[- ](onset )?(degenerat\\w*|arthritis|osteoarthritis)') },
      { label: 'Flat feet', text: r('\\b(flat feet|pes planus|fallen arches)') },
      { label: 'Orthostatic intolerance / POTS', text: r('\\b(pots|postural (orthostatic )?tachycardia|orthostatic (intolerance|tachycardia)|dizziness on standing)') },
      { label: 'Gut dysmotility (gastroparesis, IBS, reflux)', text: r('\\b(dysmotility|gastroparesis|slow transit|ibs|irritable bowel)') },
      { label: 'Pelvic floor / organ prolapse or hernias', text: r('\\b(prolapse|hernia|pelvic floor dysfunction)') },
      { label: 'Local anaesthetic less effective', text: r('\\b(local an(a)?esthetic|lidocaine|novocaine) (doesn\'?t|does not|didn\'?t|did not) work|resistan\\w* to (local )?an(a)?esthe') },
    ],
    workup: [
      { label: 'Beighton score / 2017 hEDS criteria assessment', test: r('beighton|heds criteria|hypermobility assessment') },
      { label: 'Genetics referral if vascular/classical features (bruising, skin, family history)', test: r('genetic(s)? (consult|referral|testing)|col3a1|col5a1') },
      { label: 'Echocardiogram (aortic root) if criteria met', test: r('\\becho(cardiogram)?\\b') },
    ],
  },
  {
    id: 'pots',
    name: 'Dysautonomia / POTS',
    summary:
      'Autonomic dysfunction links dizziness when upright, racing heart, fatigue, brain fog, exercise intolerance and heat sensitivity – often blamed on anxiety or deconditioning.',
    specialty: 'Cardiology (autonomic) / neurology',
    minMatches: 3,
    features: [
      { label: 'Dizziness / lightheaded on standing', text: r('\\b(dizz\\w*|lightheaded\\w*|light-headed\\w*|presyncope|near[- ]faint\\w*|vertigo on standing|orthostatic)') },
      { label: 'Fainting', text: r('\\b(syncop\\w*|faint(ed|ing)|passed out|blackout)') },
      { label: 'Palpitations / fast heart rate', text: r('\\b(palpitations?|tachycardi\\w*|racing heart|heart racing|fast heart ?rate)') },
      { label: 'Brain fog', text: r('\\b(brain fog|cognitive (dysfunction|difficult\\w*)|poor concentration|memory (problems|issues))') },
      { label: 'Fatigue / post-exertional crash', text: r('\\b(fatigue|exhaust\\w*|post[- ]exertional|crash(es)? after|exercise intolerance)') },
      { label: 'Heat intolerance', text: r('\\b(heat intolerance|worse in (the )?heat|heat (trigger|sensitiv\\w*))|\\bheat \\(trigger\\)') },
      { label: 'Blood pooling / purple feet on standing', text: r('\\b(acrocyanosis|blood pooling|purple (feet|legs)|mottled)') },
      { label: 'Cold hands/feet, Raynaud-like color change', text: r('\\b(cold hands|cold (hands/)?feet|raynaud\\w*|color change in fingers)') },
      { label: 'Low blood volume / low BP', text: r('\\b(hypotension|low blood pressure|low bp)') },
      { label: 'Labeled anxiety/panic for physical symptoms', text: r('\\b(panic attacks?|anxiety)') },
    ],
    workup: [
      { label: 'Active stand test / NASA lean test (10 min HR & BP)', test: r('stand test|lean test|orthostatic vitals') },
      { label: 'Tilt-table test', test: r('tilt[- ]table') },
      { label: 'Ferritin, B12, morning cortisol, TSH to exclude contributors', test: r('ferritin') },
    ],
  },
  {
    id: 'mcas',
    name: 'Mast cell activation (MCAS)',
    summary:
      'Inappropriate mast-cell release can tie together flushing, hives, itching, food/medication reactions, GI cramping, wheeze and widespread pain – often across allergy, dermatology and GI notes.',
    specialty: 'Allergy / immunology',
    minMatches: 3,
    features: [
      { label: 'Flushing', text: r('\\bflush(ing|es|ed)?\\b') },
      { label: 'Hives / itching / dermatographism', text: r('\\b(hives|urticaria|itch(ing|y)|pruritus|dermatographi\\w*|rash/hives)') },
      { label: 'Reactions to foods, medications or fragrances', text: r('\\b(reaction to|reacts? to|sensitiv\\w* to (foods?|medications?|fragrances?|chemicals?)|multiple (drug|medication) (allergies|intolerances)|intolerant of)|high-histamine') },
      { label: 'Anaphylaxis / throat swelling', text: r('\\b(anaphyla\\w*|angioedema|throat (swelling|tightness)|epipen)') },
      { label: 'Abdominal cramping / diarrhea', text: r('\\b(cramp\\w*|diarrh\\w*)') },
      { label: 'Nasal congestion / wheeze without clear allergy', text: r('\\b(wheez\\w*|rhinitis|nasal congestion|asthma)') },
      { label: 'Good response to antihistamines', text: r('responded well to [^.]*antihistamine') },
      { label: 'Raised tryptase', lab: { test: r('tryptase'), when: ['high'] } },
    ],
    workup: [
      { label: 'Serum tryptase (baseline and within 1–4 h of a flare)', test: r('tryptase') },
      { label: 'Urine N-methylhistamine, 11β-PGF2α, LTE4 (chilled 24 h)', test: r('methylhistamine|pgf2|prostaglandin|leukotriene') },
    ],
  },
  {
    id: 'axspa',
    name: 'Axial spondyloarthritis (incl. ankylosing spondylitis)',
    summary:
      'An inflammatory arthritis of the spine and pelvis. Often missed for 7–10 years, especially in women, because back pain is common and early X-rays can look normal. Clues sit in eye, skin, gut and foot notes.',
    specialty: 'Rheumatology',
    minMatches: 3,
    features: [
      { label: 'Chronic back pain starting before age 45', text: r('\\b(low(er)? back pain|lumbar pain|back pain|lower back pain)') },
      { label: 'Morning stiffness > 30 min / pain at night', text: r('\\b(morning stiffness|stiff in the morning|night pain|wakes? (me )?(at night|in the second half)|second half of the night)') },
      { label: 'Improves with movement, worse with rest', text: r('\\b(better|improves?) with (exercise|movement|activity)|worse (with|after) rest') },
      { label: 'Buttock / sacroiliac pain', text: r('\\b(buttock pain|alternating buttock|sacroili\\w*|si joint|sacrum/si)') },
      { label: 'Sacroiliitis or bone marrow oedema on imaging', text: r('\\b(sacroiliitis|bone marrow (o)?edema|bme|osteitis|erosions?|syndesmophyte)') },
      { label: 'Heel / tendon-insertion pain (enthesitis, plantar fasciitis)', text: r('\\b(enthesitis|enthesopathy|plantar fasciitis|achilles (tendin\\w*|pain)|heel pain)') },
      { label: 'Uveitis / iritis (red painful eye)', text: r('\\b(uveitis|iritis|iridocyclitis)') },
      { label: 'Psoriasis', text: r('\\bpsoria\\w*') },
      { label: 'Inflammatory bowel disease / colitis', text: r('\\b(crohn\\w*|ulcerative colitis|colitis|ibd|inflammatory bowel)') },
      { label: 'Good response to NSAIDs', text: r('responded well to [^.]*nsaid') },
      { label: 'HLA-B27 positive', lab: { test: r('hla-?\\s?b27'), when: ['positive'] } },
      { label: 'Raised CRP or ESR', lab: { test: r('\\bcrp\\b|c-reactive|\\besr\\b|sed(imentation)? rate'), when: ['high'] } },
    ],
    workup: [
      { label: 'HLA-B27', test: r('hla-?\\s?b27') },
      { label: 'CRP and ESR (ideally during a flare)', test: r('\\bcrp\\b|c-reactive') },
      { label: 'MRI sacroiliac joints with STIR sequence', test: r('(mri|magnetic)[^.]*(sacroiliac|si joint)|(sacroiliac|si joint)[^.]*mri') },
    ],
  },
  {
    id: 'ctd',
    name: 'Lupus / connective-tissue disease',
    summary:
      'Systemic autoimmune disease can surface as joint pain, rashes, mouth ulcers, hair loss, Raynaud, chest pain on breathing, fatigue and odd blood counts seen by different doctors at different times.',
    specialty: 'Rheumatology',
    minMatches: 3,
    features: [
      { label: 'Positive ANA', lab: { test: r('\\bana\\b|antinuclear'), when: ['positive', 'high'] } },
      { label: 'Joint pain or swelling', text: r('\\b(joint swelling|swollen joints?|synovitis|arthralgia|polyarthr\\w*|inflammatory arthritis)') },
      { label: 'Rash on face / sun-sensitive rash', text: r('\\b(malar|butterfly rash|photosensitiv\\w*|sun[- ]sensitiv\\w*|discoid)') },
      { label: 'Mouth or nose ulcers', text: r('\\b(mouth|oral|nasal) ulcers?|aphthous') },
      { label: 'Hair loss', text: r('\\b(hair loss|alopecia|thinning hair)') },
      { label: 'Raynaud phenomenon', text: r('\\b(raynaud\\w*|color change in fingers|white fingers)') },
      { label: 'Chest pain on breathing / pleurisy', text: r('\\b(pleurisy|pleuritic|pericarditis|pleural effusion)') },
      { label: 'Low white cells / platelets / anemia', lab: { test: r('\\b(wbc|white (blood )?cell|platelets?|plt|lymphocytes?|hemoglobin|haemoglobin|hgb)\\b'), when: ['low'] } },
      { label: 'Protein or blood in urine', text: r('\\b(proteinuria|hematuria|protein in (the )?urine)') },
      { label: 'Recurrent unexplained fevers', text: r('\\b(low[- ]grade fevers?|unexplained fevers?|recurrent fevers?)') },
      { label: 'Pregnancy losses / clotting', text: r('\\b(miscarriages?|pregnancy loss|dvt|blood clot|thrombosis|antiphospholipid)') },
    ],
    workup: [
      { label: 'ANA with reflex ENA panel (dsDNA, Sm, RNP, SSA/SSB)', test: r('\\bana\\b|antinuclear') },
      { label: 'Complement C3/C4', test: r('\\bc3\\b|\\bc4\\b|complement') },
      { label: 'Urinalysis with protein:creatinine ratio', test: r('urinalysis|protein.?creatinine|\\bupcr\\b') },
    ],
  },
  {
    id: 'sjogren',
    name: "Sjögren's disease",
    summary:
      "An autoimmune disease of moisture glands that also causes fatigue, joint pain and small-fiber (burning) neuropathy. Dry eyes/mouth are often dismissed or seen by the dentist/optometrist only.",
    specialty: 'Rheumatology',
    minMatches: 3,
    features: [
      { label: 'Dry eyes', text: r('\\b(dry eyes?|dry eye syndrome|keratoconjunctivitis sicca|dry eyes/mouth|gritty eyes)') },
      { label: 'Dry mouth / dental decay', text: r('\\b(dry mouth|xerostomia|dry eyes/mouth|(many|multiple|frequent) (cavities|dental caries))') },
      { label: 'Swollen salivary (parotid) glands', text: r('\\b(parotid|salivary gland) (swelling|enlargement)|swollen (parotid|salivary)') },
      { label: 'Burning / small-fiber neuropathy symptoms', text: r('\\b(burning (pain|feet|hands)|burning pain|small[- ]fiber|small[- ]fibre)') },
      { label: 'Fatigue', text: r('\\bfatigue\\b') },
      { label: 'Joint pain', text: r('\\b(joint pain|arthralgia)') },
      { label: 'SSA/Ro or SSB/La antibodies', lab: { test: r('\\b(ssa|ssb|ro|la|anti-ro|anti-la|ro52|ro60)\\b'), when: ['positive', 'high'] } },
      { label: 'Positive ANA or RF', lab: { test: r('\\bana\\b|antinuclear|rheumatoid factor|\\brf\\b'), when: ['positive', 'high'] } },
    ],
    workup: [
      { label: 'Anti-SSA/Ro (Ro52 & Ro60) and SSB/La', test: r('\\bssa\\b|\\bro\\b|anti-ro|ro52|ro60') },
      { label: "Schirmer test / ophthalmology review", test: r('schirmer') },
      { label: 'Minor salivary gland (lip) biopsy if antibodies negative', test: r('lip biopsy|salivary gland biopsy') },
    ],
  },
  {
    id: 'sfn',
    name: 'Small fiber neuropathy',
    summary:
      'Damage to the smallest nerves causes burning, tingling and temperature-sensitive pain – often with autonomic symptoms – and a NORMAL standard EMG/nerve conduction study, so it is easily missed.',
    specialty: 'Neurology',
    minMatches: 3,
    features: [
      { label: 'Burning pain', text: r('\\bburning\\b') },
      { label: 'Pins & needles / tingling / numbness', text: r('\\b(pins (&|and) needles|tingl\\w*|paresthesi\\w*|numbness|numb)\\b') },
      { label: 'Feet and/or hands (length-dependent)', text: r('\\b(feet|foot|hands?|stocking|glove)\\b[^.]*(burn\\w*|tingl\\w*|numb\\w*)|(burn\\w*|tingl\\w*|numb\\w*)[^.]*\\b(feet|foot|hands?|foot/ankle|hand/wrist)\\b') },
      { label: 'Normal EMG / nerve conduction study', text: r('\\b(emg|ncs|nerve conduction)[^.]*(normal|unremarkable)|(normal|unremarkable)[^.]*(emg|ncs|nerve conduction)') },
      { label: 'Sheet or temperature sensitivity (allodynia)', text: r('\\b(allodynia|bed ?sheets|temperature sensitiv\\w*|sensitiv\\w* to touch)') },
      { label: 'Autonomic symptoms (dizziness, sweating, gut)', text: r('\\b(dizziness on standing|orthostatic|sweating (abnormal|changes)|anhidrosis|gastroparesis)') },
      { label: 'Diabetes / prediabetes / raised HbA1c', lab: { test: r('a1c|hba1c|glucose'), when: ['high'] } },
      { label: 'Low B12', lab: { test: r('\\bb12\\b|cobalamin'), when: ['low'] } },
    ],
    workup: [
      { label: 'Skin punch biopsy for intraepidermal nerve fiber density', test: r('skin (punch )?biopsy|ienfd|nerve fiber density') },
      { label: 'HbA1c and 2-hour glucose tolerance test', test: r('a1c|glucose tolerance|ogtt') },
      { label: 'B12 with methylmalonic acid', test: r('\\bb12\\b|methylmalonic') },
      { label: 'Screen for Sjögren’s, celiac, thyroid', test: r('\\bssa\\b|ttg|tsh') },
    ],
  },
  {
    id: 'celiac',
    name: 'Celiac disease',
    summary:
      'Celiac disease can present with anemia, low bone density, neuropathy, fatigue, joint pain or mouth ulcers – not only gut symptoms. Testing must be done while eating gluten.',
    specialty: 'Gastroenterology',
    minMatches: 3,
    features: [
      { label: 'Bloating / diarrhea / IBS label', text: r('\\b(bloating|diarrh\\w*|ibs|irritable bowel|loose stools)') },
      { label: 'Iron deficiency or low ferritin', lab: { test: r('ferritin|\\biron\\b|transferrin sat'), when: ['low'] } },
      { label: 'Low vitamin D or bone density (osteopenia) at a young age', text: r('\\b(osteopeni\\w*|osteoporo\\w*|low bone density)') },
      { label: 'Neuropathy / tingling', text: r('\\b(neuropath\\w*|tingl\\w*|numbness)') },
      { label: 'Symptoms after gluten', text: r('\\bgluten\\b') },
      { label: 'Mouth ulcers or itchy blistering rash', text: r('\\b(mouth ulcers?|aphthous|dermatitis herpetiformis)') },
      { label: 'Raised liver enzymes', lab: { test: r('\\b(alt|ast|sgpt|sgot)\\b'), when: ['high'] } },
      { label: 'Family history of celiac or autoimmune thyroid', text: r('\\b(celiac|coeliac|hashimoto\\w*)') },
    ],
    workup: [
      { label: 'tTG-IgA with total IgA (on a gluten-containing diet)', test: r('ttg|tissue transglutaminase|endomysial') },
    ],
  },
  {
    id: 'thyroid',
    name: 'Thyroid dysfunction',
    summary: 'Under-active thyroid can cause muscle and joint aches, fatigue, low mood, constipation, cold intolerance and carpal tunnel.',
    specialty: 'Endocrinology / primary care',
    minMatches: 3,
    features: [
      { label: 'High (or high-normal, rising) TSH', lab: { test: r('\\btsh\\b|thyroid stimulating'), when: ['high'] } },
      { label: 'Positive thyroid antibodies (TPO)', lab: { test: r('\\btpo\\b|thyroid peroxidase|thyroglobulin ab'), when: ['positive', 'high'] } },
      { label: 'Cold intolerance', text: r('\\b(cold intolerance|always cold|feels? cold|cold hands)') },
      { label: 'Weight gain', text: r('\\bweight gain\\b') },
      { label: 'Constipation', text: r('\\bconstipat\\w*') },
      { label: 'Hair loss / dry skin', text: r('\\b(hair loss|thinning hair|dry skin)') },
      { label: 'Carpal tunnel', text: r('\\bcarpal tunnel\\b') },
      { label: 'Fatigue / low mood', text: r('\\b(fatigue|low mood|depress\\w*)') },
    ],
    workup: [
      { label: 'TSH, free T4, TPO antibodies', test: r('\\btsh\\b|free t4|\\btpo\\b') },
    ],
  },
  {
    id: 'hyperpara',
    name: 'Calcium / parathyroid disorder',
    summary:
      '"Stones, bones, groans and moans": high calcium from an over-active parathyroid gland causes bone pain, kidney stones, abdominal pain, fatigue and low mood. A mildly high calcium is easily ignored.',
    specialty: 'Endocrinology',
    minMatches: 2,
    features: [
      { label: 'High calcium', lab: { test: r('\\bcalcium\\b|\\bca\\b'), when: ['high'] } },
      { label: 'High PTH', lab: { test: r('\\bpth\\b|parathyroid'), when: ['high'] } },
      { label: 'Kidney stones', text: r('\\b(kidney stones?|renal (calculi|stones?)|nephrolithiasis)') },
      { label: 'Bone pain / low bone density / fractures', text: r('\\b(bone pain|osteopeni\\w*|osteoporo\\w*|fragility fracture|stress fracture)') },
      { label: 'Abdominal pain / constipation', text: r('\\b(abdominal pain|constipat\\w*)') },
    ],
    workup: [{ label: 'Calcium (albumin-adjusted) with PTH and vitamin D together', test: r('\\bpth\\b|parathyroid') }],
  },
  {
    id: 'hemochromatosis',
    name: 'Iron overload (hemochromatosis)',
    summary: 'Hereditary iron overload causes fatigue and arthritis – classically knuckles of the index/middle fingers – with raised ferritin and liver enzymes.',
    specialty: 'Hepatology / hematology',
    minMatches: 2,
    features: [
      { label: 'High ferritin', lab: { test: r('ferritin'), when: ['high'] } },
      { label: 'High transferrin saturation', lab: { test: r('transferrin sat|tsat|iron saturation'), when: ['high'] } },
      { label: 'Hand arthritis (2nd/3rd knuckles)', text: r('\\b(mcp|knuckle)\\w*[^.]*(arthritis|pain|swelling)|hook-?like osteophytes|chondrocalcinosis') },
      { label: 'Raised liver enzymes', lab: { test: r('\\b(alt|ast|ggt)\\b'), when: ['high'] } },
    ],
    workup: [{ label: 'Fasting transferrin saturation and HFE genotype', test: r('transferrin sat|hfe') }],
  },
  {
    id: 'myositis',
    name: 'Inflammatory / metabolic muscle disease',
    summary: 'Muscle pain with weakness (trouble with stairs, getting up from chairs, lifting arms), especially with a raised CK, deserves a muscle work-up – also consider medication causes such as statins.',
    specialty: 'Rheumatology / neuromuscular neurology',
    minMatches: 2,
    features: [
      { label: 'Raised CK', lab: { test: r('\\bck\\b|creatine kinase|\\bcpk\\b'), when: ['high'] } },
      { label: 'Proximal weakness', text: r('\\b(proximal (muscle )?weakness|difficulty (with )?(stairs|climbing stairs|rising from|getting up)|muscle weakness)') },
      { label: 'Muscle pain', text: r('\\b(myalgia|muscle (pain|aches?))') },
      { label: 'Statin use', text: r('\\b(atorvastatin|simvastatin|rosuvastatin|pravastatin|statin)\\b') },
    ],
    workup: [{ label: 'CK, aldolase, myositis antibody panel; EMG', test: r('\\bck\\b|creatine kinase|myositis') }],
  },
  {
    id: 'pmr',
    name: 'Polymyalgia rheumatica',
    summary: 'In people over 50, new shoulder and hip girdle aching with marked morning stiffness and raised inflammatory markers.',
    specialty: 'Rheumatology',
    minMatches: 3,
    minAge: 50,
    features: [
      { label: 'Shoulder pain (both sides)', text: r('\\b(bilateral shoulder|both shoulders|shoulder girdle|left shoulder|right shoulder)') },
      { label: 'Hip girdle pain', text: r('\\b(hip girdle|both hips|left hip|right hip|bilateral hip)') },
      { label: 'Morning stiffness', text: r('\\bmorning stiffness\\b') },
      { label: 'Raised ESR/CRP', lab: { test: r('\\bcrp\\b|c-reactive|\\besr\\b'), when: ['high'] } },
    ],
    workup: [{ label: 'ESR and CRP; ask about headache / jaw pain on chewing / vision (giant cell arteritis)', test: r('\\besr\\b') }],
  },
  {
    id: 'endo',
    name: 'Endometriosis / adenomyosis',
    summary:
      'Endometriosis takes 7–10 years to diagnose on average and can cause pelvic, back, leg, bowel and bladder pain that follows the menstrual cycle. Normal ultrasound does not exclude it.',
    specialty: 'Gynecology (endometriosis specialist)',
    minMatches: 3,
    features: [
      { label: 'Painful periods', text: r('\\b(dysmenorrh\\w*|painful periods|period pain|severe cramps)') },
      { label: 'Pelvic pain', text: r('\\bpelvic pain\\b|\\bpelvis pain\\b') },
      { label: 'Symptoms that follow the menstrual cycle', text: r('\\b(cyclical|cyclic|menstrual cycle|worse (around|during|before) (my )?period)') },
      { label: 'Painful bowel movements / bladder pain', text: r('\\b(dyschezia|painful bowel movements|bladder pain|interstitial cystitis)') },
      { label: 'Heavy bleeding / anemia', text: r('\\b(menorrhagia|heavy (periods|bleeding))') },
      { label: 'Fertility difficulties', text: r('\\b(infertility|difficulty conceiving)') },
      { label: 'Ovarian cysts (endometrioma)', text: r('\\b(endometrioma|chocolate cyst|ovarian cyst)') },
    ],
    workup: [{ label: 'Specialist transvaginal ultrasound / MRI for deep endometriosis', test: r('endometriosis (protocol|scan|mri)|deep endometriosis') }],
  },
  {
    id: 'osa',
    name: 'Sleep disorder (e.g., sleep apnea)',
    summary: 'Unrefreshing sleep amplifies pain sensitivity. Sleep apnea is under-diagnosed in women and slim people; it often presents as fatigue, morning headaches and poor concentration.',
    specialty: 'Sleep medicine',
    minMatches: 3,
    features: [
      { label: 'Unrefreshing sleep / insomnia', text: r('\\b(unrefreshing sleep|non-?restorative sleep|insomnia|poor sleep|wakes? (up )?(tired|exhausted))') },
      { label: 'Snoring / gasping', text: r('\\b(snor\\w*|gasping|witnessed apnea|apnoea)') },
      { label: 'Daytime sleepiness', text: r('\\b(daytime sleepiness|somnolence|falling asleep)') },
      { label: 'Morning headaches', text: r('\\bmorning headaches?\\b') },
      { label: 'Teeth grinding / jaw clenching', text: r('\\b(bruxism|grinding|clenching)') },
      { label: 'Restless legs', text: r('\\b(restless legs?|rls)\\b') },
    ],
    workup: [{ label: 'Sleep study (polysomnography)', test: r('polysomnograph\\w*|sleep study') }],
  },
  {
    id: 'ms',
    name: 'Demyelinating disease (e.g., MS)',
    summary: 'Episodes of neurological symptoms that come and go – vision problems, numbness, electric shocks down the spine – separated in time and seen by different doctors.',
    specialty: 'Neurology',
    minMatches: 3,
    features: [
      { label: 'Vision loss / painful eye movement / optic neuritis', text: r('\\b(optic neuritis|vision loss|blurred vision|double vision|diplopia)') },
      { label: 'Episodes of numbness or weakness', text: r('\\b(numbness|weakness)\\b') },
      { label: 'Electric shock with neck bending (Lhermitte)', text: r("\\b(lhermitte\\w*|electric (shocks?|sensation) (down|along) (the )?(spine|back))") },
      { label: 'Bladder urgency', text: r('\\b(urinary urgency|bladder urgency|incontinence)') },
      { label: 'White-matter lesions on MRI', text: r('\\b(white matter (lesions?|hyperintensit\\w*)|demyelinat\\w*|t2 hyperintens\\w*)') },
      { label: 'Heat makes symptoms worse', text: r('\\b(uhthoff|worse (with|in) (the )?heat)') },
    ],
    workup: [{ label: 'MRI brain and spine with contrast', test: r('mri (brain|head)') }],
  },
  {
    id: 'cci',
    name: 'Chiari / craniocervical instability',
    summary: 'Occipital headache brought on by coughing or straining, with neck pain, dizziness and swallowing/tinnitus symptoms – more common with hypermobility.',
    specialty: 'Neurosurgery / neurology',
    minMatches: 3,
    features: [
      { label: 'Headache at back of head, worse with cough/strain', text: r('\\b(occipital headache|cough headache|headache (worse|triggered) (with|by) (cough\\w*|strain\\w*|sneez\\w*|laugh\\w*))') },
      { label: 'Chronic neck pain', text: r('\\bneck pain\\b') },
      { label: 'Dizziness / balance problems', text: r('\\b(dizz\\w*|vertigo|imbalance|balance problems)') },
      { label: 'Tinnitus or pressure in ears', text: r('\\b(tinnitus|ear pressure)') },
      { label: 'Swallowing difficulty', text: r('\\b(dysphagia|difficulty swallowing)') },
      { label: 'Low-lying tonsils on imaging', text: r('\\b(chiari|tonsillar ectopia|low[- ]lying tonsils|cerebellar tonsil)') },
      { label: 'Hypermobility', text: r('\\b(hyper-?mobil\\w*|eds\\b|ehlers)') },
    ],
    workup: [{ label: 'Upright / flexion-extension cervical MRI review by specialist', test: r('upright mri|flexion[- ]extension') }],
  },
];

/** Baseline tests many clinicians would expect in an unexplained chronic pain work-up. */
export const BASELINE_TESTS: { label: string; test: RegExp }[] = [
  { label: 'Full blood count (CBC)', test: r('\\b(cbc|fbc|full blood count|complete blood count|hemoglobin|haemoglobin|hgb|wbc)\\b') },
  { label: 'Kidney & liver function', test: r('\\b(creatinine|egfr|alt|ast|cmp|bmp)\\b') },
  { label: 'CRP (inflammation)', test: r('\\bcrp\\b|c-reactive') },
  { label: 'ESR (inflammation)', test: r('\\besr\\b|sed(imentation)? rate') },
  { label: 'TSH (thyroid)', test: r('\\btsh\\b') },
  { label: 'Vitamin D (25-OH)', test: r('vitamin d|25-?oh|25\\(oh\\)') },
  { label: 'Vitamin B12', test: r('\\bb12\\b|cobalamin') },
  { label: 'Ferritin / iron studies', test: r('ferritin') },
  { label: 'HbA1c (blood sugar)', test: r('a1c') },
  { label: 'Calcium', test: r('\\bcalcium\\b') },
  { label: 'CK (muscle enzyme)', test: r('\\bck\\b|creatine kinase|\\bcpk\\b') },
  { label: 'ANA (autoimmune screen)', test: r('\\bana\\b|antinuclear') },
];
