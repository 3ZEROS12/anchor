#!/usr/bin/env node

/**
 * Anchor CLI Standalone Executable
 * Direct command-line interface for the Anchor cross-session task protocol.
 */

import { DualAnchorStore } from '../src/store.ts';
import { evaluateAnchorDecay, sweepStore } from '../src/decay.ts';
import { runPhysicalVerification } from '../src/settlement.ts';

const args = process.argv.slice(2);
const command = args[0] || 'list';
const store = new DualAnchorStore(process.cwd());

function printHelp() {
  console.log(`
⚓ Anchor - Cross-session task protocol for AI coding agents

Usage:
  anchor list [-g|--global]           List active and sleeping anchors
  anchor pin [-g|--global] <title>    Create a new task anchor
  anchor settle <id>                  Settle and archive a task
  anchor verify <id>                  Run physical verification command
  anchor show <id>                    Show detailed anchor metadata
  anchor log                          View history of settled anchors
  anchor sweep                        Trigger half-life decay cleanup
  anchor help                         Display this help message

Options:
  -g, --global   Target user-global space (~/.pi/agent/anchors/) instead of local (.anchor/)
`);
}

switch (command) {
  case 'list':
  case 'ls': {
    const isGlobalOnly = args.includes('-g') || args.includes('--global');
    const scopeFilter = isGlobalOnly ? 'global' : 'all';
    const active = store.list({ status: 'active', scope: scopeFilter });
    const sleeping = store.list({ status: 'sleeping', scope: scopeFilter });

    console.log('\n⚓ [Anchor Task Ledger]');
    if (active.length === 0 && sleeping.length === 0) {
      console.log('  No active anchors found. Use `anchor pin <task>` to create one.\n');
      break;
    }

    if (active.length > 0) {
      console.log('\n  ACTIVE:');
      for (const a of active) {
        const decay = evaluateAnchorDecay(a);
        const prio = `[${a.priority.toUpperCase()}]`;
        const scope = a.scope === 'global' ? '[global]' : '[project]';
        const files = a.files.length > 0 ? ` (${a.files.slice(0, 2).join(', ')})` : '';
        const verify = a.verifyCommand ? ` [verify: ${a.verifyCommand}]` : '';
        console.log(`    #${a.id} ${scope} ${prio} ${a.title}${files}${verify} · ${decay.remainingActiveDays}d left`);
      }
    }

    if (sleeping.length > 0) {
      console.log('\n  SLEEPING (0 context tokens):');
      for (const a of sleeping) {
        const decay = evaluateAnchorDecay(a);
        const scope = a.scope === 'global' ? '[global]' : '[project]';
        console.log(`    #${a.id} ${scope} ${a.title} · ${decay.remainingSleepDays}d until graveyard`);
      }
    }
    console.log();
    break;
  }

  case 'pin':
  case 'add': {
    const isGlobal = args.includes('-g') || args.includes('--global');
    const cleanArgs = args.slice(1).filter(a => a !== '-g' && a !== '--global');
    const title = cleanArgs.join(' ').trim();

    if (!title) {
      console.error('Error: title is required. Example: anchor pin "Refactor auth"');
      process.exit(1);
    }

    const anc = store.create({
      title,
      scope: isGlobal ? 'global' : 'project'
    });

    console.log(`\n⚓ Pinned [${anc.scope.toUpperCase()}] anchor #${anc.id}: "${anc.title}"`);
    console.log(`   Location: ${anc.scope === 'global' ? '~/.pi/agent/anchors/' : '.anchor/'}\n`);
    break;
  }

  case 'settle':
  case 'close': {
    const id = args[1];
    if (!id) {
      console.error('Error: anchor id is required. Example: anchor settle anc-1');
      process.exit(1);
    }

    try {
      const settled = store.settle(id, { settledBy: 'manual-command' });
      console.log(`\n⚓ Settled #${settled.id}: "${settled.title}". Archived to archive.jsonl.\n`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    break;
  }

  case 'verify': {
    const id = args[1];
    if (!id) {
      console.error('Error: anchor id is required. Example: anchor verify anc-1');
      process.exit(1);
    }

    const item = store.get(id);
    if (!item) {
      console.error(`Error: anchor ${id} not found`);
      process.exit(1);
    }

    if (!item.anchor.verifyCommand) {
      console.log(`Anchor #${item.anchor.id} has no verification command configured.`);
      break;
    }

    console.log(`Running verification for #${item.anchor.id}: ${item.anchor.verifyCommand}...`);
    const res = runPhysicalVerification(item.anchor, process.cwd());
    if (res.success) {
      console.log(`✓ Verification passed! Settling anchor...`);
      store.settle(item.anchor.id, {
        settledBy: 'verification-test',
        summary: `CLI verification passed: ${item.anchor.verifyCommand}`
      });
      console.log(`⚓ Anchor #${item.anchor.id} successfully settled and archived.`);
    } else {
      console.error(`✗ Verification failed:\n${res.output}`);
      process.exit(1);
    }
    break;
  }

  case 'show': {
    const id = args[1];
    if (!id) {
      console.error('Error: anchor id is required. Example: anchor show anc-1');
      process.exit(1);
    }

    const item = store.get(id);
    if (!item) {
      console.error(`Error: anchor ${id} not found`);
      process.exit(1);
    }

    const a = item.anchor;
    const decay = evaluateAnchorDecay(a);
    console.log(`
⚓ Anchor #${a.id}
  Title:         ${a.title}
  Status:        ${a.status.toUpperCase()}
  Scope:         ${a.scope} (${item.store.anchorDir})
  Priority:      ${a.priority.toUpperCase()}
  Created:       ${new Date(a.createdAt).toLocaleString()}
  Last Touched:  ${new Date(a.lastTouchedAt).toLocaleString()}
  Days Untouched:${decay.daysUntouched}d (Active left: ${decay.remainingActiveDays}d | Sleep left: ${decay.remainingSleepDays}d)
  Files:         ${a.files.length > 0 ? a.files.join(', ') : 'none'}
  Tags:          ${a.tags.length > 0 ? a.tags.join(', ') : 'none'}
  Verify Cmd:    ${a.verifyCommand || 'none'}
`);
    break;
  }

  case 'log': {
    const archive = store.getArchive();
    console.log(`\n⚓ [Settled Anchor History] (${archive.length} records)`);
    if (archive.length === 0) {
      console.log('  No settled anchors recorded yet.\n');
      break;
    }

    for (const a of archive.slice(-10).reverse()) {
      const settledDate = a.evidence?.settledAt ? new Date(a.evidence.settledAt).toLocaleDateString() : '';
      console.log(`  ✓ #${a.id} [${a.scope}] ${a.title} (${settledDate}) [by ${a.evidence?.settledBy || 'unknown'}]`);
    }
    console.log();
    break;
  }

  case 'sweep': {
    const res = sweepStore(store);
    console.log(`\n⚓ Sweep complete:`);
    console.log(`   - Transitioned to sleeping: ${res.transitionedToSleeping.length}`);
    console.log(`   - Woken to active:          ${res.wokenToActive.length}`);
    console.log(`   - Evicted to graveyard:     ${res.evictedToGraveyard.length}\n`);
    break;
  }

  case 'help':
  default:
    printHelp();
    break;
}
