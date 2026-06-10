export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { messages, weatherData } = req.body
  const apiKey = req.headers['x-groq-key']
  if (!apiKey) return res.status(401).json({ error: 'No API key provided' })

  const lastUserMsg = (messages[messages.length - 1]?.content || '').trim()
  const lastUserLower = lastUserMsg.toLowerCase()

  const needsSearch = /\b(weather|forecast|news|today|tonight|right now|currently|live|score|standings|stock|price|net worth|richer|richest|wealthiest|who won|who is winning|latest|breaking|just happened|this week|this year|how much is|worth|billion|million|bitcoin|crypto|2025|2026)\b/.test(lastUserLower)

  const weatherBlock = weatherData ? `\nLIVE WEATHER DATA (use this): ${weatherData}` : ''

  let searchSnippet = ''
  let searchWorked = false

  if (needsSearch) {
    try {
      // Jina AI reader: fetches + cleans any URL for free, no key needed
      // We point it at a DuckDuckGo search results page
      const query = encodeURIComponent(lastUserMsg)
      const searchUrl = `https://html.duckduckgo.com/html/?q=${query}`
      const jinaUrl = `https://r.jina.ai/${searchUrl}`

      const jinaRes = await fetch(jinaUrl, {
        headers: {
          'Accept': 'text/plain',
          'X-Return-Format': 'text',
        },
        signal: AbortSignal.timeout(8000),
      })

      if (jinaRes.ok) {
        const text = await jinaRes.text()
        // Extract first meaningful chunk — DDG results are in the first ~2000 chars
        const cleaned = text
          .replace(/\[.*?\]/g, '')
          .replace(/https?:\/\/\S+/g, '')
          .replace(/\s{3,}/g, ' ')
          .trim()
          .slice(0, 1200)

        if (cleaned.length > 100) {
          searchSnippet = cleaned
          searchWorked = true
        }
      }
    } catch (err) {
      // Jina failed — will answer from training data
    }
  }

  const systemPrompt = `You are AXIOM — a sharp, witty, slightly formal personal AI assistant. Every response is spoken aloud:
- Zero markdown. No bullets, no numbered lists, no asterisks, no headers. Ever.
- Natural flowing prose like a knowledgeable friend speaking to you.
- Match length to complexity: simple fact = 1-2 sentences. Detailed plan = several rich sentences.
- NEVER claim to have searched the internet unless search data is explicitly provided to you below.
- If no search data is provided for a time-sensitive question, say clearly you don't have real-time access and give your best answer from training data.
- Current date/time: ${new Date().toLocaleString()}${weatherBlock}${searchSnippet ? `\n\nLIVE SEARCH RESULTS (use this to answer accurately, speak naturally, no citations):\n${searchSnippet}` : ''}`

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
    return res.status(200).json({ reply, usedSearch: searchWorked })

  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach Groq API' })
  }
}
