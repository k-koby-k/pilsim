# 01 — Data Acquisition

**Agent A. All endpoints below were executed from a Linux shell with `curl` on
2026-08-16/17 (UTC).** Every `curl` in this file was actually run. Every pasted
response is a real, truncated response body. Where a source is dead, blocked, or
key-gated, it says so.

> **Safety framing (carries to every artifact):** PilSim is a *research simulator*.
> Nothing acquired here is validated for clinical decision-making. Regulatory labeling
> is used as a data source about drug products, not as prescribing guidance.

**Locked drug set:** lisinopril, losartan, amlodipine, hydrochlorothiazide, metoprolol
(+ their excipients, + human physiological reference values).

---

## 0. TL;DR — the answer to "can we remove the runtime API dependency?"

**Yes, completely.** Every field PilSim needs at runtime can come from a
version-controlled JSON baked into the repo at build time. Recommended acquisition
plan, total ~200 MB of downloads, none of which are needed at runtime:

| Need | Bulk artifact | Size | Format | Status |
|---|---|---|---|---|
| Regulatory labeling (5 drugs, boxed warnings, contraindications, PK section, excipients) | `https://download.open.fda.gov/drug/label/drug-label-{0001..0014}-of-0014.json.zip` | 130–143 MB **per part**, 14 parts | zipped NDJSON-in-JSON | VERIFIED WORKING 2026-08-17 |
| Chemical identity + PD binding constants + ATC + indications | ChEMBL 37 `chembl_37_chemreps.txt.gz` / `chembl_37_postgresql.tar.gz` | see §2.2 | TSV / PG dump | VERIFIED WORKING 2026-08-17 |
| Excipient max-daily-exposure per route/dosage form | FDA IID `iig_july_2026.zip` | **382,910 B (374 KB)** | ZIP → CSV + XLS | VERIFIED WORKING 2026-08-17 |
| Adverse effect → drug mapping (MedDRA terms) | SIDER 4.1 `meddra_all_se.tsv.gz` | **2,381,171 B (2.3 MB)** | TSV.GZ | VERIFIED WORKING 2026-08-17 |
| Human organ volumes + blood flows + GFR + cardiac output | US EPA `httk` datatables (raw GitHub TXT) | **1.2–5.1 KB each** | TSV | VERIFIED WORKING 2026-08-17 |
| Pharmacogenomics (CYP2D6 × metoprolol) | CPIC API `api.cpicpgx.org` (snapshot to JSON) | < 5 KB for our set | JSON | VERIFIED WORKING 2026-08-17 |
| ATC code + DDD | WHO ATCDDD index (HTML, 5 scrapes) | ~30 KB | HTML → 5 hand-typed values | VERIFIED WORKING 2026-08-17 |
| Drug-product identity / RxCUI / available strengths & forms | RxNav REST (snapshot) or RxNorm full release (UMLS login) | small | JSON | VERIFIED WORKING 2026-08-17 |

**Practical recommendation for the 24-hour build:** do **not** download the 14-part
openFDA label bulk (1.8 GB). For 5 drugs, hit the openFDA *live* API once at build
time, write the response to `data/raw/openfda-labels.json`, and commit it. Same for
ChEMBL, RxNav, CPIC, and DrugCentral. Download only the two genuinely small bulk
files (FDA IID 374 KB, SIDER 2.3 MB) and the httk TSVs (< 50 KB total). That is a
~3 MB repo addition and gives full offline determinism.

**Dead / unusable this cycle (details in §5):** NLM RxNav **Drug Interaction API**
(retired ~2024-01-02, confirmed 404), DrugBank downloads (403 bot-wall),
DDInter (host unreachable), PK-DB `/api/v1/substances/` (404 — resource renamed),
DrugCentral `/api/v1/*` on the main host (404 — API moved to a new host), ICD-11 API
(401 without OAuth key), RxNorm full release (UMLS login redirect), HPA
`/download/tsv/proteinatlas.tsv.zip` (404 — path changed).

**Browser-direct (CORS) summary — measured, §6:** openFDA, ChEMBL, RxNav, PubChem,
ClinicalTrials.gov, PK-DB, CPIC all send `Access-Control-Allow-Origin: *`.
**DailyMed and DrugCentral-DRS send no ACAO header — a browser fetch will be
blocked.** Since nothing lives in the runtime path this is informational only.

---

## 1. Chemical / structural identity

### 1.1 PubChem PUG-REST — `VERIFIED WORKING 2026-08-17` (with a caveat)

- **Source:** PubChem, NCBI / NLM / NIH.
- **License:** public domain (US Government work). Attribution not legally required;
  cite as courtesy.
- **Base URL:** `https://pubchem.ncbi.nlm.nih.gov/rest/pug/`

```bash
curl -s -w '\n[HTTP %{http_code}] %{size_download}B %{time_total}s\n' \
 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/losartan/property/MolecularFormula,MolecularWeight,XLogP/JSON'
```

Real response:

```json
{
  "PropertyTable": {
    "Properties": [
      {
        "CID": 3961,
        "MolecularFormula": "C22H23ClN6O",
        "MolecularWeight": "422.9",
        "XLogP": 4.3
      }
    ]
  }
}

[HTTP 200] 192B 1.737258s
```

- **JSON paths:** `PropertyTable.Properties[0].CID`, `.MolecularFormula`,
  `.MolecularWeight` (string!), `.XLogP`, `.TPSA`, `.HBondDonorCount`,
  `.HBondAcceptorCount`, `.InChIKey`, `.SMILES`.
- **⚠️ Property name change:** `CanonicalSMILES` is no longer accepted as a property
  name in the current PUG-REST — use **`SMILES`**. My first attempt with
  `CanonicalSMILES` was part of a batch that also failed for throttling reasons, so
  treat this as "use `SMILES`, it definitely works".
- **⚠️ Throttling is aggressive and will bite you.** My first three attempts returned:

```
{"Fault": {"Code": "PUGREST.ServerBusy", "Message": "Too many requests or server too busy"}}
[HTTP 503] 109B
```

  with response headers:

```
retry-after: 30
x-throttling-control: Request Count status: Green (0%), Request Time status: Green (0%),
                      Service status: Green (13%), too many requests per second or blacklisted
access-control-allow-origin: *
```

  The literal string `too many requests per second or blacklisted` appears. This is a
  **shared-egress-IP problem** — a cloud/NAT IP can be throttled for traffic that is
  not yours. It recovered on its own ~4 minutes later without any change on my side.
  **Implication for the build: never put PubChem in the demo path.** Even the build
  script should retry with backoff and honour `Retry-After: 30`. Monitor the
  `x-throttling-control` header, which on a healthy request reads:
  `Request Count status: Green (3%), Request Time status: Green (0%), Service status: Green (3%)`.
- **Documented limits:** PubChem publishes a dynamic-throttling policy at
  `https://pubchem.ncbi.nlm.nih.gov/docs/dynamic-request-throttling` (page is
  JS-rendered; I could not extract the numeric text). The conventional guidance is
  ≤5 requests/second and ≤400 requests/minute — **treat that as unverified**, and
  rely on the `x-throttling-control` header, which I *did* verify is emitted.
- **No API key required.**
- **CORS:** `access-control-allow-origin: *` — verified present on both 200 and 503.
- **PUG-View (full annotated record, including pharmacology, toxicity, drug warnings):**

```bash
curl -s -o /dev/null -w '[HTTP %{http_code}] %{size_download}B\n' \
 'https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/3961/JSON'
# [HTTP 200] 1410476B
```
  1.41 MB for one compound. Rich but heavy — fine to snapshot 5 of them (~7 MB).

**BULK DOWNLOAD:** yes.
`https://ftp.ncbi.nlm.nih.gov/pubchem/Compound/Extras/CID-SMILES.gz`
— verified `HTTP/1.1 200`, `Content-Length: 1485177634` (**1.49 GB**), gzipped TSV of
CID→SMILES for all of PubChem. **Overkill for 5 drugs — do not use.** Snapshot the
5 PUG-REST responses instead.

### 1.2 ChEMBL REST API — `VERIFIED WORKING 2026-08-17` — *primary recommendation*

- **Source:** ChEMBL, EMBL-EBI.
- **License:** **CC BY-SA 3.0** (verified — fetched `LICENSE` from the FTP root, first
  line reads `Creative Commons / Attribution-ShareAlike 3.0 Unported`).
  **Attribution IS required.** The `REQUIRED.ATTRIBUTION` file specifies the citation:
  > Mendez D, Gaulton A, Bento AP, et al. *ChEMBL: towards direct deposition of bioassay
  > data.* Nucleic Acids Res. 2019 47(D1):D930-D940. DOI: 10.1093/nar/gky1075
  **Note the ShareAlike clause** — if `data/substances.json` embeds ChEMBL values it is
  arguably a derivative work. For a hackathon this is fine; put the attribution in the
  README and in the app's About panel.
- **Base URL:** `https://www.ebi.ac.uk/chembl/api/data/`

```bash
curl -s -w '\n[HTTP %{http_code}] %{size_download}B %{time_total}s\n' \
 'https://www.ebi.ac.uk/chembl/api/data/molecule.json?pref_name__iexact=LISINOPRIL'
```

Real response (truncated):

```json
{"molecules": [{"atc_classifications": ["C09AA03"], "availability_type": 1,
"black_box_warning": 1, "chirality": 1,
"cross_references": [{"xref_id": "lisinopril", "xref_name": "lisinopril", "xref_src": "DailyMed"}],
"dosed_ingredient": true, "first_approval": 1987, "max_phase": "4.0",
"molecule_chembl_id": "CHEMBL419213",
"molecule_hierarchy": {"active_chembl_id": "CHEMBL1237", "parent_chembl_id": "CHEMBL1237"},
"molecule_properties": {"alogp": "1.24", "aromatic_rings": 1,
 "full_molformula": "C21H35N3O7", "full_mwt": "441.53", "hba": 5, "hbd": 4,
 "heavy_atoms": 29, "mw_freebase": "405.50", "num_ro5_violations": 0,
 "psa": "132.96", "qed_weighted": "0.38", "ro3_pass": "N", "rtb": 12},
"molecule_structures": {"canonical_smiles":
 "NCCCC[C@H](N[C@@H](CCc1ccccc1)C(=O)O)C(=O)N1CCC[C@H]1C(=O)O.O.O", ...
```

- **JSON paths PilSim needs:**
  - ATC code → `molecules[0].atc_classifications[0]` (`"C09AA03"`)
  - MW (salt/hydrate) → `molecules[0].molecule_properties.full_mwt`
  - MW (free base — **use this for molar PK math**) → `.molecule_properties.mw_freebase`
  - logP → `.molecule_properties.alogp`; TPSA → `.psa`; HBD/HBA → `.hbd`/`.hba`
  - Rotatable bonds → `.rtb`; Lipinski violations → `.num_ro5_violations`
  - SMILES → `.molecule_structures.canonical_smiles`
  - Boxed warning flag → `.black_box_warning` (**`1` for lisinopril** — the fetal
    toxicity box. Directly usable as a rules-engine trigger.)
  - Parent vs salt id → `.molecule_hierarchy.parent_chembl_id` / `molecule_chembl_id`
- **⚠️ Salt/parent gotcha that will cost you an hour if you miss it.** Name lookup
  returns the *salt/hydrate* record (`CHEMBL419213`, lisinopril dihydrate, MW 441.53).
  The *parent* is `CHEMBL1237` (MW 405.50). Mechanism/target data hangs off the **salt**
  id here, while indications hang off the **parent** id. I verified both:

```bash
curl -s 'https://www.ebi.ac.uk/chembl/api/data/mechanism.json?molecule_chembl_id=CHEMBL1237'
# {"mechanisms": [], "page_meta": {"total_count": 0}}   <-- EMPTY

curl -s 'https://www.ebi.ac.uk/chembl/api/data/mechanism.json?molecule_chembl_id=CHEMBL419213'
```
```json
{"mechanisms": [{"action_type": "INHIBITOR", "direct_interaction": 1,
"disease_efficacy": 1, "max_phase": 4, "mec_id": 116,
"mechanism_of_action": "Angiotensin-converting enzyme inhibitor",
"mechanism_refs": [{"ref_id": "label/2016/019777s074lbl.pdf", "ref_type": "FDA",
 "ref_url": "http://www.accessdata.fda.gov/drugsatfda_docs/label/2016/019777s074lbl.pdf"}],
"molecular_mechanism": 1, "molecule_chembl_id": "CHEMBL419213",
"parent_molecule_chembl_id": "CHEMBL1237", "target_chembl_id": "CHEMBL1808"}]}
```
  **Always query mechanism with BOTH ids and take whichever is non-empty.**

