import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCli, USAGE } from '../src/app';
import { createBufferIO } from '../src/io';

describe('npm run play', () => {
  // Defaults: level 2 bot and a random rival team.
  it.each(['singles', 'doubles'])('--auto finishes a %s battle without errors', async (mode) => {
    const io = createBufferIO();
    const code = await runCli(['--auto', '--mode', mode, '--seed', `cli-${mode}`], io);
    const output = io.output.join('\n');
    expect(code, output).toBe(0);
    expect(output).toMatch(/Resultado: (gana Bot [12]|empate)/);
    expect(output).toContain('── Turno 1 ──');
    expect(output).toMatch(/ha usado [A-ZÁÉÍÓÚ]/); // Spanish templates and move names
    expect(output).toContain('rival: Táctico (nivel 2)');
  });

  it.each([
    ['0', 'singles'],
    ['1', 'doubles'],
  ])('--bot %s plays a %s battle with the fixture teams', async (bot, mode) => {
    const io = createBufferIO();
    const opponent = fileURLToPath(new URL('../../smoke/fixtures/equipo-b.txt', import.meta.url));
    const args = ['--auto', '--bot', bot, '--mode', mode, '--opponent-team', opponent];
    expect(await runCli([...args, '--seed', 'b'], io)).toBe(0);
    expect(io.output.join('\n')).toMatch(/Resultado: (gana Bot [12]|empate)/);
  });

  it('is reproducible with the same seed', async () => {
    const play = async () => {
      const io = createBufferIO();
      await runCli(['--auto', '--mode', 'doubles', '--seed', 'repro', '--no-preview'], io);
      return io.output;
    };
    expect(await play()).toEqual(await play());
  });

  it('shows the usage and rejects bad options', async () => {
    const help = createBufferIO();
    expect(await runCli(['--help'], help)).toBe(0);
    expect(help.output).toEqual([USAGE]);
    const bad = createBufferIO();
    expect(await runCli(['--mode', 'triples'], bad)).toBe(2);
    expect(await runCli(['--bot', '7'], createBufferIO())).toBe(2);
    expect(await runCli(['--team', 'no-existe.txt', '--auto'], createBufferIO())).toBe(1);
  });
});

/**
 * Plays as the human with a scripted responder: always the first valid option, plus a few
 * commands at chosen moments (undo in the middle, rewind after the end, then quit).
 */
function scriptedIO(plan: { undoAtTurn: number }) {
  const output: string[] = [];
  let lastQuestion = '';
  let attempts = 0;
  let undone = false;
  let ends = 0;
  const candidates = ['1', '2', '3', '4', 'c'];
  return {
    output,
    print: (text: string) => output.push(text),
    close: () => {},
    ask: async (question: string) => {
      output.push(question);
      attempts =
        question === lastQuestion && output.at(-2) === '  Respuesta no válida.' ? attempts + 1 : 0;
      lastQuestion = question;
      if (question.startsWith('Elige')) return '132';
      if (question.includes('Megaevolucionar')) return 's';
      if (question.startsWith('Fin del combate')) return ++ends === 1 ? 'rebobinar 1' : 'salir';
      const turnHeader = output.findLast((line) => line.includes('── Turno'));
      if (!undone && turnHeader?.includes(`Turno ${plan.undoAtTurn} `)) {
        undone = true;
        return 'deshacer';
      }
      return candidates[attempts % candidates.length] ?? '1';
    },
  };
}

describe('interactive play', () => {
  it('plays to the end, undoes, rewinds after the end and quits', async () => {
    const io = scriptedIO({ undoAtTurn: 3 });
    const code = await runCli(['--seed', 'human', '--name', 'Ash'], io);
    const output = io.output.join('\n');
    expect(code, output).toBe(0);
    expect(output).toContain('═══ Vista previa ═══');
    expect(output).toContain('¿Qué hace');
    expect(output).toContain('⏪ Vuelta al inicio del turno 2.');
    expect(output).toContain('⏪ Vuelta al inicio del turno 1.');
    expect(output.match(/Resultado: /g)?.length).toBe(2);
    expect(output).toContain('Combate abandonado.');
  });
});
