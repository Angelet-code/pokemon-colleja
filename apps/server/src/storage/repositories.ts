/** Everything the user saves (PLAN §3.7), as seen by the routes and the battle manager. */
import type { BenchRepository } from '../bench/bench-repository';
import type { OpponentRepository } from '../opponents/opponent-repository';
import type { ReplayRepository } from '../replays/replay-repository';
import type { TeamRepository } from '../teams/team-repository';

export interface Repositories {
  teams: TeamRepository;
  opponents: OpponentRepository;
  replays: ReplayRepository;
  bench: BenchRepository;
}
