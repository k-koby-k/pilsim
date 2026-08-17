# Physicochemical Properties & Identifiers — Actives and Excipients

**Collection date:** 2026-08-17
**Sources:** PubChem PUG-REST + PUG-View (executed via curl); FDA GSRS (Global Substance
Registration System) for excipient UNII/CAS.
**Status:** salvaged from an agent that completed this sub-task; verified data, ready to
merge into `data/substances_part1.json` / `data/substances_part2.json`.

## API reproducibility notes

1. `CanonicalSMILES` in a PUG-REST property request does **not** 400 — PubChem accepts it
   and returns the field renamed to `ConnectivitySMILES` in the response JSON. Request with
   `CanonicalSMILES`, parse as `ConnectivitySMILES`.
2. The `XLogP` field returned is PubChem's computed **XLogP3** descriptor. Absent from all
   multi-component salt records.
3. PUG-REST returns `HTTP 503 PUGREST.ServerBusy` on rapid-fire requests. All values here
   collected with exponential backoff; no value accepted from a Fault response.
4. Excipient CAS/UNII came from FDA GSRS, not PubChem, because PubChem has no compound
   records for most polymers.
   - Search: `https://gsrs.ncats.nih.gov/api/v1/substances/search?q=root_names_name:"<NAME>"`
   - Full record: `https://gsrs.ncats.nih.gov/api/v1/substances(<UNII>)?view=full`
   - CAS is in the `codes` array where `codeSystem == "CAS"`.

---

## 1. Actives — identifiers and computed properties

Property table endpoint:
`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/<name>/property/MolecularFormula,MolecularWeight,CanonicalSMILES,InChIKey,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount,Complexity/JSON`
CAS/UNII: `.../rest/pug_view/data/compound/<CID>/JSON?heading=CAS` and `?heading=UNII`

| Compound | CID | CAS | UNII | InChIKey | Formula | MW (g/mol) | XLogP3 | TPSA (Å²) | HBD/HBA |
|---|---|---|---|---|---|---|---|---|---|
| Lisinopril (anhydrous) | 5362119 | 76547-98-3 | 7Q3P4BS2FD | RLAWWYSOJDYHDC-BZSNNMDCSA-N | C21H31N3O5 | 405.5 | −2.9 | 133 | 4/7 |
| Lisinopril dihydrate (tablet form) | 5362118 | 83915-83-7 | E7199S1YWR | CZRQXSDBMCMPNJ-ZUIPZQNBSA-N | C21H35N3O7 | 441.5 | NOT_FOUND | 135 | 6/9 |
| Losartan (free acid) | 3961 | 114798-26-4 | JMS50MPO89 | PSIFNNKUMBGKDQ-UHFFFAOYSA-N | C22H23ClN6O | 422.9 | 4.3 | 92.5 | 2/5 |
| Losartan potassium (tablet salt) | 11751549 | 124750-99-8 | 3ST302B24A | OXCMYAYHXIHQOA-UHFFFAOYSA-N | C22H22ClKN6O | 461.0 | NOT_FOUND | 77.7 | 1/6 |
| Losartan carboxylic acid (EXP3174 / E-3174) | 108185 | 124750-92-1 | GD76OCH73X | ZEUXAIYYDDCIRX-UHFFFAOYSA-N | C22H21ClN6O2 | 436.9 | 5.0 | 110 | 2/6 |
| Amlodipine (free base) | 2162 | 88150-42-9 | 1J444QC288 | HTIQEAQVCYTUBX-UHFFFAOYSA-N | C20H25ClN2O5 | 408.9 | 3.0 | 99.9 | 2/7 |
| Amlodipine besylate | 60496 | 111470-99-6 | 864V2Q084H | ZPBWCRDSRKPIDG-UHFFFAOYSA-N | C26H31ClN2O8S | 567.1 | NOT_FOUND | 163 | 3/10 |
| Hydrochlorothiazide | 3639 | 58-93-5 | 0J48LPH2TH | JZUFKLXOESDKRF-UHFFFAOYSA-N | C7H8ClN3O4S2 | 297.7 | −0.1 | 135 | 3/7 |
| Metoprolol (free base) | 4171 | 37350-58-6 *and* 51384-51-1 (see note) | GEB06NHM23 | IUBSYMUCCVWXPE-UHFFFAOYSA-N | C15H25NO3 | 267.36 | 1.9 | 50.7 | 2/4 |
| Metoprolol tartrate (2:1) | 441308 | 56392-17-7 | W5S57Y3A5L | YGULWPYYGQCFMP-CEAXSRTFSA-N | C34H56N2O12 | 684.8 | NOT_FOUND | 217 | 8/14 |
| Metoprolol succinate (2:1) | 62937 | 98418-47-4 | TH25PD4CCB | RGHAZVBIOOEVQX-UHFFFAOYSA-N | C34H56N2O10 | 652.8 | NOT_FOUND | 176 | 6/12 |

