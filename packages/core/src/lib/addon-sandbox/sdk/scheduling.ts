import { call } from "./rpc.js";

export type TaskFireHandler = (payload: Record<string, unknown>) => void | Promise<void>;

const handlers = new Map<string, TaskFireHandler>();

export function registerTaskFireHandler(task: string, handler: TaskFireHandler): void {
  handlers.set(task, handler);
}

export function registeredTasks(): string[] {
  return [...handlers.keys()];
}

export function getTaskHandler(task: string): TaskFireHandler | undefined {
  return handlers.get(task);
}

export function schedule(
  task: string,
  payload: Record<string, unknown>,
  options: { delay?: number } = {},
): Promise<void> {
  return call("schedule.add", { task, payload, delay: options.delay });
}
