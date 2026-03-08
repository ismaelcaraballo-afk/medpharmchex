const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// Resolve drug name → RxCUI code via RxNorm
export async function getRxCUI(name: string) {
  const res = await fetch(`${BASE}/drug/rxcui?name=${encodeURIComponent(name)}`)
  return res.json()
}

// Get interactions between drugs by RxCUI codes
// RxCUI = standard drug ID from NIH RxNorm
export async function getInteractions(rxcuis: string[]) {
  const res = await fetch(`${BASE}/interactions?rxcuis=${rxcuis.join(',')}`)
  return res.json()
}

// Score interaction severity (SAFE / CAUTION / DANGEROUS)
export async function scoreInteractions(interactionPairs: unknown[]) {
  const res = await fetch(`${BASE}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interactionPairs })
  })
  return res.json()
}

// Claude AI plain-English explanation (Claude only explains — FDA data detects)
export async function explainInteractions(drugs: string[], interactions: unknown, severity: string) {
  const res = await fetch(`${BASE}/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drugs, interactions, severity })
  })
  return res.json()
}

// OpenFDA FAERS adverse event data for a drug
export async function getFAERS(drug: string) {
  const res = await fetch(`${BASE}/faers?drug=${encodeURIComponent(drug)}`)
  return res.json()
}
