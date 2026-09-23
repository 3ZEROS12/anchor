import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { DualAnchorStore, AnchorStore } from './store.ts';
import { evaluateAnchorDecay } from './decay.ts';
import type { Anchor, AnchorScope } from './types.ts';

/**
 * Strip ANSI escape codes and calculate physical display width (handling CJK double-width)
 */
export function visibleWidth(str: string): number {
  const clean = str.replace(/\x1b\[[0-9;]*m/g, '');
  let w = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0xff00 && code <= 0xffef)) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

export function padToWidth(content: string, targetWidth: number): string {
  const curW = visibleWidth(content);
  if (curW >= targetWidth) return content;
  return content + ' '.repeat(targetWidth - curW);
}

/**
 * Update the footer status bar indicator
 * Whisper-quiet with ToolFlow benzene ring symbol: [⌬ anc: 1]
 */
export function updateAnchorStatusBar(ctx: ExtensionContext, store: DualAnchorStore | AnchorStore): void {
  if (!ctx.hasUI || !ctx.ui) return;

  const active = store.list({ status: 'active' });
  const sleeping = store.list({ status: 'sleeping' });

  if (active.length === 0 && sleeping.length === 0) {
    ctx.ui.setStatus('anchor', undefined);
    return;
  }

  const parts: string[] = [];
  if (active.length > 0) {
    parts.push(`⌬ anc: ${active.length} active`);
  }
  if (sleeping.length > 0) {
    parts.push(`${sleeping.length} sleep`);
  }

  ctx.ui.setStatus('anchor', `[${parts.join(', ')}]`);
}

/**
 * Render ToolFlow-style Benzene Ring Cockpit Component via ctx.ui.custom
 */
