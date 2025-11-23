/**
 * Transcript Verifier
 *
 * Sammelt und vergleicht Transkripte von:
 * - B2BUA (Leg A - hört Customer)
 * - B2BUA (Leg B - hört Agent)
 * - Agent (hört Customer via B2BUA)
 * - Customer (hört Agent via B2BUA)
 *
 * Verifiziert dass Audio korrekt durchgereicht wird
 */

import { logger } from '../utils/logger';

export interface TranscriptEntry {
  timestamp: Date;
  source: string;
  speaker: string;
  text: string;
  confidence?: number;
}

export class TranscriptVerifier {
  private transcripts: TranscriptEntry[] = [];
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Add a transcript entry
   */
  addTranscript(entry: Omit<TranscriptEntry, 'timestamp'>): void {
    const fullEntry: TranscriptEntry = {
      ...entry,
      timestamp: new Date()
    };

    this.transcripts.push(fullEntry);

    logger.info({
      sessionId: this.sessionId,
      source: entry.source,
      speaker: entry.speaker,
      text: entry.text
    }, `📝 Transcript recorded from ${entry.source}`);
  }

  /**
   * Get all transcripts
   */
  getTranscripts(): TranscriptEntry[] {
    return [...this.transcripts];
  }

  /**
   * Get transcripts by source
   */
  getTranscriptsBySource(source: string): TranscriptEntry[] {
    return this.transcripts.filter(t => t.source === source);
  }

  /**
   * Compare transcripts from two sources
   * Returns similarity score (0-1)
   */
  compareTranscripts(source1: string, source2: string): {
    similarity: number;
    matches: number;
    total: number;
    details: Array<{
      index: number;
      source1Text: string;
      source2Text: string;
      match: boolean;
    }>;
  } {
    const transcripts1 = this.getTranscriptsBySource(source1);
    const transcripts2 = this.getTranscriptsBySource(source2);

    const total = Math.max(transcripts1.length, transcripts2.length);
    let matches = 0;
    const details: Array<{
      index: number;
      source1Text: string;
      source2Text: string;
      match: boolean;
    }> = [];

    for (let i = 0; i < total; i++) {
      const t1 = transcripts1[i];
      const t2 = transcripts2[i];

      if (!t1 || !t2) {
        details.push({
          index: i,
          source1Text: t1?.text || '[MISSING]',
          source2Text: t2?.text || '[MISSING]',
          match: false
        });
        continue;
      }

      // Normalize for comparison
      const text1 = this.normalizeText(t1.text);
      const text2 = this.normalizeText(t2.text);

      // Check if texts are similar (allowing for minor STT differences)
      const match = this.textSimilarity(text1, text2) > 0.8;

      if (match) matches++;

      details.push({
        index: i,
        source1Text: t1.text,
        source2Text: t2.text,
        match
      });
    }

    const similarity = total > 0 ? matches / total : 0;

    return {
      similarity,
      matches,
      total,
      details
    };
  }

  /**
   * Verify audio flow is working correctly
   * Returns verification report
   */
  verifyAudioFlow(): {
    success: boolean;
    report: string;
    checks: Array<{
      name: string;
      passed: boolean;
      details: string;
    }>;
  } {
    const checks: Array<{ name: string; passed: boolean; details: string }> = [];

    // Check 1: B2BUA Leg A hört Customer
    const b2buaLegA = this.getTranscriptsBySource('B2BUA-LEG-A');
    checks.push({
      name: 'B2BUA hört Customer (Leg A)',
      passed: b2buaLegA.length > 0,
      details: `${b2buaLegA.length} transcripts recorded`
    });

    // Check 2: Agent hört Customer (via B2BUA)
    const agentHears = this.getTranscriptsBySource('AGENT-HÖRT');
    checks.push({
      name: 'Agent hört Customer',
      passed: agentHears.length > 0,
      details: `${agentHears.length} transcripts recorded`
    });

    // Check 3: B2BUA vs Agent - sollten identisch sein
    if (b2buaLegA.length > 0 && agentHears.length > 0) {
      const comparison = this.compareTranscripts('B2BUA-LEG-A', 'AGENT-HÖRT');
      checks.push({
        name: 'B2BUA und Agent hören dasselbe',
        passed: comparison.similarity >= 0.8,
        details: `${(comparison.similarity * 100).toFixed(1)}% Übereinstimmung (${comparison.matches}/${comparison.total})`
      });
    }

    // Check 4: Agent sagt etwas
    const agentSays = this.getTranscriptsBySource('AGENT-SAGT');
    checks.push({
      name: 'Agent generiert Responses',
      passed: agentSays.length > 0,
      details: `${agentSays.length} responses generated`
    });

    // Check 5: Customer hört Agent
    const customerHears = this.getTranscriptsBySource('CUSTOMER-HÖRT');
    checks.push({
      name: 'Customer hört Agent',
      passed: customerHears.length > 0,
      details: `${customerHears.length} transcripts recorded`
    });

    // Check 6: Agent sagt vs Customer hört - sollten identisch sein
    if (agentSays.length > 0 && customerHears.length > 0) {
      const comparison = this.compareTranscripts('AGENT-SAGT', 'CUSTOMER-HÖRT');
      checks.push({
        name: 'Customer hört was Agent sagt',
        passed: comparison.similarity >= 0.8,
        details: `${(comparison.similarity * 100).toFixed(1)}% Übereinstimmung (${comparison.matches}/${comparison.total})`
      });
    }

    const allPassed = checks.every(c => c.passed);

    // Generate report
    const report = this.generateReport(checks);

    return {
      success: allPassed,
      report,
      checks
    };
  }

