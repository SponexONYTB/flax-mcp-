using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using FlaxEngine;

public class FlaxMcpPlugin : GamePlugin
{
    private static McpServer _server;
    private static readonly Queue<Action> _cmdQueue = new Queue<Action>();
    private static readonly object _cmdLock = new object();
    private static bool _subscribed;

    internal static void EnqueueMainThread(Action action)
    {
        lock (_cmdLock) { _cmdQueue.Enqueue(action); }
    }

    private static void OnScriptingUpdate()
    {
        Action action = null;
        lock (_cmdLock)
        {
            if (_cmdQueue.Count > 0) action = _cmdQueue.Dequeue();
        }
        if (action != null)
        {
            try { action(); }
            catch (Exception ex) { Debug.Log("[FlaxMcp] Command error: " + ex.Message); }
        }
    }

    static FlaxMcpPlugin()
    {
        AppDomain.CurrentDomain.DomainUnload += (_, _) => StopServer();
        StartServer();
    }

    private static void StopServer()
    {
        var srv = _server;
        _server = null;
        if (srv != null) { try { srv.Stop(); } catch { } }
    }

    private static void StartServer()
    {
        try
        {
            _server = new McpServer();
            _server.Start();
            Debug.Log("[FlaxMcp] Plugin initialized on port 7777");
        }
        catch (Exception ex)
        {
            Debug.Log("[FlaxMcp] Server already running (hot-reload): " + ex.Message);
        }
    }

    public override void Initialize()
    {
        base.Initialize();
        StartServer();
        if (!_subscribed)
        {
            Scripting.Update += OnScriptingUpdate;
            _subscribed = true;
            Debug.Log("[FlaxMcp] Subscribed to Scripting.Update");
        }
    }

    public override void Deinitialize()
    {
        if (_subscribed)
        {
            Scripting.Update -= OnScriptingUpdate;
            _subscribed = false;
        }
        StopServer();
        Debug.Log("[FlaxMcp] Plugin deinitialized");
        base.Deinitialize();
    }
}

#region WebSocket Server

internal class McpServer
{
    private TcpListener _listener;
    private Thread _acceptThread;
    private volatile bool _stopped;

    public void Start()
    {
        _stopped = false;
        _listener = new TcpListener(IPAddress.Loopback, 7777);
        _listener.Start();
        _acceptThread = new Thread(AcceptLoop) { IsBackground = true, Name = "FlaxMcp" };
        _acceptThread.Start();
    }

    public void Stop()
    {
        _stopped = true;
        try { _listener?.Stop(); } catch { }
        _listener = null;
        _acceptThread = null;
    }

    private void AcceptLoop()
    {
        while (!_stopped)
        {
            try
            {
                var client = _listener.AcceptTcpClient();
                var handler = new ClientHandler(client);
                var t = new Thread(handler.Run) { IsBackground = true, Name = "FlaxMcp-C" };
                t.Start();
            }
            catch
            {
                if (_stopped) break;
            }
        }
    }

}

internal class ClientHandler
{
    private static readonly byte[] WsGuid = Encoding.UTF8.GetBytes("258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    private readonly TcpClient _client;
    private NetworkStream _stream;
    private bool _handshakeDone;

    public ClientHandler(TcpClient client) => _client = client;

    public void Run()
    {
        try
        {
            _stream = _client.GetStream();
            var buf = new byte[8192];

            while (_client.Connected)
            {
                int n = _stream.Read(buf, 0, buf.Length);
                if (n == 0) break;

                if (!_handshakeDone)
                {
                    DoHandshake(Encoding.UTF8.GetString(buf, 0, n));
                    _handshakeDone = true;
                    continue;
                }

                var text = Decode(buf, n);
                if (text == null) continue;

                var resp = DispatchViaProcessor(text);

                var frame = Encode(resp);
                _stream.Write(frame, 0, frame.Length);
            }
        }
        catch (Exception ex)
        {
            if (ex is ObjectDisposedException || ex is IOException) { /* normal disconnect */ }
            else Debug.Log("[FlaxMcp] Client error: " + ex.Message);
        }
        finally
        {
            _stream?.Close();
            _client?.Close();
        }
    }

    private static string DispatchViaProcessor(string text)
    {
        // Scripting.Update doesn't fire in editor mode, so execute directly
        return Router.Dispatch(text);
    }

    private void DoHandshake(string request)
    {
        string key = null;
        var lines = request.Split(new[] { "\r\n" }, StringSplitOptions.None);
        foreach (var line in lines)
        {
            if (line.StartsWith("Sec-WebSocket-Key:", StringComparison.OrdinalIgnoreCase))
            {
                key = line.Substring("Sec-WebSocket-Key:".Length).Trim();
                break;
            }
        }
        if (key == null) return;

        using (var sha1 = SHA1.Create())
        {
            var combined = new byte[Encoding.UTF8.GetByteCount(key) + WsGuid.Length];
            int len = Encoding.UTF8.GetBytes(key, 0, key.Length, combined, 0);
            Buffer.BlockCopy(WsGuid, 0, combined, len, WsGuid.Length);
            var hash = sha1.ComputeHash(combined);
            var accept = Convert.ToBase64String(hash);
            var resp = $"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n";
            _stream.Write(Encoding.UTF8.GetBytes(resp), 0, resp.Length);
        }
    }

    private static string Decode(byte[] buf, int len)
    {
        if (len < 2 || (buf[0] & 0x0F) != 1) return null;
        bool masked = (buf[1] & 0x80) != 0;
        int off = 2;
        int payLen = buf[1] & 0x7F;
        if (payLen == 126) { payLen = (buf[2] << 8) | buf[3]; off = 4; }
        else if (payLen == 127) { payLen = 0; for (int i = 0; i < 8; i++) payLen = (payLen << 8) | buf[2 + i]; off = 10; }
        var payload = new byte[payLen];
        if (masked)
        {
            for (int i = 0; i < payLen; i++) payload[i] = (byte)(buf[off + 4 + i] ^ buf[off + (i & 3)]);
        }
        else
        {
            Buffer.BlockCopy(buf, off, payload, 0, payLen);
        }
        return Encoding.UTF8.GetString(payload);
    }

    private static byte[] Encode(string text)
    {
        var data = Encoding.UTF8.GetBytes(text);
        using (var ms = new MemoryStream())
        {
            ms.WriteByte(0x81);
            if (data.Length < 126) { ms.WriteByte((byte)data.Length); }
            else if (data.Length < 65536) { ms.WriteByte(126); ms.WriteByte((byte)((data.Length >> 8) & 0xFF)); ms.WriteByte((byte)(data.Length & 0xFF)); }
            else { ms.WriteByte(127); for (int i = 7; i >= 0; i--) ms.WriteByte((byte)((data.Length >> (i * 8)) & 0xFF)); }
            ms.Write(data, 0, data.Length);
            return ms.ToArray();
        }
    }
}

#endregion

#region JSON Helpers

internal static class Json
{
    public static string Encode(object obj)
    {
        var sb = new StringBuilder();
        WriteValue(sb, obj);
        return sb.ToString();
    }