**BULK DOWNLOAD:** yes — `https://ftp.ebi.ac.uk/pub/databases/chembl/ChEMBLdb/latest/`
Directory listing verified live; **current release is ChEMBL 37**. Files present:
`chembl_37_chemreps.txt.gz` (SMILES/InChI for all molecules — the right one for us),
`chembl_37.sdf.gz`, `chembl_37_postgresql.tar.gz`, `chembl_37_mysql.tar.gz`,
`chembl_37.h5`, plus `LICENSE`, `README`, `REQUIRED.ATTRIBUTION`, `checksums.txt`.
The full PG dump is tens of GB — **do not**. `chembl_37_chemreps.txt.gz` is the only
plausible bulk artifact for this project, and even that is unnecessary for 5 drugs.

---

## 2. Pharmacodynamics / dose–response (binding constants)

### 2.1 ChEMBL `activity` endpoint — `VERIFIED WORKING 2026-08-17` — **this is the PD gold**

Lisinopril × ACE (target `CHEMBL1808`):

```bash
curl -s 'https://www.ebi.ac.uk/chembl/api/data/activity.json?molecule_chembl_id=CHEMBL1237&target_chembl_id=CHEMBL1808&limit=3'
```

Real response, parsed:

```
count 23
IC50 1.2   nM | CHEMBL1126739 Inhibition of Angiotensin I converting enzyme
IC50 4.7   nM | CHEMBL1133572 Inhibitory activity against angiotensin I converting enzyme
IC50 1.202 nM | CHEMBL1126767 Inhibitory activity against angiotensin converting enzyme (A...
```

- **JSON paths:** `activities[].standard_type` (`IC50`/`Ki`/`Kd`),
  `.standard_value`, `.standard_units`, `.standard_relation`,
  `.assay_description`, `.document_chembl_id`, `.assay_chembl_id`, `.target_chembl_id`.
- **Total count is in `page_meta.total_count`.**
- **This gives Agent E a real, citable IC50 for the Emax/IC50 PD link, with spread**
  (1.2–4.7 nM across 23 assays = an honest inter-assay CV, exactly what the mission
  brief asks for instead of a midpoint).
- Target ChEMBL ids to use: ACE `CHEMBL1808`. For the other four, resolve via
  `mechanism.json?molecule_chembl_id=<salt_id>` → `.target_chembl_id`, then feed that
  into `activity.json`. **I verified this pipeline end-to-end for lisinopril only** —
  Agent B should re-run it for the other four and record what comes back.
- ⚠️ **Caveat for the team:** ChEMBL IC50s are *in vitro* enzyme/receptor assays. They
  are NOT the same as the *in vivo* plasma EC50 that drives blood pressure. Using an
  ACE IC50 of 1.2 nM directly as a PD EC50 will produce a wildly over-potent
  simulation. Agent E must fit the clinical EC50 from dose–response literature and use
  ChEMBL only to establish *relative* potency and mechanism provenance. **Flag this
  loudly.**

### 2.2 ChEMBL `drug_indication` — drug↔disease mapping, `VERIFIED WORKING 2026-08-17`

```bash
curl -s -w '\n[HTTP %{http_code}] %{size_download}B\n' \
 'https://www.ebi.ac.uk/chembl/api/data/drug_indication.json?molecule_chembl_id=CHEMBL1237&limit=3'
```

```json
{"drug_indications": [
 {"drugind_id": 111938, "efo_id": "EFO:0000279", "efo_term": "azoospermia",
  "indication_refs": [{"ref_id": "NCT01409837", "ref_type": "ClinicalTrials",
   "ref_url": "https://clinicaltrials.gov/search?term=NCT01409837"}],
  "max_phase_for_ind": "2.0", "mesh_heading": "Azoospermia", "mesh_id": "D053713",
  "molecule_chembl_id": "CHEMBL1237"},
 {"drugind_id": 111940, "efo_id": "EFO:0000319", "efo_term": "cardiovascular disease",
  "max_phase_for_ind": "3.0", "mesh_heading": "Cardiovascular Diseases",
  "mesh_id": "D002318", ...},
 {"drugind_id": 111941, "efo_id": "EFO:0000400", "efo_term": "diabetes mellitus", ...
```

- **JSON paths:** `drug_indications[].efo_id`, `.efo_term`, `.mesh_id`,
  `.mesh_heading`, `.max_phase_for_ind`.
- **Use for Agent C:** gives EFO/MeSH ontology ids to key the comorbidity presets on,
  so `data/rules.json` conditions are ontology-backed rather than free text.
- **⚠️ Noise warning:** this table is trial-derived, not label-derived. Note that
  "azoospermia" is the first hit for lisinopril — it is a Phase-2 trial indication, not
  a real indication. **Filter on `max_phase_for_ind == "4.0"`** and cross-check against
  the openFDA `indications_and_usage` field before putting anything in `rules.json`.

### 2.3 ChEMBL `drug_warning` — `VERIFIED WORKING 2026-08-17`

```bash
curl -s 'https://www.ebi.ac.uk/chembl/api/data/drug_warning.json?limit=2'
```
```json
{"drug_warnings": [{"efo_id_for_warning_class": "EFO:0011052",
"molecule_chembl_id": "CHEMBL4303288", "parent_molecule_chembl_id": "CHEMBL1380",
"warning_class": "hepatotoxicity", "warning_country": "United States",
"warning_refs": [{"ref_id": "de109a2b-e36c-40d0-85fc-a67a9e7f1ae8",
 "ref_type": "DailyMed", "ref_url": "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=..."}]}]}
```
- Filterable by `molecule_chembl_id`. Fields: `.warning_class`, `.warning_country`,
  `.warning_description`, `.warning_refs[]`. Useful as a *secondary* cross-check for
  `rules.json` severity; the primary should be the openFDA label boxed warning.

---

## 3. Regulatory drug product labeling + excipients + adverse effects

### 3.1 openFDA `/drug/label` — `VERIFIED WORKING 2026-08-17` — **the workhorse**

- **Source:** openFDA, US FDA. **License:** public domain / CC0-equivalent (see
  `https://open.fda.gov/license/`). Attribution not required; the disclaimer *is*
  embedded in every response and should be surfaced in the UI.
- **Base URL:** `https://api.fda.gov/drug/label.json`

```bash
curl -s -w '\n[HTTP %{http_code}] %{size_download}B %{time_total}s\n' \
 'https://api.fda.gov/drug/label.json?search=openfda.generic_name:%22lisinopril%22&limit=1'
```

Real response, first ~15 lines:

```json
{
  "meta": {
    "disclaimer": "Do not rely on openFDA to make decisions regarding medical care. While we make every effort to ensure that data is accurate, you should assume all results are unvalidated. We may limit or otherwise restrict your access to the API in line with our Terms of Service.",
    "terms": "https://open.fda.gov/terms/",
    "license": "https://open.fda.gov/license/",
    "last_updated": "2026-08-14",
    "results": { "skip": 0, "limit": 1, "total": 229 }
  },
  "results": [
    {
      "spl_product_data_elements": ["Lisinopril and Hydrochlorothiazide Lisinopril and Hydrochlorothiazide Tablets DIBASIC CALCIUM PHOSPHATE DIHYDRATE MANNITOL STARCH, CORN MAGNESIUM STEARATE LISINOPRIL LISINOPRIL ANHYDROUS HYDROCHLOROTHIAZIDE HYDROCHLOROTHIAZIDE H150"],
      "boxed_warning": ["WARNING: FETAL TOXICITY When pregnancy is detected, discontinue lisinopril and hydrochlorothiazide tablets as soon as possible. Drugs that act directly on the renin-angiotensin system can cause injury and death to the developing fetus. See Warnings, Fetal Toxicity ."],
      "description": ["DESCRIPTION Lisinopril and hydrochlorothiazide tablets combine an angiotensin converting enzyme inhibitor, lisinopril, and a diuretic, hydrochlorothiazide. ... Its empirical formula is C 21 H 31 N 3 O 5 • 2H 2 O and its structural formula is: Lisinopril, USP is a white to off-white, crystalline powder, with a molecular weight of 441.52. ..."],
```

**Field map (JSON paths) — this is what Agents B/C/F should key on:**

| PilSim need | openFDA path |
|---|---|
| Boxed warning (highest-severity rule trigger) | `results[0].boxed_warning[0]` |
| Contraindications | `results[0].contraindications[0]` |
| Warnings & precautions | `results[0].warnings_and_cautions[0]` / `.warnings[0]` |
| Drug interactions | `results[0].drug_interactions[0]` |
| Indications | `results[0].indications_and_usage[0]` |
| Dosing + renal/hepatic adjustment | `results[0].dosage_and_administration[0]` |
| PK/PD narrative (Cmax, Tmax, t½, F, protein binding, CL) | `results[0].clinical_pharmacology[0]` |
| Adverse reactions | `results[0].adverse_reactions[0]` |
| Pregnancy | `results[0].pregnancy[0]` / `.use_in_specific_populations[0]` |
| **Excipients (Rx)** | `results[0].spl_product_data_elements[0]` ← see gotcha below |
| Excipients (OTC only) | `results[0].inactive_ingredient` |
| UNII, RxCUI, route, brand/generic | `results[0].openfda.{unii,rxcui,route,brand_name,generic_name,substance_name,product_type}` |

Verified `openfda` sub-object for amlodipine:

```json
{"brand_name": ["Amlodipine Besylate"], "generic_name": ["AMLODIPINE BESYLATE"],
 "product_type": ["HUMAN PRESCRIPTION DRUG"], "route": ["ORAL"],
 "substance_name": ["AMLODIPINE BESYLATE"],
 "rxcui": ["197361", "308135", "308136"], "unii": ["864V2Q084H"]}
```

Verified `clinical_pharmacology` head for amlodipine (this is where Agent B's PD text
comes from):

> `"12 CLINICAL PHARMACOLOGY 12.1 Mechanism of Action Amlodipine is a dihydropyridine calcium antagonist (calcium ion antagonist or slow-channel blocker) that inhibits the transmembrane influx of calcium ions into vascular smooth muscle and cardiac muscle..."`

Verified `dosage_and_administration` head for amlodipine:

> `"2 DOSAGE AND ADMINISTRATION •Adult recommended starting dose: 5 mg once daily with maximum dose 10 mg once daily. (2.1) о Small, fragile, or elderly patients, or patients with hepatic insufficiency may be started on 2.5 mg once daily. (2.1) •Pediatric starting dose: 2.5 mg to 5 mg once daily."`

**⚠️ EXCIPIENT GOTCHA — verified, and it matters for Locked Decision 2.**
`inactive_ingredient` is **`None` for prescription labels** — I checked amlodipine
and got `inactive_ingredient : None` across a `_exists_` query and a plain query.
That field only populates for OTC drug labels. For Rx products the excipients live
in **`spl_product_data_elements`**, as one giant space-separated uppercase string
containing actives *and* inactives interleaved. Verified for metoprolol tartrate:

```
'Metoprolol Tartrate Metoprolol Tartrate STARCH, CORN SODIUM STARCH GLYCOLATE TYPE A
 POTATO SILICON DIOXIDE SODIUM LAURYL SULFATE TALC MAGNESIUM STEARATE HYPROMELLOSE
 2910 (6 MPA.S) TITANIUM DIOXIDE POLYETHYLENE GLYCOL 400 POLYSORBATE 80 METOPROLOL
 TARTRATE METOPROLOL MICROCRYSTALLINE CELLULOSE C;73'
```

That is a genuine, real excipient list for a metoprolol tablet — film-coated
(hypromellose/TiO2/PEG400/polysorbate 80), with corn starch + microcrystalline
cellulose as fillers, sodium starch glycolate as disintegrant, magnesium stearate +
talc as lubricants, silicon dioxide as glidant, SLS as wetting agent. **It parses,
but only by string-splitting against a known excipient vocabulary** (use the FDA IID
ingredient-name list in §3.4 as that vocabulary — the names match exactly, e.g.
`MAGNESIUM STEARATE`, `SODIUM STARCH GLYCOLATE TYPE A POTATO`). A cleaner alternative
is DailyMed XML (§3.3), which gives them as discrete `<name>` elements.

**Rate limits (verified from `https://open.fda.gov/apis/authentication/`):**
- Without key: **240 requests/minute per IP, 1,000 requests/day per IP**
- With key: **240 requests/minute per key, 120,000 requests/day per key**
- Key passed as `?api_key=...` before other params, or as HTTP Basic auth username.
- **Free key registration URL:** the "Get your API key" section on
  `https://open.fda.gov/apis/authentication/` renders its signup form **client-side**
  (Gatsby/api.data.gov widget); I could not extract a static form URL from the HTML.
  Escalation contact given on the page is `open@fda.hhs.gov`. **Honest status: free,
  self-service, but I could not verify a direct link — go to
  `https://open.fda.gov/apis/authentication/` in a browser.**
  For 5 drugs at build time you do not need a key at all.

**Pagination cap (verified):** `?limit=1000` → `HTTP 200`. `?skip=26000` → **`HTTP 400`**.
openFDA caps `skip` at 25,000; deeper paging needs `search_after` or the bulk files.
Irrelevant for 5 drugs, relevant if anyone tries to mirror the corpus.

**CORS:** `access-control-allow-origin: *` — verified.

**BULK DOWNLOAD: YES.** Enumerated live from the machine-readable index:

