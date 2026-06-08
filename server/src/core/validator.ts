import { z } from "zod";

export const PositionSchema = z.tuple([z.number(), z.number(), z.number()]).describe("3D position (x, y, z)");

export const RotationSchema = z.tuple([z.number(), z.number(), z.number()]).describe("Euler rotation (pitch, yaw, roll) in degrees");

export const ScaleSchema = z.tuple([z.number(), z.number(), z.number()]).describe("3D scale (x, y, z)");

export const ActorIdSchema = z.string().min(1, "Actor ID is required").describe("Unique actor identifier");

export const AssetPathSchema = z.string().min(1, "Asset path is required").describe("Path to asset in the project");

export const ActorNameSchema = z.string().min(1, "Actor name is required").describe("Display name for the actor");

export const CreateActorSchema = z.object({
  name: ActorNameSchema,
  type: z.enum([
    "EmptyActor", "StaticMesh", "BoxBrush", "SphereBrush",
    "DirectionalLight", "PointLight", "SpotLight",
    "Camera", "AudioSource", "RigidBody", "Character",
    "NavMeshBoundsVolume", "Decal", "ParticleSystem",
    "Sky", "Fog", "PostProcessVolume", "TriggerVolume",
  ]).default("EmptyActor").describe("Type of actor to create"),
  parentId: ActorIdSchema.optional().describe("Optional parent actor ID for hierarchy"),
  position: PositionSchema.default([0, 0, 0]),
  rotation: RotationSchema.default([0, 0, 0]),
  scale: ScaleSchema.default([1, 1, 1]),
  staticMeshPath: AssetPathSchema.optional().describe("Path to static mesh asset (required if type is StaticMesh)"),
});

export const MoveActorSchema = z.object({
  actorId: ActorIdSchema,
  position: PositionSchema.describe("New world-space position"),
  relative: z.boolean().default(false).describe("If true, position is relative to current"),
});

export const RotateActorSchema = z.object({
  actorId: ActorIdSchema,
  rotation: RotationSchema.describe("New euler rotation in degrees"),
  relative: z.boolean().default(false),
});

export const ScaleActorSchema = z.object({
  actorId: ActorIdSchema,
  scale: ScaleSchema.describe("New scale factors"),
  relative: z.boolean().default(false),
});

export const DuplicateActorSchema = z.object({
  actorId: ActorIdSchema,
  newName: ActorNameSchema.optional().describe("Optional name for the duplicated actor"),
});

export const DeleteActorSchema = z.object({
  actorId: ActorIdSchema,
});

export const SelectActorSchema = z.object({
  actorIds: z.array(ActorIdSchema).min(1, "At least one actor ID required").describe("Actor IDs to select"),
  additive: z.boolean().default(false).describe("Add to existing selection instead of replacing"),
});

export const ImportAssetSchema = z.object({
  sourcePath: z.string().min(1, "Source file path is required").describe("Absolute path to source file on disk"),
  destinationPath: AssetPathSchema.describe("Destination path in project (e.g., Content/Models/myModel.flax)"),
  options: z.object({
    generateMeshes: z.boolean().default(true),
    importMaterials: z.boolean().default(true),
    importTextures: z.boolean().default(true),
    scale: z.number().default(1.0),
  }).optional().default({}),
});

export const AssignMaterialSchema = z.object({
  actorId: ActorIdSchema,
  materialSlotIndex: z.number().int().min(0).default(0).describe("Material slot index"),
  materialPath: AssetPathSchema.describe("Path to material asset"),
});

export const PlayModeSchema = z.object({
  action: z.enum(["play", "stop", "pause", "step"]),
});

export const TakeScreenshotSchema = z.object({
  outputPath: z.string().optional().describe("Optional output path for screenshot"),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  filename: z.string().default("screenshot.png"),
});

export const GetSceneHierarchySchema = z.object({
  sceneName: z.string().optional().describe("Optional scene name (uses active scene if omitted)"),
  maxDepth: z.number().int().positive().default(10).describe("Maximum hierarchy depth"),
});

export const SceneOpenSchema = z.object({
  path: z.string().min(1).describe("Path to scene asset (e.g., Content/Scenes/MyScene.flax)"),
  mode: z.enum(["single", "additive"]).default("single").describe("Load mode"),
});

