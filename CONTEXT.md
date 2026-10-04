# bwmusic

A black-and-white music remote for the Bangle.js 2 watch, controlling playback on an Android phone through Gadgetbridge. It replaces the `gbmusic` app.

## Language

### Playback

**Track**:
The song the phone reports as current: title, artist and (optionally) album.
_Avoid_: song info, music info, now playing

**Playback state**:
Whether the phone is playing, paused or stopped, as last reported by the phone.
_Avoid_: music state, status

### App lifecycle

**Auto-opened**:
The app was launched by its boot hook because playback started while a clock face was showing.
_Avoid_: auto-started, popped up

**Opened by hand**:
The app was launched by the user from the launcher.
_Avoid_: manual start

**Dismissed**:
The user left an open app with a long press while playback was still playing; it suppresses auto-open until playback pauses or stops and starts again.
_Avoid_: closed, exited, hidden

**Auto-close**:
The app returning to the clock on its own, which only happens when it was auto-opened.
_Avoid_: timeout exit

### Verification

**Device check**:
The short checklist a human runs on the real watch after `pnpm flash`, because AFK agents cannot reach the device.
_Avoid_: manual test, QA