```bash
curl -s -w '\n[HTTP %{http_code}] %{size_download}B %{time_total}s\n' 'https://api.fda.gov/download.json'
# [HTTP 200] 590070B 2.349983s
```

Parsed (export date / record count / partitions / first-partition size):

| Endpoint | Export date | Records | Parts | Part-1 URL & size |
|---|---|---|---|---|
| `drug/label` | 2026-08-15 | 261,760 | 14 | `https://download.open.fda.gov/drug/label/drug-label-0001-of-0014.json.zip` — **130.63 MB** (part 2 = 142.88 MB) |
| `drug/ndc` | 2026-08-15 | 137,016 | 1 | `https://download.open.fda.gov/drug/ndc/drug-ndc-0001-of-0001.json.zip` — **26.76 MB** |
| `drug/drugsfda` | 2026-08-15 | 29,269 | 1 | `https://download.open.fda.gov/drug/drugsfda/drug-drugsfda-0001-of-0001.json.zip` — **8.96 MB** |
| `drug/orangebook` | 2026-08-15 | 48,664 | 1 | `https://download.open.fda.gov/drug/orangebook/drug-orangebook-0001-of-0001.json.zip` — **2.34 MB** |
| `other/unii` | 2026-08-15 | 175,523 | 1 | `https://download.open.fda.gov/other/unii/other-unii-0001-of-0001.json.zip` — **3.47 MB** |
| `drug/event` (FAERS) | 2026-08-10 | 20,692,690 | **1,767** | `https://download.open.fda.gov/drug/event/2004q3/drug-event-0001-of-0005.json.zip` — 48.94 MB (×1767 ≈ tens of GB) |

**Recommended for PilSim:** `other/unii` (3.47 MB — canonical substance-name↔UNII
table, perfect for normalising excipient names) and `drug/orangebook` (2.34 MB —
gives real approved strengths and dosage forms for `data/products.json`). Skip the
rest; snapshot the 5 live label queries instead.

### 3.2 openFDA `/drug/event` (FAERS) — adverse effects — `VERIFIED WORKING 2026-08-17`

```bash
curl -s -w '\n[HTTP %{http_code}] %{size_download}B %{time_total}s\n' \
 'https://api.fda.gov/drug/event.json?search=patient.drug.openfda.generic_name:%22amlodipine%22&count=patient.reaction.reactionmeddrapt.exact&limit=10'
```

Real response:

```json
{ "meta": { "disclaimer": "...", "last_updated": "2026-07-30" },
  "results": [
    { "term": "FATIGUE",         "count": 26697 },
    { "term": "DIARRHOEA",       "count": 23324 },
    { "term": "NAUSEA",          "count": 22971 },
    { "term": "DYSPNOEA",        "count": 21949 },
    { "term": "DRUG INEFFECTIVE","count": 20816 },
    { "term": "DIZZINESS",       "count": 18720 },
    { "term": "HEADACHE",        "count": 17413 },
    { "term": "OFF LABEL USE",   "count": 17389 },
    { "term": "PAIN",            "count": 16567 },
    { "term": "ASTHENIA",        "count": 15069 }
  ]}
```
- **The `count=` parameter is the key trick** — it does server-side aggregation and
  returns a tiny ranked frequency table instead of 20 M records. Response was **1,057 B**.
- **JSON paths:** `results[].term` (MedDRA Preferred Term, uppercase),
  `results[].count`.
- **⚠️ Do NOT present these as incidence rates.** FAERS is spontaneous reporting with
  no denominator, massive confounding by indication and by co-medication, and
  notification bias. Note that amlodipine's top FAERS terms are dominated by generic
  polypharmacy noise (FATIGUE, PAIN, "DRUG INEFFECTIVE", "OFF LABEL USE") and that
  **peripheral oedema — amlodipine's signature adverse effect — is not in the top 10.**
  Use FAERS only for the *"what do real patients report"* colour panel in the UI, with
  an explicit caveat. Label `adverse_reactions` text is the defensible source.
- One legitimate use: build a per-drug FAERS ranked list at build time, and let
  Agent F pick which adverse channels to animate — but weight them by the label, not
  by FAERS count.

### 3.3 DailyMed API v2 — `VERIFIED WORKING (partially) 2026-08-17`

- **Source:** DailyMed, NLM. **License:** public domain.
- **Base URL:** `https://dailymed.nlm.nih.gov/dailymed/services/v2/`

```bash
curl -s -w '\n[HTTP %{http_code}] %{size_download}B %{time_total}s\n' \
 'https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=lisinopril&pagesize=2'
```

```json
{"data": [
 {"spl_version": 11, "published_date": "Aug 12, 2026",
  "title": "LISINOPRIL AND HYDROCHLOROTHIAZIDE (LISINOPRIL AND HYDROCHLOROTHIAZIDE TABLETS) TABLET [REMEDYREPACK INC.]",
  "setid": "3bea11a3-eb07-46b2-9b91-f8a48a2f3b7e"},
 {"spl_version": 24, "published_date": "Aug 06, 2026",
  "title": "LISINOPRIL TABLET [REMEDYREPACK INC.]",
  "setid": "34bb4602-ccff-4939-91b9-26a63bfd40f7"}],
 "metadata": {"db_published_date": "Aug 14, 2026 07:49:27PM EST", "elements_per_page": 2,
  "total_elements": 376, "total_pages": 188, "current_page": 1,
  "next_page_url": "...&page=2"}}
```

- **JSON paths:** `data[].setid`, `.title`, `.spl_version`, `.published_date`;
  `metadata.total_elements`.
- **⚠️ Detail endpoint format gotcha — verified by probing all three:**

| URL | Result |
|---|---|
| `/v2/spls/{setid}.json` | **HTTP 415 Unsupported Media Type — JSON detail is NOT available** |
| `/v2/spls/{setid}.xml` | **HTTP 200, 130,067 B** ✅ |
| `/v2/spls/{setid}/ndcs.json` | **HTTP 200, 667 B** ✅ |

  So: use `.json` for search and for sub-resources, but the **full label detail is
  XML-only**.

- **Excipient extraction from DailyMed XML — verified, and it is cleaner than openFDA:**

```bash
SET=$(curl -s 'https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=amlodipine&pagesize=1' \
      | python3 -c "import sys,json;print(json.load(sys.stdin)['data'][0]['setid'])")
echo "setid=$SET"   # setid=58d2fbed-3904-3e31-e063-6294a90af21d
curl -s "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/$SET.xml" \
  | grep -oE '<name>[^<]*</name>' | sort -u
```

Real output:

```xml
<name>Amlodipine Besylate</name>
<name>AMLODIPINE BESYLATE</name>
<name>AMLODIPINE</name>
<name>CELLULOSE, MICROCRYSTALLINE</name>
<name>MAGNESIUM STEARATE</name>
<name>Redpharm Drug</name>
<name>SILICON DIOXIDE</name>
<name>SODIUM STARCH GLYCOLATE TYPE A POTATO</name>
```

  **Discrete, one excipient per element, and the names match the FDA IID vocabulary
  exactly.** This is the recommended excipient source for `data/substances.json`.
  Agent B: parse the SPL `<ingredient classCode="IACT">` blocks (the grep above is the
  quick-and-dirty version — the real XML distinguishes `ACTIB`/`ACTIM` actives from
  `IACT` inactives, and carries the UNII in `<code code="..." codeSystem="2.16.840.1.113883.4.9">`).

- **CORS: NO `Access-Control-Allow-Origin` header** — verified with
  `-H 'Origin: https://pilsim.pages.dev'`, header count = 0. **A browser cannot call
  DailyMed directly.** Must be proxied through a Worker, or (correct answer) baked in
  at build time.
- **No API key. No documented rate limit found; be polite.**

**BULK DOWNLOAD: YES, and it is enormous.**
- Full human Rx release:
  `https://dailymed-data.nlm.nih.gov/public-release-files/dm_spl_release_human_rx_part1.zip`
  → verified `HTTP/2 200`, `content-type: application/zip`,
  `content-length: 3220922151` — **3.22 GB, part 1 of several.**
- Monthly delta (much saner):
  `https://dailymed-data.nlm.nih.gov/public-release-files/dm_spl_monthly_update_jul2026.zip`
  (current month verified present in the index at
  `https://dailymed.nlm.nih.gov/dailymed/spl-resources-all-drug-labels.cfm`;
  jun2026, may2026, apr2026 also listed. FTP mirror at
  `ftp://public.nlm.nih.gov/nlmdata/.dailymed/`).
- **Verdict: do not download. Snapshot the ~10 setids you actually care about.**

### 3.4 FDA Inactive Ingredient Database (IID) — `VERIFIED WORKING 2026-08-17` — **best excipient source, and it is tiny**

- **Source:** US FDA CDER. **License:** public domain.
- **Landing page:** `https://www.fda.gov/drugs/drug-approvals-and-databases/inactive-ingredients-database-download`
- **⚠️ fda.gov requires a browser User-Agent** — without `-A 'Mozilla/5.0'` the page
  request hung and my first attempt timed out at 120 s. With a UA it returns in ~2 s.

```bash
# current file (label on page: "Inactive Ingredients Database Download File")
curl -s --max-time 60 -A 'Mozilla/5.0' -L \
 'https://www.fda.gov/media/193784/download?attachment' \
 -o iid.zip -w '[HTTP %{http_code}] %{size_download}B %{time_total}s\n'
# [HTTP 200] 382910B 1.972712s
```

Verified headers: `content-type: application/zip`, `content-length: 382910`,
`content-disposition: inline; filename=iig_july_2026.zip`

`unzip -l` output:

```
  Length      Date    Time    Name
---------  ---------- -----   ----
  1174016  2026-07-21 13:25   IIR_OCOMM.xls
     5414  2026-07-21 13:32   Change_Log_Data.csv
    30208  2026-07-21 13:31   Change_Log_Data.xls
   644025  2026-07-21 13:25   IIR_OCOMM.csv
```

`head -3 IIR_OCOMM.csv` (real):

```csv
INGREDIENT_NAME,ROUTE,DOSAGE_FORM,CAS_NUMBER,UNII,POTENCY_AMOUNT,POTENCY_UNIT,MAXIMUM_DAILY_EXPOSURE,MAXIMUM_DAILY_EXPOSURE_UNIT,RECORD_UPDATED
.ALPHA.-TERPINEOL,TOPICAL,LOTION,98555,21334LVV8W,11,%w/w,,,
.ALPHA.-TOCOPHEROL,BUCCAL,"FILM, SOLUBLE",1406184,H4N855PNZ1,0.07,mg,,,
```

Real query for one of our excipients:

```
MAGNESIUM STEARATE,BUCCAL,TABLET,557040,70097M6I30,17.5,mg,,,
MAGNESIUM STEARATE,ORAL,TABLET,557040,70097M6I30,,,980,mg,
MAGNESIUM STEARATE,ORAL,"TABLET, CHEWABLE",557040,70097M6I30,,,127,mg,
```

- **9,072 rows total** in `IIR_OCOMM.csv`.
- **Column map for `data/substances.json` excipient records:**
  `INGREDIENT_NAME` (canonical uppercase name — **use as the join key**),
  `ROUTE`, `DOSAGE_FORM`, `CAS_NUMBER`, `UNII` (join to openFDA/GSRS),
  `POTENCY_AMOUNT` + `POTENCY_UNIT` (per-unit max seen in an approved product),
  `MAXIMUM_DAILY_EXPOSURE` + `_UNIT` (**this is the dose-cap number** — e.g. magnesium
  stearate oral tablet = **980 mg/day**).
- **This directly answers Locked Decision 2 and the "which formulation types are
  feasible" question:** filter by `ROUTE`+`DOSAGE_FORM` and you get the set of
  excipients FDA has ever approved for that formulation, with amount ceilings. That
  is a real, citable basis for the Pills page's "can these coexist / is this
  formulation feasible" check.
- Quarterly archive going back to Jan-2022 is linked on the same page
  (`/media/191970/...` = Apr 2026, `/media/190589/...` = Jan 2026, etc.) if you need a
  pinned version for reproducibility.
- No key, no rate limit, no CORS concern (build-time download).

**BULK DOWNLOAD: YES — 374 KB. This is the single best size/value ratio in this file.
Commit it to the repo.**

### 3.5 SIDER 4.1 — drug ↔ side effect — `VERIFIED WORKING 2026-08-17`

- **Source:** SIDER (Side Effect Resource), Kuhn et al., EMBL.
  Homepage `http://sideeffects.embl.de/`, code `https://github.com/mkuhn/sider`.
- **License:** the download page links **CC0 1.0 Universal (public domain dedication)**
  — `https://creativecommons.org/publicdomain/zero/1.0/`. Verified as a link on
  `http://sideeffects.embl.de/download/`. Attribution courteous, not required.

```bash
curl -sIL 'http://sideeffects.embl.de/media/download/meddra_all_se.tsv.gz'
# HTTP/1.1 200 OK
# Content-Type: application/octet-stream
# Content-Length: 2381171
curl -s 'http://sideeffects.embl.de/media/download/meddra_all_se.tsv.gz' | zcat | head -6
```

