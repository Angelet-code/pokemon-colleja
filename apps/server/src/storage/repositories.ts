/** Everything the user saves (PLAN §3.7), as seen by the routes and the battle manager. */
import type { OpponentRepository } from '../opponents/opponent-repository';
import type { TeamRepository } from '../teams/team-repository';

export interface Repositories {
  teams: TeamRepository;
  opponents: OpponentRepository;
}