**EXP3174 confirmed:** CID 108185's synonym list (`/rest/pug/compound/cid/108185/synonyms/JSON`)
explicitly contains `EXP-3174`, `E-3174`, `Losartan carboxylic acid [EXP3174]`. Correct
metabolite CID.

**Metoprolol CAS ambiguity — flagged, unresolved.** CID 4171 carries two CAS numbers from
different depositors: CAS Common Chemistry, DrugBank and FDA GSRS give **51384-51-1**;
HSDB and HMDB give **37350-58-6**. Both resolve back to CID 4171. No source adjudicates
which is canonical, so both are reported. Prefer 51384-51-1 for FDA-aligned joins.

**Lisinopril CAS caveat.** Under CID 5362119 (anhydrous), DTP/NCI and HMDB deposit
83915-83-7, which is actually the *dihydrate* CAS. The anhydrous CAS per CAS Common
Chemistry / DrugBank / GSRS / ECHA / EPA DSSTox is **76547-98-3**.

### 1b. Salt-to-base conversion factors

CALCULATED from the PubChem molecular weights above — not fetched. Needed because product
strengths are labeled in different bases across these five drugs.

| Salt | Salt MW | Base MW basis | Base fraction | mg salt per mg base |
|---|---|---|---|---|
| Lisinopril dihydrate → lisinopril | 441.5 | 405.5 | 0.9185 | 1.0888 |
| Losartan potassium → losartan | 461.0 | 422.9 | 0.9174 | 1.0901 |
| Amlodipine besylate → amlodipine | 567.1 | 408.9 | 0.7211 | 1.3869 |
| Metoprolol tartrate → metoprolol | 684.8 | 2 × 267.36 = 534.72 | 0.7808 | 1.2807 |
| Metoprolol succinate → metoprolol | 652.8 | 2 × 267.36 = 534.72 | 0.8191 | 1.2208 |

Sanity check: 5 mg amlodipine base ÷ 0.7211 = 6.93 mg besylate, matching the labeled
6.94 mg. Conversion factors validated.

---

## 2. Actives — experimental properties with source attribution

All from `.../rest/pug_view/data/compound/<CID>/JSON?heading=<LogP|Dissociation+Constants|Solubility|Melting+Point>`

### Lisinopril (CID 5362119)
| Property | Value | Attribution |
|---|---|---|
| Experimental logP | −1.01 | DrugBank DB00722 |
| logP (log Kow) | −1.22 | HSDB 6852 |
| pKa | 2.5 at 25 °C | DrugBank DB00722 |
| Water solubility | 97 000 mg/L | DrugBank DB00722 |
| Water solubility | 97 mg/mL | HMDB0001938 |
| Melting point | 148 °C | DrugBank DB00722 |

### Losartan free acid (CID 3961)
| Property | Value | Attribution |
|---|---|---|
| Experimental logP | 1.19 | DrugBank DB00678 |
| Experimental logP | 6.1 | HMDB0014816 |
| pKa | 5.5 | DrugBank DB00678 |
| pKa | 5–6 | HSDB 7043 |
| Water solubility | <1 mg/mL | DrugBank DB00678 |
| Water solubility | 4.70e-03 g/L | HMDB0014816 |
| Melting point | 178–184 °C | DrugBank DB00678 |
| Melting point | 183.5–184.5 °C | HSDB 7043 |

