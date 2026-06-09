export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { messages, weatherData } = req.body
  const apiKey = req.headers['x-groq-key']

  if (!apiKey) return res.status(401).json({ error: 'No API key provided' })

  const weatherBlock = weatherData
    ? `\nCRITICAL: You have live real-time weather data. Use it. Data: ${weatherData}`
    : ''

  const systemPrompt = `You are AXIOM — an advanced AI assistant. Sharp, witty, slightly formal.
- Responses spoken aloud: 2-3 sentences MAX. No markdown, no bullets, no asterisks.
- Be clever and concise. Current date/time: ${new Date().toLocaleString()}
- You have real-time web search. Use it for anything current.
- You handle everything: travel, fitness, science, weather, news, coding, writing.${weatherBlock}`

  // Aggressively trim: last 4 exchanges only, hard char limit per message
  const trimmedMessages = messages.slice(-4).map(m => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content.slice(0, 300) : ''
  }))

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'compound-beta',
        messages: [{ role: 'system', content: systemPrompt }, ...trimmedMessages],
        max_tokens: 150,
        temperature: 0.7,
      }),
    })

    const data = await response.json()
    if (data.error) return res.status(400).json({ error: data.error.message })

    // Truncate reply before sending to client so it never bloats history
    const reply = data.choices[0].message.content.trim().slice(0, 400)
    return res.status(200).json({ reply })
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach Groq API' })
  }
}