    private static void WriteValue(StringBuilder sb, object val)
    {
        if (val == null) { sb.Append("null"); }
        else if (val is bool b) { sb.Append(b ? "true" : "false"); }
        else if (val is int i) { sb.Append(i); }
        else if (val is long l) { sb.Append(l); }
        else if (val is float f) { sb.Append(f.ToString("G")); }
        else if (val is double d) { sb.Append(d.ToString("G")); }
        else if (val is string s) { WriteString(sb, s); }
        else if (val is IDictionary dict) { WriteDict(sb, dict); }
        else if (val is IList list) { WriteList(sb, list); }
        else if (val is IEnumerable en) { WriteList(sb, en); }
        else if (val is Vector3 v3) { sb.Append("["); sb.Append(v3.X.ToString("G")); sb.Append(","); sb.Append(v3.Y.ToString("G")); sb.Append(","); sb.Append(v3.Z.ToString("G")); sb.Append("]"); }
        else { WriteString(sb, val.ToString()); }
    }

    private static void WriteString(StringBuilder sb, string s)
    {
        sb.Append('"');
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default: sb.Append(c); break;
            }
        }
        sb.Append('"');
    }

    private static void WriteDict(StringBuilder sb, IDictionary d)
    {
        sb.Append('{');
        bool first = true;
        foreach (DictionaryEntry e in d)
        {
            if (!first) sb.Append(',');
            WriteString(sb, e.Key?.ToString() ?? "");
            sb.Append(':');
            WriteValue(sb, e.Value);
            first = false;
        }
        sb.Append('}');
    }

    private static void WriteList(StringBuilder sb, IEnumerable list)
    {
        sb.Append('[');
        bool first = true;
        foreach (var item in list)
        {
            if (!first) sb.Append(',');
            WriteValue(sb, item);
            first = false;
        }
        sb.Append(']');
    }

    public static (string id, string tool, Dictionary<string, object> args) ParseRequest(string json)
    {
        string id = "", tool = "";
        var args = new Dictionary<string, object>();
        if (string.IsNullOrEmpty(json)) return (id, tool, args);

        int pos = 0;
        SkipWhitespace(json, ref pos);
        if (pos >= json.Length || json[pos] != '{') return (id, tool, args);
        pos++;

        while (pos < json.Length)
        {
            SkipWhitespace(json, ref pos);
            if (pos >= json.Length || json[pos] == '}') break;
            if (json[pos] != '"') { pos++; continue; }

            var key = ReadString(json, ref pos);
            SkipWhitespace(json, ref pos);
            if (pos >= json.Length || json[pos] != ':') continue;
            pos++;
            SkipWhitespace(json, ref pos);

            if (key == "tool") tool = ReadJsonValue(json, ref pos)?.ToString() ?? "";
            else if (key == "id") id = ReadJsonValue(json, ref pos)?.ToString() ?? "";
            else if (key == "version") ReadJsonValue(json, ref pos);
            else if (key == "params") args = ReadJsonObject(json, ref pos) ?? args;
            else ReadJsonValue(json, ref pos);

            SkipWhitespace(json, ref pos);
            if (pos < json.Length && json[pos] == ',') pos++;
        }
        return (id, tool, args);
    }

    private static string ReadString(string json, ref int pos)
    {
        if (pos >= json.Length || json[pos] != '"') return "";
        pos++;
        var sb = new StringBuilder();
        while (pos < json.Length)
        {
            char c = json[pos++];
            if (c == '"') break;
            if (c == '\\' && pos < json.Length) { sb.Append(json[pos++]); }
            else sb.Append(c);
        }
        return sb.ToString();
    }

    private static object ReadJsonValue(string json, ref int pos)
    {
        SkipWhitespace(json, ref pos);
        if (pos >= json.Length) return null;
        char c = json[pos];
        if (c == '"') return ReadString(json, ref pos);
        if (c == '{') return ReadJsonObject(json, ref pos);
        if (c == '[') return ReadJsonArray(json, ref pos);
        if (c == 't' || c == 'f') return ReadBool(json, ref pos);
        if (c == 'n') { pos += 4; return null; }
        return ReadNumber(json, ref pos);
    }

    private static Dictionary<string, object> ReadJsonObject(string json, ref int pos)
    {
        if (pos >= json.Length || json[pos] != '{') return null;
        pos++;
        var result = new Dictionary<string, object>();
        while (pos < json.Length)
        {
            SkipWhitespace(json, ref pos);
            if (pos >= json.Length || json[pos] == '}') { pos++; return result; }
            if (json[pos] != '"') { pos++; continue; }
            var key = ReadString(json, ref pos);
            SkipWhitespace(json, ref pos);
            if (pos < json.Length && json[pos] == ':') pos++;
            SkipWhitespace(json, ref pos);
            result[key] = ReadJsonValue(json, ref pos);
            SkipWhitespace(json, ref pos);
            if (pos < json.Length && json[pos] == ',') pos++;
        }
        return result;
    }

    private static List<object> ReadJsonArray(string json, ref int pos)
    {
        if (pos >= json.Length || json[pos] != '[') return null;
        pos++;
        var result = new List<object>();
        while (pos < json.Length)
        {
            SkipWhitespace(json, ref pos);
            if (pos >= json.Length || json[pos] == ']') { pos++; return result; }
            result.Add(ReadJsonValue(json, ref pos));
            SkipWhitespace(json, ref pos);
            if (pos < json.Length && json[pos] == ',') pos++;
        }
        return result;
    }

    private static bool ReadBool(string json, ref int pos)
    {
        if (pos + 4 < json.Length && json.Substring(pos, 4) == "true") { pos += 4; return true; }
        if (pos + 5 < json.Length && json.Substring(pos, 5) == "false") { pos += 5; return false; }
        return false;
    }

    private static object ReadNumber(string json, ref int pos)
    {
        int start = pos;
        while (pos < json.Length && (char.IsDigit(json[pos]) || json[pos] == '.' || json[pos] == '-' || json[pos] == '+' || json[pos] == 'e' || json[pos] == 'E')) pos++;
        var num = json.Substring(start, pos - start);
        if (num.Contains('.') || num.Contains('e') || num.Contains('E'))
            return double.TryParse(num, out var d) ? (object)d : num;
        return long.TryParse(num, out var l) ? (object)l : num;
    }

    private static void SkipWhitespace(string json, ref int pos)
    {
        while (pos < json.Length && (json[pos] == ' ' || json[pos] == '\t' || json[pos] == '\n' || json[pos] == '\r')) pos++;
    }

    public static string ToJson(object obj) => Encode(obj);
}

#endregion

#region Command Router

internal static class Router
{
    private static readonly Dictionary<string, Func<Dictionary<string, object>, object>> Handlers =
        new Dictionary<string, Func<Dictionary<string, object>, object>>(StringComparer.OrdinalIgnoreCase)
    {
        { "ping", Ping },
        { "echo", Echo },
        { "get_editor_state", GetEditorState },
        { "get_active_scene", GetActiveScene },
        { "get_scene_hierarchy", GetSceneHierarchy },
        { "create_actor", CreateActor },
        { "delete_actor", DeleteActor },
        { "move_actor", MoveActor },
        { "rotate_actor", RotateActor },
        { "scale_actor", ScaleActor },
        { "duplicate_actor", DuplicateActor },
        { "select_actor", SelectActor },
        { "import_asset", ImportAsset },
        { "assign_material", AssignMaterial },
        { "get_assets", GetAssets },
        { "play_control", PlayControl },
        { "take_screenshot", TakeScreenshot },
        // Scene management
        { "scene_open", SceneOpen },
        { "scene_save", SceneSave },
        { "scene_create", SceneCreate },
        { "scene_unload", SceneUnload },
        { "scene_set_active", SceneSetActive },
        { "scene_list_opened", SceneListOpened },
        { "scene_get_data", SceneGetData },
        // Actor/GameObject extended
        { "find_actors", FindActors },
        { "set_actor_parent", SetActorParent },
        { "modify_actor", ModifyActor },
        { "add_component", AddComponent },
        { "get_component", GetComponent },
        { "modify_component", ModifyComponent },
        { "remove_component", RemoveComponent },
        { "list_component_types", ListComponentTypes },
        // Asset management
        { "find_assets", FindAssets },
        { "create_asset_folder", CreateAssetFolder },
        { "delete_asset", DeleteAsset },
        { "copy_asset", CopyAsset },
        { "move_asset", MoveAsset },
        { "refresh_assets", RefreshAssets },
        { "create_material", CreateMaterial },
        // Script tools
        { "read_script", ReadScript },
        { "write_script", WriteScript },
        { "delete_script", DeleteScript },
        { "execute_script", ExecuteScript },
        // Editor / Console
        { "get_console_logs", GetConsoleLogs },
        { "get_project_info", GetProjectInfo },
        { "screenshot_camera", ScreenshotCamera },
    };

