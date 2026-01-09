import { Injectable } from '@nestjs/common';
import { RequestFingerprint } from '../analyze/fingerprint.types';

type RequestShape = {
  path: string;
  method: string;
  query: string[];
  body?: string;
  mime: string;
  size: number;
};

@Injectable()
export class HarFilter {
  private readonly EXCLUDED_MIME_TYPES = [
    'text/html', 'text/css', 'application/javascript', 'text/javascript',
    'image/', 'font/', 'video/', 'audio/', 'application/font', 'application/x-font',
  ];

  private readonly EXCLUDED_EXTENSIONS = [
    '.css','.js','.png','.jpg','.jpeg','.gif','.svg','.ico','.woff','.woff2','.ttf','.eot','.mp4','.webp',
  ];

  private readonly API_KEYWORDS = ['api','v1','v2','v3','graphql','rest','json'];

  // -------- Normalizers --------

  private shapeFromEntry(entry: any): RequestShape {
    const req = entry.request || {};
    const res = entry.response || {};

    return {
      path: this.extractPathname(req.url || ''),
      method: (req.method || 'GET').toUpperCase(),
      query: (req.queryString || []).map((q: any) => q.name || '').filter(Boolean),
      body: req.postData?.text || '',
      mime: (res.content?.mimeType || '').toLowerCase(),
      size: res.content?.size || 0,
    };
  }

  private shapeFromFingerprint(fp: RequestFingerprint): RequestShape {
    return {
      path: fp.pathname,
      method: fp.method.toUpperCase(),
      query: fp.queryKeys || [],
      body: fp.bodyPreview || '',
      mime: fp.responseMime.toLowerCase(),
      size: fp.responseSize,
    };
  }

  // -------- Ranking --------

  rankFingerprints(fingerprints: RequestFingerprint[], description: string): RequestFingerprint[] {
    if (!fingerprints?.length) return [];
    if (!description?.trim()) {
      return fingerprints
        .map(fp => ({ fp, score: this.scoreShape(this.shapeFromFingerprint(fp), '', []) }))
        .filter(x => x.score > 0)
        .sort((a,b) => b.score - a.score)
        .slice(0,20)
        .map(x => x.fp);
    }

    const keywords = this.extractKeywords(description);

    return fingerprints
      .map(fp => ({ fp, score: this.scoreShape(this.shapeFromFingerprint(fp), description, keywords) }))
      .filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score)
      .slice(0,20)
      .map(x => x.fp);
  }

  rank(entries: any[], description: string): any[] {
    if (!entries?.length) return [];
    if (!description?.trim()) {
      return entries
        .map(e => ({ e, score: this.scoreShape(this.shapeFromEntry(e), '', []) }))
        .filter(x => x.score > 0)
        .sort((a,b) => b.score - a.score)
        .slice(0,20)
        .map(x => x.e);
    }

    const keywords = this.extractKeywords(description);

    return entries
      .map(e => ({ e, score: this.scoreShape(this.shapeFromEntry(e), description, keywords) }))
      .filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score)
      .slice(0,20)
      .map(x => x.e);
  }

  // -------- Scoring Core --------

  private scoreShape(shape: RequestShape, description: string, keywords: string[]): number {
    if (this.shouldExcludeShape(shape)) return 0;

    let score = 0;
    const path = shape.path.toLowerCase();
    const desc = description.toLowerCase();
    const segments = path.split('/').filter(Boolean);

    for (const k of keywords) {
      if (path.includes(k)) score += 3;
      if (new RegExp(`\\b${k}\\b`).test(path)) score += 2;
    }

    for (const w of this.extractWords(description)) {
      if (segments.some(s => this.isSemanticMatch(w, s))) score += 1;
    }

    for (const q of shape.query) {
      const key = q.toLowerCase();
      if (desc.includes(key)) score += 2;
      if (keywords.some(k => key.includes(k))) score += 1;
    }

    // Body matching - especially important for POST/PUT requests
    if (shape.body) {
      const bodyLower = shape.body.toLowerCase();
      // Count how many keywords match in the body
      const bodyMatches = keywords.filter(k => bodyLower.includes(k)).length;
      if (bodyMatches > 0) {
        score += 3 + bodyMatches; // Base 3 + 1 per keyword match
      }
      // Bonus for JSON bodies with substantial content
      if (shape.body.includes('{') && bodyMatches > 0) {
        score += 2;
      }
    }

    if (shape.mime.includes('json')) score += 4;
    if (this.API_KEYWORDS.some(k => path.includes(k))) score += 3;
    if (shape.method !== 'GET') score += 2;

    if (shape.size > 300 && shape.size < 500_000) score += 1;
    if (shape.size > 5_000 && shape.size < 200_000) score += 1;

    if (segments.length > 6) score -= 1;

    return Math.max(0, Math.min(100, score));
  }

  private shouldExcludeShape(shape: RequestShape): boolean {
    const p = shape.path.toLowerCase();
    const m = shape.mime.toLowerCase();

    if (this.EXCLUDED_MIME_TYPES.some(x => m.includes(x))) return true;
    if (this.EXCLUDED_EXTENSIONS.some(x => p.includes(x))) return true;
    if (p.includes('favicon.ico') || p.includes('robots.txt')) return true;
    if (shape.size < 50 && !m.includes('json')) return true;

    return false;
  }

  // -------- Utilities --------

  private extractKeywords(text: string): string[] {
    const blacklist = new Set(['the','and','for','with','from','that','this','your','you','are','was','were','been']);
    return this.extractWords(text).filter(w => w.length > 2 && !blacklist.has(w));
  }

  private extractWords(text: string): string[] {
    return text.toLowerCase().replace(/[^\w\s]/g,' ').split(/\s+/).filter(Boolean);
  }

  private extractPathname(url: string): string {
    try { return new URL(url).pathname; }
    catch {
      const m = url.match(/^https?:\/\/[^\/]+(\/[^?#]*)/);
      return m ? m[1] : url;
    }
  }

  private isSemanticMatch(a: string, b: string): boolean {
    if (a === b) return true;
    if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;
    return a.replace(/s$/,'') === b.replace(/s$/,'');
  }
}
