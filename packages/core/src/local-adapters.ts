import type { BuildPlan, FilePatch, MonstroTask, RuntimeResult } from "@monstro/contracts";
import { LocalSandboxRuntime, ProjectWorkspace, type ProcessSpec, type RuntimePolicy } from "@monstro/runtime";
import type { Builder, Runtime } from "./index.js";

export interface LocalBuilderOptions {
  build?: (task: MonstroTask, plan: BuildPlan) => Promise<FilePatch[]> | FilePatch[];
}

export class WorkspaceBuilder implements Builder {
  constructor(
    private readonly workspace: ProjectWorkspace,
    private readonly options: LocalBuilderOptions = {},
  ) {}

  async build(task: MonstroTask, plan: BuildPlan): Promise<FilePatch[]> {
    return this.options.build ? this.options.build(task, plan) : [];
  }

  async apply(_task: MonstroTask, patches: FilePatch[]): Promise<void> {
    await this.workspace.apply(patches);
  }
}

export type ProcessSpecFactory = (task: MonstroTask) => ProcessSpec;

export class WorkspaceRuntime implements Runtime {
  private readonly runtime: LocalSandboxRuntime;

  constructor(
    workspace: ProjectWorkspace,
    private readonly process: ProcessSpec | ProcessSpecFactory,
    policy: RuntimePolicy = {},
  ) {
    this.runtime = new LocalSandboxRuntime(workspace, policy);
  }

  run(task: MonstroTask): Promise<RuntimeResult> {
    const spec = typeof this.process === "function" ? this.process(task) : this.process;
    return this.runtime.run(spec);
  }
}

export interface LocalExecutionAdapters {
  workspace: ProjectWorkspace;
  builder: WorkspaceBuilder;
  runtime: WorkspaceRuntime;
}

export function createLocalExecutionAdapters(options: {
  baseDir: string;
  projectId: string;
  process: ProcessSpec | ProcessSpecFactory;
  policy?: RuntimePolicy;
  build?: LocalBuilderOptions["build"];
}): LocalExecutionAdapters {
  const workspace = new ProjectWorkspace(options.baseDir, options.projectId);
  return {
    workspace,
    builder: new WorkspaceBuilder(workspace, { build: options.build }),
    runtime: new WorkspaceRuntime(workspace, options.process, options.policy),
  };
}
