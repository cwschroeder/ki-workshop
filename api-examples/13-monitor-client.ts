/**
 * Test 13 - Monitor Client (Passive Listener)
 *
 * Verbindet sich mit dem IVU Voice API Server und zeigt
 * Live-Transkripte von Monitor-Sessions in der Konsole an.
 *
 * Verwendung:
 *   npx tsx tests/13-monitor-client.ts [--denoiser rnnoise|dtln|none] [--status]
 *
 * Optionen:
 *   --denoiser rnnoise   Aktiviert RNNoise Rauschunterdrückung (Standard)
 *   --denoiser dtln      Aktiviert DTLN Rauschunterdrückung (bessere Qualität)
 *   --denoiser none      Deaktiviert Rauschunterdrückung
 *   --status             Zeigt nur den Status und verfügbare Provider
 *
 * Beispiele:
 *   npx tsx tests/13-monitor-client.ts                    # Mit DTLN (Standard)
 *   npx tsx tests/13-monitor-client.ts --denoiser dtln    # Mit DTLN
 *   npx tsx tests/13-monitor-client.ts --denoiser none    # Ohne Denoising
 *   npx tsx tests/13-monitor-client.ts --status           # Nur Status anzeigen
 *
 * Der Monitor-Service muss auf dem Server aktiv sein (SIP_ENABLED=true, SIP_MODE=monitor)
 */

import { io, Socket } from 'socket.io-client';

// Server URL - Standard: IVU Workshop Server (wie andere Tests)
const SERVER_URL = process.env.IVU_SERVER_URL || 'wss://mqtt.ivu-software.de:443';
const API_BASE_URL = SERVER_URL.replace('wss://', 'https://').replace('ws://', 'http://');

interface MonitorTranscription {
  callId: string;
  text: string;
  timestamp: string;
  isFinal: boolean;
  durationMs?: number;
  agentId?: string;
}

interface MonitorSessionStarted {
  callId: string;
  agentId?: string;
  startedAt: string;
}

interface MonitorSessionEnded {
  callId: string;
  agentId?: string;
  stats: {
    durationMs: number;
    transcriptionCount: number;
  };
}

interface MonitorProviders {
  stt: string[];
  denoiser: string[];
  defaults: {
    stt: string;
    denoiser: string;
  };
}

interface MonitorStatus {
  enabled: boolean;
  running: boolean;
  config: {
    port: number;
    domain: string;
    username: string;
  };
  activeSessions: number;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function parseArgs(): { denoiser: string; statusOnly: boolean } {
  const args = process.argv.slice(2);
  let denoiser = 'dtln'; // Default: DTLN aktiviert
  let statusOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--denoiser' && args[i + 1]) {
      denoiser = args[i + 1];
      i++;
    } else if (args[i] === '--status') {
      statusOnly = true;
    }
  }

  return { denoiser, statusOnly };
}

