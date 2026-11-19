import { css } from "lit";
import {
  OPENINGS_GROUP_GAP,
  OPENINGS_GROUP_RADIUS_INNER,
  OPENINGS_GROUP_RADIUS_OUTER,
  OPENINGS_GROUP_RADIUS_PRESSED,
  OPENINGS_HERO_SIZE,
  OPENINGS_ICON_RADIUS,
  OPENINGS_ICON_SIZE,
  OPENINGS_ROW_HEIGHT,
} from "../const";

export const compactStatusStyles = css`
  .m3-header:not([role="button"]) {
    cursor: default;
  }

  .hero-line {
    display: flex;
    align-items: baseline;
    gap: 5px;
  }

  .hero-n {
    font-size: ${OPENINGS_HERO_SIZE}px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .hero-l {
    font-size: 14px;
    font-weight: 600;
  }

  .compact-rows {
    --lr-row-height: ${OPENINGS_ROW_HEIGHT}px;
    --lr-row-radius: ${OPENINGS_GROUP_RADIUS_INNER}px;
    --lr-icon-size: ${OPENINGS_ICON_SIZE}px;
    --lr-icon-radius: ${OPENINGS_ICON_RADIUS}px;
    --lr-row-gap: ${OPENINGS_GROUP_GAP}px;
  }

  .compact-rows .lr-row:first-child {
    border-top-left-radius: ${OPENINGS_GROUP_RADIUS_OUTER}px;
    border-top-right-radius: ${OPENINGS_GROUP_RADIUS_OUTER}px;
  }

  .compact-rows .lr-row:last-child {
    border-bottom-left-radius: ${OPENINGS_GROUP_RADIUS_OUTER}px;
    border-bottom-right-radius: ${OPENINGS_GROUP_RADIUS_OUTER}px;
  }

  .compact-rows .lr-row:active {
    border-radius: ${OPENINGS_GROUP_RADIUS_PRESSED}px;
  }

  .compact-rows .lr-icon ha-icon {
    --mdc-icon-size: 18px;
  }

  .compact-row-name {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--m3p-text, var(--primary-text-color));
  }

  .compact-row-sub {
    font-size: 12px;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--m3p-secondary-text, var(--secondary-text-color));
  }

  .compact-action {
    min-height: 36px;
    min-width: 44px;
    padding: 0 10px;
    border-radius: 18px;
  }
`;
