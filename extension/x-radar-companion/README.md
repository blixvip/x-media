# X Master for Chrome

The unified X Master extension captures public posts already visible in your X tab, ranks the live feed, saves voice examples and drafts, generates replies or quotes, and sends X video jobs to your private Drive service.

It never reads your X password or cookies and never clicks X's Post button. Generated copy is inserted into X's native composer for your review.

## Install unpacked

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this folder.
3. In the X Master web app, connect X and open **Settings → Chrome extension**.
4. Generate a pairing code, open the extension popup, and claim it within ten minutes.

## Store package

Zip the files in this directory with `manifest.json` at the root. Do not include secrets or local configuration.

## Save videos — v2.2.0

Version 3.0.0 adds X Media's blue/neutral popup styling and an **Open X Media**
shortcut for the combined app at `http://127.0.0.1:4330`. Existing pairings,
queued saves, video overlays and X Master tools are retained. Re-pairing is an
explicit action; updating never changes the destination of existing saves.

A **Save video** button stays in the top-left corner of each supported X video.
It saves the source post and its videos to your paired X Master saving library.
For posts containing multiple videos, **Save videos** keeps their original order.
The button shows **Queued** while offline and **Saved** after the library confirms
acceptance. The status distinguishes archived files from queued media and missing
archive setup. Blob playback addresses are never saved as downloadable files.

Open the extension popup → **Saved videos** to browse the video filter, play
archived copies, and download them for later use. Clicking **Saved** on a video
opens the same library. Pair with the email account used by the reference library;
a running media archive worker and private file storage are needed for MP4 copies.

After updating an unpacked extension, reload it in `chrome://extensions`, then
reload the X tab. Quoted embeds without their own resolvable source post do not
get a Save control; the extension never attributes their video to the outer post.
