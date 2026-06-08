# Flax MCP — AI-to-Flax Engine Control System

Bridge AI assistants (Claude, Cursor, etc.) directly into the Flax Engine editor via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

Inspect scenes, create and manipulate actors, manage assets, control play mode — all through natural language.

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
│   - Versioned Tools (v1)    │
└─────────────┬───────────────┘
              │ WebSocket (localhost:7777)
              ▼
┌─────────────────────────────┐
│   LAYER 2: Bridge Gateway   │
│   (Node.js)                 │
│   - Reconnect Logic         │
│   - Command Queue           │
│   - Response Correlation    │
│   - State Sync              │
└─────────────┬───────────────┘
              │ TCP/WebSocket
              ▼
┌─────────────────────────────┐
│   LAYER 3: Flax Plugin      │
│   (C++)                     │
│   - WebSocket Server :7777  │
│   - CommandRouter           │
│   - SceneController         │
│   - AssetController         │
│   - EditorStateManager      │
└─────────────────────────────┘
```

### Layer 1: MCP Server (`server/`)

TypeScript process that speaks the MCP protocol via stdio. Hosts a `ToolRegistry` for registering versioned tools, validates params with Zod schemas, and dispatches calls via the bridge.

### Layer 2: Bridge Gateway (`bridge/`)

Standalone Node.js WebSocket gateway that manages the connection to Flax. Handles reconnection with exponential backoff, command queuing, and response correlation via UUIDs.

### Layer 3: Flax Engine Plugin (`plugin/`)

Native C++ editor plugin loaded inside Flax Editor. Embeds a lightweight WebSocket server on port 7777. Routes commands through `SceneController`, `AssetController`, and `EditorStateManager`.

---

## Tools

### Scene
| Tool | Description |
|---|---|
| `get_scene_hierarchy` | Recursive actor tree of active scene |
| `create_actor` | Spawn any actor type with transform |
| `delete_actor` | Remove actor by ID |
| `move_actor` | Set or offset position |
| `rotate_actor` | Set or offset euler rotation |
| `scale_actor` | Set or offset scale |
| `duplicate_actor` | Clone an actor with optional rename |
| `select_actor` | Select one or more actors in editor |

### Assets
| Tool | Description |
|---|---|
| `import_asset` | Import external file into project |
| `assign_material` | Assign material to actor slot |
| `get_assets` | List project content recursively |

### Editor
| Tool | Description |
|---|---|
| `play_control` | Play / Stop / Pause / Step |
| `take_screenshot` | Capture editor viewport |
| `get_editor_state` | Full editor state snapshot |
| `get_active_scene` | Current scene name + path |

### Debug
| Tool | Description |
|---|---|
| `ping` | Connectivity check |
| `echo` | Echo test for bridge validation |

---

## Installation

### Prerequisites
- Node.js >= 18
- Flax Engine (with editor)
- npm or yarn

### 1. Build the MCP Server
```bash
cd server
npm install
npm run build
```

### 2. Build the Bridge (optional standalone)
```bash
cd bridge
npm install
npm run build
```

### 3. Install the Flax Plugin
- Copy `plugin/` to your Flax project's `Plugins/FlaxMcp/` directory
- Open Flax Editor and enable the plugin in **Plugins** tab
- Restart the editor — the WebSocket server starts automatically on port 7777

### 4. Configure Claude Desktop
Edit `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "flax-mcp": {
      "command": "node",
      "args": ["path/to/flax-mcp/server/dist/index.js"],
      "env": {
        "FLAX_WS_HOST": "localhost",
        "FLAX_WS_PORT": "7777"
      }
    }
  }
}
```

Restart Claude Desktop.

---

## Usage Examples

Once configured, an AI assistant can run commands like:

> "Create a directional light at position (0, 10, 0), add a StaticMesh cube at the origin, assign a metal material to it, then play the scene."

This translates to:
1. `create_actor` — DirectionalLight at (0,10,0)
2. `create_actor` — StaticMesh at (0,0,0) with mesh path
3. `assign_material` — assign material to the cube
4. `play_control` — action: "play"

---

## Protocol

### Request
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "tool": "create_actor",
  "params": {
    "name": "MyLight",
    "type": "DirectionalLight",
    "position": [0, 10, 0],
    "rotation": [45, 0, 0]
  },
  "version": "1.0"
}
```

### Response
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "success": true,
  "data": {
    "actorId": "a1b2c3d4-...",
    "name": "MyLight",
    "type": "DirectionalLight"
  },
  "error": null
}
```

---

## Extending

### Adding a new tool

**Server side** (`server/src/tools/`):
```typescript
export function createMyTools(): ToolDefinition[] {
  return [
    {
      name: "my_tool",
      version: TOOL_VERSION,
      description: "Description",
      schema: z.object({ /* zod schema */ }),
      handler: async (params, ctx) => {
        return ctx.bridge.send({
          id: ctx.requestId,
          tool: "my_tool",
          params,
          version: TOOL_VERSION,
        });
      },
    },
  ];
}
```

Register in `server/src/index.ts`:
```typescript
registry.registerBatch(createMyTools());
```

**Plugin side** (`plugin/Source/CommandRouter.cpp`):
```cpp
RegisterHandler("my_tool", &CommandRouter::HandleMyTool);
```

Implement the handler and add the corresponding controller method.

---

## Project Structure

```
flax-mcp/
├── server/                     # MCP Server (TypeScript)
│   ├── src/
│   │   ├── index.ts           # Entry point
│   │   ├── core/
│   │   │   ├── registry.ts    # Tool registry
│   │   │   ├── dispatcher.ts  # Command dispatcher
│   │   │   ├── validator.ts   # Zod schemas
│   │   │   └── types.ts       # Core types
│   │   ├── tools/
│   │   │   ├── scene.ts       # Scene manipulation
│   │   │   ├── assets.ts      # Asset management
│   │   │   ├── editor.ts      # Editor control
│   │   │   └── debug.ts       # Debug utilities
│   │   ├── bridge/
│   │   │   └── client.ts      # WebSocket client
│   │   └── utils/
│   │       ├── logger.ts      # Logging
│   │       └── errors.ts      # Error handling
│   ├── package.json
│   └── tsconfig.json
├── bridge/                     # Standalone Gateway (Node.js)
│   ├── src/
│   │   ├── index.ts           # Entry point + CLI REPL
│   │   ├── gateway.ts         # WebSocket gateway
│   │   └── protocol.ts        # Types + constants
│   ├── package.json
│   └── tsconfig.json
├── plugin/                     # Flax Engine Plugin (C++)
│   ├── FlaxMcp.Build.cs
│   └── Source/
│       ├── FlaxMcpModule.h/.cpp
│       ├── WebSocketServer.h/.cpp
│       ├── CommandRouter.h/.cpp
│       ├── SceneController.h/.cpp
│       ├── AssetController.h/.cpp
│       └── EditorStateManager.h/.cpp
├── config/
│   ├── mcp-config.json
│   └── claude_desktop_config.json
└── README.md
```

---

## Safety

The system includes a command whitelist (`FLAX_TOOL_WHITELIST` env var) that restricts which tools can be executed. Enable it in production environments:

```json
{
  "enabled": true,
  "allowedTools": [
    "get_scene_hierarchy",
    "get_editor_state",
    "get_active_scene",
    "ping"
  ]
}
```

The C++ plugin runs only in editor mode (`#if COMPILE_WITH_EDITOR`) and never affects standalone builds.

---

## License

MIT
