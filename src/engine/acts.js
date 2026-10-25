// What some acts make on top of every act's tasks as the stage starts, after their stage init (CreateGameStage,
// SAT-R decompilation src/game/shared/stage/stage.c), by level: Secret Base act 1's spotlights, made while
// Sonic's checkpoint is at or before x 1368, which also keep the title card from fading the screen in
// (its screenBlank).

import { createSpotlights, SPOTLIGHTS_FADE_X } from './spotlights.js';

const SECRET_BASE_1 = 2;

/** { tasks, to add at the objects' priority in order, spotlights (spotlights.js) or null, cardBlank }. */
export function createActTasks(level, checkpointX) {
  if (level === SECRET_BASE_1 && checkpointX <= SPOTLIGHTS_FADE_X) {
    const spotlights = createSpotlights();
    return { tasks: spotlights.tasks, spotlights, cardBlank: true };
  }
  return { tasks: [], spotlights: null, cardBlank: false };
}
