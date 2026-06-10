export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { messages, weatherData } = req.body
  const apiKey = req.headers['x-groq-key']
  if (!apiKey) return res.status(401).json({ error: 'No API key provided' })

  const lastUserMsg = (messages[messages.length - 1]?.content || '').trim()
  const lastUserLower = lastUserMsg.toLowerCase()

  const needsSearch = /\b(weather|forecast|news|today|tonight|right now|currently|live|score|standings|stock|price|net worth|richer|richest|wealthiest|who won|who is winning|latest|breaking|just happened|this week|this year|how much is|worth|billion|million|elon|musk|trump|kardashian|hamilton|bitcoin|crypto|2025|2026)\b/.test(lastUserLower)

  const weatherBlock = weatherData ? `\nLIVE WEATHER DATA (use this): ${weatherData}` : ''

  const systemPrompt = `You are AXIOM — a sharp, witty, slightly formal personal AI assistant. Every response is spoken aloud:
- Zero markdown. No bullets, no numbered lists, no asterisks, no headers. Ever.
- Natural flowing prose, like an exceptionally knowledgeable friend speaking to you.
- Match length to complexity: simple fact = 1-2 sentences. Detailed plan = several rich sentences. Never pad, never cut short.
- Confident, precise, occasionally witty.
- Current date/time: ${new Date().toLocaleString()}${weatherBlock}`

  if (needsSearch) {
    // compound-mini: one tool call, 3x faster than compound-beta
    // Send ONLY the current message — no history — to keep request tiny
    // max_completion_tokens must be HIGH (not low) — low values cause the entity error
    // citation_options disabled — strips bloated source metadata from response
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'groq/compound-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: lastUserMsg }
          ],
          max_completion_tokens: 3000,
          temperature: 0.7,
          citation_options: { mode: 'disabled' },
        }),
      })

      const data = await response.json()

      if (data.error) {
        console.error('compound-mini error:', data.error.message)
        // Fall through to llama
      } else {
        // Strip any leftover markdown/citations from the reply
        const raw = data.choices[0].message.content || ''
        const reply = raw
          .replace(/\【.*?\】/g, '')
          .replace(/\[Source:.*?\]/gi, '')
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/#{1,6}\s/g, '')
          .replace(/\n+/g, ' ')
          .trim()
          .slice(0, 600)
        return res.status(200).json({ reply })
      }
    } catch (err) {
      console.error('compound-mini fetch error:', err)
    }
  }

  // Regular query OR fallback — fast llama with full context
  const trimmedMessages = messages.slice(-6).map(m => ({
    role: m.role,
    content: (m.content || '').slice(0, 600)
  }))

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: systemPrompt }, ...trimmedMessages],
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
