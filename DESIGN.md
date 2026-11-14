# Design

Soundboard is Stream Studio's soundboard, made to run on phones, tablets and computers. Its look, its wording
and its rules come from Stream Studio. This file says what was ported and where it lives, what was changed on
purpose and why, and how it is checked. `PRODUCT.md` says who it is for and how it should sound.

## What came from Stream Studio

Stream Studio's own code was only read while building Soundboard. Nothing in it was changed.

| Stream Studio | Soundboard | What it does |
| --- | --- | --- |
| `wwwroot/css/app.css`: colours, themes, shell gradient, focus ring, reduced motion | `src/styles/tokens.css`, `src/styles/components.css` | The purple dark theme, the light theme, and the shared look |
| `.ss-*` classes in `app.css` | `src/styles/components.css` | Cards, chips, inputs, the dashed empty state and drop zone, the bottom Undo bar, problem and note messages |
| `Soundboard.razor` and `Soundboard.razor.css` | `src/components/SoundTile.tsx`, `src/styles/soundboard.css` | The grid of sound buttons, the Edit pill, the press flash |
| `SoundboardWindowPresenter.Shades()` | `src/model/shades.ts` | The gradient colours of a button, kept dark enough for its white text |
| The Plain, Emoji and Color rules in the presenter | `src/model/rules.ts` | Names (48 characters, cut with …), emoji (2 characters), colours (`#RRGGBB`), volume (starts at 80%) |
| `StudioModels.cs` (Soundboard, SoundItem) | `src/model/types.ts`, `src/model/boards.ts` | Boards and sounds, and the changes you can make to them |
| `MediaLibrary.cs` | `src/storage/import.ts` | The 20 MB limit, telling MP3, WAV and OGG apart by their content, the friendly error messages |
| `RecordingReview.cs`, `WavFile.cs`, `RecorderPresenter.cs` | `src/audio/recorder/` | Trim, waveform, WAV, turn-down and fades |
| `UndoService` | `src/state/undo.ts` | The Undo bar and its 10 seconds |
| `HotkeyRecorder.razor`, `HotkeyGesture.cs`, `HotkeyServiceContracts.cs` | `src/keys/`, `src/components/HotkeyRecorder.tsx` | The key recorder, "Not set", the warnings and the "Already used" messages |
| `PRODUCT.md` voice | every message in the app | Plain, second person, says what happened and what to do next |

## Colours and shape

The tokens are Stream Studio's, in `src/styles/tokens.css`.

| Token | Dark | Light |
| --- | --- | --- |
| Page | `#111018` | `#faf8ff` |
| Panel | `#1b1824` | `#ffffff` |
| Panel 2 | `#241f31` | `#f0eaff` |
| Text | `#f7f2ff` | `#21182f` |
| Muted text | `#c9c1d9` | `#5f566d` |
| Accent | `#8b5cf6` | `#8b5cf6` |
| Border | `rgba(255,255,255,.12)` | `rgba(54,38,76,.16)` |

Radius is 14 px and the gap is 16 px. Live is `#e5484d`, OK is `#30a46c` and warning is `#f5a524` (darker
shades of each on the light theme). The page has Stream Studio's soft purple glow in the top left corner. The
font is Segoe UI Variable first, then each device's own system font. Dark, Light and System are chosen in
Settings, and System (the default) follows the device. `index.html` sets the theme before the page draws, so
there is no flash of the wrong one.

## Sound buttons

- A grid of `minmax(160px, 1fr)` buttons with a 14 px gap. Each is at least 128 px tall, with 18 px corners and
  16 px of padding.
- A gradient from the sound's colour, a 34 px emoji, the name in bold, and a chip with its key ("Not set"
  until she picks one). A small **✏️ Edit** pill opens the editor. Right-click and press-and-hold do too.
- Hover and focus lift the button. While a sound plays the button brightens and presses in for about 350 ms.
  Reduced motion turns the movement off.
