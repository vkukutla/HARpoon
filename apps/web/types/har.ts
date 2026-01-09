// types/har.ts
export interface HarFile {
    log: {
      version: string;
      creator: { name: string; version: string };
      entries: HarEntry[];
    };
  }
  
  export interface HarEntry {
    startedDateTime: string;
    time: number;
    request: {
      method: string;
      url: string;
      headers: { name: string; value: string }[];
      postData?: { mimeType: string; text: string };
    };
    response: {
      status: number;
      statusText: string;
      headers: { name: string; value: string }[];
      content: { size: number; mimeType: string; text?: string };
    };
  }
  