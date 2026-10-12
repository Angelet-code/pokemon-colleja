/**
 * The learned value the level 3 bot uses (fase 19): the model trained by `npm run ladder:train`
 * with the current factors. The test of the shipped model fails if `FEATURES_VERSION` changes
 * without regenerating it.
 */
import shipped from './models/value-v1.json';
import type { ValueModel } from './value-model';

export const VALUE_MODEL: ValueModel = shipped;
