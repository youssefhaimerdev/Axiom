export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { messages, weatherData } = req.body
  const apiKey = req.headers['x-groq-key']
  if (!apiKey) return res.status(401).json({ error: 'No API key provided' })

  const lastUserMsg = (messages[messages.length - 1]?.content || '').toLowerCase()

  const needsSearch = /news|today|current|latest|right now|score|price|stock|weather|who is|who's|who won|what happened|2024|2025|2026|live|breaking|update|recently|this week|this month|richer|richest|net worth|worth|wealthy|wealthiest|rich|billion|million|salary|earn|paid/.test(lastUserMsg)

  const model = needsSearch ? 'compound-beta' : 'llama-3.3-70b-versatile'

  const weatherBlock = weatherData
    ? `\nUSE THIS WEATHER DATA: ${weatherData}`
    : ''

  const systemPrompt = `You are AXIOM, a voice assistant. You speak in 1-2 sentences only. Never more.
No lists. No markdown. No "according to". No citations. Just the answer, spoken naturally.
Example: "Kim Kardashian is worth around 1.7 billion, Lewis Hamilton around 300 million — Kim wins by a mile."
Current date: ${new Date().toLocaleString()}${weatherBlock}`

  const historyLimit = needsSearch ? 2 : 6
  const charLimit = needsSearch ? 150 : 500

  const trimmedMessages = messages.slice(-historyLimit).map(m => ({
    role: m.role,
    content: (m.content || '').slice(0, charLimit)
  }))

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...trimmedMessages],
        max_tokens: 80,
        temperature: 0.5,
      }),
    })

    const data = await response.json()
    if (data.error) return res.status(400).json({ error: data.error.message })

    const reply = data.choices[0].message.content.trim().slice(0, 300)
    return res.status(200).json({ reply, searched: needsSearch })
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reach Groq API' })
  }
}
