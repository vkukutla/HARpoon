import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { RequestFingerprint } from '../analyze/fingerprint.types';

@Injectable()
export class LlmService {
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    this.openai = new OpenAI({ apiKey });
  }

  async pickBestFingerprint(
    description: string,
    candidates: RequestFingerprint[],
  ): Promise<RequestFingerprint | null> {
    if (!candidates || candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    try {
      const candidateSummaries = candidates.map((fp, index) => ({
        index,
        method: fp.method,
        pathname: fp.pathname,
        queryKeys: fp.queryKeys.join(', ') || 'none',
        responseMime: fp.responseMime,
        responseSize: fp.responseSize,
        bodyPreview: fp.bodyPreview || '',
      }));

      const prompt = this.buildFingerprintPrompt(description, candidateSummaries);

      const response = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              "You are an API reverse engineering assistant. Your task is to analyze API request fingerprints and select the one that best matches a user's description. Return only the index number (0-based) of the best matching request.",
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 10,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        return candidates[0];
      }

      const index = this.extractIndex(content);

      if (index >= 0 && index < candidates.length) {
        return candidates[index];
      }

      return candidates[0];
    } catch (error) {
      console.error('Error calling OpenAI:', error);
      return candidates[0];
    }
  }

  private buildFingerprintPrompt(description: string, summaries: any[]): string {
    const candidatesText = summaries
      .map((s) => {
        let text = `[${s.index}] ${s.method} ${s.pathname}
  Query Keys: ${s.queryKeys}
  Response: ${s.responseMime} (${s.responseSize} bytes)`;
        if (s.bodyPreview) {
          const bodyDisplay = s.bodyPreview.length > 300 
            ? s.bodyPreview.substring(0, 300) + '...' 
            : s.bodyPreview;
          text += `\n  Request Body Preview: ${bodyDisplay}`;
        }
        return text;
      })
      .join('\n\n');

    return `User wants to reverse engineer this API: "${description}"

Here are the candidate API request fingerprints from the HAR file:

${candidatesText}

Which request (by index number) best matches the user's description? Consider:
- URL path and query parameter names relevance
- HTTP method appropriateness
- Response type and size
- Request body content (especially for POST/PUT requests with JSON bodies)
- Semantic meaning of the endpoint and body data

Return only the index number (0-based) of the best match.`;
  }

  private extractIndex(content: string): number {
    const match = content.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      return isNaN(num) ? -1 : num;
    }
    return -1;
  }
}
