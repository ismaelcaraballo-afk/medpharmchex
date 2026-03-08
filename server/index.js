import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import Anthropic from '@anthropic-ai/sdk'
import fetch from 'node-fetch'
import rateLimit from 'express-rate-limit'
import NodeCache from 'node-cache'

dotenv.config()

// WHY: Fail fast if required env vars are missing.
// A cryptic "Cannot read properties of undefined" mid-demo is worse than a clear startup error.
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY is not set. Add it to your .env file.')
  process.exit(1)
}

const app = express()
const PORT = process.env.PORT || 3001

// WHY: CORS restricted to known frontend origin in production.
// Allowing all origins (*) is a security risk — any website could call our API.
// In development we allow localhost; in production we lock to the Vercel frontend URL.
// WHY fallback: if FRONTEND_URL is missing in production, fail with clear message not silent block.
const allowedOrigin = process.env.NODE_ENV === 'production'
  ? (process.env.FRONTEND_URL || (() => { throw new Error('FRONTEND_URL must be set in production') })())
  : 'http://localhost:5173'

app.use(cors({ origin: allowedOrigin }))

app.use(express.json())

// WHY: Rate limiting prevents abuse of our API endpoints.
// Without it, a bad actor (or a bug in the frontend) could spam OpenFDA/RxNorm
// causing us to get blocked mid-demo. 100 requests per 15 min is generous for real users.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests — please wait a moment and try again.' }
})
app.use('/api/', limiter)

// WHY: Caching API responses reduces latency and protects against upstream API downtime.
// OpenFDA can take 5-10 seconds. Caching means the second request for "warfarin" is instant.
// TTL = 1 hour — drug interaction data doesn't change minute-to-minute.
const cache = new NodeCache({ stdTTL: 3600 })

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// WHY: DEMO_MODE pre-returns cached real data for our Demo Day drug pairs.
// Live API calls during a presentation are a single point of failure.
// If OpenFDA is slow or down on March 18, DEMO_MODE keeps the demo running perfectly.
const DEMO_INTERACTIONS = {
  'warfarin,ibuprofen': {
    scored: [{
      drug1: 'Warfarin', drug2: 'Ibuprofen',
      description: 'Ibuprofen may increase the anticoagulant effect of warfarin, raising the risk of serious or fatal bleeding.',
      severity: 'DANGEROUS'
    }]
  },
  'warfarin,aspirin': {
    scored: [{
      drug1: 'Warfarin', drug2: 'Aspirin',
      description: 'Concurrent use significantly increases bleeding risk. Contraindicated in most patients.',
      severity: 'DANGEROUS'
    }]
  },
  'lisinopril,ibuprofen': {
    scored: [{
      drug1: 'Lisinopril', drug2: 'Ibuprofen',
      description: 'NSAIDs like ibuprofen may reduce the antihypertensive effect of lisinopril and increase risk of kidney injury.',
      severity: 'CAUTION'
    }]
  }
}

// --- DATA SOURCE 1: RxNorm — drug name → RxCUI normalization ---
// WHY: RxCUI is the standard drug ID used by all NIH/FDA systems.
// We can't query the interaction API with plain text — we need the numeric RxCUI.
// Docs: https://rxnav.nlm.nih.gov/RxNormAPIs.html
app.get('/api/drug/rxcui', async (req, res) => {
  const { name } = req.query

  // WHY: Input validation prevents empty or malformed queries from hitting the API.
  // An empty string sent to RxNorm returns garbage data. Catch it early.
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Drug name must be at least 2 characters.' })
  }

  const cacheKey = `rxcui:${name.toLowerCase().trim()}`
  const cached = cache.get(cacheKey)
  if (cached) return res.json(cached)

  try {
    const url = `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name.trim())}&search=1`
    const data = await fetch(url).then(r => r.json())
    cache.set(cacheKey, data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: 'Could not reach RxNorm API. Please try again.' })
  }
})

// --- DATA SOURCE 2: RxNorm — interaction check by RxCUI list ---
// WHY: RxNorm is the gold standard for drug interaction detection.
// It's maintained by the NIH, free, no API key needed, and used in clinical systems.
// Docs: https://rxnav.nlm.nih.gov/InteractionAPIs.html
app.get('/api/interactions', async (req, res) => {
  const { rxcuis } = req.query

  // WHY: RxCUI codes must be numeric. Anything else will return bad data from RxNorm.
  if (!rxcuis || typeof rxcuis !== 'string') {
    return res.status(400).json({ error: 'rxcuis parameter is required.' })
  }
  const cuiList = rxcuis.split(',').map(s => s.trim())
  if (!cuiList.every(cui => /^\d+$/.test(cui))) {
    return res.status(400).json({ error: 'All RxCUI values must be numeric.' })
  }

  const cacheKey = `interactions:${cuiList.sort().join(',')}`
  const cached = cache.get(cacheKey)
  if (cached) return res.json(cached)

  try {
    const url = `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${cuiList.join(',')}`
    const data = await fetch(url).then(r => r.json())
    cache.set(cacheKey, data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: 'Could not reach RxNorm API. Please try again.' })
  }
})

