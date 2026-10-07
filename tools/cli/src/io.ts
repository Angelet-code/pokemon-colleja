import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

/** Terminal input/output, abstracted so the game loop can run in tests without a TTY. */
export interface CliIO {
  print(text: string): void;
  ask(question: string): Promise<string>;
  close(): void;
}

export function createTerminalIO(): CliIO {
  const readline = createInterface({ input: stdin, output: stdout });
  return {
    print: (text) => stdout.write(`${text}\n`),
    ask: (question) => readline.question(question),
    close: () => readline.close(),
  };
}

/** Collects the output; any question is an error (non-interactive runs such as `--auto`). */
export function createBufferIO(): CliIO & { output: string[] } {
  const output: string[] = [];
  return {
    output,
    print: (text) => output.push(text),
    ask: (question) => Promise.reject(new Error(`Pregunta inesperada: ${question}`)),
    close: () => {},
  };
}
