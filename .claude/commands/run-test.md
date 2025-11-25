---
allowed-tools: Bash(npx:*), Bash(npm:*)
description: Test-Skript ausführen (z.B. /run-test 01)
---

Führe das angegebene Test-Skript aus dem tests/ Ordner aus.

Argument: Test-Nummer (01-13)

```bash
npx tsx tests/$ARGUMENTS-*.ts
```

Zeige die Ausgabe und erkläre eventuelle Fehler.