// --- DATA SOURCE 3: OpenFDA FAERS — adverse event reports ---
// WHY: FAERS has 15M+ real adverse drug event reports from the FDA.
// This gives us real-world frequency data — how often has this combination hurt people?
// Used to enrich the results card, not as the primary detection source.
// Docs: https://open.fda.gov/apis/drug/event/
app.get('/api/faers', async (req, res) => {
  const { drug } = req.query

  if (!drug || typeof drug !== 'string' || drug.trim().length < 2) {
    return res.status(400).json({ error: 'Drug name must be at least 2 characters.' })
  }

  const cacheKey = `faers:${drug.toLowerCase().trim()}`
  const cached = cache.get(cacheKey)
  if (cached) return res.json(cached)

  try {
    const url = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(drug.trim())}"&limit=5`
    const data = await fetch(url).then(r => r.json())
    cache.set(cacheKey, data)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: 'Could not reach OpenFDA API. Please try again.' })
  }
})

// --- Severity scoring engine ---
// WHY: Severity classification must be based on FDA/RxNorm data — never AI.
// AI can hallucinate severity levels. This is a safety-critical classification.
// We parse RxNorm's own severity language to produce SAFE/CAUTION/DANGEROUS.
// This keeps Claude in its lane: plain-English explanation only.
app.post('/api/score', async (req, res) => {
  const { interactionPairs } = req.body

  if (!Array.isArray(interactionPairs)) {
    return res.status(400).json({ error: 'interactionPairs must be an array.' })
  }

  // WHY: Check DEMO_MODE — if flagged, return pre-validated data for common demo pairs.
  if (process.env.DEMO_MODE === 'true') {
    const key = interactionPairs.map(p => p.drug1?.toLowerCase()).sort().join(',')
    if (DEMO_INTERACTIONS[key]) return res.json(DEMO_INTERACTIONS[key])
  }

  try {
    const scored = interactionPairs.map(pair => {
      const desc = (pair.description || '').toLowerCase()
      let severity = 'SAFE'
      if (desc.includes('contraindicated') || desc.includes('serious') || desc.includes('fatal') || desc.includes('death')) {
        severity = 'DANGEROUS'
      } else if (desc.includes('moderate') || desc.includes('caution') || desc.includes('monitor') || desc.includes('may increase')) {
        severity = 'CAUTION'
      }
      return { ...pair, severity }
    })
    res.json({ scored })
  } catch (err) {
    res.status(500).json({ error: 'Scoring failed. Please try again.' })
  }
})

// --- AI: Claude — plain English explanation of interactions ---
// WHY: Claude translates clinical FDA data into plain English for non-medical users.
// IMPORTANT: Claude does NOT determine if a drug interaction exists or how serious it is.
// That logic stays in /api/score using real FDA data. Claude only explains what it means.
// This prevents AI hallucination from affecting safety-critical information.
app.post('/api/explain', async (req, res) => {
  const { interactions, drugs, severity } = req.body

  if (!Array.isArray(drugs) || drugs.length === 0) {
    return res.status(400).json({ error: 'drugs array is required.' })
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `You are a pharmacist explaining drug interactions in plain English to a patient (not a doctor).

Medications entered: ${drugs.join(', ')}
Severity level determined by FDA data: ${severity}
Interactions found (from FDA/RxNorm data): ${JSON.stringify(interactions)}

In 2-3 short paragraphs:
1. What the interaction is and what body systems are affected
2. How serious it is and what could happen
3. What the patient should do (call pharmacist, avoid combination, monitor symptoms, etc.)

Use plain language. No medical jargon. Be direct and caring. End with: "For informational purposes only. Always consult your pharmacist or physician."`
      }]
    })

    res.json({ explanation: message.content[0].text })
  } catch (err) {
    res.status(500).json({ error: 'AI explanation unavailable. Please try again.' })
  }
})

app.listen(PORT, () => console.log(`MedChex backend running on :${PORT}`))
