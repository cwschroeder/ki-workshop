# SIP Bot - Voice Transcription & AI Agent

Python-based SIP bot using PJSUA2 for:
1. **Transcription Bot**: Silent monitoring of calls with real-time Whisper transcription
2. **AI Agent Bot**: Simulated human agent for DEV/testing using GPT-4o-mini

## Architecture

```
┌─────────────────┐
│   Tenios SIP    │
│   (Call Router) │
└────────┬────────┘
         │ SIP INVITE
         ▼
┌─────────────────┐
│  Python SIP Bot │
│   (PJSUA2)      │
└────────┬────────┘
         │
         ├─► RTP Audio ──► OpenAI Whisper (STT)
         │
         ├─► OpenAI GPT-4o-mini (AI responses)
         │
         └─► OpenAI TTS (Text-to-Speech)
```

## Installation

### 1. Install PJSUA2

**macOS:**
```bash
brew install pjproject
pip install pjsua2
```

**Linux (Ubuntu):**
```bash
sudo apt-get install libpjproject-dev python3-pjsua2
```

### 2. Install Python Dependencies

```bash
cd sip-bot
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

## Usage

### Transcription Bot Mode

For monitoring active calls and streaming transcriptions to dashboard:

```bash
cd sip-bot
export BOT_MODE=transcription
python src/main.py
```

**Configuration (.env):**
```env
SIP_DOMAIN=204671.tenios.com
SIP_USERNAME=cmschroeder
SIP_PASSWORD=passwort123456
OPENAI_API_KEY=sk-proj-...
BOT_MODE=transcription
BACKEND_WS_URL=ws://localhost:3000/ws
```

**How it works:**
1. Bot registers with Tenios SIP server
2. Receives SIP INVITE when Silent Monitoring starts
3. Captures RTP audio stream from the call
4. Sends audio chunks to OpenAI Whisper for transcription
5. Streams transcriptions to Node.js backend via WebSocket
6. Backend sends to supervisor dashboard

### AI Agent Bot Mode

For simulating human agent in DEV/testing:

```bash
cd sip-bot
export BOT_MODE=agent
python src/main.py
```

**Configuration (.env):**
```env
SIP_DOMAIN=204671.tenios.com
SIP_USERNAME=cwschroeder
SIP_PASSWORD=<agent-password>
BOT_MODE=agent
AI_AGENT_SYSTEM_PROMPT=Du bist ein freundlicher Mitarbeiter beim Stadtwerk...
```

**How it works:**
1. Bot registers as agent SIP account
2. Receives calls transferred from IVR
3. Listens to caller speech → Whisper transcription
4. Generates responses → GPT-4o-mini
5. Speaks responses → OpenAI TTS
6. Continues conversation loop until call ends

## Integration with Node.js Backend

### Tenios Configuration

**For Transcription Bot:**
- Silent Monitoring API calls `sip:cmschroeder@204671.tenios.com`
- Bot receives INVITE and joins call as third party
- No changes needed to existing Call Control API flow

**For AI Agent Bot:**
- BRIDGE block targets `sip:cwschroeder@204671.tenios.com`
- Bot receives INVITE and handles call as agent
- Only used when `SIMULATE_HUMAN_AGENT=true` in backend .env

### WebSocket Streaming

Transcription bot sends real-time transcripts to backend:

```python
# In transcription_bot.py
await ws_sender.send_transcript({
    "timestamp": "2025-11-22T14:35:12Z",
    "text": "Ich möchte meinen Zählerstand durchgeben",
    "speaker": "caller"
})
```

Backend WebSocket server (`src/websocket/transcription.ts`) receives and broadcasts to dashboard.

## Development

### Testing Locally

1. Start Node.js backend:
```bash
cd backend
npm run dev
```

2. Start SIP bot:
```bash
cd sip-bot
python src/main.py
```

3. Make test call to Tenios number
4. Observe transcriptions in dashboard

### Debugging

Enable verbose PJSUA2 logging:

```python
# In main.py
ep_cfg.logConfig.level = 5  # Max verbosity
```

View SIP messages:
```bash
# Observe SIP traffic
sudo tcpdump -i any -n port 5060
```

## Deployment

### Production Setup

1. Install as systemd service:

```bash
sudo cp sip-bot.service /etc/systemd/system/
sudo systemctl enable sip-bot
sudo systemctl start sip-bot
```

2. Monitor logs:
```bash
sudo journalctl -u sip-bot -f
```

### Docker (Alternative)

```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y libpjproject-dev

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY src/ ./src/
CMD ["python", "src/main.py"]
```

## Troubleshooting

### PJSUA2 Import Error

```bash
# macOS
export DYLD_LIBRARY_PATH=/usr/local/lib

# Linux
export LD_LIBRARY_PATH=/usr/lib
```

### SIP Registration Fails

- Check SIP credentials in `.env`
- Verify network connectivity to Tenios SIP server
- Check firewall rules (UDP port 5060, RTP ports 10000-20000)

### No Audio Captured

- Ensure RTP ports are open in firewall
- Check PJSUA2 audio device configuration
- Verify Tenios sends RTP to bot's IP address

## Next Steps

- [ ] Implement WebSocket sender for dashboard streaming
- [ ] Add proper Voice Activity Detection (VAD)
- [ ] Handle DTMF input in agent mode
- [ ] Add call recording to CSV
- [ ] Production-ready error handling and reconnection logic