export async function openAnchorDashboard(
  ctx: ExtensionContext,
  store: DualAnchorStore
): Promise<void> {
  if (!ctx.hasUI || !ctx.ui) return;

  let activeTab: 'active' | 'sleeping' = 'active';
  let activeScope: AnchorScope = 'project';
  let selectedIdx = 0;

  function getList(): Anchor[] {
    return store.list({ status: activeTab, scope: activeScope });
  }

  try {
    await ctx.ui.custom<void>((tui, theme, _keybindings, done) => {
      function rerender() {
        tui.requestRender();
      }

      const component = {
        render: (width: number) => {
          const borderColor = (s: string) => theme.fg('borderMuted', s);
          const titleColor = (s: string) => theme.fg('accent', theme.bold(s));
          const dimColor = (s: string) => theme.fg('dim', s);
          const innerWidth = Math.max(10, width - 4);

          const list = getList();
          if (selectedIdx >= list.length && list.length > 0) {
            selectedIdx = list.length - 1;
          }

          const lines: string[] = [];

          // 1. Header with Benzene Ring (⌬) and Anchor (⚓)
          const titleText = ' ⌬ ⚓ Anchor 任务锚点驾驶舱 ';
          const titleVisW = visibleWidth(titleText);
          const topFillLen = Math.max(0, width - 3 - titleVisW);
          const topBorder = borderColor('╭─') + titleColor(titleText) + borderColor('─'.repeat(topFillLen) + '╮');

          // 2. Tabs & Scope Selector
          const tabActive = activeTab === 'active'
            ? theme.bold(theme.fg('accent', '● 活跃契约 (Active)'))
            : dimColor('○ 活跃契约');
          const tabSleep = activeTab === 'sleeping'
            ? theme.bold(theme.fg('accent', '● 休眠契约 (Sleeping)'))
            : dimColor('○ 休眠契约');

          const scopeProj = activeScope === 'project'
            ? theme.bold(theme.fg('warning', '● 当前项目 (.anchor/)'))
            : dimColor('○ 当前项目');
          const scopeGlob = activeScope === 'global'
            ? theme.bold(theme.fg('success', '● 用户全局 (~/.pi/agent)'))
            : dimColor('○ 用户全局');

          lines.push(`  ${theme.bold('状态视图:')} [Tab 切页]   ${tabActive}    ${tabSleep}`);
          lines.push(`  ${theme.bold('存储空间:')} [g 键切换]   ${scopeProj}    ${scopeGlob}`);
          lines.push(dimColor('─'.repeat(innerWidth)));

          // 3. Anchor List
          if (list.length === 0) {
            const emptyTip = activeTab === 'active'
              ? '  (当前作用域下暂无活跃锚点。按 [+] 可新建，或按 [g] 切换空间)'
              : '  (暂无休眠中的任务锚点)';
            lines.push(dimColor(emptyTip));
          } else {
            list.forEach((anc, idx) => {
              const isSel = idx === selectedIdx;
              const cursor = isSel ? theme.fg('accent', '▶ ') : '  ';
              const prio = `[${anc.priority.toUpperCase()}]`;
              const prioColored = anc.priority === 'p0'
                ? theme.fg('error', prio)
                : anc.priority === 'p1' ? theme.fg('warning', prio) : dimColor(prio);

              const decay = evaluateAnchorDecay(anc);
              const daysInfo = activeTab === 'active'
                ? dimColor(`(${decay.remainingActiveDays}d 剩余)`)
                : dimColor(`(距墓园 ${decay.remainingSleepDays}d)`);

              const fileInfo = anc.files.length > 0 ? dimColor(`[${anc.files[0]}]`) : '';
              const titleStr = isSel ? theme.bold(theme.fg('accent', anc.title)) : anc.title;

              lines.push(`${cursor}#${anc.id} ${prioColored} ${titleStr} ${fileInfo} ${daysInfo}`);
            });
          }

          lines.push(dimColor('─'.repeat(innerWidth)));
          // 4. Action bar footer
          lines.push(
            dimColor('  [Enter 结案归档] [g 切换全局/项目] [Tab 切页] [t 触碰刷新] [d 丢入墓园] [Esc 退出]')
          );

          // 5. Box drawing wrap
          const wrapRow = (row: string) => {
            const rowW = visibleWidth(row);
            const pad = Math.max(0, innerWidth - rowW);
            return borderColor('│ ') + row + ' '.repeat(pad) + borderColor(' │');
          };

          const botFillLen = Math.max(0, width - 2);
          const botBorder = borderColor(`╰${'─'.repeat(botFillLen)}╯`);

          return [topBorder, ...lines.map(wrapRow), botBorder];
        },

        handleInput: (data: string) => {
          const list = getList();

          if (data === '\r' || data === '\n') {
            // Enter: Settle selected anchor
            if (list.length > 0 && selectedIdx < list.length) {
              const target = list[selectedIdx];
              store.settle(target.id, { settledBy: 'manual-command' });
              ctx.ui.notify(`Anchor: #${target.id} 已结案归档并释放上下文`, 'info');
              updateAnchorStatusBar(ctx, store);
              rerender();
            }
            return true;
          }

          if (data === '\x1b' || data === 'q' || data === 'Q') {
            // Escape / q: close
            done();
            return true;
          }

          if (data === '\t') {
            // Tab: switch tab (active <-> sleeping)
            activeTab = activeTab === 'active' ? 'sleeping' : 'active';
            selectedIdx = 0;
            rerender();
            return true;
          }

          if (data === 'g' || data === 'G') {
            // g: toggle scope (project <-> global)
            activeScope = activeScope === 'project' ? 'global' : 'project';
            selectedIdx = 0;
            rerender();
            return true;
          }

          if (data === '\x1b[A' || data === 'k') {
            // Up arrow
            if (selectedIdx > 0) {
              selectedIdx--;
              rerender();
            }
            return true;
          }

          if (data === '\x1b[B' || data === 'j') {
            // Down arrow
            if (selectedIdx < list.length - 1) {
              selectedIdx++;
              rerender();
            }
            return true;
          }

          if (data === 't' || data === 'T') {
            // Touch & refresh
            if (list.length > 0 && selectedIdx < list.length) {
              const target = list[selectedIdx];
              store.touch(target.id);
              ctx.ui.notify(`Anchor: #${target.id} 半衰期已刷新`, 'info');
              rerender();
            }
            return true;
          }

          if (data === 'd' || data === 'D') {
            // Drop to graveyard
            if (list.length > 0 && selectedIdx < list.length) {
              const target = list[selectedIdx];
              store.dropToGraveyard(target.id, 'Manually dropped from TUI');
              ctx.ui.notify(`Anchor: #${target.id} 已移入墓园`, 'info');
              updateAnchorStatusBar(ctx, store);
              rerender();
            }
            return true;
          }

          return false;
        }
      };

      return component;
    });
  } catch (err: any) {
    // Fallback to text output if custom TUI is unsupported in environment
    const list = store.list({ status: 'active' });
    ctx.ui.notify(`Anchor: ${list.length} 个活跃契约挂起。使用 /anchor close <id> 结案。`, 'info');
  }
}
