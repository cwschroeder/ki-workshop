# IVU Voice API Server - Linux Deployment Guide

Anleitung für das Deployment der IVU Voice API auf einem Linux-Server für den Workshop.

## Systemanforderungen

- Ubuntu 22.04 LTS oder neuer (empfohlen)
- Node.js 20.x oder höher
- 2 GB RAM minimum
- 10 GB freier Speicherplatz
- Root-Zugriff oder sudo-Rechte

## Schnellstart (5 Minuten)

```bash
# 1. Repository klonen
git clone <your-repo-url>
cd ki-phone-connect/ivu-voice-api-server

# 2. Installation ausführen
./scripts/install.sh

# 3. Umgebungsvariablen konfigurieren
cp .env.example .env
nano .env  # API-Keys eintragen

# 4. Server starten
sudo systemctl start ivu-voice-api
sudo systemctl status ivu-voice-api
```

## Detaillierte Installation

### 1. Node.js 20.x installieren

```bash
# Node.js 20.x Repository hinzufügen
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Node.js und npm installieren
sudo apt update
sudo apt install -y nodejs

# Version überprüfen
node --version  # sollte >= v20.0.0 sein
npm --version
```

### 2. Projekt-Setup

```bash
# Benutzer für den Service erstellen
sudo useradd -r -s /bin/false ivu-voice

# Projekt-Verzeichnis erstellen
sudo mkdir -p /opt/ivu-voice-api
sudo chown $USER:$USER /opt/ivu-voice-api

# Code kopieren
cd /opt/ivu-voice-api
git clone <your-repo-url> .
cd ivu-voice-api-server

# Dependencies installieren
npm install --production

# TypeScript kompilieren
npm run build
```

### 3. Umgebungskonfiguration

```bash
# .env Datei erstellen
cp .env.example .env
nano .env
```

**Wichtige Konfigurationen für den Workshop:**

```env
# TENIOS Configuration
TENIOS_API_KEY=9fd94019-4bb8-461e-9dbb-029701db5f5a
TENIOS_WEBHOOK_URL=https://your-domain.com/api/webhook

# AI Provider (wähle einen)
AI_PROVIDER=openai
OPENAI_API_KEY=sk-proj-your-key-here

# Server Configuration
PORT=3001
NODE_ENV=production

# Workshop Configuration
WORKSHOP_DATA_DIR=/opt/ivu-voice-api/workshop-data
MAX_CONCURRENT_CALLS=20

# Logging
LOG_LEVEL=info
ENABLE_CORS=true
```

### 4. Workshop-Daten-Verzeichnis

```bash
# Verzeichnis erstellen
sudo mkdir -p /opt/ivu-voice-api/workshop-data
sudo chown ivu-voice:ivu-voice /opt/ivu-voice-api/workshop-data
```

### 5. Systemd Service einrichten

```bash
# Service-Datei erstellen
sudo cp scripts/ivu-voice-api.service /etc/systemd/system/

# Service aktivieren
sudo systemctl daemon-reload
sudo systemctl enable ivu-voice-api

# Service starten
sudo systemctl start ivu-voice-api

# Status überprüfen
sudo systemctl status ivu-voice-api
```

### 6. Nginx Reverse Proxy (optional aber empfohlen)

```bash
# Nginx installieren
sudo apt install -y nginx

# Konfiguration erstellen
sudo cp scripts/nginx-ivu-voice-api.conf /etc/nginx/sites-available/ivu-voice-api
sudo ln -s /etc/nginx/sites-available/ivu-voice-api /etc/nginx/sites-enabled/

# SSL mit Let's Encrypt einrichten
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com

# Nginx neu starten
sudo systemctl restart nginx
```

### 7. Firewall konfigurieren

```bash
# UFW einrichten
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw allow 3001/tcp    # IVU Voice API (optional, wenn direkt exposed)
sudo ufw enable
```

## Service-Management

```bash
# Service starten
sudo systemctl start ivu-voice-api

# Service stoppen
sudo systemctl stop ivu-voice-api

# Service neu starten
sudo systemctl restart ivu-voice-api

# Service-Status anzeigen
sudo systemctl status ivu-voice-api

# Logs anzeigen
sudo journalctl -u ivu-voice-api -f

# Logs der letzten Stunde
sudo journalctl -u ivu-voice-api --since "1 hour ago"
```

## Deployment mit Docker (Alternative)

```bash
# Image bauen
docker build -t ivu-voice-api .

# Container starten
docker run -d \
  --name ivu-voice-api \
  --restart unless-stopped \
  -p 3001:3001 \
  --env-file .env \
  -v /opt/ivu-voice-api/workshop-data:/app/workshop-data \
  ivu-voice-api

# Logs anzeigen
docker logs -f ivu-voice-api

# Container stoppen
docker stop ivu-voice-api
```

