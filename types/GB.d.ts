// Local declarations not covered by the vendored BangleApps types.
// Kept outside types/vendor/ so tools/update-vendor never overwrites them.

/** An event object sent by Gadgetbridge over BLE, e.g. `{t:"musicinfo", ...}`. */
type GBEvent = { t: string; [key: string]: unknown };

/**
 * Entry point Gadgetbridge calls for every event. Defined by the `android`
 * app's boot code; apps wrap it to intercept events and must pass others on.
 */
declare var GB: ((event: GBEvent) => void) | undefined;
