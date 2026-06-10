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
- Match length to complexity: simple fact = 1-2 sentences. Detailed plan = several rich sentences.
- CRITICAL: Never pretend to search the internet or claim to have done research if you have not. If you don't have current data, say clearly: "I don't have real-time access to that, but as of my last knowledge..." 
- Confident, precise, occasionally witty.
- Current date/time: ${new Date().toLocaleString()}${weatherBlock}`

  if (needsSearch) {
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
        // Return the actual error so we can see it in the UI
        return res.status(200).json({ 
          reply: `Search error: ${data.error.message}. Answering from training data instead — I cannot access real-time information right now.`,
          searchError: data.error.message 
        })
      }

      const msg = data.choices[0].message
      
      // Check if it actually used a search tool
      const usedSearch = msg.executed_tools?.length > 0
      
      const raw = msg.content || ''
      const reply = raw
        .replace(/\【.*?\】/g, '')
        .replace(/\[Source:.*?\]/gi, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/#{1,6}\s/g, '')
        .replace(/\n+/g, ' ')
        .trim()
        .slice(0, 600)

      return res.status(200).json({ reply, usedSearch })

    } catch (err) {
      return res.status(200).json({ 
        reply: `I couldn't reach the search service right now. As of my training data: ${lastUserMsg} — but I can't confirm current figures.`,
        searchError: err.message 
      })
    }
  }

  // Regular query — fast llama
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
