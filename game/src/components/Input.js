// Central keyboard handling: one listener for the whole game.
// Gameplay keys only act while gameplay is enabled (the game is being played); everywhere else they
// are left to the browser, so menu buttons work normally. Interface keys (such as Escape) work in every state.
let gameplayEnabled = false;

// gameplay and ui map KeyboardEvent.code values (layout independent) to handlers.
// ui handlers receive the event, so they can tell what was focused.
export function createInput({ gameplay, ui }) {
  window.addEventListener('keydown', (event) => {
    const gameplayAction = gameplay[event.code];
    if (gameplayAction && gameplayEnabled) {
      event.preventDefault();
      if (!event.repeat) gameplayAction();
      return;
    }

    const uiAction = ui[event.code];
    if (uiAction && !event.repeat) uiAction(event);
  });
}

export function setGameplayEnabled(enabled) {
  gameplayEnabled = enabled;
}
