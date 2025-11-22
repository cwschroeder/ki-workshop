---
name: tenios-call-control
description: Official Tenios Call Control API specification
tags: [tenios, voice, api, telephony]
---

# Tenios Call Control API Specification (Official)

This skill provides guidance for implementing Tenios Call Control Voice API integrations.

## API Overview

The Tenios Call Control API allows you to control phone calls programmatically via webhooks. When a call is received, Tenios sends a POST request to your webhook URL and expects a JSON response with "blocks" that define what should happen next.

## Request Format (Incoming from Tenios)

Tenios sends POST requests with this structure:

```json
{
  "requestType": "EXTERNAL_CALL_CONTROL",
  "customerNumber": 204671,
  "accessKey": "your-api-key",
  "variables": {
    "destination_number": "+494042237908",
    "correlation_id": "uuid",
    "call_uuid": "uuid",
    "caller_id_number": "+491757039338"
  },
  "callControlUuid": "unique-call-id",
  "loopCount": 0,
  "requestStatus": "REQUESTING_BLOCKS",
  "blocksProcessingResult": null
}
```

### Key Fields:
- `callControlUuid` - Unique identifier for this call session
- `variables.call_uuid` - Call UUID for tracking
- `variables.caller_id_number` - Caller's phone number
- `loopCount` - Number of times this webhook has been called for this call
- `requestStatus` - Can be:
  - `REQUESTING_BLOCKS` - Normal flow, requesting next blocks
  - `VALIDATION_ERRORS` - Previous response had errors
- `blocksProcessingResult` - Contains results from previous blocks (e.g., recording URLs)

## Response Format (Your API to Tenios)

Your webhook must return JSON with this structure:

```json
{
  "blocks": [
    {
      "blockType": "PLAY",
      "audioUrl": "https://example.com/audio.mp3"
    },
    {
      "blockType": "RECORD",
      "maxRecordingLength": 10,
      "finishOnKey": "#",
      "beep": false
    }
  ],
  "next": {
    "url": "https://your-server.com/next-webhook",
    "method": "POST"
  }
}
```

## Block Types

### 1. PLAY Block
Plays audio to the caller.

```json
{
  "blockType": "PLAY",
  "audioUrl": "https://example.com/greeting.mp3"
}
```

**Supported Audio Formats:**
- MP3 files via HTTPS URL
- Base64-encoded audio: `data:audio/mp3;base64,<base64-string>`
- WAV files (converted automatically)

**Properties:**
- `audioUrl` (required) - URL or data URI of audio file

### 2. RECORD Block
Records caller's voice input.

```json
{
  "blockType": "RECORD",
  "maxRecordingLength": 10,
  "finishOnKey": "#",
  "beep": false
}
```

**Properties:**
- `maxRecordingLength` (optional) - Max recording duration in seconds (default: 30)
- `finishOnKey` (optional) - DTMF key to finish recording (e.g., "#")
- `beep` (optional) - Play beep before recording (default: false)

**Result:** Recording URL is returned in next request via:
```json
{
  "blocksProcessingResult": {
    "record": {
      "audioUrl": "https://tenios.de/recordings/xyz.wav"
    }
  }
}
```

### 3. GATHER Block
Collect DTMF (keypad) input.

```json
{
  "blockType": "GATHER",
  "numDigits": 5,
  "timeout": 10,
  "finishOnKey": "#"
}
```

**Properties:**
- `numDigits` (optional) - Number of digits to collect
- `timeout` (optional) - Timeout in seconds (default: 5)
- `finishOnKey` (optional) - Key to finish input (default: "#")

**Result:** DTMF digits returned in `blocksProcessingResult.gather.digits`

### 4. HANGUP Block
Ends the call.

```json
{
  "blockType": "HANGUP"
}
```

**Properties:** None

### 5. DIAL Block
Forwards call to another number.

```json
{
  "blockType": "DIAL",
  "destination": "+4930123456",
  "timeout": 30,
  "callerId": "+4940987654"
}
```

**Properties:**
- `destination` (required) - Phone number to dial
- `timeout` (optional) - Ring timeout in seconds
- `callerId` (optional) - Caller ID to show

### 6. SAY Block
Text-to-speech output.

```json
{
  "blockType": "SAY",
  "text": "Guten Tag, willkommen!",
  "voice": "de-DE",
  "language": "de-DE"
}
```

**Properties:**
- `text` (required) - Text to speak
- `voice` (optional) - Voice identifier
- `language` (optional) - Language code (e.g., "de-DE", "en-US")

## Next URL Structure

The `next` object defines where Tenios should send the next request:

```json
{
  "next": {
    "url": "https://your-server.com/webhook/response",
    "method": "POST"
  }
}
```

**Important:**
- If `next` is omitted, the call continues to next routing step
- Use absolute URLs (include protocol and domain)
- Method is always "POST"

## Error Handling

When Tenios encounters validation errors, it sends:

```json
{
  "requestStatus": "VALIDATION_ERRORS",
  "blocksProcessingResult": {
    "validationErrors": [
      "Low level (JSON) error on line 1, column 25"
    ]
  }
}
```

