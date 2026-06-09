# AXIOM — Advanced AI Assistant

A personal voice AI assistant. Talk to it, get answers, check the weather. Powered by Groq (free tier).

## Features

- 🎙️ Voice input via Web Speech API (transcribed live as you speak)
- 🔊 Voice output via browser TTS
- 🌤️ Live weather via Open-Meteo (no API key needed)
- ⚡ Ultra-fast responses via Groq's free LLaMA 3 70B
- 📱 Works on any device via browser
- 🔑 API key stored locally in your browser (never sent to any server other than Groq)

## Setup

### 1. Get a free Groq API key

Go to [console.groq.com](https://console.groq.com), sign up, and create an API key.

### 2. Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), paste your Groq key, and start talking.

### 3. Deploy to Vercel (free)

**Option A — Vercel CLI:**
```bash
npm install -g vercel
vercel
```
Follow the prompts. Done.

**Option B — GitHub + Vercel dashboard:**
1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. No environment variables needed (API key is entered by the user in the browser)
4. Click Deploy

## Usage

- Tap the **mic button** → speak → tap again to send
- Say *"weather in [city]"* for live weather
- Pick a voice from the dropdown (browser voices vary by device)
- The **square button** stops AXIOM mid-sentence
- Works best in **Chrome** (best Web Speech API support)

## Stack

- Next.js 14 (React)
- Groq API (LLaMA 3 70B)
- Open-Meteo (weather, free, no key)
- Web Speech API (voice in/out, browser native)
- Deployed on Vercel
