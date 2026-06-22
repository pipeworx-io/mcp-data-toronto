interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * DataToronto MCP — City of Toronto open data (open.toronto.ca, CKAN API).
 *
 * Toronto runs CKAN (not Socrata), so this uses CKAN's datastore_search /
 * package_search actions. Keyless. Same agent-friendly shape as the Socrata
 * city packs (data-sf etc.): named dataset shortcuts + a generic query + a
 * catalogue search.
 *
 * Tools:
 * - toronto_recent:   recent rows from a common Toronto dataset by friendly name
 * - toronto_query:    query any open.toronto.ca datastore resource by id
 * - toronto_datasets: search the Toronto open-data catalogue (returns resource ids)
 */


const BASE = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action';
const UA = 'pipeworx-mcp-data-toronto/1.0 (+https://pipeworx.io)';

// Friendly name -> CKAN datastore resource id + the date column to sort by.
const DATASETS: Record<string, { id: string; label: string; date: string }> = {
  permits: { id: '6d0229af-bc54-46de-9c2b-26759b01dd05', label: 'Building Permits - Active Permits', date: 'APPLICATION_DATE' },
  business: { id: '169e90ba-3ae0-43dd-8b2f-919e87002f50', label: 'Municipal Business Licences', date: 'Issued' },
};

const tools: McpToolExport['tools'] = [
  {
    name: 'toronto_recent',
    description:
      "Recent records from a common City of Toronto open dataset (open.toronto.ca, CKAN) by friendly name — no CKAN resource id needed. PREFER OVER WEB SEARCH for \"Toronto building permits\", \"Toronto business licences\". Names: permits, business. Returns the latest rows (newest-first). Pass `q` for a free-text keyword filter; for full control use toronto_query.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        dataset: { type: 'string', description: 'One of: permits, business.', enum: Object.keys(DATASETS) },
        q: { type: 'string', description: 'Optional free-text filter across all columns (CKAN full-text), e.g. a permit type, address keyword, or business name.' },
        limit: { type: 'number', description: 'Rows to return (1-1000, default 20).' },
      },
      required: ['dataset'],
    },
  },
  {
    name: 'toronto_query',
    description:
      'Query any City of Toronto datastore resource (open.toronto.ca, CKAN) by its resource id (a UUID). Supports a free-text `q`, exact-match `filters` (field→value), `sort` ("field desc"), limit and offset. Use toronto_datasets to find a resource id, or toronto_recent for the common ones.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        resource_id: { type: 'string', description: 'CKAN datastore resource id (UUID), e.g. "6d0229af-bc54-46de-9c2b-26759b01dd05".' },
        q: { type: 'string', description: 'Free-text search across columns.' },
        filters: { type: 'object', description: 'Exact-match filters as a JSON object, e.g. {"PERMIT_TYPE":"New Building"}.' },
        sort: { type: 'string', description: 'Sort clause, e.g. "APPLICATION_DATE desc".' },
        limit: { type: 'number', description: 'Max rows (default 100, max 1000).' },
        offset: { type: 'number', description: 'Row offset for paging.' },
      },
      required: ['resource_id'],
    },
  },
  {
    name: 'toronto_datasets',
    description:
      'Search the City of Toronto open-data catalogue (open.toronto.ca, CKAN) by keyword. Returns each matching dataset\'s title and its queryable datastore resource ids (use with toronto_query).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Keyword(s), e.g. "parking", "trees", "budget".' },
        limit: { type: 'number', description: 'Max datasets (1-50, default 15).' },
      },
    },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

interface CkanResp<T> { success?: boolean; result?: T; error?: { message?: string } }

