import { join } from 'node:path';
import { DATASETS_DIR, ladderReplaysDir } from '@colleja/metagame';

export { FolderReplayStore } from '@colleja/metagame';

/** Local, unversioned datasets of the ladder (`datasets/ladder/`, git-ignored). */
export const DATASETS = join(DATASETS_DIR, 'ladder');

/** The doubles format, the only one with enough replays for now. */
export const LADDER_FORMAT = 'gen9championsvgc2026regmc';

export const replaysDir = (format: string) => ladderReplaysDir(format);