    public static string Dispatch(string json)
    {
        try
        {
            var (id, tool, args) = Json.ParseRequest(json);
            if (string.IsNullOrEmpty(tool))
                return Respond(id, false, null, "Missing 'tool'");

            if (!Handlers.TryGetValue(tool, out var handler))
                return Respond(id, false, null, $"Unknown tool: '{tool}'");

            var result = handler(args);
            return Respond(id, true, result, null);
        }
        catch (Exception ex)
        {
            Debug.Log("[FlaxMcp] Error: " + ex.Message);
            return Respond(null, false, null, ex.Message);
        }
    }

    public static string ErrorResponse(string message) => Respond(null, false, null, message);

    private static string Respond(string id, bool success, object data, string error)
    {
        var sb = new StringBuilder();
        sb.Append("{\"id\":");
        sb.Append(Json.Encode(id ?? ""));
        sb.Append(",\"success\":");
        sb.Append(success ? "true" : "false");
        sb.Append(",\"data\":");
        sb.Append(data != null ? Json.Encode(data) : "null");
        sb.Append(",\"error\":");
        sb.Append(error != null ? Json.Encode(error) : "null");
        sb.Append("}");
        return sb.ToString();
    }

    private static T V<T>(Dictionary<string, object> d, string k, T def = default)
    {
        if (d != null && d.TryGetValue(k, out var v) && v != null)
        {
            try { return (T)Convert.ChangeType(v, typeof(T)); } catch { }
        }
        return def;
    }

    private static float GV3(Dictionary<string, object> d, string k, int idx, float def)
    {
        if (d != null && d.TryGetValue(k, out var v) && v is List<object> list && list.Count > idx)
        {
            try { return Convert.ToSingle(list[idx]); } catch { }
        }
        return def;
    }

    private static Actor FindActor(Dictionary<string, object> d)
    {
        var id = V<string>(d, "actorId");
        if (string.IsNullOrEmpty(id) || !Guid.TryParse(id, out var guid)) return null;
        return Level.FindActor(guid);
    }

    private static int CountAllActors()
    {
        int count = 0;
        var scenes = Level.Scenes;
        if (scenes == null) return 0;
        foreach (var scene in scenes)
            CountActorChildren(scene, ref count);
        return count;
    }

    private static void CountActorChildren(Actor actor, ref int count)
    {
        count++;
        foreach (var child in actor.Children)
            if (child is Actor a) CountActorChildren(a, ref count);
    }

    private static EditorReflection _editor;
    private static EditorReflection Editor => _editor ?? (_editor = new EditorReflection());

    // === Handlers ===

    private static object Ping(Dictionary<string, object> args)
    {
        return new Dictionary<string, object> { { "status", "ok" }, { "timestamp", DateTime.UtcNow.ToString("O") } };
    }

    private static object Echo(Dictionary<string, object> args) => args;

    private static object GetEditorState(Dictionary<string, object> args)
    {
        var selectedIds = new List<string>();
        var sel = Editor.GetSelection();
        if (sel != null)
            foreach (var a in sel) selectedIds.Add(a.ID.ToString());

        var scenes = Level.Scenes;
        var result = new Dictionary<string, object>
        {
            { "playMode", Engine.IsPlayMode ? "playing" : "stopped" },
            { "isPaused", false },
            { "activeScene", (scenes != null && scenes.Length > 0) ? scenes[0].Name : "" },
            { "selectedActorIds", selectedIds },
            { "fps", (long)(1.0 / Math.Max(Time.DeltaTime, 0.0001)) },
            { "totalActorCount", CountAllActors() },
        };
        return result;
    }

    private static object GetActiveScene(Dictionary<string, object> args)
    {
        var scenes = Level.Scenes;
        if (scenes != null && scenes.Length > 0)
            return new Dictionary<string, object> { { "name", scenes[0].Name }, { "path", scenes[0].Path } };
        return new Dictionary<string, object> { { "name", "" }, { "path", "" } };
    }

    private static object GetSceneHierarchy(Dictionary<string, object> args)
    {
        var maxDepth = V(args, "maxDepth", 10);
        var sceneName = V<string>(args, "sceneName");
        Scene target = null;
        var scenes = Level.Scenes;
        if (scenes != null)
        {
            foreach (var s in scenes)
                if (string.IsNullOrEmpty(sceneName) || s.Name == sceneName) { target = s; break; }
        }
        if (target == null)
            return new Dictionary<string, object> { { "sceneName", "" }, { "actors", new List<object>() } };
        var list = new List<object>();
        foreach (var c in target.Children)
            if (c is Actor a) list.Add(BuildActorTree(a, 0, maxDepth));
        return new Dictionary<string, object> { { "sceneName", target.Name }, { "actors", list } };
    }

    private static object BuildActorTree(Actor a, int depth, int maxDepth)
    {
        var p = a.Position;
        var r = a.EulerAngles;
        var s = a.Scale;
        var children = new List<object>();
        if (depth < maxDepth)
        {
            foreach (var c in a.Children)
                if (c is Actor ca) children.Add(BuildActorTree(ca, depth + 1, maxDepth));
        }
        var result = new Dictionary<string, object>
        {
            { "id", a.ID.ToString() },
            { "name", a.Name },
            { "type", a.GetType().Name },
            { "transform", new Dictionary<string, object>
                {
                    { "position", new List<double> { p.X, p.Y, p.Z } },
                    { "rotation", new List<double> { r.X, r.Y, r.Z } },
                    { "scale", new List<double> { s.X, s.Y, s.Z } },
                }
            },
            { "children", children },
        };
        return result;
    }

    private static object CreateActor(Dictionary<string, object> args)
    {
        var name = V<string>(args, "name") ?? "NewActor";
        var typeStr = V<string>(args, "type") ?? "EmptyActor";
        var px = GV3(args, "position", 0, 0);
        var py = GV3(args, "position", 1, 0);
        var pz = GV3(args, "position", 2, 0);
        var rx = GV3(args, "rotation", 0, 0);
        var ry = GV3(args, "rotation", 1, 0);
        var rz = GV3(args, "rotation", 2, 0);
        var sx = GV3(args, "scale", 0, 1);
        var sy = GV3(args, "scale", 1, 1);
        var sz = GV3(args, "scale", 2, 1);
        var parentId = V<string>(args, "parentId");
        var meshPath = V<string>(args, "staticMeshPath");

