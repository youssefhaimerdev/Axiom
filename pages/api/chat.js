export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { messages, weatherData } = req.body
  const apiKey = req.headers['x-groq-key']

  if (!apiKey) return res.status(401).json({ error: 'No API key provided' })

  const weatherBlock = weatherData
    ? `\nCRITICAL: You have live real-time weather data from an API. Use it. Never claim you lack real-time access. Data: ${weatherData}`
    : ''

  const systemPrompt = `You are AXIOM — an advanced AI assistant. Sharp, witty, and slightly formal, like a highly intelligent colleague who happens to know everything.

Your responses are spoken aloud, so:
- Keep answers concise (2-5 sentences max)
- No markdown, no bullet points, no asterisks  
- Speak naturally, as if in conversation
- Be clever but never verbose — you value precision
- Current date and time: ${new Date().toLocaleString()}
- You have real-time web search — use it for current events, news, sports, prices, or anything recent
- You are a fully capable personal assistant: travel, fitness, history, science, weather, coding, writing — nothing is outside your scope${weatherBlock}`

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'compound-beta',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: 500,
        temperature: 0.75,
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
