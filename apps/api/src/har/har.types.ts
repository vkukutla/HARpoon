export type HarReq = {
    id: string;
    method: string;
    url: string;
    pathname: string;
    queryKeys: string[];
    headers: Record<string,string>;
    responseMime: string;
    responseSize: number;
  };