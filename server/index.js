import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import Anthropic from '@anthropic-ai/sdk'
import fetch from 'node-fetch'

dotenv.config()
const app = express()
app.use(cors())
app.use(express.json())

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// --- DATA SOURCE 1: RxNorm — drug name → RxCUI normalization ---
// Docs: https://rxnav.nlm.nih.gov/RxNormAPIs.html
app.get('/api/drug/rxcui', async (req, res) => {
  try {
    const { name } = req.query
    const url = `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name)}&search=1`
    const data = await fetch(url).then(r => r.json())
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- DATA SOURCE 2: RxNorm — interaction check by RxCUI list ---
// Docs: https://rxnav.nlm.nih.gov/InteractionAPIs.html
app.get('/api/interactions', async (req, res) => {
  try {
    const { rxcuis } = req.query // comma-separated RxCUI codes
    const url = `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${rxcuis}`
    const data = await fetch(url).then(r => r.json())
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- DATA SOURCE 3: OpenFDA FAERS — adverse event reports ---
// Docs: https://open.fda.gov/apis/drug/event/
app.get('/api/faers', async (req, res) => {
  try {
    const { drug } = req.query
    const url = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(drug)}"&limit=5`
    const data = await fetch(url).then(r => r.json())
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- AI: Claude — plain English explanation of interactions ---
// Interaction DETECTION stays on FDA/RxNorm data — Claude only explains
app.post('/api/explain', async (req, res) => {
  try {
    const { interactions, drugs, severity } = req.body

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `You are a pharmacist explaining drug interactions in plain English to a patient (not a doctor).

Medications entered: ${drugs.join(', ')}
Severity level: ${severity}
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
    res.status(500).json({ error: err.message })
  }
})

// --- Severity scoring engine ---
// Based on RxNorm severity descriptions — keeps AI out of safety-critical logic
app.post('/api/score', async (req, res) => {
  try {
    const { interactionPairs } = req.body
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
    res.status(500).json({ error: err.message })
  }
})

app.listen(3001, () => console.log('MedChex backend running on :3001'))
