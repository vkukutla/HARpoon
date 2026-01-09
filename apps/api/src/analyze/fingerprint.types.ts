export type RequestFingerprint = {
  id: string;
  method: string;
  pathname: string;
  queryKeys: string[];
  responseMime: string;
  responseSize: number;
  bodyPreview?: string;
};

