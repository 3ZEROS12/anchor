declare module '@earendil-works/pi-coding-agent' {
  export interface ExtensionContext {
    cwd: string;
    hasUI: boolean;
    ui: {
      setStatus: (key: string, text: string | undefined) => void;
      notify: (message: string, level?: 'info' | 'warn' | 'error') => void;
      confirm: (title: string, message: string) => Promise<boolean>;
      select: (title: string, options: string[]) => Promise<string | undefined>;
    };
  }

  export interface ToolDefinition {
    name: string;
    label?: string;
    description: string;
    promptSnippet?: string;
    promptGuidelines?: string[];
    parameters: unknown;
    execute: (
      toolCallId: string,
      params: any,
      signal?: AbortSignal,
      onUpdate?: (partial: any) => void,
      ctx?: ExtensionContext
    ) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
  }

  export interface CommandDefinition {
    description: string;
    handler: (args: string, ctx: ExtensionContext) => Promise<void>;
  }

  export interface PiHost {
    on: (event: string, handler: (event: any, ctx: ExtensionContext) => any) => void;
    registerTool: (tool: ToolDefinition) => void;
    registerCommand: (name: string, command: CommandDefinition) => void;
  }

  export type ExtensionAPI = PiHost;
}