Real output:

```tsv
CID100000085	CID000010917	C0000729	LLT	C0000729	Abdominal cramps
CID100000085	CID000010917	C0000737	PT	C0000737	Abdominal pain
CID100000085	CID000010917	C0000737	LLT	C0000737	Abdominal pain
CID100000085	CID000010917	C0000737	PT	C0687713	Gastrointestinal pain
CID100000085	CID000010917	C0000737	PT	C0000737	Abdominal pain
CID100000085	CID000010917	C0002418	LLT	C0002418	Amblyopia
```

- **Column map (no header row — this is the documented SIDER 4.1 layout):**
  1. STITCH compound id, flat (`CID1…`); 2. STITCH compound id, stereo (`CID0…`);
  3. UMLS CUI from the label; 4. MedDRA concept type (`LLT` = lowest-level term,
  `PT` = preferred term); 5. UMLS CUI for the MedDRA term; 6. **side effect name**.
- **Join to our drugs:** strip the `CID1`/`CID0` prefix and the leading zeros →
  PubChem CID. e.g. losartan CID 3961 → `CID000003961`. **Filter to `PT` rows only**
  or you will get 3–5 duplicate rows per effect.
- **Other files on the same path** (same host, same pattern):
  `meddra_freq.tsv.gz` (frequency-annotated — **more useful than `meddra_all_se`**
  because it carries placebo/drug frequency ranges), `drug_names.tsv`
  (verified linked from `/download/`), `meddra_all_indications.tsv.gz`.
  I verified `meddra_all_se.tsv.gz` and `drug_names.tsv` links; I did **not**
  individually HEAD `meddra_freq.tsv.gz` — treat its exact size as unverified, its
  existence is documented on the download page.
- **⚠️ Staleness:** SIDER 4.1 is from **2015**. It is derived from label text of that
  era. Do not present it as current. Its value here is that it is small, offline, and
  gives a machine-readable drug→MedDRA-PT edge list, which is exactly what Agent F
  needs to pick adverse-effect animation channels.

**BULK DOWNLOAD: YES — 2.38 MB, and there is no API, so bulk is the only mode.
Commit it.**

---

## 4. Physiology, pharmacogenomics, classification, and identity

### 4.1 US EPA `httk` datatables — human organ volumes, blood flows, GFR, cardiac output — `VERIFIED WORKING 2026-08-17` — **★ the best find in this file**

This is the answer to "human physiological reference values for the virtual human"
and it is dramatically better than fighting with paywalled ICRP 89.

- **Source:** `httk` (High-Throughput Toxicokinetics), **US EPA** CompTox / ExpoCast.
  Package on CRAN (`httk` v2.7.4, dated 2025-12-08 — verified from the DESCRIPTION file
  I extracted). Development repo `https://github.com/USEPA/CompTox-ExpoCast-httk`.
- **License:** the package ships a `LICENSE` file; `httk` on CRAN is GPL-3. **US EPA
  work — verify the LICENSE file before shipping**, but this is open-source and freely
  redistributable. The underlying numbers are literature values (ICRP, ILSI, Davies &
  Morris 1993), not EPA-copyrighted.
- **The data is available as plain TSV over raw.githubusercontent — no R needed.**

```bash
curl -s -w '\n[HTTP %{http_code}] %{size_download}B %{time_total}s\n' \
 'https://raw.githubusercontent.com/USEPA/CompTox-ExpoCast-httk/main/datatables/Tissue-Volumes-Flows.txt'
```

**Real, complete human block of the response:**

```tsv
"Tissue"	"Species"	"Vol (L/kg)"	"Vol Reference"	"Flow (mL/min/kg^(3/4))"	"Flow Reference"
"Adipose"	"Human"	0.2086	"ILSI-RSI 1994"	10.74	"Davies and Morris 1993"
"Bone"	"Human"	0.07231	"ILSI-RSI 1994"	9.719	"Davies and Morris 1993"
"Brain"	"Human"	0.01931	"ILSI-RSI 1994"	28.93	"Davies and Morris 1993"
"Gut"	"Human"	0.0158	"ILSI-RSI 1994"	47.52	"Davies and Morris 1993"
"Heart"	"Human"	0.004563	"ILSI-RSI 1994"	9.917	"Davies and Morris 1993"
"Kidney"	"Human"	0.00419	"ILSI-RSI 1994"	51.24	"Davies and Morris 1993"
"Liver"	"Human"	0.02448	"ILSI-RSI 1994"	59.92	"Davies and Morris 1993"
"Lung"	"Human"	0.007235	"ILSI-RSI 1994"	5.785	"Davies and Morris 1993"
"Muscle"	"Human"	0.3842	"ILSI-RSI 1994"	30.99	"Davies and Morris 1993"
"Skin"	"Human"	0.0332	"ILSI-RSI 1994"	12.4	"Davies and Morris 1993"
"Spleen"	"Human"	0.002467	"ILSI-RSI 1994"	3.182	"Davies and Morris 1993"
"Thyroid"	"Human"	3e-04	"ILSI-RSI 1994"	3.7	"ILSI-RSI 1994"
"Rest"	"Human"	0.05182	"ILSI-RSI 1994"	4.19	"Davies and Morris 1993"
```

**Every row carries its own literature reference in-band.** That satisfies Locked
Decision 4 (mandatory provenance) with zero extra work — Agent D can copy the
`Vol Reference` / `Flow Reference` columns straight into the provenance field.

```bash
curl -s -w '\n[HTTP %{http_code}] %{size_download}B\n' \
 'https://raw.githubusercontent.com/USEPA/CompTox-ExpoCast-httk/main/datatables/HTTK-Physiology-Data.txt'
# [HTTP 200] 1165B
```

**Real, complete response:**

```tsv
Parameter	Units	Mouse	Rat	Dog	Human	Rabbit	Monkey
Total Body Water	ml/kg	725	668	603.6	600	716	693
Plasma Volume	ml/kg	50	31.2	51.5	42.86	44	44.8
Cardiac Output	ml/min/kg^(3/4)	150.4	209.3	213.4	231.4	212	324.8
Average BW	kg	0.02	0.25	10	70	2.5	5
Total Plasma Protein	g/ml	0.062	0.067	0.09	0.074	0.057	0.088
Plasma albumin	g/ml	0.0327	0.0316	0.0263	0.0418	0.0387	0.0493
Plasma a-1-AGP	g/ml	0.0125	0.0181	0.0037	0.0018	0.0013	0.0024
Hematocrit	fraction	0.45	0.46	0.42	0.44	0.36	0.41
Urine	ml/min/kg^(3/4)	0.01306	0.09821	0.03705	0.04017	0.0417	0.1508
Bile	ml/min/kg^(3/4)	0.02612	0.04419	0.01482	0.01004	0.0833	0.004006
GFR	ml/min/kg^(3/4)	5.265	3.705	10.9	5.165	3.12	2.08
Average Body Temperature	C	37	38.7	38.9	37	39.35	38
Plasma Effective Neutral Lipid Volume Fraction	unitless	0.00355	0.00174	0.001037	0.0073	0.001962	0.0073
Plasma Protein Volume Fraction	unitless	0.06036	0.05871	0.09	0.06951	0.057	0.06951
Pulmonary Ventilation Rate	l/h/kg^(3/4)	24.75	24.75	24.75	27.75	24.75	27.75
Alveolar Dead Space Fraction	unitless	0.33	0.33	0.33	0.33	0.33	0.33
Small Intestine Mean Residence Time	min	NA	88	109	199.2	NA	NA
Small Intestine Radius	cm	NA	0.18	NA	1.75	NA	NA
```

**Sanity check I ran mentally, and Agent D should run in code:** cardiac output
231.4 mL/min/kg^0.75 × 70^0.75 (= 24.20) ≈ **5.60 L/min** for a 70 kg adult — textbook.
GFR 5.165 × 24.20 ≈ **125 mL/min** — textbook. **The allometric `kg^(3/4)` scaling
means Agent D gets body-size scaling of cardiac output and GFR for free**, which is
exactly what the "editable weight/BMI" slider on the Test Subject page needs.

**Full inventory of the `datatables/` directory** (from the GitHub contents API,
sizes in bytes; each is `https://raw.githubusercontent.com/USEPA/CompTox-ExpoCast-httk/main/datatables/<name>`):

| File | Size | Use |
|---|---|---|
| `HTTK-Physiology-Data.txt` | 1,165 | whole-body params (above) |
| `Basic-Physiology.txt` | 1,253 | — |
| `Tissue-Volumes-Flows.txt` | 5,106 | organ V and Q (above) |
| `Tissue-PercentBW.txt` | 3,123 | organ mass as %BW |
| `Tissue-Flows.txt` | 2,505 | flows alone |
| `Tissue-Density.txt` | 2,164 | tissue densities |
| `Tissue-Composition.txt` | 2,497 | water/lipid/protein fractions → tissue:plasma partition coefficients |
| `Tissue-data.txt` / `HTTK-Tissue-Data.txt` | 22,119 / 18,867 | merged long-format |

**Total ~58 KB for the entire virtual-human physiology layer. Commit all of it.**

- **Provenance chain, per the package's own docs** (I extracted
  `httk/man/physiology.data.Rd` and `httk/man/tissue.data.Rd` from the CRAN tarball):
  - `physiology.data`: "values from **Davies and Morris (1993)** necessary to
    parameterize a toxicokinetic model for human, mouse, rat, dog, or rabbit."
  - `tissue.data`: "values from **Schmitt (2008)** and **Ruark et al. (2014)**
    describing the composition of specific tissues and from **Birnbaum et al. (1994)**
    describing volumes of and blood flows to those tissues… **Tissue volumes were
    calculated by converting the fractional mass of each tissue with its density (both
    from ICRP)**, lumping the remaining tissues into the rest-of-body, excluding the
    mass of the gastrointestinal contents."
  **So this IS ICRP-derived organ mass data, laundered into an open, machine-readable
  form.** That is the clean answer to the ICRP-89-is-paywalled problem.
- **CRAN source tarball (verified downloaded):**
  `https://cran.r-project.org/src/contrib/httk_2.7.4.tar.gz` — **4,160,963 B (4.0 MB)**,
  `[HTTP 200] 2.77 s`. ⚠️ CRAN only keeps the *current* version at that path —
  `httk_2.6.1.tar.gz` returned **HTTP 404**. Pin by downloading, not by URL.
  The tabular data inside the tarball is in binary `.rda`/`sysdata.rda` (R serialization)
  — **and R is not installed in this environment**, which is exactly why the GitHub
  raw TSVs are the right access path for a TypeScript project.

### 4.2 IT'IS Foundation Tissue Properties Database — `VERIFIED WORKING 2026-08-17` (with a scope warning)

- **Source:** IT'IS Foundation, Zurich. **License:** free for research use with
  attribution (they request citation of the database DOI); check
  `https://itis.swiss/virtual-population/tissue-properties/overview` before commercial use.
- **BULK DOWNLOAD:**
  `https://itis.swiss/assets/Downloads/TissueDb/Database-V5-0.zip`
  → verified `HTTP/1.1 200`, `Content-Type: application/zip`,
  `Content-Length: 5746785` — **5.75 MB. Database V5.0 is the current version.**
  (Archive of V4.2, V4.1, V4.0, V3.1, V3.0, V2.6…V1.0 all linked from
  `https://itis.swiss/virtual-population/tissue-properties/downloads`.)
- **⚠️ Scope warning — read before Agent D uses this.** IT'IS is built for
  **electromagnetic and thermal** simulation. Its tables are density, heat capacity,
  thermal conductivity, **heat transfer rate**, heat generation rate, viscosity,
  acoustic properties, tissue weight fractions, MR relaxation times — verified from the
  live database landing page. The "Heat Transfer Rate" table *is* effectively tissue
  blood perfusion (it is derived from perfusion), so it is usable as a cross-check on
  httk's flows, but **the per-tissue tables on the website are JavaScript-rendered and
  return nothing to `curl`** (I confirmed: the `/database/heat-transfer-rate/` page
  yields only CSS and GA script to a plain fetch). You must download the ZIP.
- **Verdict: use httk (§4.1) as primary. IT'IS is a Tier-2 cross-check and a source of
  tissue density for the organ-volume→organ-mass conversion in Agent F's animation.**

### 4.3 Human Protein Atlas — target/enzyme tissue expression — `VERIFIED WORKING 2026-08-17`

Useful for Agent F: "which organ do we animate for this drug's target?" answered with
real expression data rather than assertion.

```bash
curl -s -w '\n[HTTP %{http_code}] %{size_download}B\n' \
 'https://www.proteinatlas.org/api/search_download.php?search=ACE&format=json&columns=g,gs,eg,rnatsm&compress=no'
```

Real response (truncated):

