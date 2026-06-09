export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { messages, weatherData } = req.body
  const apiKey = req.headers['x-groq-key']
  if (!apiKey) return res.status(401).json({ error: 'No API key provided' })

  const lastUserMsg = (messages[messages.length - 1]?.content || '').trim()

  // ── Step 1: Classify the question with a ultra-fast lightweight model ──
  // Asks: does this need live internet data? And how long should the answer be?
  let needsSearch = false
  let maxTokens = 120
  let historyLimit = 6

  try {
    const classifyRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant', // tiny + instant, just for classification
        messages: [{
          role: 'user',
          content: `Classify this question. Reply with ONLY a JSON object, nothing else.
Question: "${lastUserMsg}"
Reply format: {"search": true/false, "tokens": number}
- search: true ONLY if the answer requires real-time internet data (live news, current prices, today's weather, recent events, who currently holds a title/record, net worth of living people). false for everything else (workouts, recipes, history, science, travel planning, explanations, math, coding, general advice).
- tokens: how many tokens the ideal spoken answer needs. 40 for simple 1-line facts. 80 for short explanations. 150 for detailed plans or multi-part answers. 250 for complex breakdowns.`
        }],
        max_tokens: 30,
        temperature: 0,
      }),
    })
    const classifyData = await classifyRes.json()
    const raw = classifyData.choices?.[0]?.message?.content?.trim() || '{}'
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
    needsSearch = parsed.search === true
    maxTokens = Math.min(Math.max(parsed.tokens || 120, 40), 300)
    historyLimit = needsSearch ? 2 : 6
  } catch {
    // Classification failed — safe defaults
    needsSearch = false
    maxTokens = 120
  }

  // ── Step 2: Build system prompt ──
  const weatherBlock = weatherData ? `\nUSE THIS LIVE WEATHER DATA: ${weatherData}` : ''

  const systemPrompt = `You are AXIOM, a voice assistant. Sharp, witty, slightly formal.
CRITICAL RULES:
- You are speaking out loud. No markdown, no bullet points, no numbered lists, no asterisks, no headers.
- Speak in natural flowing sentences, like a knowledgeable friend talking to you.
- Answer length must match complexity: simple question = 1-2 sentences. Detailed plan = several sentences covering all key points fully. Never pad, never cut short.
- Current date/time: ${new Date().toLocaleString()}${weatherBlock}`

  const charLimit = needsSearch ? 150 : 600
  const trimmedMessages = messages.slice(-historyLimit).map(m => ({
    role: m.role,
    content: (m.content || '').slice(0, charLimit)
  }))

  // ── Step 3: Call the right model ──
  const model = needsSearch ? 'compound-beta' : 'llama-3.3-70b-versatile'

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...trimmedMessages],
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    })

    const data = await response.json()
    if (data.error) return res.status(400).json({ error: data.error.message })

    const reply = data.choices[0].message.content.trim().slice(0, 600)
    return res.status(200).json({ reply, searched: needsSearch, tokens: maxTokens })
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach Groq API' })
  }
}