        Actor actor = null;
        switch (typeStr)
        {
            case "StaticMesh":
            case "StaticModel":
                var sm = new StaticModel();
                if (!string.IsNullOrEmpty(meshPath))
                {
                    var model = Content.LoadAsync<Model>(meshPath);
                    if (model != null) sm.Model = model;
                }
                actor = sm;
                break;
            case "DirectionalLight": actor = new DirectionalLight(); break;
            case "PointLight": actor = new PointLight(); break;
            case "SpotLight": actor = new SpotLight(); break;
            case "Camera": actor = new Camera(); break;
            case "BoxBrush": actor = new BoxBrush(); break;
            case "Decal": actor = new Decal(); break;
            case "Sky": actor = new Sky(); break;
            case "AudioSource": actor = new AudioSource(); break;
            default: actor = new EmptyActor(); break;
        }
        if (actor == null) throw new Exception("Failed to create actor");

        actor.Name = name;
        actor.Position = new Vector3((float)px, (float)py, (float)pz);
        actor.Orientation = Quaternion.Euler(new Vector3((float)rx, (float)ry, (float)rz));
        actor.Scale = new Vector3((float)sx, (float)sy, (float)sz);
        if (!string.IsNullOrEmpty(parentId) && Guid.TryParse(parentId, out var pg))
        {
            var p = Level.FindActor(pg);
            if (p != null) actor.Parent = p;
        }
        Level.SpawnActor(actor);

        Editor.Select(actor);
        return new Dictionary<string, object> { { "actorId", actor.ID.ToString() }, { "name", name }, { "type", typeStr } };
    }

    private static object DeleteActor(Dictionary<string, object> args)
    {
        var actor = FindActor(args);
        if (actor == null) throw new Exception("Actor not found");
        FlaxEngine.Object.Destroy(actor);
        return new Dictionary<string, object> { { "deleted", true } };
    }

    private static object MoveActor(Dictionary<string, object> args)
    {
        var actor = FindActor(args);
        if (actor == null) throw new Exception("Actor not found");
        var px = GV3(args, "position", 0, 0);
        var py = GV3(args, "position", 1, 0);
        var pz = GV3(args, "position", 2, 0);
        var rel = V(args, "relative", false);
        var pos = new Vector3((float)px, (float)py, (float)pz);
        actor.Position = rel ? actor.Position + pos : pos;
        return new Dictionary<string, object>
        {
            { "actorId", V<string>(args, "actorId") },
            { "position", new List<double> { actor.Position.X, actor.Position.Y, actor.Position.Z } }
        };
    }

    private static object RotateActor(Dictionary<string, object> args)
    {
        var actor = FindActor(args);
        if (actor == null) throw new Exception("Actor not found");
        var rx = GV3(args, "rotation", 0, 0);
        var ry = GV3(args, "rotation", 1, 0);
        var rz = GV3(args, "rotation", 2, 0);
        var rel = V(args, "relative", false);
        var q = Quaternion.Euler(new Vector3((float)rx, (float)ry, (float)rz));
        actor.Orientation = rel ? actor.Orientation * q : q;
        var e = actor.EulerAngles;
        return new Dictionary<string, object>
        {
            { "actorId", V<string>(args, "actorId") },
            { "rotation", new List<double> { e.X, e.Y, e.Z } }
        };
    }

    private static object ScaleActor(Dictionary<string, object> args)
    {
        var actor = FindActor(args);
        if (actor == null) throw new Exception("Actor not found");
        var sx = GV3(args, "scale", 0, 1);
        var sy = GV3(args, "scale", 1, 1);
        var sz = GV3(args, "scale", 2, 1);
        var rel = V(args, "relative", false);
        var scale = new Vector3((float)sx, (float)sy, (float)sz);
        actor.Scale = rel ? actor.Scale * scale : scale;
        var sc = actor.Scale;
        return new Dictionary<string, object>
        {
            { "actorId", V<string>(args, "actorId") },
            { "scale", new List<double> { sc.X, sc.Y, sc.Z } }
        };
    }

    private static object DuplicateActor(Dictionary<string, object> args)
    {
        var actor = FindActor(args);
        if (actor == null) throw new Exception("Actor not found");
        var clone = (Actor)actor.Clone();
        clone.Name = V<string>(args, "newName") ?? actor.Name + "_Copy";
        Level.SpawnActor(clone);
        return new Dictionary<string, object>
        {
            { "actorId", actor.ID.ToString() },
            { "newActorId", clone.ID.ToString() }
        };
    }

    private static object SelectActor(Dictionary<string, object> args)
    {
        if (!args.TryGetValue("actorIds", out var idsObj) || !(idsObj is List<object> ids))
            throw new Exception("Missing 'actorIds' array");
        var additive = V(args, "additive", false);
        var actors = new List<Actor>();
        foreach (var idStr in ids)
        {
            if (Guid.TryParse(idStr?.ToString(), out var g))
            {
                var a = Level.FindActor(g);
                if (a != null) actors.Add(a);
            }
        }
        Editor.Select(actors, additive);
        return new Dictionary<string, object> { { "selected", (long)actors.Count }, { "additive", additive } };
    }

    private static object ImportAsset(Dictionary<string, object> args)
    {
        var src = V<string>(args, "sourcePath");
        var dst = V<string>(args, "destinationPath");
        if (string.IsNullOrEmpty(src) || string.IsNullOrEmpty(dst))
            throw new Exception("Both 'sourcePath' and 'destinationPath' are required");
        Editor.Import(src, dst);
        return new Dictionary<string, object> { { "source", src }, { "destination", dst } };
    }

    private static object AssignMaterial(Dictionary<string, object> args)
    {
        var actor = FindActor(args);
        if (actor == null) throw new Exception("Actor not found");
        var sm = actor as StaticModel;
        if (sm == null) throw new Exception("Actor is not a StaticModel");
        var matPath = V<string>(args, "materialPath");
        var slot = V(args, "materialSlotIndex", 0);
        var mat = Content.LoadAsync<Material>(matPath);
        if (mat == null) throw new Exception("Material not found: " + matPath);
        var model = sm.Model;
        if (model == null) throw new Exception("Actor has no model assigned");
        var slots = model.MaterialSlots;
        if (slots == null || slot < 0 || slot >= slots.Length)
            throw new Exception("Invalid material slot index");
        slots[slot].Material = mat;
        return new Dictionary<string, object> { { "actorId", V<string>(args, "actorId") }, { "slot", (long)slot }, { "material", matPath } };
    }

    private static object GetAssets(Dictionary<string, object> args)
    {
        var filter = V<string>(args, "filter") ?? "";
        var max = V(args, "maxResults", 100);
        var list = new List<object>();
        var ids = Content.GetAllAssets();
        if (ids == null) return list;
        int c = 0;
        foreach (var id in ids)
        {
            if (c++ >= max) break;
            AssetInfo info;
            if (!Content.GetAssetInfo(id, out info)) continue;
            var name = System.IO.Path.GetFileNameWithoutExtension(info.Path);
            if (!string.IsNullOrEmpty(filter) && !name.Contains(filter, StringComparison.OrdinalIgnoreCase))
                continue;
            list.Add(new Dictionary<string, object>
            {
                { "id", info.ID.ToString() },
                { "name", name },
                { "path", info.Path },
                { "type", info.TypeName }
            });
        }
        return list;
    }

    private static object PlayControl(Dictionary<string, object> args)
    {
        var action = V<string>(args, "action");
        switch (action)
        {
            case "play": Editor.RequestPlay(); break;
            case "stop": Editor.RequestStop(); break;
            case "pause": Editor.RequestPause(); break;
            default: throw new Exception($"Unknown action: '{action}'");
        }
        return new Dictionary<string, object> { { "action", action }, { "state", Engine.IsPlayMode ? "playing" : "stopped" } };
    }