**Common Errors:**
- Invalid JSON structure
- Missing required block properties
- Invalid audio URL format
- Nested objects where flat structure expected (e.g., don't wrap properties in sub-objects)

**Best Practice:** Always validate JSON structure before sending to Tenios.

## Audio Format Best Practices

### Using Base64 Audio
For inline audio (e.g., from OpenAI TTS):

```javascript
const audioBuffer = Buffer.from(mp3AudioData);
const audioUrl = `data:audio/mp3;base64,${audioBuffer.toString('base64')}`;
```

### Using External URLs
- Must be HTTPS
- Must be publicly accessible
- Supported formats: MP3, WAV, OGG
- Max file size: 10MB recommended

## Example Call Flows

### Simple Greeting with Recording

**Request 1 (Incoming Call):**
```json
{
  "blocks": [
    {
      "blockType": "PLAY",
      "audioUrl": "data:audio/mp3;base64,..."
    },
    {
      "blockType": "RECORD",
      "maxRecordingLength": 10,
      "finishOnKey": "#",
      "beep": false
    }
  ],
  "next": {
    "url": "https://your-server.com/response",
    "method": "POST"
  }
}
```

**Request 2 (After Recording):**
```json
{
  "blocksProcessingResult": {
    "record": {
      "audioUrl": "https://tenios.de/recordings/abc123.wav"
    }
  }
}
```

**Response 2 (Play Confirmation and Hangup):**
```json
{
  "blocks": [
    {
      "blockType": "PLAY",
      "audioUrl": "data:audio/mp3;base64,..."
    },
    {
      "blockType": "HANGUP"
    }
  ]
}
```

## TypeScript Interface Definitions

```typescript
// Incoming Request from Tenios
interface TeniosWebhookRequest {
  requestType: 'EXTERNAL_CALL_CONTROL';
  customerNumber: number;
  accessKey: string;
  variables: {
    destination_number: string;
    correlation_id: string;
    call_uuid: string;
    caller_id_number: string;
  };
  callControlUuid: string;
  loopCount: number;
  requestStatus: 'REQUESTING_BLOCKS' | 'VALIDATION_ERRORS';
  blocksProcessingResult: {
    record?: {
      audioUrl: string;
    };
    gather?: {
      digits: string;
    };
    validationErrors?: string[];
  } | null;
}

// Response to Tenios
interface TeniosWebhookResponse {
  blocks: Block[];
  next?: {
    url: string;
    method: 'POST';
  };
}

type Block =
  | PlayBlock
  | RecordBlock
  | GatherBlock
  | HangupBlock
  | DialBlock
  | SayBlock;

interface PlayBlock {
  blockType: 'PLAY';
  audioUrl: string;
}

interface RecordBlock {
  blockType: 'RECORD';
  maxRecordingLength?: number;
  finishOnKey?: string;
  beep?: boolean;
}

interface GatherBlock {
  blockType: 'GATHER';
  numDigits?: number;
  timeout?: number;
  finishOnKey?: string;
}

interface HangupBlock {
  blockType: 'HANGUP';
}

interface DialBlock {
  blockType: 'DIAL';
  destination: string;
  timeout?: number;
  callerId?: string;
}

interface SayBlock {
  blockType: 'SAY';
  text: string;
  voice?: string;
  language?: string;
}
```

## Common Implementation Patterns

### Pattern 1: Voice Menu (IVR)
```javascript
// Play greeting, gather DTMF input
{
  blocks: [
    {
      blockType: 'PLAY',
      audioUrl: 'https://example.com/menu.mp3'
    },
    {
      blockType: 'GATHER',
      numDigits: 1,
      timeout: 10
    }
  ],
  next: {
    url: 'https://your-server.com/menu-selection',
    method: 'POST'
  }
}
```

### Pattern 2: Voice Recording with Transcription
```javascript
// Record user, then transcribe with Whisper
app.post('/webhook', async (req, res) => {
  const { blocksProcessingResult } = req.body;

  if (blocksProcessingResult?.record?.audioUrl) {
    // Download and transcribe
    const audioUrl = blocksProcessingResult.record.audioUrl;
    const response = await fetch(audioUrl);
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // Transcribe with OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioBuffer,
      model: 'whisper-1'
    });

    // Process transcription...
  }
});
```

### Pattern 3: Call Forwarding
```javascript
{
  blocks: [
    {
      blockType: 'PLAY',
      audioUrl: 'data:audio/mp3;base64,...'
    },
    {
      blockType: 'DIAL',
      destination: '+4930123456',
      timeout: 30
    }
  ]
}
```

## Debugging Tips

1. **Log all requests and responses:**
   ```javascript
   logger.info({ body: req.body }, 'Tenios request received');
   logger.info({ response: responseObj }, 'Sending response to Tenios');
   ```

2. **Check `loopCount`:** If it increments rapidly, you have a validation error

3. **Validate JSON structure:** Use Zod or JSON Schema validation

4. **Test audio URLs:** Ensure they're accessible before sending to Tenios

5. **Monitor `requestStatus`:** Check for `VALIDATION_ERRORS`

## Security Considerations

1. **Validate `accessKey`:** Verify it matches your Tenios API key
2. **Use HTTPS:** All webhook URLs must use HTTPS in production
3. **Rate limiting:** Implement rate limiting on webhook endpoints
4. **Input validation:** Validate all incoming data with Zod schemas

## Reference Links

- Official Documentation: https://www.tenios.de/doc/call-control-voice-api
- API Portal: https://tenios.de/login
- Support: support@tenios.de
