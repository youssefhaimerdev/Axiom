export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { messages, weatherData } = req.body
  const apiKey = req.headers['x-groq-key']

  if (!apiKey) return res.status(401).json({ error: 'No API key provided' })

  const weatherBlock = weatherData
    ? `\nCRITICAL: You have live real-time weather data. Use it. Never claim you lack real-time access. Data: ${weatherData}`
    : ''

  const systemPrompt = `You are AXIOM — an advanced AI assistant. Sharp, witty, and slightly formal.

Rules (STRICT):
- Responses are spoken aloud: 2-4 sentences max, no markdown, no bullet points, no asterisks
- Speak naturally, be clever but concise
- Current date/time: ${new Date().toLocaleString()}
- You have real-time web search — use it for current events, news, sports, prices
- You are a full personal assistant: travel, fitness, history, science, weather, coding, writing${weatherBlock}`

  // Keep only last 6 exchanges to stay well under size limits
  const trimmedMessages = messages.slice(-6).map(m => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content.slice(0, 500) : m.content
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
        max_tokens: 200,
        temperature: 0.7,
      }),
    })

    const data = await response.json()
    if (data.error) return res.status(400).json({ error: data.error.message })

    const reply = data.choices[0].message.content.trim()
    return res.status(200).json({ reply })
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach Groq API' })
  }
}
