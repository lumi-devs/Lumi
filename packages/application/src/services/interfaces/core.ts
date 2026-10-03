export interface IModuleCommandService {
  setModuleEnabled(name: string, enabled: boolean): Promise<unknown>;
}