    private static object TakeScreenshot(Dictionary<string, object> args)
    {
        var filename = V<string>(args, "filename") ?? "screenshot.png";
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "FlaxMcpScreenshots");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, filename);
        Editor.TakeScreenshot(path);
        return new Dictionary<string, object> { { "path", path }, { "width", (long)V(args, "width", 1920) }, { "height", (long)V(args, "height", 1080) } };
    }

    // ========== Scene Management ==========

    private static object SceneOpen(Dictionary<string, object> args)
    {
        var path = V<string>(args, "path");
        var mode = V<string>(args, "mode") ?? "single";
        Editor.OpenScene(path, mode);
        return new Dictionary<string, object> { { "path", path }, { "mode", mode } };
    }

    private static object SceneSave(Dictionary<string, object> args)
    {
        var path = V<string>(args, "path");
        if (!string.IsNullOrEmpty(path))
            Editor.SaveScene(path);
        else
            Editor.SaveScene();
        return new Dictionary<string, object> { { "saved", true }, { "path", path ?? "(current)" } };
    }

    private static object SceneCreate(Dictionary<string, object> args)
    {
        var name = V<string>(args, "name");
        var dir = Path.Combine(Globals.ProjectFolder, "Content", "Scenes");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, name + ".flax");
        Editor.CreateScene(path);
        Editor.OpenScene(path, "single");
        return new Dictionary<string, object> { { "path", path }, { "name", name } };
    }

    private static object SceneUnload(Dictionary<string, object> args)
    {
        var name = V<string>(args, "sceneName");
        var scenes = Level.Scenes;
        if (scenes != null)
        {
            foreach (var s in scenes)
            {
                if (s.Name == name)
                {
                    Level.UnloadScene(s);
                    return new Dictionary<string, object> { { "unloaded", name } };
                }
            }
        }
        throw new Exception("Scene not found: " + name);
    }

    private static object SceneSetActive(Dictionary<string, object> args)
    {
        var name = V<string>(args, "sceneName");
        var scenes = Level.Scenes;
        if (scenes != null)
        {
            foreach (var s in scenes)
            {
                if (s.Name == name)
                {
                    Editor.SetActiveScene(s);
                    return new Dictionary<string, object> { { "activeScene", name } };
                }
            }
        }
        throw new Exception("Scene not found: " + name);
    }

    private static object SceneListOpened(Dictionary<string, object> args)
    {
        var scenes = Level.Scenes;
        var list = new List<object>();
        if (scenes != null)
        {
            foreach (var s in scenes)
            {
                list.Add(new Dictionary<string, object>
                {
                    { "name", s.Name },
                    { "path", s.Path },
                    { "isActive", s.IsActive },
                });
            }
        }
        return list;
    }

    private static object SceneGetData(Dictionary<string, object> args)
    {
        var sceneName = V<string>(args, "sceneName");
        var scenes = Level.Scenes;
        Scene target = null;
        if (scenes != null)
        {
            foreach (var s in scenes)
                if (string.IsNullOrEmpty(sceneName) || s.Name == sceneName) { target = s; break; }
        }
        if (target == null) return new List<object>();
        var roots = new List<object>();
        foreach (var c in target.Children)
        {
            if (c is Actor a)
            {
                roots.Add(new Dictionary<string, object>
                {
                    { "id", a.ID.ToString() },
                    { "name", a.Name },
                    { "type", a.GetType().Name },
                });
            }
        }
        return new Dictionary<string, object> { { "sceneName", target.Name }, { "rootActors", roots } };
    }

    // ========== Actor / GameObject Extended ==========

    private static object FindActors(Dictionary<string, object> args)
    {
        var nameFilter = V<string>(args, "name");
        var typeFilter = V<string>(args, "type");
        var maxResults = V(args, "maxResults", 50);
        var results = new List<object>();
        int count = 0;
        var scenes = Level.Scenes;
        if (scenes == null) return results;
        foreach (var scene in scenes)
        {
            if (count >= maxResults) break;
            CollectActors(scene, results, nameFilter, typeFilter, ref count, maxResults);
        }
        return results;
    }

    private static void CollectActors(Actor parent, List<object> results, string nameFilter, string typeFilter, ref int count, int max)
    {
        if (count >= max) return;
        if (!string.IsNullOrEmpty(nameFilter) && parent.Name.Contains(nameFilter, StringComparison.OrdinalIgnoreCase))
        {
            results.Add(new Dictionary<string, object>
            {
                { "id", parent.ID.ToString() },
                { "name", parent.Name },
                { "type", parent.GetType().Name },
            });
            count++;
        }
        if (!string.IsNullOrEmpty(typeFilter) && parent.GetType().Name.Contains(typeFilter, StringComparison.OrdinalIgnoreCase))
        {
            results.Add(new Dictionary<string, object>
            {
                { "id", parent.ID.ToString() },
                { "name", parent.Name },
                { "type", parent.GetType().Name },
            });
            count++;
        }
        if (string.IsNullOrEmpty(nameFilter) && string.IsNullOrEmpty(typeFilter) && parent is Scene)
        {
            // Include scene roots when no filter
        }
        foreach (var c in parent.Children)
            if (c is Actor a) CollectActors(a, results, nameFilter, typeFilter, ref count, max);
    }

    private static object SetActorParent(Dictionary<string, object> args)
    {
        var actor = FindActor(args);
        if (actor == null) throw new Exception("Actor not found");
        var parentId = V<string>(args, "parentId");
        var wps = V(args, "worldPositionStays", true);
        if (string.IsNullOrEmpty(parentId))
        {
            actor.Parent = null;
        }
        else
        {
            if (!Guid.TryParse(parentId, out var pg)) throw new Exception("Invalid parentId");
            var parent = Level.FindActor(pg);
            if (parent == null) throw new Exception("Parent actor not found");
            actor.Parent = parent;
        }
        return new Dictionary<string, object>
        {
            { "actorId", V<string>(args, "actorId") },
            { "parentId", parentId ?? "" }
        };
    }

    private static object ModifyActor(Dictionary<string, object> args)
    {
        var actor = FindActor(args);
        if (actor == null) throw new Exception("Actor not found");
        var rel = V(args, "relative", false);

        if (args.ContainsKey("name")) actor.Name = V<string>(args, "name");
        if (args.ContainsKey("position"))
        {
            var v = new Vector3(GV3(args, "position", 0, 0), GV3(args, "position", 1, 0), GV3(args, "position", 2, 0));
            actor.Position = rel ? actor.Position + v : v;
        }
        if (args.ContainsKey("rotation"))
        {
            var v = new Vector3(GV3(args, "rotation", 0, 0), GV3(args, "rotation", 1, 0), GV3(args, "rotation", 2, 0));
            var q = Quaternion.Euler(v);
            actor.Orientation = rel ? actor.Orientation * q : q;
        }
        if (args.ContainsKey("scale"))
        {
            var v = new Vector3(GV3(args, "scale", 0, 1), GV3(args, "scale", 1, 1), GV3(args, "scale", 2, 1));
            actor.Scale = rel ? actor.Scale * v : v;
        }
        if (args.ContainsKey("isActive")) actor.IsActive = V(args, "isActive", true);

        var p = actor.Position;
        var r = actor.EulerAngles;
        var s = actor.Scale;
        return new Dictionary<string, object>
        {
            { "actorId", actor.ID.ToString() },
            { "name", actor.Name },
            { "position", new List<double> { p.X, p.Y, p.Z } },
            { "rotation", new List<double> { r.X, r.Y, r.Z } },
            { "scale", new List<double> { s.X, s.Y, s.Z } },
            { "isActive", actor.IsActive },
        };
    }

    private static object AddComponent(Dictionary<string, object> args)
    {
        var actor = FindActor(args);
        if (actor == null) throw new Exception("Actor not found");
        var typeName = V<string>(args, "typeName");
        // Try to find a Script type with the given name
        var scriptType = FindScriptType(typeName);
        if (scriptType == null)
            throw new Exception("Component type not found: " + typeName);
        var script = (Script)actor.AddScript(scriptType);
        return new Dictionary<string, object>
        {
            { "actorId", actor.ID.ToString() },
            { "typeName", typeName },
            { "added", script != null },
        };
    }

    private static object GetComponent(Dictionary<string, object> args)
    {
        var actor = FindActor(args);
        if (actor == null) throw new Exception("Actor not found");
        var typeName = V<string>(args, "typeName");
        var scriptType = FindScriptType(typeName);
        if (scriptType == null)
            throw new Exception("Component type not found: " + typeName);
        var script = actor.GetScript(scriptType);
        if (script == null)
            return new Dictionary<string, object> { { "found", false } };
        return new Dictionary<string, object>
        {
            { "found", true },
            { "typeName", typeName },
            { "actorId", actor.ID.ToString() },
        };
    }

    private static object ModifyComponent(Dictionary<string, object> args)
    {
        var actor = FindActor(args);
        if (actor == null) throw new Exception("Actor not found");
        var typeName = V<string>(args, "typeName");
        var scriptType = FindScriptType(typeName);
        if (scriptType == null) throw new Exception("Component type not found: " + typeName);
        var script = actor.GetScript(scriptType);
        if (script == null) throw new Exception("Component not found on actor");
        var props = args.ContainsKey("properties") && args["properties"] is Dictionary<string, object> propDict
            ? propDict : new Dictionary<string, object>();
        foreach (var kv in props)
        {
            var prop = scriptType.GetProperty(kv.Key, BindingFlags.Public | BindingFlags.Instance);
            if (prop != null && prop.CanWrite)
            {
                try { prop.SetValue(script, Convert.ChangeType(kv.Value, prop.PropertyType)); } catch { }
            }
        }
        return new Dictionary<string, object> { { "actorId", actor.ID.ToString() }, { "typeName", typeName }, { "modified", true } };
    }

    private static object RemoveComponent(Dictionary<string, object> args)
    {
        var actor = FindActor(args);
        if (actor == null) throw new Exception("Actor not found");
        var typeName = V<string>(args, "typeName");
        var scriptType = FindScriptType(typeName);
        if (scriptType == null) throw new Exception("Component type not found: " + typeName);
        var script = actor.GetScript(scriptType);
        if (script == null) throw new Exception("Component not found on actor");
        FlaxEngine.Object.Destroy(script);
        return new Dictionary<string, object> { { "actorId", actor.ID.ToString() }, { "typeName", typeName }, { "removed", true } };
    }

    private static object ListComponentTypes(Dictionary<string, object> args)
    {
        // List all Script subclasses available in loaded assemblies
        var types = new List<object>();
        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
        {
            try
            {
                foreach (var t in asm.GetTypes())
                {
                    if (t.IsSubclassOf(typeof(Script)) && !t.IsAbstract)
                    {
                        types.Add(new Dictionary<string, object>
                        {
                            { "name", t.Name },
                            { "fullName", t.FullName },
                            { "assembly", asm.GetName().Name },
                        });
                    }
                }
            }
            catch { }
        }
        return types;
    }

    private static Type FindScriptType(string name)
    {
        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
        {
            try
            {
                foreach (var t in asm.GetTypes())
                {
                    if (t.IsSubclassOf(typeof(Script)) && !t.IsAbstract &&
                        (t.Name == name || t.FullName == name))
                        return t;
                }
            }
            catch { }
        }
        return null;
    }

    // ========== Asset Management ==========

    private static object FindAssets(Dictionary<string, object> args)
    {
        var filter = V<string>(args, "filter") ?? "";
        var max = V(args, "maxResults", 100);
        var recursive = V(args, "recursive", true);
        var list = new List<object>();
        var ids = Content.GetAllAssets();
        if (ids == null) return list;
        int c = 0;
        foreach (var id in ids)
        {
            if (c++ >= max) break;
            AssetInfo info;
            if (!Content.GetAssetInfo(id, out info)) continue;
            var name = System.IO.Path.GetFileNameWithoutExtension(info.Path);
            var path = info.Path ?? "";
            if (!string.IsNullOrEmpty(filter))
            {
                var parts = filter.Split(':');
                if (parts.Length >= 2)
                {
                    if (parts[0] == "t" && !info.TypeName.Contains(parts[1], StringComparison.OrdinalIgnoreCase)) continue;
                    if (parts[0] == "glob" && !System.IO.Path.GetExtension(path).Contains(parts[1], StringComparison.OrdinalIgnoreCase)) continue;
                }
                else if (!name.Contains(filter, StringComparison.OrdinalIgnoreCase))
                    continue;
            }
            list.Add(new Dictionary<string, object>
            {
                { "id", info.ID.ToString() },
                { "name", name },
                { "path", path },
                { "type", info.TypeName }
            });
        }
        return list;
    }

    private static object CreateAssetFolder(Dictionary<string, object> args)
    {
        var folderPath = V<string>(args, "path");
        if (string.IsNullOrEmpty(folderPath)) throw new Exception("Folder path is required");
        var fullPath = Path.Combine(Globals.ProjectFolder, "Content", folderPath);
        Directory.CreateDirectory(fullPath);
        // Refresh asset database
        Editor.RefreshAssetDatabase();
        return new Dictionary<string, object> { { "path", folderPath }, { "fullPath", fullPath } };
    }

    private static object DeleteAsset(Dictionary<string, object> args)
    {
        var path = V<string>(args, "path");
        if (string.IsNullOrEmpty(path)) throw new Exception("Asset path is required");
        var fullPath = Path.Combine(Globals.ProjectFolder, path);
        if (File.Exists(fullPath)) File.Delete(fullPath);
        else if (Directory.Exists(fullPath)) Directory.Delete(fullPath, true);
        else throw new Exception("Asset not found: " + path);
        Editor.RefreshAssetDatabase();
        return new Dictionary<string, object> { { "deleted", path } };
    }

    private static object CopyAsset(Dictionary<string, object> args)
    {
        var src = V<string>(args, "sourcePath");
        var dst = V<string>(args, "destinationPath");
        if (string.IsNullOrEmpty(src) || string.IsNullOrEmpty(dst)) throw new Exception("sourcePath and destinationPath required");
        var srcFull = Path.Combine(Globals.ProjectFolder, src);
        var dstFull = Path.Combine(Globals.ProjectFolder, dst);
        if (File.Exists(srcFull)) File.Copy(srcFull, dstFull, true);
        else if (Directory.Exists(srcFull)) DirectoryCopy(srcFull, dstFull);
        else throw new Exception("Source not found: " + src);
        Editor.RefreshAssetDatabase();
        return new Dictionary<string, object> { { "source", src }, { "destination", dst } };
    }

    private static void DirectoryCopy(string src, string dst)
    {
        Directory.CreateDirectory(dst);
        foreach (var f in Directory.GetFiles(src))
            File.Copy(f, Path.Combine(dst, Path.GetFileName(f)), true);
        foreach (var d in Directory.GetDirectories(src))
            DirectoryCopy(d, Path.Combine(dst, Path.GetFileName(d)));
    }

    private static object MoveAsset(Dictionary<string, object> args)
    {
        var src = V<string>(args, "sourcePath");
        var dst = V<string>(args, "destinationPath");
        if (string.IsNullOrEmpty(src) || string.IsNullOrEmpty(dst)) throw new Exception("sourcePath and destinationPath required");
        var srcFull = Path.Combine(Globals.ProjectFolder, src);
        var dstFull = Path.Combine(Globals.ProjectFolder, dst);
        Directory.CreateDirectory(Path.GetDirectoryName(dstFull));
        if (File.Exists(srcFull)) File.Move(srcFull, dstFull, true);
        else if (Directory.Exists(srcFull)) Directory.Move(srcFull, dstFull);
        else throw new Exception("Source not found: " + src);
        Editor.RefreshAssetDatabase();
        return new Dictionary<string, object> { { "source", src }, { "destination", dst } };
    }

    private static object RefreshAssets(Dictionary<string, object> args)
    {
        Editor.RefreshAssetDatabase();
        return new Dictionary<string, object> { { "refreshed", true } };
    }

    private static object CreateMaterial(Dictionary<string, object> args)
    {
        var name = V<string>(args, "name");
        var folder = V<string>(args, "parentFolder") ?? "Content";
        if (string.IsNullOrEmpty(name)) throw new Exception("Material name is required");
        var dir = Path.Combine(Globals.ProjectFolder, folder);
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, name + ".flax");
        Editor.CreateMaterialAsset(path);
        Editor.RefreshAssetDatabase();
        return new Dictionary<string, object> { { "path", path }, { "name", name } };
    }

    // ========== Script Tools ==========

    private static object ReadScript(Dictionary<string, object> args)
    {
        var path = V<string>(args, "path");
        if (string.IsNullOrEmpty(path)) throw new Exception("Script path is required");
        var fullPath = Path.Combine(Globals.ProjectFolder, "Source", path);
        if (!File.Exists(fullPath)) throw new Exception("Script not found: " + path);
        var content = File.ReadAllText(fullPath);
        return new Dictionary<string, object> { { "path", path }, { "content", content }, { "length", (long)content.Length } };
    }

    private static object WriteScript(Dictionary<string, object> args)
    {
        var path = V<string>(args, "path");
        var content = V<string>(args, "content");
        if (string.IsNullOrEmpty(path)) throw new Exception("Script path is required");
        if (content == null) throw new Exception("Script content is required");
        var fullPath = Path.Combine(Globals.ProjectFolder, "Source", path);
        Directory.CreateDirectory(Path.GetDirectoryName(fullPath));
        File.WriteAllText(fullPath, content);
        return new Dictionary<string, object> { { "path", path }, { "written", true }, { "length", (long)content.Length } };
    }

    private static object DeleteScript(Dictionary<string, object> args)
    {
        var path = V<string>(args, "path");
        if (string.IsNullOrEmpty(path)) throw new Exception("Script path is required");
        var fullPath = Path.Combine(Globals.ProjectFolder, "Source", path);
        if (!File.Exists(fullPath)) throw new Exception("Script not found: " + path);
        File.Delete(fullPath);
        return new Dictionary<string, object> { { "deleted", path } };
    }

    private static object ExecuteScript(Dictionary<string, object> args)
    {
        var code = V<string>(args, "code");
        if (string.IsNullOrEmpty(code)) throw new Exception("Code is required");
        // Use the Editor.ExecuteCode method via reflection
        Editor.ExecuteCode(code);
        return new Dictionary<string, object> { { "executed", true }, { "codeLength", (long)code.Length } };
    }

    // ========== Editor / Console ==========

    private static object GetConsoleLogs(Dictionary<string, object> args)
    {
        var maxCount = V(args, "maxCount", 50);
        var logType = V<string>(args, "logType") ?? "all";
        var logs = Editor.GetConsoleLogs(maxCount, logType);
        return logs;
    }

    private static object GetProjectInfo(Dictionary<string, object> args)
    {
        return new Dictionary<string, object>
        {
            { "projectName", System.IO.Path.GetFileName(Globals.ProjectFolder) },
            { "projectFolder", Globals.ProjectFolder },
            { "engineVersion", "1.12" },
            { "platform", "Windows" },
        };
    }

    private static object ScreenshotCamera(Dictionary<string, object> args)
    {
        var cameraId = V<string>(args, "cameraId");
        var filename = V<string>(args, "filename") ?? "screenshot.png";
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "FlaxMcpScreenshots");
        Directory.CreateDirectory(dir);
        var path = Path.Combine(dir, filename);

        Camera camera = null;
        if (!string.IsNullOrEmpty(cameraId) && Guid.TryParse(cameraId, out var cg))
            camera = Level.FindActor(cg) as Camera;

        Editor.TakeScreenshot(path);
        return new Dictionary<string, object> { { "path", path }, { "cameraId", camera?.ID.ToString() ?? "viewport" } };
    }
}

