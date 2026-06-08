# Flax MCP — AI-to-Flax Engine Control System

Bridge AI assistants (Claude, Cursor, Windsurf, etc.) directly into the Flax Engine editor via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

Inspect scenes, create and manipulate actors, manage assets, control play mode — all through natural language.

> **Alpha** — core works, some editor APIs need refinement.

---

## Architecture

```
┌─────────────────────────────┐
│      AI Assistant           │
│  (Claude, Cursor, etc.)     │
└─────────────┬───────────────┘
              │ MCP Protocol (JSON-RPC over stdio)
              ▼
┌─────────────────────────────┐
│   LAYER 1: MCP Server       │
│   (TypeScript)              │
│   - Tool Registry           │
│   - Zod Validation          │
│   - Command Dispatcher      │
└─────────────┬───────────────┘
              │ WebSocket (localhost:7777)
              ▼
┌─────────────────────────────┐
│   LAYER 2: Bridge Gateway   │
│   (Node.js)                 │
│   - Reconnect Logic         │
│   - Command Queue           │
│   - Response Correlation    │
└─────────────┬───────────────┘
              │ TCP/WebSocket
              ▼
┌─────────────────────────────┐
│   LAYER 3: Flax Plugin      │
│   (C# GamePlugin)           │
│   - WebSocket Server :7777  │
│   - CommandRouter           │
│   - EditorReflection        │
└─────────────────────────────┘
```

---

## Quick Start

### Prerequisites
- Node.js >= 18
- Flax Engine 1.12 (editor)
- npm or yarn

### 1. Install the Flax Plugin

Copy `plugin/FlaxMcpPlugin.cs` to your project:

```
YourProject/Source/Game/FlaxMcpPlugin.cs
```

Open Flax Editor — it auto-compiles. You'll see:
```
[FlaxMcp] Plugin initialized on port 7777
```

### 2. Install Server

```bash
cd server
npm install
```

### 3. Run

```bash
# Terminal 1: MCP server (for AI assistant)
npx tsx server/src/index.ts

# Terminal 2: Bridge (for manual testing)
echo '{"tool":"ping","params":{}}' | npx tsx bridge/src/index.ts
```

---

## AI Client Setup

### Claude Desktop

Edit `claude_desktop_config.json`:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "flax-mcp": {
      "command": "npx",
      "args": [
        "tsx",
        "C:/path/to/flax-mcp/server/src/index.ts"
      ],
      "env": {
        "FLAX_WS_HOST": "localhost",
        "FLAX_WS_PORT": "7777"
      }
    }
  }
}
```

### Cursor

1. Open **Cursor Settings → Features → MCP Servers**
2. Click **+ Add New MCP Server**
3. Fill in:
   - **Name:** `flax-mcp`
   - **Type:** `command`
   - **Command:** `npx tsx C:/path/to/flax-mcp/server/src/index.ts`
4. Click **Save**

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "flax-mcp": {
      "command": "npx",
      "args": [
        "tsx",
        "C:/path/to/flax-mcp/server/src/index.ts"
      ]
    }
  }
}
```

### VS Code + Cline / Continue

**Cline:** `cline_mcp_settings.json`
**Continue:** `~/.continue/config.json`

```json
{
  "mcpServers": {
    "flax-mcp": {
      "command": "npx",
      "args": [
        "tsx",
        "C:/path/to/flax-mcp/server/src/index.ts"
      ]
    }
  }
}
```

---

## Tools (47 total)

### Core
| Tool | Description |
|------|-------------|
| `ping` | Connectivity check |
| `echo` | Echo test for bridge validation |
| `get_tool_list` | List all available tools |

### Scene — Hierarchy
| Tool | Description |
|------|-------------|
| `get_scene_hierarchy` | Recursive actor tree of active scene |
| `get_active_scene` | Current scene name + path |
| `scene_list_opened` | List all opened scenes |
| `scene_get_data` | Root actors in a scene |
| `scene_open` | Open a scene (single/additive) |
| `scene_save` | Save current scene |
| `scene_create` | Create a new scene asset |
| `scene_unload` | Unload a scene |
| `scene_set_active` | Set active scene |

