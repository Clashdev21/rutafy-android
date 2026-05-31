export type NodeItemMetadata = {
  search_aliases?: string[];
  aliases?: string[];
  subnodes?: Array<{ label?: string; name?: string }>;
  [key: string]: unknown;
};

/** Misma forma que portex-rutafy TransportistaPanel NodeItem */
export type RutafyNode = {
  node_id: string;
  code: string;
  name: string;
  category: string;
  zone: string | null;
  lat: number;
  lng: number;
  address_text: string | null;
  is_active: boolean;
  marketplace_enabled?: boolean;
  metadata?: NodeItemMetadata;
};

export type NodesListResponse = {
  trace_id?: string;
  nodes?: unknown[];
  error?: string;
};
