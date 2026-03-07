import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import Groq from 'groq-sdk'
import fetch from 'node-fetch'

dotenv.config()
const app = express()
app.use(cors())
app.use(express.json())

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// --- DATA SOURCE 1: OpenFDA drug interaction lookup ---
// Docs: https://open.fda.gov/apis/drug/label/
app.get('/api/drug/search', async (req, res) => {
  const { name } = req.query
  const url = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${name}"&limit=5`
  const data = await fetch(url).then(r => r.json())
  res.json(data)
})

// --- DATA SOURCE 2: RxNorm drug interactions ---
// Docs: https://rxnav.nlm.nih.gov/InteractionAPIs.html
app.get('/api/interactions', async (req, res) => {
  const { rxcuis } = req.query // comma-separated RxCUI codes
  const url = `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${rxcuis}`
  const data = await fetch(url).then(r => r.json())
  res.json(data)
})

// --- AI: Plain English explanation of interactions ---
app.post('/api/explain', async (req, res) => {
  const { interactions, drugs } = req.body
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{
      role: 'user',
      content: `You are a pharmacist explaining drug interactions in plain English to a patient (not a doctor). 
Drugs: ${drugs.join(', ')}
Interactions found: ${JSON.stringify(interactions)}
Explain what this means, how serious it is (safe/caution/danger), and what to do. Be clear and direct.`
    }]
  })
  res.json({ explanation: completion.choices[0].message.content })
})

app.listen(3001, () => console.log('MedCheck backend running on :3001'))