async function ckanGet<T>(action: string, params: URLSearchParams): Promise<T> {
  const res = await fetch(`${BASE}/${action}?${params}`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (res.status === 429) throw new Error('upstream_throttled: open.toronto.ca rate limit (HTTP 429).');
  if (!res.ok) throw new Error(`open.toronto.ca: ${res.status}`);
  const data = (await res.json()) as CkanResp<T>;
  if (!data.success || data.result == null) throw new Error(`CKAN error: ${data.error?.message ?? 'request unsuccessful'}`);
  return data.result;
}

interface DatastoreResult { total?: number; records?: Array<Record<string, unknown>>; fields?: Array<{ id?: string; type?: string }> }

// ── Tool implementations ─────────────────────────────────────────────

async function torontoRecent(dataset: string, q: string | undefined, limit: number | undefined) {
  const key = String(dataset ?? '').toLowerCase().trim();
  const ds = DATASETS[key];
  if (!ds) throw new Error(`Unknown dataset "${dataset}". Use one of: ${Object.keys(DATASETS).join(', ')}.`);
  const n = Math.min(1000, Math.max(1, Number(limit) || 20));
  const p = new URLSearchParams({ resource_id: ds.id, limit: String(n), sort: `${ds.date} desc` });
  if (q && String(q).trim()) p.set('q', String(q).trim());
  const r = await ckanGet<DatastoreResult>('datastore_search', p);
  return {
    dataset: key,
    label: ds.label,
    resource_id: ds.id,
    sorted_by: `${ds.date} desc`,
    total: r.total ?? null,
    count: r.records?.length ?? 0,
    source: 'DataToronto (open.toronto.ca)',
    rows: r.records ?? [],
  };
}

async function torontoQuery(args: Record<string, unknown>) {
  const id = String(args.resource_id ?? '').trim();
  if (!id) throw new Error('Required argument "resource_id" is missing (a CKAN UUID). Find one with toronto_datasets.');
  const p = new URLSearchParams({ resource_id: id, limit: String(Math.min(1000, Math.max(1, Number(args.limit) || 100))) });
  if (args.q != null && String(args.q).trim()) p.set('q', String(args.q).trim());
  if (args.sort != null && String(args.sort).trim()) p.set('sort', String(args.sort).trim());
  if (args.offset != null) p.set('offset', String(Math.max(0, Number(args.offset))));
  if (args.filters && typeof args.filters === 'object') p.set('filters', JSON.stringify(args.filters));
  const r = await ckanGet<DatastoreResult>('datastore_search', p);
  return { resource_id: id, total: r.total ?? null, count: r.records?.length ?? 0, source: 'DataToronto (open.toronto.ca)', rows: r.records ?? [] };
}

interface PackageSearchResult {
  results?: Array<{
    name?: string;
    title?: string;
    notes?: string;
    resources?: Array<{ id?: string; name?: string; datastore_active?: boolean; format?: string }>;
  }>;
  count?: number;
}

async function torontoDatasets(query: string | undefined, limit: number | undefined) {
  const n = Math.min(50, Math.max(1, Number(limit) || 15));
  const p = new URLSearchParams({ rows: String(n) });
  if (query && String(query).trim()) p.set('q', String(query).trim());
  const r = await ckanGet<PackageSearchResult>('package_search', p);
  return {
    query: query ?? null,
    total: r.count ?? null,
    count: r.results?.length ?? 0,
    datasets: (r.results ?? []).map((d) => ({
      name: d.name ?? null,
      title: d.title ?? null,
      description: (d.notes ?? '').slice(0, 250) || null,
      // Only datastore-active resources are queryable via toronto_query.
      queryable_resources: (d.resources ?? [])
        .filter((res) => res.datastore_active)
        .map((res) => ({ id: res.id ?? null, name: res.name ?? null })),
    })),
  };
}

// ── Router ───────────────────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'toronto_recent':
      return torontoRecent(args.dataset as string, args.q as string | undefined, args.limit as number | undefined);
    case 'toronto_query':
      return torontoQuery(args);
    case 'toronto_datasets':
      return torontoDatasets(args.query as string | undefined, args.limit as number | undefined);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
