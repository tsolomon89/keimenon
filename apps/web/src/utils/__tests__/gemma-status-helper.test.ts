import { describe, it, expect } from 'vitest';
import { getGemmaStatusLabel, GemmaLocalStatus } from '../gemma-status-helper';

describe('getGemmaStatusLabel', () => {
  it('returns neutral "Checking..." when status is null', () => {
    const result = getGemmaStatusLabel(null);
    expect(result).toEqual({ label: 'Checking...', tone: 'neutral' });
  });

  it('returns neutral "Gemma Not Configured" when configured is false', () => {
    const status: GemmaLocalStatus = { configured: false, status: 'offline' };
    const result = getGemmaStatusLabel(status);
    expect(result).toEqual({ label: 'Gemma Not Configured', tone: 'neutral' });
  });

  it('returns warning "Gemma Model Missing" when error_code is GEMMA_MODEL_NOT_FOUND', () => {
    const status: GemmaLocalStatus = {
      configured: true,
      status: 'offline',
      error_code: 'GEMMA_MODEL_NOT_FOUND',
    };
    const result = getGemmaStatusLabel(status);
    expect(result).toEqual({ label: 'Gemma Model Missing', tone: 'warning' });
  });

  it('returns error "Gemma Runtime Offline" when error_code is GEMMA_LOCAL_RUNTIME_UNAVAILABLE', () => {
    const status: GemmaLocalStatus = {
      configured: true,
      status: 'offline',
      error_code: 'GEMMA_LOCAL_RUNTIME_UNAVAILABLE',
    };
    const result = getGemmaStatusLabel(status);
    expect(result).toEqual({ label: 'Gemma Runtime Offline', tone: 'error' });
  });

  it('returns error "Gemma Unavailable" when status is unavailable', () => {
    const status: GemmaLocalStatus = { configured: true, status: 'unavailable' };
    const result = getGemmaStatusLabel(status);
    expect(result).toEqual({ label: 'Gemma Unavailable', tone: 'error' });
  });

  it('returns online "Gemma Online" when status is online and model is available', () => {
    const status: GemmaLocalStatus = { configured: true, status: 'online', modelAvailable: true };
    const result = getGemmaStatusLabel(status);
    expect(result).toEqual({ label: 'Gemma Online', tone: 'online' });
  });

  it('does not return online if modelAvailable is false', () => {
    const status: GemmaLocalStatus = { configured: true, status: 'online', modelAvailable: false };
    const result = getGemmaStatusLabel(status);
    // falls back to the default
    expect(result).toEqual({ label: 'Gemma Runtime Offline', tone: 'error' });
  });
});