#endregion

#region Editor Reflection Bridge

internal class EditorReflection
{
    private Type _editorType;
    private PropertyInfo _instanceProp;
    private object _editorInstance;
    private FieldInfo _simulationField;
    private object _simulation;
    private FieldInfo _sceneEditingField;
    private object _sceneEditing;
    private FieldInfo _selectionField;
    private FieldInfo _windowsField;
    private object _windows;
    private PropertyInfo _viewportProp;
    private object _viewport;
    private MethodInfo _selectMethod;
    private MethodInfo _selectMultiMethod;
    private MethodInfo _getNodeMethod;
    private MethodInfo _requestStartPlay;
    private MethodInfo _requestStopPlay;
    private MethodInfo _requestResumePause;
    private MethodInfo _importMethod;
    private MethodInfo _takeScreenshot;
    private Type _sceneGraphNodeType;
    private Type _listSceneGraphNodeType;
    private bool _initialized;

    private static Assembly FindEditorAssembly()
    {
        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            if (asm.GetName().Name == "FlaxEditor.CSharp") return asm;
        return null;
    }

    private void EnsureInit()
    {
        if (_initialized) return;
        try
        {
            var editorAsm = FindEditorAssembly();
            if (editorAsm == null) return;
            _editorType = editorAsm.GetType("FlaxEditor.Editor");
            if (_editorType == null) return;

            _instanceProp = _editorType.GetProperty("Instance", BindingFlags.Public | BindingFlags.Static);
            _editorInstance = _instanceProp?.GetValue(null);
            if (_editorInstance == null) return;

            _simulationField = _editorType.GetField("Simulation");
            _simulation = _simulationField?.GetValue(_editorInstance);

            _sceneEditingField = _editorType.GetField("SceneEditing");
            _sceneEditing = _sceneEditingField?.GetValue(_editorInstance);

            _windowsField = _editorType.GetField("Windows");
            _windows = _windowsField?.GetValue(_editorInstance);

            if (_sceneEditing != null)
            {
                var sedType = _sceneEditing.GetType();
                _selectionField = sedType.GetField("Selection");
                _selectMethod = sedType.GetMethod("Select", new[] { typeof(Actor) });
                _getNodeMethod = sedType.GetMethod("GetNode", new[] { typeof(Actor) });
                _sceneGraphNodeType = editorAsm.GetType("FlaxEditor.SceneGraph.SceneGraphNode");
                if (_sceneGraphNodeType != null)
                    _listSceneGraphNodeType = typeof(List<>).MakeGenericType(_sceneGraphNodeType);
                if (_sceneGraphNodeType != null && _listSceneGraphNodeType != null)
                    _selectMultiMethod = sedType.GetMethod("Select", new[] { _listSceneGraphNodeType, typeof(bool) });
            }

            if (_simulation != null)
            {
                var simType = _simulation.GetType();
                _requestStartPlay = simType.GetMethod("RequestStartPlayScenes");
                _requestStopPlay = simType.GetMethod("RequestStopPlay");
                _requestResumePause = simType.GetMethod("RequestResumeOrPause");
            }

            if (_windows != null)
            {
                var winType = _windows.GetType();
                _viewportProp = winType.GetProperty("Viewport");
                _viewport = _viewportProp?.GetValue(_windows);
                if (_viewport != null)
                    _takeScreenshot = _viewport.GetType().GetMethod("TakeScreenshot", new[] { typeof(string) });
            }

            _importMethod = _editorType.GetMethod("Import", new[] { typeof(string), typeof(string), typeof(IntPtr) });

            _initialized = true;
            Debug.Log("[FlaxMcp] Editor API bound");
        }
        catch (Exception ex)
        {
            Debug.Log("[FlaxMcp] Editor API unavailable (standalone?): " + ex.Message);
        }
    }