**Conflict flagged.** The two logP values (1.19 vs 6.1) and the two solubility values
(<1 mg/mL vs 0.0047 g/L) are mutually inconsistent by orders of magnitude. Both reported
verbatim; PubChem does not reconcile them. The DrugBank logP of 1.19 also disagrees with
the computed XLogP3 of 4.3. Do not silently pick one — if the simulation needs lipophilicity,
mark the choice and its uncertainty.

### Losartan carboxylic acid / EXP3174 (CID 108185)
Experimental logP, pKa, water solubility and melting point are all **NOT_FOUND** —
PUG-View returns no Record for any of those headings. Only computed values available:
XLogP3 = 5.0, TPSA = 110 Å².

### Amlodipine free base (CID 2162)
| Property | Value | Attribution |
|---|---|---|
| Experimental logP | 3 | DrugBank DB00381 |
| logP (log Kow) | 3.00 | HSDB 7079 |
| Experimental logP | 3.00 | HMDB0005018 |
| pKa (basic) | 9.26 | ChEMBL CHEMBL1491 |
| Water solubility | "slightly soluble in water" — qualitative only, no number | DrugBank DB00381 |
| Melting point | 199–201 °C | DrugBank DB00381 |

### Hydrochlorothiazide (CID 3639)
| Property | Value | Attribution |
|---|---|---|
| Experimental logP | −0.07 | DrugBank DB00999 |
| logP (log Kow) | −0.07 | HSDB 3096 |
| pKa | 7.9 | DrugBank DB00999 |
| pKa1 / pKa2 | 7.9 / 9.2 | HSDB 3096 |
| Water solubility | 722 mg/L at 25 °C | DrugBank DB00999 and HSDB 3096 |
| Water solubility | 0.722 mg/mL at 25 °C | HMDB0001928 |
| Kinetic solubility pH 7.4 | >44.7 µg/mL | Sanford-Burnham CCG, SID855646 |
| Melting point | 266–268 °C | DrugBank DB00999 |
| Melting point | 273–275 °C | HSDB 3096 |

### Metoprolol free base (CID 4171)
| Property | Value | Attribution |
|---|---|---|
| Experimental logP | 2.15 | DrugBank DB00264 |
| logP (log Kow) | 1.88 | HSDB 6531 |
| Experimental logP | 1.88 | HMDB0001932 |
| pKa (basic) | 9.7 | DrugBank DB00264 |
| pKa (basic) | 9.56 and 9.7 (two entries) | ChEMBL CHEMBL13 |
| Water solubility | >1000 mg/mL at 25 °C — **HSDB annotates this "/Tartrate/"**, i.e. it is the tartrate salt's solubility, not the free base | HSDB 6531 |
| Water solubility | "Soluble (tartrate form)" — qualitative | DrugBank DB00264 |
| Melting point | 120 °C | DrugBank DB00264 |

### Salt forms — experimental data availability
For lisinopril dihydrate (5362118), losartan potassium (11751549), amlodipine besylate
(60496), metoprolol tartrate (441308) and metoprolol succinate (62937), PUG-View returns
**no Record** for all four experimental headings. logP, pKa, water solubility and melting
point are NOT_FOUND for every salt form — use the free-base/free-acid values above.

---

## 3. Excipients

CID/MW from PubChem PUG-REST `/property/Title,MolecularFormula,MolecularWeight/JSON`.
CAS and UNII from FDA GSRS.

**Functional categories are ESTIMATED** — assigned from general pharmaceutical formulation
knowledge, not fetched, except the two rows citing HSDB. The Handbook of Pharmaceutical
Excipients and the USP-NF Excipient Performance chapter are both paywalled, and PubChem's
`Use Classification` heading returns JECFA food-additive and CIR cosmetic classes, not
pharmaceutical excipient functional categories.

