# MedCheck — Data Sources

## 1. OpenFDA Drug Label API
- URL: https://api.fda.gov/drug/label.json
- Auth: None (free, public)
- What it gives: brand names, generic names, warnings, contraindications
- Use: drug search autocomplete + label warnings

## 2. NIH RxNorm / RxNav Interaction API
- URL: https://rxnav.nlm.nih.gov/REST/interaction/list.json
- Auth: None (free, public, no rate limit)
- What it gives: known drug-drug interactions by RxCUI code
- Use: core interaction detection engine

## 3. Groq AI (Llama 3.3 70B)
- Auth: GROQ_API_KEY in .env (free tier)
- What it gives: plain English explanation of what interactions mean
- Use: translate clinical data into patient-friendly language

## Flow
User types drug names
  → OpenFDA resolves to RxCUI codes
  → RxNav checks interactions between all drugs
  → Groq explains results in plain English
  → UI shows severity (safe / caution / danger) + what to do