    public List<Actor> GetSelection()
    {
        EnsureInit();
        if (_sceneEditing == null || _selectionField == null) return new List<Actor>();
        try
        {
            var sel = _selectionField.GetValue(_sceneEditing) as IList;
            if (sel == null) return new List<Actor>();
            var result = new List<Actor>();
            foreach (var node in sel)
            {
                var actorProp = node.GetType().GetProperty("Actor");
                if (actorProp?.GetValue(node) is Actor a) result.Add(a);
            }
            return result;
        }
        catch { return new List<Actor>(); }
    }

    public void Select(Actor actor)
    {
        if (actor == null) return;
        EnsureInit();
        try { _selectMethod?.Invoke(_sceneEditing, new object[] { actor }); } catch { }
    }

    public void Select(List<Actor> actors, bool additive)
    {
        EnsureInit();
        if (_sceneEditing == null || _selectMultiMethod == null || _getNodeMethod == null) return;
        try
        {
            var list = Activator.CreateInstance(_listSceneGraphNodeType) as IList;
            if (list == null) return;
            foreach (var a in actors)
            {
                var node = _getNodeMethod.Invoke(_sceneEditing, new object[] { a });
                if (node != null) list.Add(node);
            }
            _selectMultiMethod.Invoke(_sceneEditing, new object[] { list, additive });
        }
        catch { }
    }

