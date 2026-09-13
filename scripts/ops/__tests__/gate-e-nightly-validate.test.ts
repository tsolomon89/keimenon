import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
const { evaluateGateENightly } = require('../gate-e-nightly-validate');

describe('gate-e-nightly-validate', () => {
  const tmpDir = path.resolve(process.cwd(), '.data/test-gate-e-nightly-validate');
  const evidencePath = path.join(tmpDir, 'evidence.json');
  const streakPath = path.join(tmpDir, 'streak.json');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  const validEvidence = {
    pass: true,
    status: 'green',
    e2e: { pass: true },
    lod: { pass: true },
    drill: { pass: true },
  };

  it('passes routine daily validation when evidence is green even if streak < 14', () => {
    fs.writeFileSync(evidencePath, JSON.stringify(validEvidence), 'utf8');
    fs.writeFileSync(
      streakPath,
      JSON.stringify({ target: 14, streak: 3, meetsTarget: false }),
      'utf8'
    );

    const result = evaluateGateENightly({
      evidenceReport: evidencePath,
      streakReport: streakPath,
      requireStreak: false,
      targetStreak: 14,
    });

    expect(result.pass).toBe(true);
    expect(result.status).toBe('green');
    expect(result.failures).toHaveLength(0);
    expect(result.payload.streakProgress.streak).toBe(3);
  });

  it('fails release signoff (--require-streak) when streak < 14', () => {
    fs.writeFileSync(evidencePath, JSON.stringify(validEvidence), 'utf8');
    fs.writeFileSync(
      streakPath,
      JSON.stringify({ target: 14, streak: 0, meetsTarget: false }),
      'utf8'
    );

    const result = evaluateGateENightly({
      evidenceReport: evidencePath,
      streakReport: streakPath,
      requireStreak: true,
      targetStreak: 14,
    });

    expect(result.pass).toBe(false);
    expect(result.status).toBe('red');
    expect(
      result.failures.some((f: string) => f.includes('Streak requirement not satisfied'))
    ).toBe(true);
  });

  it('fails release signoff when streak report is missing and requireStreak is true', () => {
    fs.writeFileSync(evidencePath, JSON.stringify(validEvidence), 'utf8');

    const result = evaluateGateENightly({
      evidenceReport: evidencePath,
      streakReport: path.join(tmpDir, 'non-existent-streak.json'),
      requireStreak: true,
      targetStreak: 14,
    });

    expect(result.pass).toBe(false);
    expect(result.failures.some((f: string) => f.includes('Missing streak report'))).toBe(true);
  });

  it('fails when evidence component does not match overall pass', () => {
    const badEvidence = {
      pass: true,
      status: 'green',
      e2e: { pass: false },
      lod: { pass: true },
      drill: { pass: true },
    };
    fs.writeFileSync(evidencePath, JSON.stringify(badEvidence), 'utf8');

    const result = evaluateGateENightly({
      evidenceReport: evidencePath,
      streakReport: streakPath,
      requireStreak: false,
      targetStreak: 14,
    });

    expect(result.pass).toBe(false);
    expect(result.failures.some((f: string) => f.includes('Evidence pass mismatch'))).toBe(true);
  });

  it('validates calendar distinct UTC dates when historicalRunsInspected is present', () => {
    fs.writeFileSync(evidencePath, JSON.stringify(validEvidence), 'utf8');

    // 14 runs, but all on the same day (reruns/duplicates)
    const duplicateDayRuns = Array.from({ length: 14 }, (_, i) => ({
      id: 100 + i,
      conclusion: 'success',
      createdAt: '2026-09-01T02:00:00Z',
    }));

    fs.writeFileSync(
      streakPath,
      JSON.stringify({
        target: 14,
        streak: 14,
        meetsTarget: true,
        historicalRunsInspected: duplicateDayRuns,
      }),
      'utf8'
    );

    const result = evaluateGateENightly({
      evidenceReport: evidencePath,
      streakReport: streakPath,
      requireStreak: true,
      targetStreak: 14,
    });

    expect(result.pass).toBe(false);
    expect(
      result.failures.some((f: string) => f.includes('Calendar streak requirement not satisfied'))
    ).toBe(true);
  });

  it('passes release signoff when streak is 14 with 14 distinct UTC dates', () => {
    fs.writeFileSync(evidencePath, JSON.stringify(validEvidence), 'utf8');

    // 14 distinct days
    const distinctDays = Array.from({ length: 14 }, (_, i) => {
      const day = String(i + 1).padStart(2, '0');
      return {
        id: 200 + i,
        conclusion: 'success',
        createdAt: `2026-08-${day}T02:00:00Z`,
      };
    });

    fs.writeFileSync(
      streakPath,
      JSON.stringify({
        target: 14,
        streak: 14,
        meetsTarget: true,
        timestamp: '2026-08-14T12:00:00Z',
        historicalRunsInspected: distinctDays,
      }),
      'utf8'
    );

    const result = evaluateGateENightly({
      evidenceReport: evidencePath,
      streakReport: streakPath,
      requireStreak: true,
      targetStreak: 14,
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toHaveLength(0);
  });
});