```json
[{"Gene":"ACE","Gene synonym":["ACE1","CD143","DCP1"],"Ensembl":"ENSG00000159640",
  "RNA tissue specific nTPM":{"intestine":"249.7","testis":"96.4"}},
 {"Gene":"ACE2","Gene synonym":["ACEH"],"Ensembl":"ENSG00000130234",
  "RNA tissue specific nTPM":{"gallbladder":"62.3","intestine":"230.5","kidney":"82.4"}},
 {"Gene":"BACE1", ... }]
```

- **⚠️ Substring matching — `search=ACE` returns ACE2, BACE1, ACER1, ACER2…** Filter
  on exact `Gene` match.
- **⚠️ Interpretation trap for Agent F:** HPA reports ACE's *tissue-specific* nTPM as
  intestine and testis. That does **not** mean ACE inhibition acts on the intestine.
  ACE is expressed on pulmonary and renal vascular endothelium throughout the body;
  "tissue specific" in HPA means "enriched relative to other tissues", not "where it
  matters". **Do not animate the intestine for lisinopril on the strength of this.**
  Use the full `rnatsm`/consensus tissue vector, not the "specific" summary.
- **License:** CC BY-SA 3.0. Attribution required.
- **CORS:** not tested.
- **BULK DOWNLOAD:** yes —
  `https://www.proteinatlas.org/download/proteinatlas.tsv.zip`
  verified `HTTP/2 200`, `content-type: application/zip`, `content-length: 7460135`
  (**7.46 MB**). Also `proteinatlas.json.gz` and `proteinatlas.xml.gz` at the same path.
  **⚠️ MOVED:** the commonly cited `https://www.proteinatlas.org/download/tsv/proteinatlas.tsv.zip`
  returns **HTTP 404** — the `/tsv/` segment is gone. Use the URL above.

### 4.4 CPIC API — pharmacogenomics (CYP2D6 × metoprolol) — `VERIFIED WORKING 2026-08-17` — **★ directly serves problem 12's "genetics" requirement**

- **Source:** CPIC (Clinical Pharmacogenetics Implementation Consortium).
  **License:** CPIC guidelines are CC BY-SA 4.0. Attribution required.
- **Base URL:** `https://api.cpicpgx.org/v1/` (PostgREST — supports `?col=eq.value`,
  `select=`, `limit=`).

```bash
curl -s -w '\n[HTTP %{http_code}] %{size_download}B %{time_total}s\n' \
 'https://api.cpicpgx.org/v1/drug?name=eq.metoprolol'
```

```json
[{"drugid":"RxNorm:6918","name":"metoprolol","clinpgxid":"PA450480","rxnormid":"6918",
  "drugbankid":"DB00264","atcid":["C07AB02"],"umlscui":null,
  "flowchart":"https://files.cpicpgx.org/images/flow_chart/Metoprolol_CDS_Flow_Chart.jpg",
  "version":274,"guidelineid":5290480}]
[HTTP 200] 269B 1.712569s
```

```bash
curl -s -w '\n[HTTP %{http_code}] %{size_download}B\n' \
 'https://api.cpicpgx.org/v1/recommendation?drugid=eq.RxNorm:6918&select=drugrecommendation,implications,phenotypes,classification&limit=3'
```

**Real response:**

```json
[{"drugrecommendation":"No recommendation for metoprolol therapy due to insufficient evidence regarding diminished metoprolol effectiveness clinically",
  "implications":{"CYP2D6": "Increased metabolism of metoprolol leading to decreased drug concentrations; however, it is unclear whether this results in clinically significant changes in heart rate, blood pressure, or clinical outcomes"},
  "phenotypes":{"CYP2D6": "Ultrarapid Metabolizer"},
  "classification":"No Recommendation"},
 {"drugrecommendation":"Initiate standard dosing",
  "implications":{"CYP2D6": "Normal metabolism of metoprolol"},
  "phenotypes":{"CYP2D6": "Normal Metabolizer"},
  "classification":"Strong"},
 {"drugrecommendation":"Initiate standard dosing",
  "implications":{"CYP2D6": "Normal metabolism of metoprolol"},
  "phenotypes":{"CYP2D6": "Normal Metabolizer"},"classification":"Strong"}]
```

- **JSON paths:** `[].drugrecommendation`, `[].implications.CYP2D6`,
  `[].phenotypes.CYP2D6`, `[].classification` (`Strong`/`Moderate`/`Optional`/
  `No Recommendation`), `[].drugid`, `[].guidelineid`. Also `atcid[]`, `rxnormid`,
  `drugbankid` on `/drug` — a free identity cross-walk.
- **Other useful tables on the same API:** `/guideline`, `/gene`, `/allele`,
  `/diplotype` (diplotype → phenotype mapping — this is what turns "CYP2D6 *4/*4" into
  "Poor Metabolizer"), `/pair`.
- **⚠️ Important honesty note for the pitch.** CPIC's actual position on metoprolol is
  **weaker than the team's framing assumes.** For Ultrarapid Metabolizer the
  classification is literally `"No Recommendation"` with the text "it is unclear
  whether this results in clinically significant changes in heart rate, blood pressure,
  or clinical outcomes". The CYP2D6 story is still the best personalization hook in
  the drug set (poor metabolizers have several-fold higher metoprolol exposure — real
  and well-documented PK), but **the product must not claim CPIC recommends a dose
  change.** Model the PK effect; label the clinical recommendation as CPIC does.
  Agents C and F: use these exact strings.
- **No API key. CORS:** `access-control-allow-origin: *` — **verified**, plus
  `access-control-expose-headers` listing `Content-Range` etc. Browser-callable.
- **BULK DOWNLOAD:** CPIC publishes database dumps at `files.cpicpgx.org` (the
  `flowchart` URL above confirms that host is live). **I did not verify a dump URL.**
  For 1 drug × 1 gene, snapshot the two API calls above — < 5 KB.

### 4.5 WHO ATC / DDD Index — `VERIFIED WORKING 2026-08-17` (HTML scrape, no API)

- **Source:** WHO Collaborating Centre for Drug Statistics Methodology, Oslo.
  `https://atcddd.fhi.no/atc_ddd_index/`
- **License: NOT open.** The ATC/DDD index is free to *browse*; bulk reuse and
  redistribution of the ATC/DDD data require a licence from the WHOCC. **For 5 values
  hand-transcribed from the public index this is fine; do not mirror the index.**
- **There is no API.** The page is server-rendered HTML.

```bash
curl -s --max-time 25 'https://atcddd.fhi.no/atc_ddd_index/?code=C09AA03&showdescription=no' \
  | grep -iA3 -B3 'lisinopril' | sed 's/<[^>]*>/ /g' | tr -s ' \n' ' \n'
```

**Real output:**

```
C09AA ACE inhibitors, plain
 ATC code   Name   DDD   U  Adm.R  Note
 C09AA03  lisinopril   10  mg  O  List of abbreviations
 Last updated:
2026-01-20
```

**All five drugs, actually retrieved (each by its own `curl`):**

| Drug | ATC | DDD | Unit | Route | Verified |
|---|---|---|---|---|---|
| Lisinopril | `C09AA03` | **10** | mg | O | ✅ page "Last updated: 2026-01-20" |
| Losartan | `C09CA01` | **50** | mg | O | ✅ |
| Amlodipine | `C08CA01` | **5** | mg | O | ✅ |
| Hydrochlorothiazide | `C03AA03` | **25** | mg | O | ✅ page "Last updated: 2026-01-20" |
| Metoprolol | `C07AB02` | **0.15** | **g** (= 150 mg) | O **and** P | ✅ |

**⚠️ Unit inconsistency, verified in the raw HTML:** metoprolol's DDD is expressed in
**grams**, the others in **milligrams**, and metoprolol has **two** DDD rows (oral and
parenteral, both 0.15 g). A naive scraper that assumes mg will be off by 1000× on
metoprolol. Raw line as retrieved:
`C07AB02  metoprolol   0.15  g  O  0.15  g  P  List of abbreviations`

**Also verified:** the C08CA01 page carries a scope note that must not be
mis-scraped as a DDD row —
`"Preparations containing nifedipine in combination with ergot alkaloids are classified in C08CA55. Combinations with diuretics are classified in C08G. Amlodipine in combination with atorvastatin is classified in C10BX03."`

- **BULK DOWNLOAD: NO** (licensing). **Alternative that IS freely licensed:** ChEMBL's
  `atc_classifications` field (§1.2) and RxNav's `allProperties` ATC code (§4.6) both
  give the ATC *code* under open licences. Only the *DDD* needs the WHOCC page — and
  that is 5 numbers, hand-transcribed above. **Recommendation: hard-code these 5 DDDs
  in `data/substances.json` with the WHOCC URL + retrieval date as provenance, and do
  not scrape at runtime.**

### 4.6 RxNorm / RxNav — product identity, strengths, dose forms — `VERIFIED WORKING 2026-08-17`

- **Source:** RxNav, NLM. **License:** public domain (RxNorm itself has UMLS terms of
  service for the full release; the RxNav API is open).
- **Base URL:** `https://rxnav.nlm.nih.gov/REST/`

```bash
curl -s -w '\n[HTTP %{http_code}] %{size_download}B %{time_total}s\n' \
 'https://rxnav.nlm.nih.gov/REST/rxcui.json?name=lisinopril'
# {"idGroup":{"rxnormId":["29046"]}}
# [HTTP 200] 34B 1.325856s
```

**Available strengths and dose forms — exactly what `data/products.json` needs:**

```bash
curl -s 'https://rxnav.nlm.nih.gov/REST/rxcui/29046/related.json?tty=SCD'
```
```json
{"relatedGroup":{"conceptGroup":[{"tty":"SCD","conceptProperties":[
 {"rxcui":"1806884","name":"lisinopril 1 MG/ML Oral Solution","tty":"SCD",...},
 {"rxcui":"197884","name":"lisinopril 40 MG Oral Tablet","tty":"SCD",...},
 {"rxcui":"197885","name":"hydrochlorothiazide 12.5 MG / lisinopril 10 MG Oral Tablet", ...
```

**This directly confirms Locked Decision's premise:** the lisinopril/HCTZ fixed-dose
combination exists as a real RxNorm concept (`197885`), *and* lisinopril has a
**1 mg/mL oral solution** (`1806884`) alongside tablets — so the "formulation/route
availability" requirement and the "best formulation type" claim have a real,
enumerable basis. Query `tty=SCD` per ingredient for all five drugs.

**Identifier cross-walk in one call:**

```bash
curl -s 'https://rxnav.nlm.nih.gov/REST/rxcui/29046/allProperties.json?prop=all'
```
```json
{"propConceptGroup":{"propConcept":[
 {"propCategory":"ATTRIBUTES","propName":"GENERAL_CARDINALITY","propValue":"SINGLE"},
 {"propCategory":"ATTRIBUTES","propName":"PRESCRIBABLE","propValue":"Y"},
 {"propCategory":"ATTRIBUTES","propName":"RXNAV_HUMAN_DRUG","propValue":"US"},
 {"propCategory":"ATTRIBUTES","propName":"TTY","propValue":"IN"},
 {"propCategory":"CODES","propName":"ATC","propValue":"C09AA03"},
 {"propCategory":"CODES","propName":"DRUGBANK","propValue":"DB00722"}, ...
```
Gives ATC and DrugBank id for free.

**RxClass (ATC/EPC/MoA drug classification) — `VERIFIED WORKING`:**

```bash
curl -s 'https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json?rxcui=29046&relaSource=ATC'
# {"rxclassDrugInfoList":{"rxclassDrugInfo":[{"minConcept":{"rxcui":"29046",
#   "name":"lisinopril","tty":"IN"},"rxclassMinConceptItem":{"classId":"C09AA",
#   "className":"ACE inhibitors, plain","classType":"ATC1-4"},"relaSource":"ATC"}]}}
# [HTTP 200] 239B 0.786641s
```

- **No API key. CORS:** `access-control-allow-origin: *` — verified.
- **Documented rate limit:** NLM asks for ≤20 requests/second per IP (not tested).
- **BULK DOWNLOAD: gated.**
  `https://download.nlm.nih.gov/umls/kss/rxnorm/RxNorm_full_current.zip`
  → **`HTTP/1.1 302 Found`**, `Location: https://uts.nlm.nih.gov/uts/login?service=...`
  **REQUIRES KEY** — free UMLS/UTS account, but an interactive login/API-key flow.
  Register free at `https://uts.nlm.nih.gov/uts/signup-login`. **Not worth it for 5
  drugs — snapshot the RxNav REST responses instead.**

### 4.7 DrugCentral — `MOVED — new URL` — `VERIFIED WORKING 2026-08-17 (new host)`

- **Source:** DrugCentral, University of New Mexico (Oprea lab).
  **License:** CC BY-SA 4.0 for the database. Attribution required.
- **⚠️ The documented API path is dead.** All of these returned **HTTP 404** with an
  HTML "Not Found" body:
  - `https://drugcentral.org/api/v1/`
  - `https://drugcentral.org/api/v1/drugcards/?name=lisinopril`
  - `https://drugcentral.org/api/v1/structures?name=lisinopril`