    public void RequestPlay()
    {
        EnsureInit();
        try { _requestStartPlay?.Invoke(_simulation, null); } catch { }
    }

    public void RequestStop()
    {
        EnsureInit();
        try { _requestStopPlay?.Invoke(_simulation, null); } catch { }
    }

    public void RequestPause()
    {
        EnsureInit();
        try { _requestResumePause?.Invoke(_simulation, null); } catch { }
    }

    public void Import(string sourcePath, string destinationPath)
    {
        EnsureInit();
        try { _importMethod?.Invoke(null, new object[] { sourcePath, destinationPath, IntPtr.Zero }); } catch { }
    }

    public void TakeScreenshot(string path)
    {
        EnsureInit();
        try { _takeScreenshot?.Invoke(_viewport, new object[] { path }); } catch { }
    }

    // ========== Scene Management (Reflection) ==========

    private MethodInfo _sceneOpenMethod;
    private MethodInfo _sceneSaveMethod;
    private MethodInfo _sceneCreateMethod;
    private MethodInfo _setActiveSceneMethod;
    private MethodInfo _refreshDbMethod;
    private MethodInfo _createMaterialMethod;
    private MethodInfo _executeCodeMethod;
    private Type _contentEditingType;
    private object _contentEditing;

    private void EnsureSceneMethods()
    {
        if (_sceneOpenMethod != null) return;
        try
        {
            var editorAsm = FindEditorAssembly();
            if (editorAsm == null) return;

            // Try SceneEditing methods
            if (_sceneEditing != null)
            {
                var sedType = _sceneEditing.GetType();
                _sceneOpenMethod = sedType.GetMethod("OpenScene", new[] { typeof(string) });
                _sceneSaveMethod = sedType.GetMethod("SaveScene", new[] { typeof(string) });
                _sceneCreateMethod = sedType.GetMethod("CreateScene", new[] { typeof(string) });
                if (_sceneCreateMethod == null)
                    _sceneCreateMethod = sedType.GetMethod("NewScene", new[] { typeof(string) });
                _setActiveSceneMethod = sedType.GetMethod("SetActiveScene", new[] { typeof(Scene) });
            }

            // Try ContentEditing (for asset operations)
            _contentEditingType = editorAsm.GetType("FlaxEditor.ContentEditing");
            if (_contentEditingType != null)
            {
                _contentEditing = _contentEditingType.GetProperty("Instance",
                    BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
                if (_contentEditing == null)
                {
                    var contentField = _editorType.GetField("ContentEditing",
                        BindingFlags.Public | BindingFlags.Instance);
                    _contentEditing = contentField?.GetValue(_editorInstance);
                }

                if (_contentEditing != null)
                {
                    var ct = _contentEditing.GetType();
                    _createMaterialMethod = ct.GetMethod("CreateMaterial", new[] { typeof(string) });
                    _refreshDbMethod = ct.GetMethod("RefreshAssetDatabase", Type.EmptyTypes);
                    if (_refreshDbMethod == null)
                        _refreshDbMethod = ct.GetMethod("Refresh", Type.EmptyTypes);
                }
            }

            // Try Editor.ExecuteCode or Eval
            if (_editorType != null)
            {
                _executeCodeMethod = _editorType.GetMethod("ExecuteCode", new[] { typeof(string) });
                if (_executeCodeMethod == null)
                    _executeCodeMethod = _editorType.GetMethod("Eval", new[] { typeof(string) });
            }
        }
        catch { }
    }

    public void OpenScene(string path, string mode)
    {
        EnsureSceneMethods();
        try { _sceneOpenMethod?.Invoke(_sceneEditing, new object[] { path }); } catch { }
    }

    public void SaveScene(string path = null)
    {
        EnsureSceneMethods();
        try
        {
            if (path != null)
                _sceneSaveMethod?.Invoke(_sceneEditing, new object[] { path });
            else
                _sceneSaveMethod?.Invoke(_sceneEditing, new object[] { null });
        }
        catch { }
    }

    public void CreateScene(string path)
    {
        EnsureSceneMethods();
        try { _sceneCreateMethod?.Invoke(_sceneEditing, new object[] { path }); } catch { }
    }

    public void SetActiveScene(Scene scene)
    {
        EnsureSceneMethods();
        try { _setActiveSceneMethod?.Invoke(_sceneEditing, new object[] { scene }); } catch { }
    }

    public void RefreshAssetDatabase()
    {
        EnsureSceneMethods();
        try { _refreshDbMethod?.Invoke(_contentEditing, null); } catch { }
    }

    public void CreateMaterialAsset(string path)
    {
        EnsureSceneMethods();
        try { _createMaterialMethod?.Invoke(_contentEditing, new object[] { path }); } catch { }
    }

    public void ExecuteCode(string code)
    {
        EnsureSceneMethods();
        try { _executeCodeMethod?.Invoke(null, new object[] { code }); } catch { }
    }

    public object GetConsoleLogs(int maxCount, string logType)
    {
        // Return basic log info from Debug
        var result = new List<object>();
        try
        {
            result.Add(new Dictionary<string, object>
            {
                { "message", "Console log retrieval via FlaxEngine.Debug" },
                { "type", logType },
                { "note", "Full console history requires editor integration" }
            });
        }
        catch { }
        return result;
    }
}

#endregion
