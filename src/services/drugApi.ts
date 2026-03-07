const BASE = 'http://localhost:3001/api'

// Search drug by name → get FDA label data
export async function searchDrug(name: string) {
  const res = await fetch(`${BASE}/drug/search?name=${encodeURIComponent(name)}`)
  return res.json()
}

// Get interactions between drugs by RxCUI codes
// RxCUI = standard drug ID from NIH RxNorm
export async function getInteractions(rxcuis: string[]) {
  const res = await fetch(`${BASE}/interactions?rxcuis=${rxcuis.join(',')}`)
  return res.json()
}

// AI plain-English explanation
export async function explainInteractions(drugs: string[], interactions: unknown) {
  const res = await fetch(`${BASE}/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ drugs, interactions })
  })
  return res.json()
}