| Excipient | CID | CAS | UNII | MW | Functional category |
|---|---|---|---|---|---|
| Microcrystalline cellulose | none | 9004-34-6 | OP1R32D61U | not meaningful (polymer) | Filler/diluent; dry binder — ESTIMATED |
| Lactose monohydrate | 104938 | 64044-51-5 (also 10039-26-6, 5989-81-1) | EWQ57Q8I5X | 360.31 | Filler/diluent — ESTIMATED |
| Anhydrous lactose | 84571 | 63-42-3 (also 16984-38-6) | 3SY5LH9PMK | 342.30 | Filler/diluent for moisture-sensitive actives — ESTIMATED |
| Mannitol | 6251 | 69-65-8 (also 87-78-5) | 3OWL53L36A | 182.17 | Filler/diluent — ESTIMATED |
| Dibasic calcium phosphate dihydrate | 104805 | 7789-77-7 | O7TSZ97GEP | 172.09 | Filler/diluent — ESTIMATED |
| Pregelatinized starch | none | NOT_FOUND | NOT_FOUND | not meaningful | Binder; disintegrant; filler — ESTIMATED |
| Corn starch | none | 9005-25-8 | O8232NY3SJ | not meaningful | Disintegrant; binder; filler — ESTIMATED |
| Croscarmellose sodium | none | 74811-65-7 | M28OL1HH48 | not meaningful | Superdisintegrant — ESTIMATED |
| Sodium starch glycolate | none | 9063-38-1 | Type B SP4S77AHO6 · Type B potato 27NA468985 · Type A H8AV0SQX4D | not meaningful | Superdisintegrant — ESTIMATED |
| Crospovidone | none | 9003-39-8 | 2S7830E561 · 6B46OH7T95 (20 µm) | not meaningful | Superdisintegrant — ESTIMATED |
| Povidone K30 | none | 9003-39-8 | U725QWY32X (K30) · FZ989GH94E | GSRS viscosity-average 40 000 | Binder — ESTIMATED |
| Hypromellose (HPMC) | none | 9004-65-3 | 3NXW29V3WO | not meaningful | Film-former; binder; rate-controlling matrix polymer — ESTIMATED |
| Magnesium stearate | 11177 | 557-04-0 | 70097M6I30 | 591.2 | **Lubricant** — HSDB, cited |
| Colloidal silicon dioxide | 24261 | 7631-86-9 (also 63231-67-4, 14808-60-7) | ETJ7Z6XBU4 | 60.084 (formula unit only) | Glidant; anti-adherent — ESTIMATED |
| Sodium stearyl fumarate | 23665634 | 4070-80-8 | 7CV7WJK4UI | 390.5 | Lubricant — ESTIMATED |
| Talc | 165411828 | 14807-96-6 | 7SEV7J4R1U | 379.27 | **Glidant / anti-adherent** — HSDB, cited |
| Titanium dioxide | 26042 | 13463-67-7 (also 1317-80-2, 1344-29-2) | 15FIX9V2JP | 79.866 | Opacifier; white pigment — ESTIMATED |
| PEG 400 (macrogol 400) | see caveats | 25322-68-3 (also 5117-19-1) | B697894SGQ | nominal 380–420, grade-defined | Plasticizer; film-coating solvent — ESTIMATED |
| PEG 6000 (macrogol 6000) | none | 25322-68-3 | 30IQX730WE | GSRS number-average 6000 | Plasticizer; solid dispersion carrier — ESTIMATED |
| Polyethylene oxide | none | 25322-68-3 | grade-specific: 74D3A2BP47 (250 000), V46Y6OJ5QB (100 000), RU64142H6P (4 000 000) | MW *is* the grade designation | Rate-controlling matrix polymer — ESTIMATED |
| Ethylcellulose | see caveats | 9004-57-3 | 6I475159RA (50 mPa·s, weight-average 160 000) · YV4VDW9SQS (200 mPa·s) | not meaningful | Rate-controlling film-former — ESTIMATED |
| Cellulose acetate | none | 9004-35-7 | 3J2P07GVB6 | not meaningful | Semipermeable membrane former, osmotic tablets — ESTIMATED |
| Iron oxide red | 518696 | 1309-37-1 (also 1317-60-8, 1332-37-2, 12002-17-4) | 1K09F3G675 | 159.69 | Colorant — ESTIMATED |
| Iron oxide yellow | 91502 (proxy — see caveats) | 1317-63-1 (also 51274-00-1) | EX438O2MRT | 88.85 | Colorant — ESTIMATED |
| FD&C Blue No. 2 (indigo carmine) | 2723854 | 860-22-0 | L06K8R7DQK | 466.4 | Colorant — ESTIMATED |
| FD&C Blue No. 2 aluminum lake | 61842 | 16521-38-3 (also 15792-65-1, 78729-87-0, 12227-85-9) | 4AQJ3LG584 | 449.4 (cation only; a lake is substrate-adsorbed, MW not meaningful) | Colorant, insoluble lake — ESTIMATED |
| Carnauba wax | none | 8015-86-9 | R12CBM0EIZ | not meaningful | Polishing agent — ESTIMATED |
| Stearic acid | 5281 | 57-11-4 | 4ELV7Z65AP | 284.5 | Lubricant — ESTIMATED |
| Calcium stearate | 15324 | 1592-23-0 | 776XM7047L | 607.0 | Lubricant — ESTIMATED |
| Sodium citrate (anhydrous trisodium) | 6224 | 68-04-2 (also 994-36-5) | RS7A450LGA | 258.07 | Alkalizing agent / buffer — ESTIMATED |
| Sodium citrate dihydrate | 71474 | 6132-04-3 | B22547B95K | 294.10 | Alkalizing agent / buffer — ESTIMATED |
| Sodium chloride | 5234 | 7647-14-5 | 451W47IQ8X | 58.44 | Osmotic agent / tonicity modifier — ESTIMATED |