async function fetchMonitorStatus(): Promise<MonitorStatus> {
  const response = await fetch(`${API_BASE_URL}/api/monitor/status`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

async function fetchMonitorProviders(): Promise<MonitorProviders> {
  const response = await fetch(`${API_BASE_URL}/api/monitor/providers`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

async function configureDenoiser(denoiserProvider: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/monitor/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ denoiserProvider })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const result = await response.json();
  console.log(`✅ Denoiser konfiguriert: ${result.config.denoiserProvider}`);
}

async function showStatus(): Promise<void> {
  console.log('🎧 IVU Voice API - Monitor Status');
  console.log('='.repeat(60));
  console.log(`📡 Server: ${API_BASE_URL}`);
  console.log('');

  try {
    // Status abrufen
    const status = await fetchMonitorStatus();
    console.log('📊 Monitor-Service Status:');
    console.log(`   Aktiviert: ${status.enabled ? '✅ Ja' : '❌ Nein'}`);
    console.log(`   Läuft: ${status.running ? '✅ Ja' : '❌ Nein'}`);
    console.log(`   SIP Port: ${status.config.port}`);
    console.log(`   SIP Domain: ${status.config.domain}`);
    console.log(`   SIP User: ${status.config.username}`);
    console.log(`   Aktive Sessions: ${status.activeSessions}`);
    console.log('');

    // Provider abrufen
    const providers = await fetchMonitorProviders();
    console.log('🔧 Verfügbare Provider:');
    console.log(`   STT: ${providers.stt.join(', ')}`);
    console.log(`   Denoiser: ${providers.denoiser.join(', ')}`);
    console.log('');
    console.log('⚙️  Aktuelle Konfiguration:');
    console.log(`   STT: ${providers.defaults.stt}`);
    console.log(`   Denoiser: ${providers.defaults.denoiser}`);
    console.log('');

    // Hilfe anzeigen
    console.log('─'.repeat(60));
    console.log('💡 Denoiser konfigurieren:');
    console.log('');
    console.log('   # RNNoise aktivieren (Rauschunterdrückung):');
    console.log('   npx tsx tests/13-monitor-client.ts --denoiser rnnoise');
    console.log('');
    console.log('   # Denoiser deaktivieren:');
    console.log('   npx tsx tests/13-monitor-client.ts --denoiser none');
    console.log('');
  } catch (error) {
    console.error(`❌ Fehler beim Abrufen des Status: ${error}`);
    process.exit(1);
  }
}

async function main() {
  const { denoiser, statusOnly } = parseArgs();

  // Nur Status anzeigen?
  if (statusOnly) {
    await showStatus();
    return;
  }

  console.log('🎧 IVU Voice API - Monitor Client');
  console.log('='.repeat(60));
  console.log(`📡 Server: ${SERVER_URL}`);
  console.log('');

  // Denoiser konfigurieren falls angegeben
  if (denoiser) {
    console.log(`🔧 Konfiguriere Denoiser: ${denoiser}`);
    try {
      await configureDenoiser(denoiser);
    } catch (error) {
      console.error(`❌ Fehler bei Denoiser-Konfiguration: ${error}`);
      console.log('   Verfügbare Optionen: rnnoise, dtln, none');
      process.exit(1);
    }
    console.log('');
  }

  // Aktuellen Status anzeigen
  try {
    const providers = await fetchMonitorProviders();
    console.log(`⚙️  Aktive Konfiguration:`);
    console.log(`   STT: ${providers.defaults.stt}`);
    console.log(`   Denoiser: ${providers.defaults.denoiser}${providers.defaults.denoiser !== 'none' ? ' 🔇' : ''}`);
    console.log('');
  } catch (error) {
    console.warn(`⚠️  Konnte Provider-Info nicht abrufen: ${error}`);
  }

  const socket: Socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
  });

  // Connection events
  socket.on('connect', () => {
    console.log('✅ Verbunden mit IVU Voice API Server');
    console.log(`   Socket ID: ${socket.id}`);
    console.log('');
    console.log('👂 Warte auf Monitor-Events...');
    console.log('   (Rufen Sie die Monitor-Nummer an, um Transkripte zu sehen)');
    console.log('');
    console.log('─'.repeat(60));
  });

  socket.on('disconnect', (reason) => {
    console.log(`\n❌ Verbindung getrennt: ${reason}`);
  });

  socket.on('connect_error', (error) => {
    console.error(`\n❌ Verbindungsfehler: ${error.message}`);
  });

  // Monitor events
  socket.on('monitor.sessionStarted', (data: MonitorSessionStarted) => {
    console.log('');
    console.log('📞 ═══════════════════════════════════════════════════════');
    console.log(`   NEUE MONITOR-SESSION GESTARTET`);
    console.log(`   Call-ID: ${data.callId}`);
    if (data.agentId) {
      console.log(`   Agent-ID: ${data.agentId}`);
    }
    console.log(`   Gestartet: ${formatTime(new Date(data.startedAt))}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
  });

  socket.on('monitor.transcription', (data: MonitorTranscription) => {
    const time = formatTime(new Date(data.timestamp));
    const duration = data.durationMs ? ` (${formatDuration(data.durationMs)})` : '';

    // Transcript anzeigen
    console.log(`[${time}]${duration} 💬 ${data.text}`);
  });

  socket.on('monitor.sessionEnded', (data: MonitorSessionEnded) => {
    console.log('');
    console.log('📵 ═══════════════════════════════════════════════════════');
    console.log(`   MONITOR-SESSION BEENDET`);
    console.log(`   Call-ID: ${data.callId}`);
    if (data.agentId) {
      console.log(`   Agent-ID: ${data.agentId}`);
    }
    console.log(`   Dauer: ${formatDuration(data.stats.durationMs)}`);
    console.log(`   Transkripte: ${data.stats.transcriptionCount}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('👂 Warte auf weitere Monitor-Events...');
    console.log('─'.repeat(60));
  });

  // SIP events (Voice Bot mode)
  socket.on('sip.callStarted', (data: any) => {
    console.log(`\n📞 SIP-Anruf gestartet: ${data.callId}`);
  });

  socket.on('sip.callEnded', (data: any) => {
    console.log(`\n📵 SIP-Anruf beendet: ${data.callId}`);
  });

  socket.on('sip.transcription', (data: any) => {
    console.log(`[SIP] 🎤 ${data.text}`);
  });

  socket.on('sip.agentResponse', (data: any) => {
    console.log(`[SIP] 🤖 ${data.text}`);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Client wird beendet...');
    socket.disconnect();
    process.exit(0);
  });

  // Keep alive
  console.log('');
  console.log('💡 Drücken Sie Strg+C zum Beenden');
  console.log('');
}

main().catch((error) => {
  console.error('❌ Fehler:', error);
  process.exit(1);
});
