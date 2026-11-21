// Reading a command's arguments: the words, and the options it takes. Pure.

/** what each option of a command is: a flag (`--mp3`) or one that takes a value (`--out <dir>`, `--out=<dir>`) */
export type OptionKinds = Record<string, 'flag' | 'value'>;

export interface Parsed {
  /** the words that aren't options, in order */
  positional: string[];
  /** each option given a value, by its name without the dashes; the last one given wins */
  values: Record<string, string>;
  /** the flags given, by name */
  flags: Set<string>;
  /** whether `--help` or `-h` was given */
  help: boolean;
}

/** a mistake in the arguments: the CLI prints it with the command's usage */
export class UsageError extends Error {
  override name = 'UsageError';
}

/** reads `argv` against the options a command takes; an option it doesn't take, or one missing its value, is a UsageError */
export function parseArgs(argv: readonly string[], kinds: OptionKinds): Parsed {
  const parsed: Parsed = { positional: [], values: {}, flags: new Set(), help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (!arg.startsWith('--') || arg === '--') {
      parsed.positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const name = eq < 0 ? arg.slice(2) : arg.slice(2, eq);
    const kind = kinds[name];
    if (!kind) throw new UsageError(`unknown option --${name}`);
    if (kind === 'flag') {
      if (eq >= 0) throw new UsageError(`--${name} takes no value`);
      parsed.flags.add(name);
      continue;
    }
    const value = eq >= 0 ? arg.slice(eq + 1) : argv[++i];
    if (value === undefined || value === '' || (eq < 0 && value.startsWith('--')))
      throw new UsageError(`--${name} needs a value`);
    parsed.values[name] = value;
  }
  return parsed;
}
