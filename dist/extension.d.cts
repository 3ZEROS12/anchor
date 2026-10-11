import { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { A as AnchorStore } from './store-BNKjzhS_.cjs';

/**
 * Parse inline `--due <date>` / `-d <date>` flags and `done`/`rm`/`close`/`settle` subcommands
 * for `/anchor` and `/pin` slash commands.
 */
declare function parseAnchorCommandInput(raw: string, now?: number): {
    mode: 'dashboard' | 'undo' | 'settle' | 'pin';
    targetId?: string;
    title?: string;
    targetDate?: string;
};
/**
 * Resolve either an explicit anchor ID ('anc-2', '2') or a 1-based visual dashboard index ('01', '1')
 */
declare function resolveAnchorTarget(store: AnchorStore, idOrIndex: string, cwd?: string): string | undefined;
declare function export_default(pi: ExtensionAPI): void;

export { export_default as default, parseAnchorCommandInput, resolveAnchorTarget };
