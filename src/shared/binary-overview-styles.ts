import { css, unsafeCSS } from "lit";
import {
  BUTTON_SHAPE_MS,
  LIGHTS_OVERVIEW_ENTITY_GRID_MIN_COL,
  LIGHTS_OVERVIEW_GRID_GAP,
  LIGHTS_OVERVIEW_GRID_MIN_COL,
  LIGHTS_OVERVIEW_TILE_RADIUS,
  SHAPE_OFF_TILE_RADIUS,
} from "../const";
import { STANDARD_EASING } from "./animation";

export const binaryOverviewStyles = css`
  .room-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(${LIGHTS_OVERVIEW_GRID_MIN_COL}px, 1fr));
    gap: ${LIGHTS_OVERVIEW_GRID_GAP}px;
  }

  .entity-grid {
    grid-template-columns: repeat(auto-fit, minmax(${LIGHTS_OVERVIEW_ENTITY_GRID_MIN_COL}px, 1fr));
  }

  .room-tile {
    padding: 9px;
    border-radius: ${LIGHTS_OVERVIEW_TILE_RADIUS}px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 2px;
    box-sizing: border-box;
    /* iOS would otherwise answer a long press with the text-selection
       magnifier and its own share/copy callout. */
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    transition: transform 120ms ease-out;
  }

  /* Without this the hold is invisible until the popup appears, which
     reads as an unresponsive tile. */
  .room-tile.pressed {
    transform: scale(0.96);
  }

  .room-tile.shaped {
    transition:
      transform 120ms ease-out,
      border-radius ${unsafeCSS(BUTTON_SHAPE_MS)}ms ${unsafeCSS(STANDARD_EASING)};
  }
  .room-tile.shaped:not(.is-on) {
    border-radius: ${SHAPE_OFF_TILE_RADIUS}px;
  }

  .no-animations .room-tile {
    transition: none;
  }

  .room-tile:focus-visible {
    outline: 2px solid var(--tile-color);
    outline-offset: 2px;
  }

  .room-tile.unavailable {
    opacity: 0.4;
    cursor: default;
  }

  .room-tile.not-switchable {
    cursor: default;
  }

  .tile-header {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .tile-header ha-icon {
    --mdc-icon-size: 13px;
    color: var(--tile-color);
    flex-shrink: 0;
  }

  .tile-name {
    font-size: 10px;
    opacity: 0.7;
    color: var(--m3p-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .tile-state {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .tile-state .state-icon {
    --mdc-icon-size: 18px;
    flex-shrink: 0;
    color: var(--tile-color);
  }

  .state-text {
    font-size: 17px;
    font-weight: 500;
    color: var(--m3p-text);
    line-height: 1.1;
  }

  .tile-secondary {
    min-width: 0;
    margin-inline-start: auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    opacity: 0.55;
    color: var(--m3p-secondary-text);
  }

  .empty-state {
    text-align: center;
    font-size: 13px;
    opacity: 0.6;
    padding: 16px 0;
    color: var(--m3p-secondary-text);
  }
`;
