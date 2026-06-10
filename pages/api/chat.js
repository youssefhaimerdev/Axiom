export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { messages, weatherData } = req.body
  const apiKey = req.headers['x-groq-key']
  if (!apiKey) return res.status(401).json({ error: 'No API key provided' })

  const lastUserMsg = (messages[messages.length - 1]?.content || '').trim()
  const lastUserLower = lastUserMsg.toLowerCase()

  const needsSearch = /\b(weather|forecast|news|today|tonight|right now|currently|live|score|standings|stock|price|net worth|richer|richest|wealthiest|who won|who is winning|latest|breaking|just happened|this week|this year|how much is|worth|billion|million|elon|musk|trump|kardashian|hamilton|bitcoin|crypto|2025|2026)\b/.test(lastUserLower)

  const weatherBlock = weatherData
    ? `\nLIVE WEATHER DATA (use this): ${weatherData}`
    : ''

  const systemPrompt = `You are AXIOM — a sharp, witty, slightly formal personal AI assistant. Every response is spoken aloud:
- Zero markdown. No bullets, no numbered lists, no asterisks, no headers. Ever.
- Natural flowing prose, like an exceptionally knowledgeable friend speaking to you.
- Match length to complexity: simple fact = 1 sentence. Detailed plan = several rich sentences. Never pad, never cut short.
- Weave structure into speech: "Start with X, then Y, finish with Z" — never a list.
- Confident, precise, occasionally witty.
- Current date/time: ${new Date().toLocaleString()}${weatherBlock}`

  // For search queries: use gpt-oss-120b with browser_search tool + citations disabled
  // This avoids the compound-beta entity too large bug entirely
  // For regular queries: fast llama model, full history
  if (needsSearch) {
    const trimmedMessages = messages.slice(-2).map(m => ({
      role: m.role,
      content: (m.content || '').slice(0, 200)
    }))

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'system', content: systemPrompt }, ...trimmedMessages],
          max_tokens: 150,
          temperature: 0.7,
          citation_options: { mode: 'disabled' },
          tools: [{ type: 'browser_search' }],
          tool_choice: 'auto',
        }),
      })

      const data = await response.json()

      // If gpt-oss fails for any reason, fall back to llama without search
      if (data.error) {
        return fallbackToLlama(apiKey, systemPrompt, trimmedMessages, res)
      }

      const reply = data.choices[0].message.content?.trim().slice(0, 500) || ''
      return res.status(200).json({ reply })
    } catch {
      return fallbackToLlama(apiKey, systemPrompt, messages.slice(-2), res)
    }
  }

  // Regular query — fast llama, full context
  const trimmedMessages = messages.slice(-6).map(m => ({
    role: m.role,
    content: (m.content || '').slice(0, 600)
  }))

  return fallbackToLlama(apiKey, systemPrompt, trimmedMessages, res)
}

async function fallbackToLlama(apiKey, systemPrompt, messages, res) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 450,
        temperature: 0.7,
      }),
    })
    const data = await response.json()
    if (data.error) return res.status(400).json({ error: data.error.message })
    const reply = data.choices[0].message.content.trim().slice(0, 600)
    return res.status(200).json({ reply })
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach Groq API' })
  }
}
