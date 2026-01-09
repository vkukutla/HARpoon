export function parseCurlCommand(curlCommand: string): {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
} | null {
  try {
    let normalized = curlCommand.replace(/\\\s*\n\s*/g, ' ');
    
    const methodMatch = normalized.match(/-X\s+(\w+)/i);
    let method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
    
    const allQuotedMatches = [
      ...Array.from(normalized.matchAll(/'([^']+)'/g)),
      ...Array.from(normalized.matchAll(/"([^"]+)"/g))
    ];
    
    const urlMatch = allQuotedMatches.find(m => {
      const value = m[1];
      return value.startsWith('http://') || value.startsWith('https://');
    });
    
    const url = urlMatch ? urlMatch[1] : '';
    
    if (!url) {
      console.error('Could not extract URL from curl command. Normalized command:', normalized);
      return null;
    }
    
    const headers: Record<string, string> = {};
    let headerIndex = 0;
    while (true) {
      const headerStart = normalized.indexOf('-H ', headerIndex);
      if (headerStart === -1) break;
      
      const afterH = normalized.substring(headerStart + 3);
      const singleQuoteMatch = afterH.match(/^\s*'([^']*(?:'\\''[^']*)*)'/);
      const doubleQuoteMatch = afterH.match(/^\s*"([^"]*(?:\\.[^"]*)*)"/);
      
      if (singleQuoteMatch) {
        let headerContent = singleQuoteMatch[1];
        headerContent = headerContent.replace(/'\\''/g, "'");
        const colonIndex = headerContent.indexOf(':');
        if (colonIndex > 0) {
          const headerName = headerContent.substring(0, colonIndex).trim();
          const headerValue = headerContent.substring(colonIndex + 1).trim();
          headers[headerName] = headerValue;
        }
        headerIndex = headerStart + 3 + singleQuoteMatch[0].length;
      } else if (doubleQuoteMatch) {
        let headerContent = doubleQuoteMatch[1];
        headerContent = headerContent.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        const colonIndex = headerContent.indexOf(':');
        if (colonIndex > 0) {
          const headerName = headerContent.substring(0, colonIndex).trim();
          const headerValue = headerContent.substring(colonIndex + 1).trim();
          headers[headerName] = headerValue;
        }
        headerIndex = headerStart + 3 + doubleQuoteMatch[0].length;
      } else {
        break;
      }
    }
    
    let body: string | undefined;
    const dataRawSingle = normalized.match(/--data-raw\s+'([\s\S]*?)'\s*$/);
    const dataRawDouble = normalized.match(/--data-raw\s+"([\s\S]*?)"\s*$/);
    
    if (dataRawSingle) {
      body = dataRawSingle[1].replace(/'\\''/g, "'");
    } else if (dataRawDouble) {
      body = dataRawDouble[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else {
      const dSingle = normalized.match(/-d\s+'([\s\S]*?)'\s*$/);
      const dDouble = normalized.match(/-d\s+"([\s\S]*?)"\s*$/);
      if (dSingle) {
        body = dSingle[1].replace(/'\\''/g, "'");
      } else if (dDouble) {
        body = dDouble[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      }
    }
    
    if (body && method === 'GET') {
      method = 'POST';
    }
    
    console.log('Parsed curl command:', { method, url, headers, hasBody: !!body });
    
    return {
      method,
      url,
      headers,
      body,
    };
  } catch (error) {
    console.error('Error parsing curl command:', error);
    return null;
  }
}

export async function executeCurl(curlCommand: string): Promise<{
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  error?: string;
}> {
  const parsed = parseCurlCommand(curlCommand);
  
  if (!parsed) {
    return {
      status: 0,
      statusText: 'Error',
      headers: {},
      body: '',
      error: 'Failed to parse curl command',
    };
  }
  
  try {
    const response = await fetch('http://localhost:3001/analyze/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: parsed.method,
        url: parsed.url,
        headers: parsed.headers,
        body: parsed.body,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        status: response.status,
        statusText: response.statusText,
        headers: {},
        body: '',
        error: `Backend error: ${errorText}`,
      };
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    return {
      status: 0,
      statusText: 'Error',
      headers: {},
      body: '',
      error: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
}

