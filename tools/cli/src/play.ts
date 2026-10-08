/**
 * Play a Pokémon Champions battle in the terminal against the bot (level 2 by default).
 *
 *   npm run play                          # singles with the default teams
 *   npm run play -- --mode doubles        # doubles
 *   npm run play -- --team mi-equipo.txt  # your own team (Showdown export format)
 *   npm run play -- --bot 1               # easier rival (0 random, 1 aggressive, 2 tactical; 3 expert is the default)
 *   npm run play -- --help                # all options
 */
import { runCli } from './app';
import { createTerminalIO } from './io';

const io = createTerminalIO();
try {
  process.exitCode = await runCli(process.argv.slice(2), io);
} finally {
  io.close();
}
