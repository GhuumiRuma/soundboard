# Product

<!-- impeccable:product-schema 1 -->

This record covers Soundboard, the app in this repository. It is a soundboard of its own. It is not a remote
control for Stream Studio and does not need Stream Studio to run.

Facts marked *(inferred)* come from the repository or from the owner's earlier requests rather than from
a direct answer. Everything else was confirmed through the project coordinator, who speaks with the owner.

## Platform

web

## Users

One user: the owner. She is a Twitch streamer who also goes live on TikTok. She is not a developer. She
already plays sounds from the soundboard in Stream Studio on her Windows PC, and asked for one "in the same
style as the StreamStudio one" that also runs on her phone, her tablet and her computers, Android and Apple.

She plays sounds while she streams, so she is often busy with something else: a game in front on her PC, or
a phone in one hand *(inferred)*.

## Product Purpose

Give her big, colourful sound buttons on every device she owns. She adds a sound (or records one), picks its
name, emoji, colour, volume and key, and plays it with a tap or a key press. Sounds live on boards, and a
backup is one file she can keep somewhere safe.

Success means:

- a sound goes from a file to a button in a few taps, and plays the instant she taps it;
- it looks and reads like the soundboard she already knows, so there is nothing new to learn *(inferred from
  "in the same style as the StreamStudio one")*;
- her sounds are still there next time, and she knows what to do to keep them safe;
- she never has to read a technical term to get something done *(inferred)*.

## Positioning

A soundboard of its own. It plays sounds through the speakers or headphones of the device it is open on.
Everything stays on that device: no account, no cloud, no tracking.

One codebase gives her a web app that installs from the browser (iPhone, iPad, Android, Windows, Mac), an
Android app file, and a Windows installer and a Mac disk image. In the Windows and Mac apps the sound keys
work even while a game or another app is in front.

## Operating Context

- **Phone (under about 720 px wide):** one thumb, short moments. Two columns of buttons, a bar at the bottom
  with a big Stop all, the master volume, Add and Record, and the editor opens as a bottom sheet.
- **Tablet and computer:** Stream Studio's page layout: title and actions on top, board tabs, the grid of
  buttons, and an edit card.
- **Keys:** in a browser, sound keys work while the Soundboard window is in front and she isn't typing in a box.
  In the Windows and Mac apps they work everywhere. A switch turns them all off.
- **Sound:** goes out through the device's normal sound output, so anything that captures the computer's
  sound (like Stream Studio's Desktop audio) should hear it. This has not been tried with Stream Studio.
- **Boards:** she starts with one empty board called My sounds. No sounds are bundled.

## Capabilities and Constraints

- **Built as a PWA:** React 19, TypeScript, Vite and zustand, hosted on GitHub Pages at `/soundboard/`.
  Sound is the Web Audio API; storage is IndexedDB; an offline copy comes from vite-plugin-pwa. The Android
  app wraps the same build in Capacitor and the Windows and Mac apps wrap it in Tauri 2. The apps carry
  their own copy of Soundboard, so they have no offline copy of the web version inside them.
- **Sounds:** MP3, WAV or OGG, up to 20 MB each. Up to 32 can play at once. Recordings are up to 1 minute.
- **Storage:** sounds and boards live in the browser's storage on the device. Clearing site data or
  uninstalling the app deletes them, so the app offers a one-file backup (up to 500 MB) and a reminder.
  Safari can clear a website's data after about a week without a visit; an app on the Home Screen is exempt.
- **iPhone and iPad limits:** sound follows the silent switch unless Safari supports
  `navigator.audioSession` (Safari 16.4 and later). OGG needs Safari 18.4 or later; older iPhones are told to
  use MP3 or WAV. Sound keys need a keyboard.
- **Not tested on real iPhones, iPads or Macs.** The build was made on a Windows PC. Say so wherever the
  docs make a claim about them.
- **Left out on purpose:** On stream / Only me, the always-on-top pop-out window, recording from speakers,
  Linux, store listings, automatic desktop updates, choosing the output device, importing from Stream Studio,
  and an OGG decoder for old iPhones.

## Brand Commitments

- **Name:** Soundboard.
- **Look and voice:** Stream Studio's. The same purple dark theme (with Light and System beside it), the same
  colourful sound buttons and the same plain wording, ported rather than reinvented. `DESIGN.md` says what came
  from where.
- **Themes:** Dark, Light and System. The default is System, which follows the device. Both themes keep text
  at 4.5:1 contrast or better.
- **Voice:** plain, friendly, second person ("you"). Controls name their action. Messages say what happened
  and what to do next, and the app says "I" when it speaks, as Stream Studio does. Every destructive action
  can be undone.
- **Free and private:** no account, no cloud, no tracking, no ads. Her sounds never leave her device unless
  she saves a backup and moves it herself.
- **No bundled sounds:** she brings her own. The app ships none, so it never ships anything copyrighted.

## Evidence on Hand

- No testimonials, user counts, benchmarks or press exist. Do not invent them.
- Tests use synthetic audio only (generated tones), never real sounds, keys or recordings.
- `README.md` is the user guide and must match what the app does.

## Product Principles

1. **Plain words over power words.** If a term needs explaining, use a different term. *(carried over from
   Stream Studio)*
2. **Same as Stream Studio.** Where Stream Studio already has a look, a rule or a sentence for something, use
   it instead of inventing a new one.
3. **Calm while live.** Every change is easy to undo, nothing pops up uninvited, and a new version never
   restarts the app while she is using it.
4. **One tap, then Undo.** Tapping a button plays it at once. Deleting, replacing and restoring can be undone
   for a few seconds.
5. **Stays on the device.** No feature may need an account or send her sounds anywhere.
6. **Honest about the device.** When a device can't do something (OGG on an old iPhone, a blocked
   microphone, sound keys without a keyboard), say so plainly and say what to do instead.

## Accessibility & Inclusion

- Everything works from the keyboard, and every control has a name a screen reader can say, such as
  "Play Honk, Not set" for a button.
- White text on every button colour keeps at least 4.5:1 contrast, and text in both themes does too.
- The keyboard focus ring stays visible on both themes.
- Touch targets are at least 44 px. Buttons give a small tap on phones that can do that.
- Reduced motion is respected: the lift and the press flash stop.
- Checked with automated scans (axe) and keyboard-only tests at phone, tablet and computer sizes in dark and
  light. Not yet tried with VoiceOver or TalkBack on a real phone.