  /**
   * Print detailed transcript comparison
   */
  printComparison(source1: string, source2: string): void {
    const comparison = this.compareTranscripts(source1, source2);

    logger.info('');
    logger.info('═══════════════════════════════════════════════════');
    logger.info(`📊 Transcript Comparison: ${source1} vs ${source2}`);
    logger.info('═══════════════════════════════════════════════════');
    logger.info('');
    logger.info(`Similarity: ${(comparison.similarity * 100).toFixed(1)}%`);
    logger.info(`Matches: ${comparison.matches}/${comparison.total}`);
    logger.info('');
    logger.info('Details:');
    logger.info('');

    comparison.details.forEach((detail, idx) => {
      const status = detail.match ? '✅' : '❌';
      logger.info(`${status} [${idx + 1}]`);
      logger.info(`   ${source1}: "${detail.source1Text}"`);
      logger.info(`   ${source2}: "${detail.source2Text}"`);
      logger.info('');
    });
  }

  /**
   * Print all transcripts organized by source
   */
  printAllTranscripts(): void {
    logger.info('');
    logger.info('═══════════════════════════════════════════════════');
    logger.info('📋 All Transcripts');
    logger.info('═══════════════════════════════════════════════════');
    logger.info('');

    const sources = Array.from(new Set(this.transcripts.map(t => t.source)));

    sources.forEach(source => {
      const transcripts = this.getTranscriptsBySource(source);
      logger.info(`\n${source} (${transcripts.length} entries):`);
      logger.info('─'.repeat(50));

      transcripts.forEach((t, idx) => {
        const time = t.timestamp.toISOString().split('T')[1].slice(0, 8);
        logger.info(`[${idx + 1}] ${time} | ${t.speaker}: "${t.text}"`);
      });
    });

    logger.info('');
  }

  /**
   * Export transcripts to JSON file
   */
  exportToJSON(filename: string): void {
    const fs = require('fs');
    const data = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      transcriptCount: this.transcripts.length,
      transcripts: this.transcripts
    };

    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    logger.info({ filename, count: this.transcripts.length }, 'Transcripts exported to JSON');
  }

  /**
   * Export transcripts to CSV
   */
  exportToCSV(filename: string): void {
    const fs = require('fs');
    const header = 'timestamp,source,speaker,text\n';
    const rows = this.transcripts.map(t =>
      `${t.timestamp.toISOString()},"${t.source}","${t.speaker}","${t.text.replace(/"/g, '""')}"`
    ).join('\n');

    fs.writeFileSync(filename, header + rows);
    logger.info({ filename, count: this.transcripts.length }, 'Transcripts exported to CSV');
  }

  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[.,!?;:]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate text similarity using Levenshtein distance
   */
  private textSimilarity(text1: string, text2: string): number {
    const len1 = text1.length;
    const len2 = text2.length;

    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    // Levenshtein distance matrix
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = text1[i - 1] === text2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLen = Math.max(len1, len2);
    return 1 - (distance / maxLen);
  }

  /**
   * Generate verification report
   */
  private generateReport(checks: Array<{ name: string; passed: boolean; details: string }>): string {
    const lines: string[] = [];

    lines.push('');
    lines.push('═══════════════════════════════════════════════════');
    lines.push('🔍 Audio Flow Verification Report');
    lines.push('═══════════════════════════════════════════════════');
    lines.push('');

    checks.forEach(check => {
      const icon = check.passed ? '✅' : '❌';
      lines.push(`${icon} ${check.name}`);
      lines.push(`   ${check.details}`);
      lines.push('');
    });

    const passedCount = checks.filter(c => c.passed).length;
    const totalCount = checks.length;
    const successRate = (passedCount / totalCount * 100).toFixed(1);

    lines.push('─'.repeat(50));
    lines.push(`Result: ${passedCount}/${totalCount} checks passed (${successRate}%)`);

    if (passedCount === totalCount) {
      lines.push('');
      lines.push('✅ ALL CHECKS PASSED - Audio flow is working correctly!');
    } else {
      lines.push('');
      lines.push('❌ SOME CHECKS FAILED - Review audio routing');
    }

    lines.push('═══════════════════════════════════════════════════');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalTranscripts: number;
    bySource: Record<string, number>;
    bySpeaker: Record<string, number>;
    averageLength: number;
  } {
    const bySource: Record<string, number> = {};
    const bySpeaker: Record<string, number> = {};
    let totalLength = 0;

    this.transcripts.forEach(t => {
      bySource[t.source] = (bySource[t.source] || 0) + 1;
      bySpeaker[t.speaker] = (bySpeaker[t.speaker] || 0) + 1;
      totalLength += t.text.length;
    });

    return {
      totalTranscripts: this.transcripts.length,
      bySource,
      bySpeaker,
      averageLength: this.transcripts.length > 0 ? totalLength / this.transcripts.length : 0
    };
  }
}