- **NEW HOST (found by scraping the DrugCentral homepage's own nav link):**
  `https://uxn2ycvimg.us-east-2.awsapprunner.com/` — a FastAPI service titled
  **"DrugCentral DRS API"**, OpenAPI 3.1.0, docs at `.../docs#/`,
  spec at `.../openapi.json` (verified HTTP 200).

```bash
curl -s -w '\n[HTTP %{http_code}] %{size_download}B %{time_total}s\n' \
 'https://uxn2ycvimg.us-east-2.awsapprunner.com/structures/name/lisinopril'
```

**Real response (truncated):**

```json
[{"clogp":-1.82,"rotb":12,"status":"OFP","alogs":-3.27,
  "mrdef":"One of the ANGIOTENSIN-CONVERTING ENZYME INHIBITORS (ACE inhibitors), orally active, that has been used in the treatment of hypertension and congestive heart failure.",
  "o_n":8,"cd_formula":"C21H31N3O5","cas_reg_no":"76547-98-3","arom_c":6,"oh_nh":4,
  "tpsa":132.96,"sp3_c":12,
  "inchi":"InChI=1S/C21H31N3O5/c22-13-5-4-9-16(19(25)24-14-6-10-18(24)21(28)29)23-17(20(26)27)12-11-15-7-2-1-3-8-15/h1-3,7-8,16-18,23H,4-6,9-14,22H2,(H,26,27)(H,28,29)/t16-,17-,18-/m0/s1",
  "lipinski":0,"sp2_c":3,
  "smiles":"NCCCC[C@H](N[C@@H](CCC1=CC=CC=C1)C(O)=O)C(=O)N1CCC[C@H]1C(O)=O",
  "cd_id":2805,"id":1587,"name":"lisinopril","cd_molweight":405.495,
  "no_formulations":623,"halogen":0,"fda_labels":348,"stem":"-pril", ...
```

- **JSON paths of interest:** `.cas_reg_no`, `.cd_formula`, `.cd_molweight`,
  `.clogp` (**−1.82** — note this differs from ChEMBL's alogp 1.24 and is the more
  believable value for lisinopril, a zwitterionic peptidomimetic that is famously
  poorly absorbed), `.tpsa`, `.smiles`, `.inchi`, `.stem` (`"-pril"` — the USAN class
  stem, a nice free class label for the UI), `.no_formulations` (623),
  `.fda_labels` (348), `.mrdef` (MeSH definition — good UI copy).
- **⚠️ logP disagreement is a real finding for Agent B:** ChEMBL `alogp` = 1.24,
  DrugCentral `clogp` = −1.82, PubChem `XLogP` (for losartan) = 4.3. These are
  different *predicted* algorithms, not measurements. **Agent B must pick one source
  per property and say which**, not average them. For lisinopril the experimental
  logP is strongly negative; DrugCentral's −1.82 is closer to reality.
- **API endpoints available** (from `openapi.json`): `/act_table_full` (bioactivity),
  `/act_table_full/act_id/{id}`, `/structures/name/{name}`, and others — inspect
  `https://uxn2ycvimg.us-east-2.awsapprunner.com/docs#/`.
- **⚠️ This host is an AWS App Runner autogenerated hostname.** It is not a stable
  vanity domain. **It could disappear.** Snapshot, do not depend.
- **CORS: NO `Access-Control-Allow-Origin` header** — verified. Browser-blocked.

**BULK DOWNLOAD: YES, and it is the full relational database.**
- **`https://unmtid-dbs.net/download/drugcentral.dump.11012023.sql.gz`**
  → verified `HTTP/1.1 200 OK`, `Content-Type: application/x-gzip`,
  `Content-Length: **1400714190**` (**1.40 GB**), `Last-Modified: Fri, 10 Nov 2023`.
  This is a PostgreSQL dump containing the whole DrugCentral schema — including the
  `pharma_class`, `omop_relationship` (indications/contraindications/off-label!),
  `act_table_full` (bioactivity), `faers`, `ddi` (drug-drug interactions), and
  `structures` tables. **This is the single most complete open drug database available
  as one file.**
- **⚠️ It is from 2023-11-10 and there is no newer dump.** The dated download
  directories at `https://unmtid-dbs.net/download/DrugCentral/` stop at `2023/`, which
  contains only `structures.molV2.sdf.gz` (1.3 M) and `structures.molV3.sdf.gz` (705 K)
  — no newer SQL dump. Earlier dirs (`2021_09_01/`) additionally hold
  `drug.target.interaction.tsv.gz` (761 K) and `structures.smiles.tsv` (1.0 M).
- **Verdict for a 24-hour build: 1.4 GB and a Postgres restore is too much.** But
  DrugCentral's `omop_relationship` table is the best open source of
  **drug–disease contraindications** I found (see §5.3 on why there is no good API for
  that). If the team has an hour to spare and a local Postgres, restoring this dump
  and dumping `omop_relationship` + `ddi` to JSON would materially strengthen
  `data/rules.json`. **Tier 2 / if time permits.**

### 4.8 ClinicalTrials.gov API v2 — `VERIFIED WORKING 2026-08-17`

```bash
curl -s -w '\n[HTTP %{http_code}] %{size_download}B %{time_total}s\n' \
 'https://clinicaltrials.gov/api/v2/studies?query.intr=lisinopril&pageSize=1&fields=NCTId,BriefTitle,Phase'
```
```json
{"studies":[
{"protocolSection":{"identificationModule":{"nctId":"NCT01234922",
 "briefTitle":"Benazepril Hydrochloride, Lisinopril, Ramipril, or Losartan Potassium in Treating Hypertension in Patients With Solid Tumors"},
 "designModule":{"phases":["PHASE2"]}}}
],"nextPageToken":"ZVt07cGHkvI2wRk2CJf6_LLqy5DbMtMod7KrgP4cnjySufE"}
[HTTP 200] 327B 1.084062s
```
- **License:** public domain (NLM). **No key. CORS: `*` — verified.**
- **Use:** only as a pointer to dose–response literature (`fields=` supports
  `OutcomeMeasures`, `ArmGroups`, `EligibilityCriteria`). **Results data is sparse and
  hard to parse; do not build the dose-response model on this.** Agent E should use
  published meta-analyses instead. Listed here for completeness — it is alive and free.

### 4.9 PK-DB — pharmacokinetic parameters — `VERIFIED WORKING (partially) 2026-08-17`

- **Source:** PK-DB, Humboldt-Universität zu Berlin (Matthias König). `https://pk-db.com/`
- **⚠️ `PARTIALLY DEAD / RENAMED`.** Probed several paths:

| Path | Status |
|---|---|
| `https://pk-db.com/` | HTTP 200 (1,005 B — SPA shell) |
| `https://pk-db.com/api/v1/` | **HTTP 200** ✅ |
| `https://pk-db.com/api/` | HTTP 302 |
| `https://pk-db.com/api/v1/substances/` | **HTTP 404 — the documented resource name is gone** |
| `https://pk-db.com/api/v1/pharmacokinetics/` | **HTTP 404** |
| `https://pk-db.com/api/v1/studies/?format=json&page_size=1` | **HTTP 200, 12,858 B** ✅ |

- **The API root self-documents the real resource names** (verified, full response):

```json
{"statistics":"https://pk-db.com/api/v1/statistics/substances/",
 "statistics/substances":"https://pk-db.com/api/v1/statistics/substances/",
 "studies":"https://pk-db.com/api/v1/studies/",
 "references":"https://pk-db.com/api/v1/references/",
 "groups":"https://pk-db.com/api/v1/groups/",
 "individuals":"https://pk-db.com/api/v1/individuals/",
 "interventions":"https://pk-db.com/api/v1/interventions/",
 "outputs":"https://pk-db.com/api/v1/outputs/",
 "info_nodes":"https://pk-db.com/api/v1/info_nodes/",
 "subsets":"https://pk-db.com/api/v1/subsets/",
 "pkdata/studies":"...","pkdata/interventions":"...","pkdata/groups":"...",
 "pkdata/individuals":"...","pkdata/outputs":"...","pkdata/data":"...",
 "pkdata/timecourses":"https://pk-db.com/api/v1/pkdata/timecourses/"}
```

  **`outputs` is the PK-parameter table; `pkdata/timecourses` is concentration-time
  curve data.** Both would be extremely valuable for Agent E.

- **⚠️ The search parameter does not work the way you'd hope.** Verified:

```bash
curl -s 'https://pk-db.com/api/v1/outputs/?search=metoprolol&format=json&page_size=1'
# {"current_page":1,"last_page":1,"next_page_url":null,"prev_page_url":null,
#  "data":{"count":0,"data":[]}}    <-- ZERO for the one endpoint we most want
```

  while the same `search=metoprolol` against `/studies/` returns **803 results**, and
  the top hit is a **glimepiride** paper (Rosenkranz1996a, PMID 8960852) that merely
  mentions metoprolol somewhere:

```json
{"data":{"count":803,"data":[{"sid":"PKDB00954","name":"Rosenkranz1996a",
 "licence":"closed","access":"public","output_count":669,"timecourse_count":10,
 "reference":{"pmid":"8960852",
  "title":"Pharmacokinetics and safety of glimepiride at clinically effective doses in diabetic patients with renal impairment."}}]}}
```

  and against `/info_nodes/` returns 22 results, correctly including the substance node:

```json
{"data":{"count":22,"data":[{"sid":"metoprolol-tartrate","name":"metoprolol tartrate",
 "ntype":"substance","dtype":"undefined",
 "description":"The tartrate salt form of metoprolol, a cardioselective competitive
  beta-1 adrenergic receptor antagonist with antihypertensive properties...",
 "synonyms":["Lopressor (TN)","METOPROLOL TARTRATE",...]}]}}
```

- **Also note `"licence":"closed"` on that study record.** PK-DB mixes open and
  restricted records; check the `licence` field before reusing any value.
- **Honest verdict:** PK-DB is **alive but I could not get it to return a PK parameter
  for one of our drugs within the timebox.** The correct query is probably
  `/api/v1/outputs/?substance=metoprolol` or a filter on the `info_node` sid
  (`metoprolol-tartrate`), not `?search=`. **Agent E: this is worth 20 more minutes —
  it is the only free structured source of Cmax/Tmax/t½/AUC/CL with per-study
  provenance and group-level variability that I found.** If it does not yield, fall
  back to the openFDA label `clinical_pharmacology` narrative (§3.1), which definitely
  contains those numbers in prose.
- **No key. CORS: `access-control-allow-origin: *` — verified.**
- **BULK DOWNLOAD:** PK-DB publishes dataset archives on Zenodo. **NOT VERIFIED** —
  I did not locate or hit a Zenodo DOI within the timebox. Do not cite a URL for this
  until someone checks.

---

## 5. DEAD / BLOCKED / KEY-GATED — do not depend on these

### 5.1 NLM RxNav **Drug Interaction API** — `DEAD` ☠️ — *the big one*

This is the retired endpoint the mission brief warned about. **Confirmed dead by
direct probe of all three documented operations:**

```
interaction/interaction.json?rxcui=29046          [HTTP 404] 9B   body: "Not found"
interaction/list.json?rxcuis=29046+5487           [HTTP 404] 9B   body: "Not found"
interaction/version.json                          [HTTP 404] 9B   body: "Not found"
```

The documentation pages still exist and still rank in search results
(`https://lhncbc.nlm.nih.gov/RxNav/APIs/InteractionAPIs.html`,
`api-Interaction.findDrugInteractions.html`, `api-Interaction.getVersion.html`) —
**the docs are a trap; the service is gone.** It was discontinued on or about
**2024-01-02**, and RxNav's Interactions tab was removed at the same time. It had been
backed by ONCHigh and DrugBank; the DrugBank licensing change is the usual explanation.
The rest of RxNav (RxNorm, RxClass, RxTerms — all verified working in §4.6) is
unaffected.

**Consequence for PilSim:** *there is no free, maintained, machine-readable
drug–drug interaction API.* Agent C must build `data/rules.json` DDI rules from:
1. the openFDA label `drug_interactions` field (§3.1) — **primary, and sufficient for
   5 drugs**;
2. DrugCentral's `ddi` table inside the 1.4 GB SQL dump (§4.7) — Tier 2;
3. hand-curation from guideline documents for the dual-RAAS-blockade rule
   (lisinopril + losartan), which is the headline DDI in this set.

For a 5-drug set the pairwise space is only 10 pairs. **Hand-curate them. It is the
right engineering call, not a compromise.**

### 5.2 DrugBank — `BLOCKED (403)`

```bash
curl -sIL 'https://go.drugbank.com/releases/5-1-13/downloads/all-drugbank-vocabulary'
# HTTP/2 403
# content-type: text/html; charset=utf-8
```
Bot protection. Even the *open* DrugBank vocabulary CSV (which is CC BY-NC 4.0) is
behind it. The full DrugBank XML has required a paid commercial licence since 2023
(ballpark: low-to-mid five figures USD/year for commercial; academic tier is free but
requires an approved account and is non-commercial). **Workaround: DrugBank IDs are
available for free via RxNav `allProperties` (§4.6, `"DRUGBANK":"DB00722"`) and via
CPIC `/drug` (§4.4, `"drugbankid":"DB00264"`) — so we can *reference* DrugBank ids
without touching DrugBank.** Do not scrape go.drugbank.com.

### 5.3 DDInter — `DEAD / UNREACHABLE`

```
http://ddinter.scbdd.com/                    [HTTP 000] 0B 20.06s   (connection never established)
http://ddinter.scbdd.com/ddinter/download/   [HTTP 000] 0B
```
`HTTP 000` = curl never got a response. Host is down or blocking this network
entirely. This is a commonly recommended open DDI dataset; **it did not respond at all
on 2026-08-17.** Do not plan around it.

### 5.4 PharmGKB API — `DEAD (DNS)`

```
https://api.pharmgkb.org/v1/data/chemical?name=metoprolol&view=base   [HTTP 000] 0B 0.000000s
getent hosts api.pharmgkb.org  →  (no result)  DNS FAIL
getent hosts www.pharmgkb.org  →  171.67.192.20  pgkb-martian.stanford.edu
https://www.pharmgkb.org/downloads                                    [HTTP 200] 2505B
```
**`api.pharmgkb.org` has no DNS record at all** — `time_total 0.000000s` confirms the
failure was resolution, not network. The `www` host resolves and serves. The
downloads page returns only 2,505 B, i.e. a JS shell. **The public PharmGKB REST API
is gone; the data-download route is JS-gated.** Use **CPIC (§4.4) instead** — CPIC is
the guideline-authoring body, its API is alive and open, and for our single
pharmacogenomic story (CYP2D6 × metoprolol) it is strictly the better source.

### 5.5 ICD-11 API — `REQUIRES KEY`

```
POST https://icdaccessmanagement.who.int/connect/token
  (grant_type=client_credentials&scope=icdapi_access, no client_id)   [HTTP 400] 26B
GET  https://id.who.int/icd/release/11/2024-01/mms                    [HTTP 401] 114B
  body: "Authentication failed. The request must include a valid and non-expired
         bearer token in the Authorization header."
```
- **OAuth2 client-credentials. Free registration at
  `https://icd.who.int/icdapi` → "Register" (free ICD API account, gives client_id +
  client_secret).** I did not register.
- **Verdict for PilSim: skip it.** The 9 comorbidities in scope are a fixed, tiny list.
  Hand-assign ICD-11 codes from the public ICD-11 browser (`https://icd.who.int/browse11`)
  and hard-code them, or key the comorbidities on the **EFO/MeSH ids that ChEMBL
  `drug_indication` already gives us for free** (§2.2) — which has the advantage of
  joining directly to the drug data. **Recommend EFO over ICD-11 for this build.**
  Mention ICD-11 in the pitch as "the ontology we'd map to for MoH integration."

### 5.6 RxNorm full release — `REQUIRES KEY`
```
https://download.nlm.nih.gov/umls/kss/rxnorm/RxNorm_full_current.zip
  → HTTP/1.1 302 Found
    Location: https://uts.nlm.nih.gov/uts/login?service=...
```
Free UMLS account required (`https://uts.nlm.nih.gov/uts/signup-login`). **Unnecessary
— the RxNav REST API is open and covers our needs (§4.6).**

### 5.7 LOINC — `NOT ATTEMPTED / REQUIRES ACCOUNT`
LOINC requires free registration and acceptance of its licence for download
(`https://loinc.org/downloads/`). **I did not attempt it, and I do not think PilSim
needs it.** The virtual human's labs (K⁺, Na⁺, creatinine, eGFR, uric acid) are a
fixed set of ~8 analytes. Hand-assign LOINC codes if a judge asks; do not build a
LOINC dependency. **Honest status: unverified, deliberately out of scope.**

### 5.8 Human Protein Atlas legacy TSV path — `MOVED`
`https://www.proteinatlas.org/download/tsv/proteinatlas.tsv.zip` → **HTTP 404**.
New URL: `https://www.proteinatlas.org/download/proteinatlas.tsv.zip` (§4.3).

### 5.9 DrugCentral legacy API — `MOVED` (see §4.7)
`https://drugcentral.org/api/v1/*` → HTTP 404. New host is the App Runner URL.

### 5.10 CRAN version-pinned URLs — `gotcha`
`https://cran.r-project.org/src/contrib/httk_2.6.1.tar.gz` → **HTTP 404**. CRAN's
`src/contrib/` holds only the *current* version; older versions live under
`src/contrib/Archive/httk/`. **Pin by committing the downloaded file, not the URL.**

### 5.11 `fda.gov` requires a browser User-Agent
A plain `curl` (default UA `curl/x.y`) to
`https://www.fda.gov/drugs/drug-approvals-and-databases/inactive-ingredients-database-download`
**hung and hit my 120-second timeout.** The same request with
`-A 'Mozilla/5.0'` returned `[HTTP 200] 40764B` in ~2 s. `https://www.fda.gov/` root
responded fine (200, 1.3 s) either way. Note this in any build script.

---

## 6. CORS matrix (measured, `-H 'Origin: https://pilsim.pages.dev'`)

| Endpoint | `Access-Control-Allow-Origin` | Browser-callable? |
|---|---|---|
| `api.fda.gov/drug/label.json` | `*` | ✅ |
| `www.ebi.ac.uk/chembl/api/data/*` | `*` | ✅ |
| `rxnav.nlm.nih.gov/REST/*` | `*` | ✅ |
| `pubchem.ncbi.nlm.nih.gov/rest/pug/*` | `*` (present even on 503) | ✅ |
| `clinicaltrials.gov/api/v2/*` | `*` | ✅ |
| `pk-db.com/api/v1/*` | `*` | ✅ |
| `api.cpicpgx.org/v1/*` | `*` + `Access-Control-Expose-Headers` | ✅ |
| **`dailymed.nlm.nih.gov/dailymed/services/v2/*`** | **none (0 `access-control-*` headers)** | ❌ **blocked** |
| **`uxn2ycvimg.us-east-2.awsapprunner.com/*` (DrugCentral DRS)** | **none** | ❌ **blocked** |
| `ftp.ncbi.nlm.nih.gov` (PubChem bulk) | `Access-Control-Expose-Headers` only | ⚠️ partial |

**Architectural conclusion, consistent with the mission brief's hard constraint:**
even the endpoints that *do* allow browser access must not be in the demo path. Bake
everything at build time. If the team wants a live "enrichment" button, only the ✅
rows can be called from the browser; DailyMed and DrugCentral would need a Worker
proxy.

---

## 7. Recommended acquisition script (all commands verified individually)

```bash
#!/usr/bin/env bash
# scripts/fetch-data.sh — run once at build time, commit the outputs.
set -euo pipefail
mkdir -p data/raw
UA='PilSim-research/1.0'

# --- 1. Small bulk files we genuinely want offline (~3 MB total) ---
curl -sS -A 'Mozilla/5.0' -L \
  'https://www.fda.gov/media/193784/download?attachment' -o data/raw/iig_july_2026.zip
curl -sS 'http://sideeffects.embl.de/media/download/meddra_all_se.tsv.gz' \
  -o data/raw/sider_meddra_all_se.tsv.gz
for f in HTTK-Physiology-Data Tissue-Volumes-Flows Tissue-Composition Tissue-Density; do
  curl -sS "https://raw.githubusercontent.com/USEPA/CompTox-ExpoCast-httk/main/datatables/$f.txt" \
    -o "data/raw/httk-$f.txt"
done
curl -sS 'https://download.open.fda.gov/other/unii/other-unii-0001-of-0001.json.zip' \
  -o data/raw/openfda-unii.zip          # 3.47 MB, canonical excipient-name↔UNII
curl -sS 'https://download.open.fda.gov/drug/orangebook/drug-orangebook-0001-of-0001.json.zip' \
  -o data/raw/openfda-orangebook.zip    # 2.34 MB, approved strengths & dosage forms

# --- 2. Per-drug snapshots (5 drugs; no key needed at this volume) ---
for d in lisinopril losartan amlodipine hydrochlorothiazide metoprolol; do
  curl -sS "https://api.fda.gov/drug/label.json?search=openfda.generic_name:%22$d%22&limit=5" \
    -o "data/raw/openfda-label-$d.json"
  curl -sS "https://api.fda.gov/drug/event.json?search=patient.drug.openfda.generic_name:%22$d%22&count=patient.reaction.reactionmeddrapt.exact&limit=25" \
    -o "data/raw/faers-$d.json"
  curl -sS "https://www.ebi.ac.uk/chembl/api/data/molecule.json?pref_name__iexact=${d^^}" \
    -o "data/raw/chembl-$d.json"
  RXCUI=$(curl -sS "https://rxnav.nlm.nih.gov/REST/rxcui.json?name=$d" \
          | python3 -c 'import sys,json;print(json.load(sys.stdin)["idGroup"]["rxnormId"][0])')
  curl -sS "https://rxnav.nlm.nih.gov/REST/rxcui/$RXCUI/related.json?tty=SCD" \
    -o "data/raw/rxnav-forms-$d.json"        # available strengths + routes
  curl -sS "https://rxnav.nlm.nih.gov/REST/rxcui/$RXCUI/allProperties.json?prop=all" \
    -o "data/raw/rxnav-props-$d.json"        # ATC + DrugBank id cross-walk
  # PubChem: honour Retry-After, it WILL 503 on a shared IP
  curl -sS --retry 5 --retry-delay 30 --retry-all-errors -A "$UA" \
    "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/$d/property/MolecularFormula,MolecularWeight,SMILES,InChIKey,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount/JSON" \
    -o "data/raw/pubchem-$d.json"
  sleep 1
done

# --- 3. Excipients, discrete, from DailyMed XML (cleaner than openFDA) ---
for d in lisinopril losartan amlodipine hydrochlorothiazide metoprolol; do
  SET=$(curl -sS "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=$d&pagesize=1" \
        | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"][0]["setid"])')
  curl -sS "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/$SET.xml" \
    -o "data/raw/dailymed-$d.xml"     # NOTE: .json returns HTTP 415. XML only.
done

# --- 4. Pharmacogenomics (metoprolol / CYP2D6) ---
curl -sS 'https://api.cpicpgx.org/v1/drug?name=eq.metoprolol' -o data/raw/cpic-metoprolol.json
curl -sS 'https://api.cpicpgx.org/v1/recommendation?drugid=eq.RxNorm:6918&select=drugrecommendation,implications,phenotypes,classification' \
  -o data/raw/cpic-metoprolol-recs.json

# --- 5. PD binding constants (per drug, needs the SALT chembl id) ---
curl -sS 'https://www.ebi.ac.uk/chembl/api/data/mechanism.json?molecule_chembl_id=CHEMBL419213' \
  -o data/raw/chembl-mechanism-lisinopril.json
curl -sS 'https://www.ebi.ac.uk/chembl/api/data/activity.json?molecule_chembl_id=CHEMBL1237&target_chembl_id=CHEMBL1808&limit=50' \
  -o data/raw/chembl-activity-lisinopril-ACE.json
```

**ATC/DDD is deliberately NOT scraped** — the 5 values are hand-transcribed in §4.5
with the WHOCC URL and retrieval date, because the WHOCC data is not openly licensed
for redistribution and 5 numbers do not justify a scraper.

---

## 8. Coverage scorecard

| Requirement | Best verified source | Bulk? | Status |
|---|---|---|---|
| Chemical/structural identity | ChEMBL `molecule.json`; PubChem PUG-REST; DrugCentral DRS | ✅ (all 3) | **VERIFIED** |
| Regulatory drug product labeling | openFDA `/drug/label`; DailyMed XML | ✅ | **VERIFIED** |
| Pharmacokinetic parameters | openFDA `clinical_pharmacology` prose (definite); PK-DB `/outputs/` (endpoint alive, query unsolved) | ⚠️ | **PARTIAL** |
| Pharmacodynamic dose–response | ChEMBL `activity.json` (in-vitro IC50, 23 assays for lisinopril/ACE) | ✅ | **VERIFIED — but see §2.1 caveat** |
| Adverse effects | openFDA label `adverse_reactions`; FAERS `count=`; SIDER 4.1 | ✅ | **VERIFIED** |
| Drug–drug interactions | openFDA label `drug_interactions`; hand-curation (10 pairs) | ✅ | **VERIFIED — but no API exists (§5.1)** |
| Drug–disease contraindications | openFDA label `contraindications` + `boxed_warning`; ChEMBL `drug_indication` (EFO/MeSH); DrugCentral `omop_relationship` (in 1.4 GB dump) | ✅ | **VERIFIED** |
| ATC classification | ChEMBL `atc_classifications`; RxNav RxClass; RxNav `allProperties` | ✅ | **VERIFIED** |
| Defined Daily Doses | WHO ATCDDD index (HTML scrape) — all 5 retrieved, §4.5 | ❌ (licensed) | **VERIFIED** |
| Excipient data | FDA IID (374 KB, max daily exposure per route/form); DailyMed XML `<name>` | ✅ | **VERIFIED** |
| Formulation / route availability | RxNav `related.json?tty=SCD`; openFDA `openfda.route`; FDA Orange Book bulk (2.34 MB) | ✅ | **VERIFIED** |
| Human physiological reference values | **US EPA httk datatables** — organ V & Q, CO, GFR, plasma volume, hematocrit, body water, all ICRP/Davies-Morris-sourced in-band | ✅ (58 KB) | **VERIFIED ★** |
| Pharmacogenomics (bonus) | CPIC API | ✅ | **VERIFIED ★** |
| Target tissue expression (bonus) | Human Protein Atlas | ✅ (7.46 MB) | **VERIFIED** |

---

## Cross-agent notes

*Findings that belong in other agents' files. I have not edited their files.*

**→ Agent B (`data/substances.json`, `data/products.json`)**
1. **Excipients: use DailyMed XML, not openFDA `inactive_ingredient`.** That openFDA
   field is `None` for prescription labels (verified for amlodipine). Rx excipients are
   only in `spl_product_data_elements` as one unsplit string. DailyMed XML gives them
   discretely (§3.3, real amlodipine list retrieved: microcrystalline cellulose,
   magnesium stearate, silicon dioxide, sodium starch glycolate type A potato).
2. **ChEMBL salt-vs-parent will bite you.** `mechanism.json?molecule_chembl_id=CHEMBL1237`
   (parent) returns `total_count: 0`; the salt id `CHEMBL419213` returns the ACE
   inhibitor mechanism. Indications are the reverse. Query both ids.
3. **Use `mw_freebase`, not `full_mwt`, for molar PK.** Lisinopril: 405.50 (free base)
   vs 441.53 (dihydrate). An 8.9% error propagates through every concentration.
4. **logP sources disagree materially** — ChEMBL `alogp` 1.24 vs DrugCentral `clogp`
   −1.82 for lisinopril. These are different prediction algorithms. Pick one source per
   property, state which, do not average.
5. **FDA IID gives you dose caps per excipient per route/dosage form** (e.g. magnesium
   stearate, ORAL TABLET, max daily exposure **980 mg**). That is the defensible basis
   for the Pills page's "can these coexist / is this formulation feasible" check, and
   it is a 374 KB CSV with 9,072 rows.
6. **Formulations:** RxNav confirms lisinopril exists as a **1 mg/mL oral solution**
   (RxCUI 1806884) as well as tablets, and the lisinopril/HCTZ FDC is real
   (RxCUI 197885, "hydrochlorothiazide 12.5 MG / lisinopril 10 MG Oral Tablet").
   Enumerate all five via `?tty=SCD`.
7. **DDDs (WHO, retrieved 2026-08-17, page last updated 2026-01-20):** lisinopril 10 mg O,
   losartan 50 mg O, amlodipine 5 mg O, HCTZ 25 mg O, metoprolol **0.15 g** O and P.
   **Metoprolol is in grams in the source** — do not lose the 1000×.

**→ Agent C (`data/rules.json`)**
1. **There is no free DDI API any more.** RxNav's was retired ~2024-01-02 and returns
   404 on all three operations (§5.1). DDInter is unreachable. DrugBank is 403.
   **Hand-curate the 10 pairs from openFDA label `drug_interactions` text.** For a
   5-drug set this is correct engineering, not a compromise — say so in the pitch.
2. **Boxed warnings are directly machine-readable** and give you the highest-severity
   triggers for free: `results[0].boxed_warning[0]`, and ChEMBL's
   `black_box_warning: 1` flag. Real retrieved text for lisinopril/HCTZ:
   *"WARNING: FETAL TOXICITY. When pregnancy is detected, discontinue… Drugs that act
   directly on the renin-angiotensin system can cause injury and death to the
   developing fetus."* That is your pregnancy reject rule, verbatim and citable.
3. **Key comorbidities on EFO ids from ChEMBL `drug_indication`, not ICD-11.** ICD-11's
   API is OAuth-gated (401 verified) and adds a registration step; ChEMBL already hands
   you `EFO:0000400` = diabetes mellitus, `EFO:0000319` = cardiovascular disease, etc.,
   joined to the drug. **But filter `max_phase_for_ind == "4.0"`** — the unfiltered
   list has junk in it (lisinopril's first indication row is *azoospermia*, from a
   Phase-2 trial).
4. **CPIC's real position on metoprolol is weaker than the brief assumes.** For
   Ultrarapid Metabolizer, `classification` is literally `"No Recommendation"` and the
   implication text says *"it is unclear whether this results in clinically significant
   changes in heart rate, blood pressure, or clinical outcomes."* Model the PK effect;
   do not claim CPIC recommends a dose change. Exact strings are in §4.4.
5. If you have a spare hour and Postgres, DrugCentral's 1.4 GB dump contains
   `omop_relationship` (indication/contraindication/off-label edges) and `ddi` —
   the best open contraindication source I found. Tier 2.

**→ Agent D (`data/patient_model.json`, `research/02-VIRTUAL-HUMAN.md`)**
1. **Start from `https://raw.githubusercontent.com/USEPA/CompTox-ExpoCast-httk/main/datatables/`.**
   Two files (~6 KB) give you the entire baseline physiology with **per-row literature
   citations already in the data** — `Tissue-Volumes-Flows.txt` (13 human organs, L/kg
   and mL/min/kg^0.75, each with `Vol Reference` and `Flow Reference` columns) and
   `HTTK-Physiology-Data.txt` (cardiac output, GFR, plasma volume, hematocrit, total
   body water, albumin, AGP, body temp, urine, bile). Both pasted in full in §4.1.
   This satisfies Locked Decision 4 essentially for free.
2. **The `kg^(3/4)` allometric exponent gives you body-size scaling for free.** CO
   231.4 × BW^0.75 → 5.60 L/min at 70 kg; GFR 5.165 × BW^0.75 → 125 mL/min at 70 kg.
   Both check out against textbook values. Your weight/BMI slider gets physiologically
   coherent CO and GFR with one line of code.
3. **Provenance chain to quote in `02-VIRTUAL-HUMAN.md`** (from httk's own docs, which
   I extracted from the CRAN tarball): tissue volumes are ICRP-derived — *"Tissue
   volumes were calculated by converting the fractional mass of each tissue with its
   density (both from ICRP)"* — flows from Davies & Morris (1993) and Birnbaum et al.
   (1994), composition from Schmitt (2008) and Ruark et al. (2014). **So you can say
   "ICRP-derived" honestly without paying for ICRP 89.**
4. **IT'IS Database V5.0** (`https://itis.swiss/assets/Downloads/TissueDb/Database-V5-0.zip`,
   5.75 MB, verified) is a cross-check and a source of tissue *density* — but it is an
   EM/thermal database, its per-tissue web tables are JS-rendered and return nothing to
   curl, and it is **not** a PBPK perfusion database. Use httk as primary.