export const SceneSaveSchema = z.object({
  path: z.string().optional().describe("Save path (uses current if omitted)"),
});

export const SceneCreateSchema = z.object({
  name: z.string().min(1).describe("Name for the new scene"),
  template: z.string().optional().describe("Template scene path"),
});

export const SceneUnloadSchema = z.object({
  sceneName: z.string().min(1).describe("Name of scene to unload"),
});

export const SceneSetActiveSchema = z.object({
  sceneName: z.string().min(1).describe("Name of scene to set active"),
});

export const SceneListOpenedSchema = z.object({});

export const SceneGetDataSchema = z.object({
  sceneName: z.string().optional().describe("Scene name (uses active if omitted)"),
});

export const FindActorsSchema = z.object({
  name: z.string().optional().describe("Filter by name (substring match)"),
  type: z.string().optional().describe("Filter by actor type name"),
  maxResults: z.number().int().positive().default(50),
});

export const SetActorParentSchema = z.object({
  actorId: ActorIdSchema,
  parentId: ActorIdSchema.describe("New parent actor ID (empty string to unparent)"),
  worldPositionStays: z.boolean().default(true).describe("Preserve world transform"),
});

export const ModifyActorSchema = z.object({
  actorId: ActorIdSchema,
  name: z.string().optional().describe("New name"),
  position: PositionSchema.optional(),
  rotation: RotationSchema.optional(),
  scale: ScaleSchema.optional(),
  isActive: z.boolean().optional().describe("Set active/inactive"),
  relative: z.boolean().default(false).describe("If true, transform values are relative"),
});

export const AddComponentSchema = z.object({
  actorId: ActorIdSchema,
  typeName: z.string().min(1).describe("Component type name (e.g., RigidBody, BoxCollider)"),
});

export const GetComponentSchema = z.object({
  actorId: ActorIdSchema,
  typeName: z.string().min(1).describe("Component type name"),
});

export const ModifyComponentSchema = z.object({
  actorId: ActorIdSchema,
  typeName: z.string().min(1).describe("Component type name"),
  properties: z.record(z.unknown()).describe("Properties to set on the component"),
});

export const RemoveComponentSchema = z.object({
  actorId: ActorIdSchema,
  typeName: z.string().min(1).describe("Component type name"),
});

export const ListComponentTypesSchema = z.object({});

export const FindAssetsSchema = z.object({
  filter: z.string().default("").describe("Search filter (e.g., 't:Material', '*.flax')"),
  recursive: z.boolean().default(true),
  maxResults: z.number().int().positive().default(100),
});

export const CreateAssetFolderSchema = z.object({
  path: z.string().min(1).describe("Folder path relative to Content (e.g., 'MyModels/SubFolder')"),
});

export const DeleteAssetSchema = z.object({
  path: z.string().min(1).describe("Asset path relative to project root"),
});

export const CopyAssetSchema = z.object({
  sourcePath: z.string().min(1).describe("Source asset path"),
  destinationPath: z.string().min(1).describe("Destination asset path"),
});

export const MoveAssetSchema = z.object({
  sourcePath: z.string().min(1).describe("Source asset path"),
  destinationPath: z.string().min(1).describe("Destination asset path"),
});

export const RefreshAssetsSchema = z.object({});

export const CreateMaterialSchema = z.object({
  name: z.string().min(1).describe("Material name"),
  parentFolder: z.string().default("Content").describe("Parent folder path"),
});

export const ReadScriptSchema = z.object({
  path: z.string().min(1).describe("Script path relative to Source/"),
});

export const WriteScriptSchema = z.object({
  path: z.string().min(1).describe("Script path relative to Source/"),
  content: z.string().describe("C# script content"),
});

export const DeleteScriptSchema = z.object({
  path: z.string().min(1).describe("Script path relative to Source/"),
});

export const ExecuteScriptSchema = z.object({
  code: z.string().min(1).describe("C# code to compile and execute"),
});

export const GetConsoleLogsSchema = z.object({
  maxCount: z.number().int().positive().default(50),
  logType: z.enum(["all", "info", "warning", "error"]).default("all"),
});

export const GetProjectInfoSchema = z.object({});

export const ScreenshotCameraSchema = z.object({
  cameraId: z.string().optional().describe("Camera actor ID (uses active camera if omitted)"),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  filename: z.string().default("screenshot.png"),
});