### Scene — Actors
| Tool | Description |
|------|-------------|
| `create_actor` | Spawn actor (EmptyActor, StaticModel, lights, camera, etc.) |
| `delete_actor` | Remove actor by ID |
| `duplicate_actor` | Clone an actor |
| `find_actors` | Search actors by name/type |
| `select_actor` | Select actors in editor |
| `move_actor` | Set or offset position |
| `rotate_actor` | Set or offset rotation |
| `scale_actor` | Set or offset scale |
| `modify_actor` | Multi-property edit (transform, name, active) |
| `set_actor_parent` | Reparent in hierarchy |

### Scene — Components
| Tool | Description |
|------|-------------|
| `add_component` | Add a Script component to an actor |
| `get_component` | Check if component exists |
| `modify_component` | Set component properties |
| `remove_component` | Remove a component |
| `list_component_types` | All available Script types |

### Assets
| Tool | Description |
|------|-------------|
| `get_assets` | List project assets |
| `find_assets` | Search with filters (t:Texture, glob:*.flax) |
| `import_asset` | Import external file into project |
| `assign_material` | Assign material to actor slot |
| `create_asset_folder` | Create folders in Content |
| `delete_asset` | Delete an asset |
| `copy_asset` | Duplicate an asset |
| `move_asset` | Move or rename an asset |
| `refresh_assets` | Force asset database refresh |
| `create_material` | Create a new Material asset |

### Editor Control
| Tool | Description |
|------|-------------|
| `get_editor_state` | Full state snapshot (selection, play mode, FPS) |
| `play_control` | Play / Stop / Pause |
| `take_screenshot` | Capture editor viewport |
| `screenshot_camera` | Capture from a specific camera |
| `get_console_logs` | Retrieve editor logs |
| `get_project_info` | Project metadata |

### Scripting
| Tool | Description |
|------|-------------|
| `read_script` | Read a C# script file |
| `write_script` | Create or update a script |
| `delete_script` | Delete a script file |
| `execute_script` | Compile & run C# code dynamically |

---

## Manual Testing (Bridge CLI)

The bridge has a REPL mode for direct testing:

```bash
# Interactive
npx tsx bridge/src/index.ts
> {"tool":"get_scene_hierarchy","params":{}}

# Pipe a single command
echo '{"tool":"ping","params":{}}' | npx tsx bridge/src/index.ts
```

---

## Development

### Adding a tool

**Server** — add schema in `server/src/core/validator.ts` + tool def in `server/src/tools/`:
```typescript
{
  name: "my_tool",
  schema: z.object({ /* zod */ }),
  handler: async (params, ctx) => ctx.bridge.send({ tool: "my_tool", params }),
}
```

**Plugin** — register in `Router.Handlers` + implement handler method:
```csharp
{ "my_tool", MyToolHandler },
```

Register in `server/src/index.ts`:
```typescript
registry.registerBatch(createMyTools());
```

---

## Credits

<p align="center">
  <img src="https://flaxengine.com/wp-content/uploads/2020/12/logo_1_150x100.png" alt="Flax Engine Logo" width="300">
</p>

Built for **[Flax Engine](https://flaxengine.com/)** — the open-source game engine by [Flax](https://flaxengine.com/). Massive thanks to the Flax team and community for building an incredible engine with first-class C# scripting and editor extensibility.

- Flax Engine: https://flaxengine.com/
- Flax GitHub: https://github.com/FlaxEngine/FlaxEngine
- Flax Docs: https://docs.flaxengine.com/
- Flax Discord: https://discord.gg/flax

---

## Safety

Enable command whitelist via `FLAX_TOOL_WHITELIST` env var:

```json
{"enabled": true, "allowedTools": ["ping", "get_scene_hierarchy"]}
```

The C# plugin runs only in editor mode and never affects standalone builds.

---

## License

MIT