- `shades()` keeps the lightest part of a button below a luminance of 0.14, so white text on any colour is at
  least 4.5:1. A very light colour is darkened more. All eight palette colours and some hostile ones (white,
  yellow) are tested.

## Layouts

- **Phone (under about 720 px):** two columns of buttons, board chips that scroll sideways, and a bar fixed to
  the bottom with a big **Stop all**, the master volume, **Add** and **Record**. The editor and the recorder
  open as a bottom sheet. Safe-area insets keep everything clear of notches and home bars.
- **Tablet and computer:** Stream Studio's page: the title and the actions on top, the sound-keys card, the
  board tabs, the board card with its drop zone, the grid, and an edit card under it.

## What changed on purpose

- **Filled buttons use `#7c3aed`** (hover `#6d28d9`). The accent stays `#8b5cf6`, but white text on it is
  only about 4.2:1; on `#7c3aed` it is about 5.7:1. The Stop all button is `#c6282e` for the same reason.
- **The light theme's focus ring is `#6d28d9`.** Stream Studio's lighter purple ring is only about 2.9:1 on
  the light page. Tabs draw their ring inside themselves so the next tab doesn't cover it.
- **`shades()` instead of `color-mix`.** Stream Studio's Soundboard page mixes a button's colour with black (92%
  at the top, 55% at the bottom), which can't promise white text 4.5:1 on a bright colour. Its pop-out window
  already had `Shades()`, which can, so every button here uses that. It still looks like a gradient that gets
  darker towards the bottom.
- **A long emoji is cut to its first two characters**, as Stream Studio does. The speaker 🔊 is used only when
  the box is empty or holds nothing usable.
- **A button's spoken name includes its key** ("Play Honk, Not set"), so a screen reader says what the key is.
- **Problems and notes** show floating on the page, or as a row under the content inside a pop-up, so they
  are never hidden behind one.
- **Sound keys can be warned about, or refused.** Keys without Ctrl, Alt or Win/Cmd get a warning (they are easy
  to hit by mistake). Ctrl+Z / Cmd+Z (Undo) and the browser's own keys, like Ctrl+W, are refused, because
  nothing could use them.
- **Press and hold opens the editor on a touch screen** (Stream Studio uses right-click), and doesn't play the
  sound. A tap plays when the finger lifts, so scrolling past a button stays silent.
- **Replacing a file can be undone**, and a sound can be moved to another board with a **Move** button.
- **Restoring a backup asks**: **Add them to what I have** or **Replace everything** (undoable). When a backup
  is added, a key that is already in use is left off rather than taking it from another sound.
- **A new version never reloads the page by itself.** A bar says it is ready and she picks **Update now** or
  **Later**, so a sound is never cut off.
- **The Android and desktop apps carry no offline copy.** They bring their own copy of Soundboard, so the build
  for them (`npm run build:native`) leaves the service worker and manifest out. CI checks this.

## How it is checked

- **Unit tests** (`npm test`): the rules and shades (including contrast for every palette colour), importing and
  its messages, storage and reference counting, the audio engine with a pretend `AudioContext`, trim, waveform
  and WAV, key names and clashes, backup round trips, and the update and install logic.
- **Real browser checks** (`npm run e2e`, which builds first): Chromium at phone 390×844, tablet 820×1180 and
  computer 1280×800, in dark and light.
  - No errors in the console, and an accessibility scan (axe) with nothing serious.
  - Keyboard-only use of every screen, with the focus ring checked against the background it sits on.
  - Reduced motion, and a scan that every touch target is at least 44 px.
  - A real sound: a generated WAV is imported, played, stopped and stopped all.
  - The recorder with Chromium's fake microphone, and backup and restore through real files.
  - The offline copy and the "new version ready" bar.
- Not checked: iPhone, iPad and Mac. They can't be run from the PC this was built on.

## Left out on purpose

On stream / Only me, the always-on-top pop-out window, recording from speakers, Linux, store listings,
automatic desktop updates, choosing the output device, importing from Stream Studio, and an OGG decoder for
old iPhones.