## Health Check

Nach dem Deployment kannst du die API testen:

```bash
# Health-Check
curl http://localhost:3001/health

# Mit ngrok/Nginx
curl https://your-domain.com/health
```

Erwartete Antwort:
```json
{
  "status": "ok",
  "timestamp": "2025-11-24T10:00:00.000Z",
  "activeSessions": 0,
  "totalSessions": 0,
  "providers": {
    "ai": "OpenAI",
    "telephony": "Tenios"
  }
}
```

## Tenios Webhook konfigurieren

1. Gehe zum Tenios Dashboard
2. Navigiere zu "Routing" > "Call Control API"
3. Setze die Webhook URL: `https://your-domain.com/api/webhook`
4. Speichern

## Monitoring

### Log-Files

```bash
# Systemd Journal
sudo journalctl -u ivu-voice-api -f

# Wenn PM2 verwendet wird
pm2 logs ivu-voice-api
```

### Wichtige Metriken

- **Session Count**: GET `/api/sessions` - Anzahl aktiver Sessions
- **Health Status**: GET `/health` - Server-Status
- **Disk Space**: Workshop-Daten-Verzeichnis überwachen

```bash
# Disk Usage überwachen
df -h /opt/ivu-voice-api/workshop-data
```

## Troubleshooting

### Server startet nicht

```bash
# Logs prüfen
sudo journalctl -u ivu-voice-api -n 50

# Environment-Variablen prüfen
sudo systemctl show ivu-voice-api --property Environment

# Manuell starten (Debug)
cd /opt/ivu-voice-api/ivu-voice-api-server
node dist/index.js
```

### Webhook funktioniert nicht

```bash
# Nginx-Logs prüfen
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Firewall prüfen
sudo ufw status

# Port-Test von außen
curl -X POST https://your-domain.com/api/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

### Hoher Speicherverbrauch

```bash
# Prozess-Ressourcen prüfen
ps aux | grep node

# Sessions aufräumen
curl -X POST http://localhost:3001/api/sessions/cleanup
```

## Backup & Wartung

### Backup erstellen

```bash
# Workshop-Daten sichern
sudo tar -czf /backup/ivu-voice-data-$(date +%Y%m%d).tar.gz \
  /opt/ivu-voice-api/workshop-data
```

### Updates einspielen

```bash
# Code aktualisieren
cd /opt/ivu-voice-api/ivu-voice-api-server
git pull origin main

# Dependencies aktualisieren
npm install --production

# Neu kompilieren
npm run build

# Service neu starten
sudo systemctl restart ivu-voice-api
```

## Performance-Tuning

### Für große Workshops (50+ Teilnehmer)

```env
MAX_CONCURRENT_CALLS=100
```

### Node.js Memory Limit erhöhen

Bearbeite `/etc/systemd/system/ivu-voice-api.service`:

```ini
[Service]
Environment="NODE_OPTIONS=--max-old-space-size=4096"
```

Dann:
```bash
sudo systemctl daemon-reload
sudo systemctl restart ivu-voice-api
```

## Security Best Practices

1. **API-Keys schützen**: `.env` Datei darf nicht öffentlich sein
2. **HTTPS erzwingen**: Nginx-Konfiguration für SSL/TLS
3. **Rate Limiting**: Nginx rate limiting aktivieren (siehe nginx-Konfiguration)
4. **Firewall**: Nur notwendige Ports öffnen
5. **Updates**: Regelmäßig `npm audit` ausführen

```bash
# Security-Audit
cd /opt/ivu-voice-api/ivu-voice-api-server
npm audit

# Fixes anwenden
npm audit fix
```

## Workshop-Vorbereitung

### Pre-Workshop Checklist

- [ ] Server erreichbar via HTTPS
- [ ] Health-Check erfolgreich
- [ ] Tenios Webhook konfiguriert
- [ ] Test-Anruf durchgeführt
- [ ] Logs werden geschrieben
- [ ] Backup erstellt
- [ ] Monitoring aktiv

### Test-Client verbinden

```bash
# Von einem Workshop-Client aus
cd workshop
npm install
node test-client-say.ts
```

Erwartung: WebSocket-Verbindung erfolgreich, Session wird erstellt.

## Support

Bei Problemen:

1. Logs prüfen: `sudo journalctl -u ivu-voice-api -f`
2. Health-Check: `curl http://localhost:3001/health`
3. Sessions prüfen: `curl http://localhost:3001/api/sessions`
4. Issue erstellen: <your-repo-url>/issues