### Excipient CID caveats — do NOT ingest these as the excipient's CID

Several name lookups return monomers or unrelated surrogates rather than the excipient:

- **Povidone / crospovidone:** `/name/1-ethenylpyrrolidin-2-one` → CID 6917 (C6H9NO, 111.14)
  is **N-vinylpyrrolidone, the monomer**. Povidone has no PubChem compound CID.
- **PEG 400 / PEG 6000 / PEO:** `/name/macrogol%20400` → CID 174 = **ethylene glycol**
  (62.07). `/name/5117-19-1` → CID 78798 = octaethylene glycol (370.44), a discrete 8-mer
  close to PEG 400's nominal MW but not the polydisperse grade. Neither is PEG 400.
- **Croscarmellose sodium:** `/name/carboxymethylcellulose%20sodium` → CID 6328154 is a
  **single repeat unit** of CMC-Na, and CMC-Na is the un-cross-linked parent, not
  croscarmellose.
- **Ethylcellulose:** `/name/9004-57-3` → CID 24832091, titled "Aquacoat" — a repeat-unit
  model of a commercial aqueous dispersion, not ethylcellulose.
- **Iron oxide yellow:** CID 91502 is goethite, the mineral α-FeO(OH). Right chemistry,
  but it is a mineral record, not the FDA colorant substance (UNII EX438O2MRT).

Confirmed to have **no PubChem compound record at all** (`PUGREST.NotFound` on every name
and CAS variant tried): microcrystalline cellulose, cellulose, croscarmellose sodium,
sodium starch glycolate, crospovidone, povidone, hypromellose, cellulose acetate, corn
starch, pregelatinized starch, polyethylene oxide, carnauba wax, PEG 6000. PubChem's
autocomplete index returns only derivative products for each, confirming genuine absence
rather than a lookup-name problem.

### Remaining gaps

- **Pregelatinized starch:** no UNII and no CAS retrievable — the GSRS record
  `STARCH, PREGELATINIZED CORN` is `substanceClass: concept` with `approvalID: null`.
- **Colloidal silicon dioxide:** GSRS has no UNII distinct from plain silicon dioxide;
  `SILICON DIOXIDE, COLLOIDAL` is a concept record with no approvalID.
- **Sodium citrate generic:** `SODIUM CITRATE, UNSPECIFIED FORM` (UNII 1Q73Q2JULR) has no
  CAS in GSRS. Use the anhydrous or dihydrate rows above.
- All excipient functional categories are ESTIMATED except magnesium stearate and talc.