5. **⚠️ Verify your eGFR equation version.** The mission brief flags this and it is
   real: CKD-EPI 2021 removed the race coefficient. I did **not** verify which version
   is current in 2026 — that is your call to make from a live guideline source, and it
   matters because HCTZ efficacy is gated on kidney function in your presets.

**→ Agent E (`research/03-SIMULATION-SPEC.md`, `research/06-VALIDATION.md`)**
1. **Do NOT use ChEMBL IC50 as the clinical PD EC50.** Lisinopril's ACE IC50 is
   1.2–4.7 nM across 23 assays. Plugging that into an Emax model against plasma
   concentration will make the simulation absurdly over-potent, because *in vivo* the
   effect is limited by tissue ACE, RAAS counter-regulation, and the fact that ~100%
   plasma ACE inhibition does not equal 100% BP effect. **Use ChEMBL for relative
   potency and citable mechanism; fit the clinical EC50 from dose–response
   literature.** A judge who is a clinician will notice this one.
2. **The ChEMBL activity spread (1.2 → 4.7 nM) is free inter-assay variability data**
   and is a legitimate, citable input to your parameter distributions.
3. **PK-DB is worth 20 more minutes.** `https://pk-db.com/api/v1/outputs/` and
   `.../pkdata/timecourses/` are alive (HTTP 200) and are the only free structured
   source of Cmax/Tmax/t½/AUC/CL *with group-level variability and per-study
   provenance* that I found. But `?search=<drug>` returns `count: 0` on `/outputs/`
   while returning 803 (mostly irrelevant) hits on `/studies/`. The right filter is
   probably the info_node sid (`metoprolol-tartrate`, verified to exist) rather than
   `?search=`. **Also check the `licence` field — some records are `"closed"`.**
   Fallback: openFDA label `clinical_pharmacology` prose definitely contains the PK
   numbers (verified for amlodipine and metoprolol).
