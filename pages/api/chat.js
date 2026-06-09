export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { messages, weatherData } = req.body
  const apiKey = req.headers['x-groq-key']
  if (!apiKey) return res.status(401).json({ error: 'No API key provided' })

  const lastUserMsg = (messages[messages.length - 1]?.content || '').toLowerCase()

  // Simple regex check — only for genuinely real-time needs
  const needsSearch = /\b(weather|forecast|temperature|news|today|tonight|right now|currently|live|score|standings|stock|price|net worth|richer|richest|wealthiest|who won|who is winning|latest|breaking|just happened|this week|this year)\b/.test(lastUserMsg)

  const weatherBlock = weatherData ? `\nLIVE WEATHER DATA (use this): ${weatherData}` : ''

  const systemPrompt = `You are AXIOM, a voice assistant. Spoken responses only — no markdown, no bullets, no numbering, no asterisks. Pure natural sentences.
Answer length is proportional to complexity: one sentence for simple facts, several full sentences for plans or explanations. Never truncate a useful answer, never pad a simple one.
Date/time: ${new Date().toLocaleString()}${weatherBlock}`

  // Send only the last user message for search queries (avoids entity too large)
  // For normal queries keep last 5 for context
  const history = needsSearch
    ? [messages[messages.length - 1]]
    : messages.slice(-5).map(m => ({ role: m.role, content: (m.content || '').slice(0, 800) }))

  const model = needsSearch ? 'compound-beta' : 'llama-3.3-70b-versatile'
  const maxTokens = needsSearch ? 120 : 350

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
