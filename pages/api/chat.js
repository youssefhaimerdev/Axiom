export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { messages, weatherData } = req.body
  const apiKey = req.headers['x-groq-key']
  if (!apiKey) return res.status(401).json({ error: 'No API key provided' })

  const lastUserMsg = (messages[messages.length - 1]?.content || '').toLowerCase()

  // Simple regex check — only for genuinely real-time needs
  const needsSearch = /\b(weather|forecast|temperature|news|today|tonight|right now|currently|live|score|standings|stock|price|net worth|richer|richest|wealthiest|who won|who is winning|latest|breaking|just happened|this week|this year)\b/.test(lastUserMsg)

  const weatherBlock = weatherData ? `\nLIVE WEATHER DATA (use this): ${weatherData}` : ''

  const systemPrompt = `You are AXIOM — a sharp, witty, slightly formal personal AI assistant. Every response is spoken aloud, so follow these rules absolutely:
- Zero markdown. No bullet points, no numbered lists, no asterisks, no headers. Ever.
- Write in flowing natural prose, like an exceptionally knowledgeable friend speaking to you.
- Match length to complexity: a simple fact = 1 tight sentence. A workout plan, trip itinerary, or explanation = multiple rich sentences covering everything needed. Never pad, never cut useful detail short.
- When giving plans or structured advice, weave it into natural speech: "Start with X, then move to Y, and finish with Z" — not a list.
- Be confident, precise, occasionally witty. You are the most capable assistant the user has ever spoken to.
- Current date/time: ${new Date().toLocaleString()}${weatherBlock}`

  // Send only the last user message for search queries (avoids entity too large)
  // For normal queries keep last 5 for context
  const history = needsSearch
    ? [messages[messages.length - 1]]
    : messages.slice(-5).map(m => ({ role: m.role, content: (m.content || '').slice(0, 800) }))

  const model = needsSearch ? 'compound-beta' : 'llama-3.3-70b-versatile'
  const maxTokens = needsSearch ? 130 : 450

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...history],
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    })

    const data = await response.json()
    if (data.error) return res.status(400).json({ error: data.error.message })

    // Strip reply to plain text only — no citations, no metadata bleeding into history
    const raw = data.choices[0].message.content || ''
    const reply = raw
      .replace(/\【.*?\】/g, '')     // remove citation brackets
      .replace(/\[.*?\]/g, '')       // remove any bracketed refs
      .replace(/\(Source:.*?\)/gi, '')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 500)

    return res.status(200).json({ reply })
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach Groq API' })
  }
}