4. **httk is not just data — it is a validated open PBPK implementation** (US EPA,
   GPL-3, `doi:10.18637/jss.v079.i04`). You cannot run R on Cloudflare, but the model
   *structure* in its documentation is a free, peer-reviewed template for your
   TypeScript compartment model, and its published outputs are a validation oracle.
   Worth a paragraph in the model-class justification.
5. **Metoprolol DDD is 0.15 g, not 150 mg, in the WHO source** — unit trap for any
   validation table you build.

**→ Agent F (`research/04-ORGAN-EFFECT-MAP.md`, `05-OUTPUT-REPORT-SPEC.md`, `07-PRIOR-ART.md`)**
1. **Do not animate the intestine for lisinopril.** HPA reports ACE's *tissue-specific*
   nTPM as `{"intestine":"249.7","testis":"96.4"}` — but "tissue specific" in HPA means
   "enriched relative to other tissues", not "where the drug acts". ACE is a
   vascular-endothelial ectoenzyme, concentrated in pulmonary capillary endothelium and
   renal vasculature. **Use the full consensus tissue vector (`rnatsm` / normal-tissue
   columns), not the "RNA tissue specific nTPM" summary field.** This is the single
   easiest way for the animation to be confidently wrong in front of a clinician judge.
2. **HPA `search=` does substring matching** — `search=ACE` returns ACE2, BACE1, ACER1,
   ACER2. Filter on exact `Gene`.
3. **FAERS is available and is great UI colour, but it is NOT incidence.** Verified
   amlodipine top-10 reported reactions (§3.2) are dominated by polypharmacy noise —
   FATIGUE, PAIN, "DRUG INEFFECTIVE", "OFF LABEL USE" — and **peripheral oedema,
   amlodipine's signature visible adverse effect, is not in the top 10.** If you surface
   FAERS counts, label them "spontaneous reports, no denominator" or a clinician judge
   will (correctly) call it out. Drive the adverse-effect animation channels from the
   label's `adverse_reactions` section, and use FAERS only as a "what patients report"
   sidebar.
4. **SIDER 4.1 gives a clean drug→MedDRA-PT edge list offline** (2.38 MB, CC0) — join
   via PubChem CID with `CID1`/`CID0` prefix stripped, and **filter to `PT` rows** or
   you get 3–5 duplicate rows per effect. But it is from **2015**; do not present it as
   current.
5. **DrugCentral gives you free UI copy**: `.mrdef` is a MeSH definition sentence
   (*"One of the ANGIOTENSIN-CONVERTING ENZYME INHIBITORS (ACE inhibitors), orally
   active, that has been used in the treatment of hypertension and congestive heart
   failure."*) and `.stem` is the USAN class stem (`"-pril"`) — a nice, real, citable
   class badge for the Substances page.
6. **Prior art / licensing for `07-PRIOR-ART.md`:** the open PK/PD tooling that
   actually exists and is reusable — **US EPA httk** (GPL-3, R, validated PBPK),
   **Open Systems Pharmacology PK-Sim/MoBi** (GPLv2; current release **v12.3.173**,
   published **2026-07-07**, verified via GitHub API; Windows `.msi` and a
   `PKSim-Portable…zip`, both ~109 MB — desktop only, cannot run on Cloudflare, but it
   is the reference open PBPK platform and worth naming). Commercial comparators:
   Certara Simcyp, Certara Phoenix WinNonlin. **PilSim's honest differentiation:
   browser-native, zero-install, one-day-buildable, and aimed at a health ministry
   rather than a pharma PK department.**

**→ The lead (`00-DECISIONS.md`)**
- The **"no live third-party call in the demo path"** constraint is fully satisfiable.
  Total offline data footprint: ~3 MB of genuine bulk files (FDA IID 374 KB, SIDER
  2.38 MB, httk 58 KB) plus ~5 MB of snapshotted per-drug API responses. Everything the
  product needs can be committed.
- **The single biggest data-side risk is not availability, it is misuse:** ChEMBL
  in-vitro IC50 masquerading as a clinical EC50, and FAERS counts masquerading as
  incidence. Both are the kind of error a clinician judge catches instantly. Both are
  flagged above for Agents E and F.
- **One retired endpoint materially changes scope:** there is no free DDI API. The
  hand-curated 10-pair matrix is the right answer and should be pitched as a deliberate
  curation decision, not a gap.
