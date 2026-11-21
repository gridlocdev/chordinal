#!/usr/bin/env node
// Chordinal on the command line (bundled into apps/cli/dist/chordinal.mjs; `just cli <command> …`):
//   chordinal help                   the commands
//   chordinal <command> --help       what one does
// Paths are relative to the folder it's run from.
import { UsageError } from './args.ts';
import type { Command } from './command.ts';
import { composeCommand } from './compose-command.ts';
import { exportCommand } from './export-command.ts';
import { renderCommand } from './render-command.ts';

const COMMANDS: Command[] = [composeCommand, exportCommand, renderCommand];

const usageOf = (c: Command): string => `usage: chordinal ${c.name} ${c.usage}`;

function overview(): string {
  const width = Math.max(...COMMANDS.map((c) => c.name.length));
  return [
    'usage: chordinal <command> [arguments]',
    '',
    ...COMMANDS.map((c) => `  ${c.name.padEnd(width)}  ${c.summary}`),
    '',
    '`chordinal <command> --help` explains one.',
  ].join('\n');
}

async function main(argv: string[]): Promise<void> {
  const [name, ...rest] = argv;
  if (name === undefined || name === 'help' || name === '--help' || name === '-h') {
    const about = COMMANDS.find((c) => c.name === rest[0]);
    console.log(about ? `${usageOf(about)}\n\n${about.help}` : overview());
    return;
  }
  const command = COMMANDS.find((c) => c.name === name);
  if (!command) {
    console.error(`chordinal: no command ${name}\n\n${overview()}`);
    process.exitCode = 2;
    return;
  }
  if (rest.includes('--help') || rest.includes('-h')) {
    console.log(`${usageOf(command)}\n\n${command.help}`);
    return;
  }
  try {
    await command.run(rest);
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`chordinal ${command.name}: ${e.message}\n${usageOf(command)}`);
      process.exitCode = 2;
      return;
    }
    console.error(`chordinal ${command.name}: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  }
}

await main(process.argv.slice(2));
