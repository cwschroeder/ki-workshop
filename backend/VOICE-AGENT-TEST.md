# Voice Agent Test Guide

## Implementierungsstatus

✅ **Fertiggestellt:**
- Node.js SIP Server (Port 5060)
- RTP Audio Handler für bidirektionale Audiostreams
- Voice Agent Pipeline (STT → LLM → TTS)
- OpenAI Provider für Whisper, GPT-4o-mini, TTS
- Modulare Architektur für zukünftigen Provider-Austausch

## Testvoraussetzungen

### 1. Server Status
```bash
# Backend läuft auf Port 3000
curl http://localhost:3000/health

# SIP Server lauscht auf Port 5060
lsof -i :5060
```

### 2. Tenios Konfiguration

**SIP Account:**
- Server: `204671.tenios.com`
- Username: `cwschroeder`
- Password: `passwort123456`
- Domain: `204671.tenios.com`

**Routing Plan:**
1. **Schritt 1**: Call Control API → ngrok URL
2. **Schritt 2**: BRIDGE zu SIP Account `cwschroeder`

### 3. Netzwerk Setup

**Für lokalen Test:**
```bash
# Server ist direkt über lokale IP erreichbar
# SIP Server: 0.0.0.0:5060
# RTP Ports: 10000-20000
```

**Für Remote-Test (via ngrok):**
- ngrok wird nicht für SIP benötigt
- Tenios verbindet sich direkt zum SIP-Account
- Backend Call Control API läuft über ngrok

## Testdurchführung

### Test 1: BRIDGE Funktionalität

**Setup in Tenios:**
```javascript
// index.ts Zeile 87: FORCE_AGENT_BRIDGE=true
{
  blocks: [
    {
      blockType: 'SAY',
      text: '<prosody rate="medium">Vielen Dank, Sie werden sofort mit einem Mitarbeiter verbunden.</prosody>',
      voiceName: 'de.female.2',
      useSsml: true
    },
    {
      blockType: 'BRIDGE',
      bridgeMode: 'SEQUENTIAL',
      destinations: [
        {
          destination: 'cwschroeder',  // SIP Username
          destinationType: 'SIP_USER',
          timeout: 30
        }
      ]
    }
  ]
}
```

**Erwartetes Verhalten:**
1. Anruf kommt bei Tenios-Nummer an
2. Tenios spielt SAY-Ansage ab
3. Tenios verbindet zu SIP-Account `cwschroeder`
4. Node.js SIP Server empfängt INVITE
5. SIP Server antwortet mit 200 OK (SDP mit RTP-Port)
6. RTP-Verbindung wird aufgebaut
7. Voice Agent Pipeline startet
8. Agent sagt: "Guten Tag. Willkommen beim Stadtwerk. Wie kann ich Ihnen heute helfen?"

### Test 2: Voice Agent Konversation

**Erwarteter Ablauf:**
1. Voice Agent begrüßt den Anrufer
2. Anrufer spricht (z.B. "Ich möchte meinen Zählerstand durchgeben")
3. Audio wird gepuffert (2 Sekunden)
4. Whisper transkribiert die Sprache
5. GPT-4o-mini generiert Antwort
6. TTS generiert Audiodatei
7. Audio wird via RTP zurückgesendet
8. Anrufer hört die Antwort

**Logs überprüfen:**
```bash
# SIP-Verbindungsaufbau
grep "Received SIP request" logs

# RTP-Audio-Empfang
grep "RTP remote endpoint detected" logs

# Voice Processing
grep "Transcribing audio" logs
grep "User said:" logs
grep "Agent responds:" logs
```

## Debugging

### Häufige Probleme

**1. SIP-Verbindung schlägt fehl**
```bash
# Prüfe SIP-Port
lsof -i :5060

# Prüfe Firewall
sudo pfctl -sr | grep 5060

# SIP-Logs
grep "SIP" logs
```

**2. Kein Audio wird empfangen**
```bash
# Prüfe RTP-Ports
lsof -i :10000-20000

# RTP-Logs
grep "RTP" logs
```

**3. STT/LLM/TTS Fehler**
```bash
# Prüfe OpenAI API Key
echo $OPENAI_API_KEY

# Provider-Logs
grep "OpenAI" logs
```

## Architektur-Überblick

```
┌─────────────────────────────────────────────────────────────┐
│                      TENIOS VOICE API                       │
│                                                             │
│  1. Anruf kommt rein                                       │
│  2. Call Control API (ngrok) → BRIDGE Block                │
│  3. SIP INVITE an cwschroeder@204671.tenios.com            │
└──────────────────────┬──────────────────────────────────────┘
                       │ SIP (Port 5060)
                       ↓
┌─────────────────────────────────────────────────────────────┐
│              NODE.JS SIP SERVER SERVICE                     │
│                                                             │
│  • Empfängt INVITE                                          │
│  • Antwortet mit 200 OK + SDP                              │
│  • Handelt ACK, BYE                                        │
└──────────────────────┬──────────────────────────────────────┘
                       │ RTP Stream
                       ↓
┌─────────────────────────────────────────────────────────────┐
│               RTP AUDIO HANDLER                             │
│                                                             │
│  • Empfängt Audio (PCM, 8kHz, mono)                        │
│  • Sendet Audio zurück                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────────┐
│            VOICE AGENT PIPELINE                             │
│                                                             │
│  1. Audio buffering (2s chunks)                            │
│  2. STT: Whisper                                           │
│  3. LLM: GPT-4o-mini                                       │
│  4. TTS: OpenAI TTS                                        │
│  5. RTP Audio zurück                                       │
└─────────────────────────────────────────────────────────────┘
```

## Nächste Schritte

### Sofort testbar:
- ✅ Anruf über Tenios testen
- ✅ Voice Agent Konversation testen

### Optional (später):
- [ ] Open-Source STT Provider (Whisper.cpp)
- [ ] Open-Source LLM Provider (Llama 3.2)
- [ ] Open-Source TTS Provider (Coqui TTS)
- [ ] Verbesserte VAD (Voice Activity Detection)
- [ ] Silence Detection
- [ ] Unterbrechungs-Handling

## Provider-Austausch

Die Architektur ist vorbereitet für einfachen Provider-Austausch:

```typescript
// Aktuell (OpenAI)
const sttProvider = new OpenAISTTProvider(env.OPENAI_API_KEY);
const llmProvider = new OpenAILLMProvider(env.OPENAI_API_KEY);
const ttsProvider = new OpenAITTSProvider(env.OPENAI_API_KEY);

// Später (Open-Source)
const sttProvider = new WhisperCppProvider('/path/to/model');
const llmProvider = new LlamaProvider('/path/to/llama');
const ttsProvider = new CoquiTTSProvider('/path/to/model');
```

Alle Interfaces sind definiert in:
- `src/providers/STTProvider.ts`
- `src/providers/LLMProvider.ts`
- `src/providers/TTSProvider.ts`
