export type RequestFingerprint = {
  id: string;
  method: string;
  pathname: string;
  queryKeys: string[];
  responseMime: string;
  responseSize: number;
  bodyPreview?: string;
};

export function extractFingerprints(har: any): RequestFingerprint[] {
  if (!har?.log?.entries) {
    return [];
  }

  return har.log.entries.map((e: any, i: number) => {
    let pathname = '';
    try {
      pathname = new URL(e.request.url).pathname;
    } catch {
      // sometimes URLs are malformed
      const match = e.request.url.match(/^https?:\/\/[^\/]+(\/[^?#]*)/);
      pathname = match ? match[1] : e.request.url;
    }

    const postData = e.request?.postData?.text || '';
    const bodyPreview = postData ? postData.substring(0, 500) : undefined;

    return {
      id: String(i),
      method: e.request.method || 'GET',
      pathname,
      queryKeys: (e.request.queryString || []).map((q: any) => q.name),
      responseMime: e.response?.content?.mimeType || '',
      responseSize: e.response?.content?.size || 0,
      bodyPreview,
    };
  });
}

