# Soundboard

A soundboard for your phone, tablet and computer, in the same style as Stream Studio's. Make big coloured buttons for your sounds and play them with a tap or a key. It plays sounds on the device you install it on, so it isn't a remote control for Stream Studio. No account, no cloud and no tracking.

**Open it:** https://ghuumiruma.github.io/soundboard/

## Get it on your device

Every phone, tablet and computer can use Soundboard from the link above. Android, Windows and Mac also have an app you can download.

- **iPhone or iPad:** open the link in **Safari**, tap **Share** (the square with an arrow pointing up), scroll down and tap **Add to Home Screen**, then tap **Add**.
- **Android app:** on the phone, open the [Latest Android app release](https://github.com/GhuumiRuma/soundboard/releases/tag/android-latest) and tap **Soundboard.apk** to download it. Open the downloaded file and tap **Install**. The first time, Android asks you to allow installs from your browser: tap **Settings** in the message, switch on **Allow from this source**, then go back and tap **Install**. New versions install right over the old one and keep your boards and sounds, so don't uninstall first (see [Updating](#updating)).
- **Windows:** open the [Latest computer apps release](https://github.com/GhuumiRuma/soundboard/releases/tag/desktop-latest), download **Soundboard-Windows-Setup.exe** and double-click it. It works on Windows 10 and 11. Windows warns you the first time (see [the first time you open the Windows or Mac app](#the-first-time-you-open-the-windows-or-mac-app)).
- **Mac:** on the same release page, download **Soundboard-Mac.dmg** (it works on Apple Silicon and Intel Macs), open it and drag **Soundboard** onto **Applications**. The Mac warns you the first time too.
- **Any browser:** open the link. In Chrome or Edge, click the install icon at the right end of the address bar, or open the menu and choose **Install Soundboard**. On Android, open the browser's menu (the three dots) and tap **Install app** or **Add to Home screen**. In Safari on a Mac, choose **File → Add to Dock**. Inside Soundboard, **Settings → Install on this device** shows the steps for the device you're on.

After the first visit it works without internet.

| Your device | Best way to get it | Do sound keys work? |
| --- | --- | --- |
| iPhone or iPad | **Add to Home Screen** from Safari | While Soundboard is in front, with a keyboard connected |
| Android phone or tablet | **Soundboard.apk**, or **Install app** in Chrome | While Soundboard is in front, with a keyboard connected |
| Windows | **Soundboard-Windows-Setup.exe** | Everywhere, even while a game or another app is in front |
| Mac | **Soundboard-Mac.dmg** | Everywhere, even while a game or another app is in front |
| A computer's browser | The link above | While the Soundboard window is in front and you aren't typing in a box |

### The first time you open the Windows or Mac app

These apps aren't signed with a paid certificate, so Windows and macOS warn you the first time. They are safe to open. This is how to get past the warning.

- **Windows:** if Windows says **Windows protected your PC**, click **More info**, then **Run anyway**. It installs just for you and never asks for an administrator password.
- **Mac:** open the `.dmg` and drag **Soundboard** onto **Applications**, then open Soundboard from Applications. If the Mac says it can't verify the app, open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. On older versions of macOS you can right-click the app and choose **Open** instead. Allow the microphone when asked if you want to record sounds. If the Mac says the app is "damaged", open Terminal and run `xattr -cr /Applications/Soundboard.app`.

## Updating

- **Web app and Home Screen app:** when there's a new version, a bar says **A new version of Soundboard is ready.** Tap **Update now**. Your boards and sounds will still be here. **Later** hides the bar for this visit, and the new version is used once you've closed Soundboard and opened it again. Soundboard looks for a new version about once an hour, and when you come back to it after a while.
- **Android app:** download the newest **Soundboard.apk** from the [release](https://github.com/GhuumiRuma/soundboard/releases/tag/android-latest) and install it right over the app you already have. Android shows **Update**, and your boards and sounds stay. **Don't uninstall first**: that deletes everything the app has saved.
- **Windows and Mac apps:** they don't update themselves yet. Download the newest file from the [release](https://github.com/GhuumiRuma/soundboard/releases/tag/desktop-latest) and install it the same way as the first time. Your sounds should still be there afterwards. To be extra safe, tap **Save a backup** in Settings first (see [Back up and restore](#back-up-and-restore)).

## What you can do

- **Boards:** keep your sounds on as many boards as you like, rename them, and move a sound from one board to another. You always keep at least one board.
- **Sounds:** add MP3, WAV or OGG files (up to 20 MB each) by browsing or by dragging them onto the page. Give each one its own name, emoji, colour and volume.
- **Playing:** tap a button to play it. Taps overlap, so you can play a sound again before it ends or play several at once. **Stop all sounds** cuts everything straight away, and one **Master volume** sets the loudness of the lot.
- **Record a sound:** record with your microphone for up to a minute. The quiet bits at the start and end are trimmed for you, and nothing is saved until you press **Save sound**.
- **Sound keys:** give each sound a key, and one for **Stop all sounds**. In the Windows and Mac apps they work even while a game or another app is in front.
- **Back up and restore:** one file holds all your boards and sounds.
- **Make it yours:** Dark, Light, or System (it follows your device). The look is Stream Studio's: the same purple, the same colourful buttons.
- **Safety net:** deleting a sound or a board, or replacing a file, can be undone for a few seconds.
- **Everything stays on your device.** There is no account, no cloud and no tracking.

## Using Soundboard

### Add a sound

1. Press **Add a sound** on an empty board, **Add sounds** on a tablet or computer, or **＋ Add** on a phone, then pick one or more MP3, WAV or OGG files. On a tablet or computer you can also drag files onto the page.
2. A new button appears. Its name comes from the file's name (`air_horn-2.mp3` becomes "Air horn 2"), and each new button gets its own emoji and colour.

Soundboard comes with no sounds, so use sounds you have the right to use.

### Change a sound

Tap **✏️ Edit** on a button. You can also press and hold a button on a touch screen, or right-click it on a computer. On a phone the editor slides up from the bottom. On a tablet or computer it's a card on the page. Press **Esc** or **Close** to put it away.

- **Name:** up to 48 characters.
- **Emoji:** pick one of 24.
- **Colour:** pick one of 8, or **Pick your own colour**. The button's text stays easy to read whichever colour you choose.
- **Volume:** how loud this sound is. It starts at 80%.
- **Sound shortcut:** the key for this sound (see [Sound keys](#sound-keys)).
- **▶ Play** lets you hear it. **Replace file** swaps in a different sound file, and **Replace by recording** swaps in a new recording. Either way the name, colour, volume and key stay the same.
- **Move to board** (pick a board, then press **Move**) puts the sound on another board.
- **Delete** removes the sound. You can undo it.

### Boards

A board is a page of buttons, like "My sounds", which is the one you start with. **+ New board** adds another, called "New board". Tap a board's name to open it. Change its name in the **Board name** box. **Delete board** removes the board and the sounds on it, and you can undo it. It's switched off when you only have one board, because you always keep at least one.

### Play and stop

- Tap or click a button to play it. The button brightens and presses in for a moment. Up to 32 sounds can play at once. After that, the oldest one is cut off.
- **Stop all sounds** stops everything at once. It's at the top of the page on a tablet or computer, and a big **Stop all** at the bottom of the screen on a phone.
- **Master volume** sets how loud everything is, from 0 to 100%. It's in the box at the top on a tablet or computer, and in the bar at the bottom on a phone.
- Short sounds are ready to play straight away. A long sound takes a moment the first time you tap it.

### Undo

After you delete a sound or a board, or replace a file, a bar appears at the bottom with **Undo**. You have 10 seconds. **Ctrl+Z** (**Cmd+Z** on a Mac) does the same when you aren't typing in a box. If you've done several things, Undo brings back the newest one first.

### Settings

Tap **⚙️ Settings** at the top of the page for the look (**Dark**, **Light** or **System**), the **Sound keys** switch and the Stop all sounds shortcut, **Backup and restore**, **Install on this device**, and the version of Soundboard you have.

## Sound keys

- Open **✏️ Edit**, click the **Sound shortcut** box and press the keys you want, like **Ctrl+Alt+1**. **Esc** cancels. **Backspace** or **Delete** clears the key.
- The key for **Stop all sounds** is in **Settings** (and in the sound controls on a tablet or computer).
- **Ctrl + Alt + a number** (**Ctrl + Option + a number** on a Mac) makes a good sound key, because it doesn't get in the way of typing or games.
- Soundboard warns you when a key has no **Ctrl**, **Alt** or **Cmd** with it, because it's easy to press by mistake. It tells you when a key is **Already used** by another sound, and it won't take the keys your browser keeps for itself, like Ctrl+W.
- The **Sound keys** switch turns every key on or off at once. Your keys stay saved while it's off.
- In a browser, on a phone or in the Android app, sound keys work while Soundboard is in front and you aren't typing in a box. Phones and tablets need a keyboard connected. In the Windows and Mac apps they work everywhere, even while a game or another app is in front. Because of that, those apps take the key away from other programs while Sound keys are on.

## Record a sound

1. Press **Record** (**🎙️ Record** on a phone, **Record a sound** on an empty board). Allow the microphone when you're asked.
2. Press **Record**, make your noise, then press **Stop**. It stops by itself after 1 minute.
3. Soundboard trims the quiet at the start and end for you and tells you so. Drag **Start** and **End** to change what's kept (the arrow keys move them too), and press **Play** to listen.
4. Type a name and press **Save sound**. It's added to the board you're on. **Record again** starts over, and **Discard** throws the recording away after asking you.

If a recording is too loud, Soundboard turns it down so it doesn't crackle. It never turns a quiet one up. Recordings are saved as WAV files. Tick **Also save a copy as a file** to keep a copy outside Soundboard too.

## Back up and restore

A backup is one file with all your boards and sounds. Clearing your browser data or uninstalling the app deletes your sounds, so keep a copy somewhere safe, like cloud storage or a USB stick.

- **Save a backup:** in **Settings → Backup and restore**. The file is called "Soundboard backup" followed by the date, and it ends in `.zip`. On a computer's browser it goes to your Downloads folder. On a phone's browser it opens the share sheet if the phone has one, otherwise it goes to Downloads. In the Android app it opens the share sheet, so you can send it to Google Drive, Files or anywhere else. In the Windows and Mac apps you choose where to save it.
- **Restore from a backup:** pick a backup file you saved before (don't unzip it first). If you already have sounds, choose **Add them to what I have** or **Replace everything**. Replace everything can be undone for a few seconds. If a sound in the file can't be restored, Soundboard skips it, tells you which one, and restores the rest.
- Settings shows when your last backup was, and a gentle reminder appears 3 days after you add your first sound. **Not now** hides it for a week. A backup less than 2 weeks old counts as recent.
- A backup can hold up to 500 MB.

## Where your sounds are kept

Your boards, settings and sounds are saved on the device you're using, in the browser's or app's own storage. They are never uploaded, and there is no account, no cloud and no tracking. The web app only uses the internet to get its own files and new versions. Soundboard asks your browser to keep that storage safe, but clearing the site's data or uninstalling the app still deletes it, so [make a backup](#back-up-and-restore) of anything you want to keep.

## Troubleshooting

Soundboard hasn't been tested on an iPhone, an iPad or a Mac. It was built and checked on a Windows computer, so if something doesn't look or sound right on one of those, that's the first place to look. See [What was and wasn't tested](#what-was-and-wasnt-tested).

| Problem | What to do |
| --- | --- |
| Nothing plays when I tap a button | Check the volume on your device and **Master volume** in Soundboard. On an iPhone or iPad, check the silent switch on the side too. Before iOS 16.4 it mutes Soundboard. From iOS 16.4, Soundboard asks iOS to play anyway, but that hasn't been tried on a real iPhone. Read any message at the bottom of the page, because it says what went wrong. |
| "This device can't play OGG sounds yet" | iPhones and iPads before iOS 18.4 can't play OGG files. Add the sound again as an MP3 or WAV. |
| "That sound is too big (the limit is 20 MB)" | A sound can be up to 20 MB. A WAV is much bigger than an MP3 of the same sound, so save it as an MP3 or trim it in another app, then add it again. |
| "That file type isn't supported" | Sounds can be MP3, WAV or OGG. Save the sound as one of those first. |
| "I couldn't play that file. It may be damaged." | Try adding it again. If it still fails, use an MP3 or WAV. |
| "I can't find that sound's file any more" | Open **✏️ Edit** on that button, then press **Replace file** to add the sound again. |
| A long sound is slow the first time | Long sounds are got ready the first time you tap them. After that they play at once. |
| Dropping files on the page does nothing | Dragging files is for tablets and computers. On a phone, use **＋ Add**. |
| Record says it can't use the microphone | Allow the microphone when you're asked. If you said no before, allow it for this site in your browser's site settings (in Chrome, tap the lock next to the address). In the Windows or Mac app, allow it in your computer's privacy settings. Check that no other app is using the microphone, then press **Try again**. |
| My sound keys don't do anything | Check that the **Sound keys** switch in Settings is on. In a browser, on a phone and in the Android app, Soundboard has to be in front and you can't be typing in a box. Phones and tablets need a keyboard connected. |
| A message says a sound key isn't working | Another program is probably using that key. Pick another one in **✏️ Edit**. **Ctrl + Alt + a number** is a good choice. |
| My sounds are gone | If you cleared your browser data or uninstalled the app, the sounds went with it. Use **Restore from a backup** in Settings. On an iPhone, Safari can clear what a website has saved if you haven't visited it for a while, and an app on your Home Screen is safe from that. |
| I added sounds in Safari, but they aren't in my Home Screen app | The two keep their sounds separately. In Safari, tap **Save a backup**. Then open Soundboard from your Home Screen and tap **Restore from a backup** in Settings. |
| "This browser won't let me keep your sounds" | You may be in a private window. Open Soundboard in a normal window instead. |
| "I couldn't update just now" | Close Soundboard completely, then open it again to get the new version. |
| Windows says "Windows protected your PC" | Click **More info**, then **Run anyway**. |
| The Mac says it can't verify the app, or that it's "damaged" | See [the first time you open the Windows or Mac app](#the-first-time-you-open-the-windows-or-mac-app). |
| Android says it can't install from my browser | The first time, Android asks you to allow installs from your browser. Tap **Settings** in the message, switch on **Allow from this source**, then open **Soundboard.apk** again. |

## What isn't in Soundboard (on purpose)

- **On stream and Only me:** Soundboard plays through the device's normal sound output. It doesn't split a sound between you and your stream.
- **A pop-out window that stays on top.**
- **Recording the sound your speakers are playing.** Recording uses the device's microphone.
- **Choosing which speakers or headphones to use.** It uses whatever the device is using.
- **Linux.**
- **App store listings.** You get the apps from the links above.
- **Automatic updates for the Windows and Mac apps.** You download the new file yourself.
- **Bringing your sounds over from Stream Studio.** Add the sound files to Soundboard again.
- **OGG on older iPhones.** They can't play it. Use an MP3 or WAV.

## What was and wasn't tested

Checked, with more than 750 automatic tests and more than 80 checks in a real Chrome-style browser:

- Adding, playing and stopping sounds, and that a button shows it's playing and then stops.
- Recording, with a pretend microphone, from the first press of **Record** to **Save sound**.
- Saving a backup, wiping everything and restoring it again.
- Phone, tablet and computer sizes, in Dark and Light, with reduced motion turned on. No errors on the page, nothing serious in an accessibility scan, and finger-sized buttons on the phone layout.
- Using Soundboard with only the keyboard.
- Working offline, and the **A new version of Soundboard is ready** bar.

The Windows app was also tried on a Windows computer, by installing the published installer. It opens, and a sound can be added, played and stopped. The sound is still there after closing and opening the app again, and a sound key plays it while the app is minimised. Turning **Sound keys** off stops the keys, and turning them back on brings them back. The "Windows protected your PC" warning didn't come up in that check, so the steps for it above are how Windows normally behaves, not something I saw.

Not tested, because they can't be tried from the computer Soundboard was built on:

- **iPhone and iPad** (Safari and the Home Screen app).
- **Mac** (Safari and the Mac app).
- Real Android phones and tablets. The browser checks used a phone-sized window, not a real phone.
- Firefox, and a real microphone.

If something looks or sounds wrong on a device that wasn't tested, it helps to know which device it was and what you saw.

## Browser support

Soundboard is built for current versions of Chrome, Edge, Firefox and Safari. Only the Chrome-style browsers (Chrome and Edge) have been tested. Recording needs a microphone, and it works from the normal link above or in the apps. On an iPhone or iPad, iOS 16.4 or later is best, because Soundboard can then ask iOS to play sounds even when the silent switch is on. OGG files need iOS 18.4 or later. MP3 and WAV work everywhere.

## Assumptions I made

- **Soundboard is its own soundboard.** It plays on the device it's installed on and isn't a remote control for Stream Studio. The Windows and Mac apps play through the computer's normal sound output, so anything that captures the computer's sound should hear them. That hasn't been tried with Stream Studio.
- **Stream Studio's rules and words are kept** wherever they fit: names up to 48 characters, 20 MB sounds, 24 emoji, 8 colours, and the same friendly messages. If a restored backup has more than two emoji on one button, only the first two are kept, as in Stream Studio.
- **New sounds get their emoji and colour in turn,** counting the sounds already on the board.
- **Undo lasts 10 seconds,** up to 32 sounds play at once, and a phone layout is used below about 720 pixels wide.
- **Recordings use the default microphone** and are saved as WAV files.
- **Backups** are `.zip` files. When a backup is added to sounds you already have, a key that's already in use is left off instead of taking it away from another sound.
- **Updates for the Windows and Mac apps:** your sounds should stay when you install a newer file over the old one, but save a backup first if you want to be extra safe.
- **Colour spelling and wording** follow Stream Studio's: "colour", "Not set", "✏️ Edit".

## For developers

Soundboard is React 19, TypeScript and Vite. It keeps its data in IndexedDB (with `idb`), plays sound with the Web Audio API, and uses `zustand` for state and `vite-plugin-pwa` for the offline copy. The Android app wraps the same code with Capacitor, and the Windows and Mac apps wrap it with Tauri.

```sh
npm install
npm run dev            # dev server
npm run typecheck      # check the types
npm test               # unit tests (Vitest)
npm run build          # type-check and build into dist/ for GitHub Pages (base /soundboard/)
npm run build:native   # the build the Android and desktop apps wrap (base /, no offline copy)
npm run e2e            # build, then browser checks (first time: npx playwright install chromium)
npm run icons          # redraw the app icons
```

Where things are:

- `src/model`: boards and sounds, the sanitising rules and the button colours.
- `src/storage`: saving on the device, with a file kept only while a sound uses it.
- `src/audio`: the Web Audio player. `src/audio/recorder` is the microphone recorder.
- `src/keys`: sound key strings, clashes and warnings.
- `src/backup`: backup and restore (a zip made with `fflate`).
- `src/pwa`: the offline copy, the update bar and the install help.
- `src/platform`: one interface with three versions, for saving files, sound keys and haptics: the browser (`web.ts`), Capacitor (`capacitor.ts`) and Tauri (`tauri.ts`). `index.ts` picks one.
- `src/components`, `src/pages`, `src/styles`, `src/state`: the screen and its stores.
- `e2e`: the browser checks.

Pushing to `main` runs `.github/workflows/ci.yml` (types, tests, both builds, then the browser checks) and `.github/workflows/deploy.yml`, which publishes the web app to GitHub Pages. `android.yml` builds and signs `Soundboard.apk` and updates the **android-latest** release. `desktop.yml` builds the Windows installer and the Mac app and updates the **desktop-latest** release.

Android only installs a new APK over an old one when both are signed with the same key. Every build is signed with one permanent key, kept in repository secrets, and the build fails if it ever gets a different one. Keep a copy of the key and its passwords somewhere private, outside the repository. If it's lost, nobody can update the Android app without uninstalling it first.

More: [PRODUCT.md](PRODUCT.md) says who Soundboard is for and how it should sound. [DESIGN.md](DESIGN.md) says what was ported from Stream Studio and what was changed on purpose.
