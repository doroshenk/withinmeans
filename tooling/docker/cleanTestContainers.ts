/** Runs a program and returns what it printed. */
export type Run = (command: string, args: string[]) => string;

export interface CleanOptions {
  run: Run;
  platform: NodeJS.Platform;
  /** This process, so its own parents are not mistaken for another test run. */
  selfPid: number;
}

export function cleanTestContainers(_options: CleanOptions): string {
  throw new Error('not implemented');
}
