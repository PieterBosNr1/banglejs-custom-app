// Local declarations not covered by the vendored BangleApps types.
// Kept outside types/vendor/ so tools/update-vendor never overwrites them.

/** An event object sent by Gadgetbridge over BLE, e.g. `{t:"musicinfo", ...}`. */
type GBEvent = { t: string; [key: string]: unknown };

/**
 * Entry point Gadgetbridge calls for every event. Defined by the `android`
 * app's boot code; apps wrap it to intercept events and must pass others on.
 */
declare var GB: ((event: GBEvent) => void) | undefined;

/** The running bwmusic app's state; set by app.js. */
declare var bwmusic: { m: import("../apps/bwmusic/lib").Model; title: string[]; draws: number } | undefined;

declare namespace Bangle {
  /** Send a player command (e.g. "playpause") to the phone; defined by the `android` app's boot code. */
  let musicControl: ((cmd: string) => void) | undefined;
}
