# MedChex — Product Requirements Document

**Team:** Ismael Caraballo · Paula Maiguru
**Program:** Pursuit L2 Capstone
**Demo Day:** March 18, 2026
**Repo:** https://github.com/ismaelcaraballo-afk/medchex

---

## Problem Statement

Every year, adverse drug interactions contribute to over 125,000 deaths and 1.5 million hospitalizations in the United States. Most of these are preventable. The people most at risk — elderly patients, those managing multiple chronic conditions, caregivers — are the least equipped to research drug interactions themselves.

Current tools either require medical training to interpret, are locked behind expensive subscriptions, or give vague warnings without explaining *why* a combination is dangerous.

**MedChex solves this:** a free, plain-English drug interaction checker backed by real FDA adverse event data — not AI guesses.

---

## Solution

MedChex lets anyone type in two or more medications and instantly get:

1. Whether a dangerous interaction exists
2. How serious it is (SAFE / CAUTION / DANGEROUS)
3. A plain-English explanation of what could happen and why

Severity is determined by real FDA and NIH data. AI is used only to translate clinical findings into language anyone can understand.

---

## Target Users

- **Patients** managing multiple prescriptions
- **Caregivers** monitoring medications for elderly family members
- **Pharmacy students** learning drug interaction concepts
- **Anyone** who just got a new prescription and wants to double-check

---

## Core Features (MVP)

### 1. Drug Search
- User types a drug name (brand or generic)
- App resolves it to an RxCUI code via NIH RxNorm
- Supports up to 5 drugs at once

### 2. Interaction Check
- Queries NIH RxNorm interaction API using RxCUI codes
- Returns all known interaction pairs

### 3. Severity Scoring
- Parses FDA/RxNorm severity language: "contraindicated", "fatal", "monitor closely"
- Returns one of three levels: **SAFE** / **CAUTION** / **DANGEROUS**
- Deterministic — same input always returns same score, fully auditable

### 4. AI Explanation
- Sends interaction data to Claude (claude-sonnet-4-6)
- Returns a 2-3 sentence plain-English summary of the risk
- AI explains — AI does NOT classify

### 5. FDA Adverse Events
- Queries OpenFDA FAERS database for real-world outcomes
- Shows how many adverse event reports exist for this combination

---

## Technical Architecture

```
User → React Frontend (Vite + TypeScript + TailwindCSS)
           ↓
     Express Backend (Node.js)
           ↓
   ┌───────┬───────────┬────────────┬──────────┐
   │RxNorm │ OpenFDA   │ Claude AI  │  Cache   │
   │  NIH  │  FAERS    │ (explain)  │(node-cache│
   └───────┴───────────┴────────────┴──────────┘
```

**Frontend:** React 19 · TypeScript · Vite · TailwindCSS · Framer Motion · Recharts
**Backend:** Node.js · Express 5 · express-rate-limit · node-cache
**APIs:** NIH RxNorm · OpenFDA FAERS · Anthropic Claude
**Deployment:** Vercel (frontend + serverless backend)

---

## Data Sources

| Source | What It Provides | Why We Use It |
|--------|-----------------|---------------|
| NIH RxNorm | Drug name → RxCUI, known interactions | Official US drug vocabulary, free, no auth required |
| OpenFDA FAERS | Real-world adverse event reports | Actual patient outcomes, not theoretical |
| Anthropic Claude | Plain-English explanations | Translates clinical data for general audience |

---

## What We're NOT Building (MVP Scope)

- No user accounts or saved history
- No dosage-specific interaction analysis
- No mobile app
- No real-time prescription import

---

## Success Criteria

- [ ] User can check 2+ drugs and get a severity score in under 3 seconds
- [ ] App works end-to-end with DEMO_MODE off (live APIs)
- [ ] AI explanation is accurate and non-alarmist
- [ ] App does not crash on unknown drug names
- [ ] Demo Day: live demo with Warfarin + Ibuprofen case study

---

## Build Timeline

| Week | Milestone |
|------|-----------|
| Mar 8–10 | PRD finalized, backend endpoints working, frontend scaffold |
| Mar 11–14 | Full integration, UI polish, error handling |
| Mar 15–17 | Demo prep, DEMO_MODE fallback tested, deployment |
| Mar 18 | **Demo Day** |

---

## Team Roles

| Member | Focus |
|--------|-------|
| Ismael Caraballo | Backend API, data integration, architecture |
| Paula Maiguru | Frontend UI/UX, product vision, demo presentation |
