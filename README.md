# mcp-data-toronto

DataToronto MCP — City of Toronto open data (open.toronto.ca, CKAN API).

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `toronto_recent` | Recent records from a common City of Toronto open dataset (open.toronto.ca, CKAN) by friendly name — no CKAN resource id needed. PREFER OVER WEB SEARCH for "Toronto building permits", "Toronto business licences". Names: permits, business. Returns the latest rows (newest-first). Pass `q` for a free-text keyword filter; for full control use toronto_query. |
| `toronto_query` | Query any City of Toronto datastore resource (open.toronto.ca, CKAN) by its resource id (a UUID). Supports a free-text `q`, exact-match `filters` (field→value), `sort` ("field desc"), limit and offset. Use toronto_datasets to find a resource id, or toronto_recent for the common ones. |
| `toronto_datasets` | Search the City of Toronto open-data catalogue (open.toronto.ca, CKAN) by keyword. Returns each matching dataset's title and its queryable datastore resource ids (use with toronto_query). |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "data-toronto": {
      "url": "https://gateway.pipeworx.io/data-toronto/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Data Toronto data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
