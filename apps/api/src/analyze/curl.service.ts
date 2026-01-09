import { Injectable } from '@nestjs/common';

@Injectable()
export class CurlService {
  fromHar(best: any): string {
    if (!best?.request) {
      return '';
    }
    
    const { request } = best;
    const method = request.method || 'GET';
    const url = request.url || '';
    
    // skip headers curl handles automatically
    const excludedHeaders = new Set([
      'host',
      'connection',
      'content-length',
      'accept-encoding',
      ':authority',
      ':method',
      ':path',
      ':scheme',
      ':status',
    ]);
    
    const escapeSingleQuote = (str: string): string => {
      return str.replace(/'/g, "'\\''");
    };
    
    const headers: string[] = [];
    if (request.headers) {
      request.headers.forEach((header: any) => {
        const headerName = header.name || '';
        if (!excludedHeaders.has(headerName.toLowerCase()) && !headerName.startsWith(':')) {
          const headerValue = escapeSingleQuote(header.value || '');
          headers.push(`-H '${headerName}: ${headerValue}'`);
        }
      });
    }
    
    const parts: string[] = ['curl'];
    const escapedUrl = escapeSingleQuote(url);
    parts.push(`'${escapedUrl}'`);
    
    const methodUpper = method.toUpperCase();
    const hasBody = !!request.postData?.text;
    
    if (hasBody && methodUpper !== 'POST' && methodUpper !== 'GET') {
      parts.push(`-X ${methodUpper}`);
    } else if (!hasBody && methodUpper !== 'GET') {
      parts.push(`-X ${methodUpper}`);
    }
    
    parts.push(...headers);
    
    if (hasBody) {
      const bodyText = request.postData.text;
      const escapedBody = escapeSingleQuote(bodyText);
      parts.push(`--data-raw '${escapedBody}'`);
    }
    
    return parts.join(' \\\n  ');
  }
}
