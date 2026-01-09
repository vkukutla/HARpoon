import { Injectable } from '@nestjs/common';
import { HarFilter } from '../har/har.filter';
import { LlmService } from '../llm/llm.service';
import { CurlService } from './curl.service';
import { RequestFingerprint } from './fingerprint.types';

interface SessionState {
  description: string;
  topCandidates: RequestFingerprint[];
  totalProcessed: number;
}

@Injectable()
export class AnalyzeService {
  private sessions = new Map<string, SessionState>();

  constructor(
    private filter: HarFilter,
    private llm: LlmService,
    private curl: CurlService,
  ) {}

  async run(dto: { fingerprints: RequestFingerprint[]; description: string }) {
    const candidates = this.filter.rankFingerprints(dto.fingerprints, dto.description);
    const best = await this.llm.pickBestFingerprint(dto.description, candidates);
    
    if (!best) {
      return { requestId: null, error: 'No matching request found' };
    }

    return { requestId: best.id };
  }

  initializeSession(sessionId: string, description: string): void {
    this.sessions.set(sessionId, {
      description,
      topCandidates: [],
      totalProcessed: 0,
    });
  }

  processChunk(sessionId: string, chunk: RequestFingerprint[]): { success: boolean; error?: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found. Please initialize session first.' };
    }

    const rankedChunk = this.filter.rankFingerprints(chunk, session.description);
    const allCandidates = [...session.topCandidates, ...rankedChunk];
    const merged = this.filter.rankFingerprints(allCandidates, session.description);
    
    session.topCandidates = merged.slice(0, 20);
    session.totalProcessed += chunk.length;

    return { success: true };
  }

  async finalizeSession(sessionId: string): Promise<{ requestId: string | null; error?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { requestId: null, error: 'Session not found' };
    }

    try {
      const best = await this.llm.pickBestFingerprint(session.description, session.topCandidates);
      this.sessions.delete(sessionId);

      if (!best) {
        return { requestId: null, error: 'No matching request found' };
      }

      return { requestId: best.id };
    } catch (error) {
      this.sessions.delete(sessionId);
      console.error('Error finalizing session:', error);
      return { requestId: null, error: 'Failed to finalize session' };
    }
  }

  cleanupSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  async generateCurl(entry: any) {
    try {
      if (!entry || !entry.request) {
        return { curl: null, error: 'Invalid HAR entry' };
      }

      const curl = this.curl.fromHar(entry);
      return { curl, request: entry };
    } catch (error) {
      console.error('Error generating curl:', error);
      return { curl: null, error: 'Failed to generate curl command' };
    }
  }

  async executeRequest(dto: { method: string; url: string; headers: Record<string, string>; body?: string }) {
    try {
      const { method, url, headers, body } = dto;

      if (!url || !url.startsWith('http://') && !url.startsWith('https://')) {
        return {
          status: 0,
          statusText: 'Error',
          headers: {},
          body: '',
          error: 'Invalid URL',
        };
      }

      const response = await fetch(url, {
        method: method || 'GET',
        headers: headers || {},
        body: body,
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const contentType = response.headers.get('content-type') || '';
      let responseBody: string;

      if (contentType.includes('application/json')) {
        try {
          const json = await response.json();
          responseBody = JSON.stringify(json, null, 2);
        } catch {
          responseBody = await response.text();
        }
      } else {
        responseBody = await response.text();
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
      };
    } catch (error) {
      console.error('Error executing request:', error);
      return {
        status: 0,
        statusText: 'Error',
        headers: {},
        body: '',
        error: error instanceof Error ? error.message : 'Network error occurred',
      };
    }
  }
}
