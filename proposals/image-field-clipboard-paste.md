---
title: Paste images into Featured Image and OG Image fields
type: feature-plan
status: proposed
authors:
  - Masahiro Akita (@akiyan)
discussion: null
created: 2026-11-13
---

# Paste images into Featured Image and OG Image fields

## Problem and user case

An editor who copies a screenshot can paste it into the post body, but the empty Featured Image control accepts only file drops or media-picker selection. Setting the same screenshot as the featured image requires saving it as a file first. The empty OG Image control has the same limitation.

## Proposed behavior

Each empty Featured Image and OG Image drop area shows Choose image and Paste buttons. Choose image opens the media picker. Paste reads one image from the clipboard, uploads it, and selects the result. Browsers may ask for clipboard access after the button is pressed.

If the clipboard contains an image copied from the EmDash body editor, Paste can select its existing local media item from the copied reference. This also works when the clipboard contains HTML without image-file data. The media item is retrieved from the current site and checked against the field's MIME restrictions.

The upload uses the existing progress indicator, validation, cancellation, and inline errors. Featured Image stores the uploaded media metadata; OG Image stores its URL, as with dropped files.

## Goals

- Accept one clipboard image through the Paste button in each empty image control.
- Preserve keyboard browsing, file drops, and text paste behavior elsewhere.
- Localize button labels, upload status, and validation messages.

## Non-goals

- Replacing an already selected image directly through paste. Remove the current image first.
- Downloading remote images referenced only by clipboard HTML or a URL.
- Handling keyboard paste events in the image fields.
- Changing body-editor image paste behavior.

## Interfaces and compatibility

Public APIs, configuration, and stored data formats stay the same. The Paste button uses the browser Clipboard API in a secure context and may request clipboard-read permission. Image files use the existing media upload API; copied local media references use the existing media lookup API. Existing field MIME restrictions apply.

## Errors and edge cases

- The Paste button reads the clipboard only after a click. Unsupported clipboard access or denied permission produces an inline message offering image selection as an alternative.
- Clipboard contents with no image file or supported local media reference produce an inline message asking the editor to copy an image.
- A missing or inaccessible copied media item shows a load error and leaves the control available for retry. External image URLs and external-provider references are not resolved.
- Controls are disabled while the clipboard is being read or an upload is active. A read that finishes after the field unmounts does not upload.
- Multiple dropped files or multiple clipboard image items show the one-image validation error.
- A single image outside the field's MIME allowlist shows the existing unsupported-format error.
- Further uploads are ignored while one is active. Upload failure leaves the control available for retry; unmounting aborts the upload.

## Verification

Browser tests cover button-driven reads, denied permission and retry, clipboard contents without images, reads completing after unmount, both Featured Image and OG Image, stored values, repeated uploads while busy, multiple images, MIME restrictions, copied local media references, lookup failures and retry, cancellation of media lookups, and unsupported clipboard HTML. Existing tests cover progress, retry, cancellation, media-picker selection, and body image paste. Capture before-and-after images of both empty fields at the same viewport, locale, and theme. Manually verify a screenshot copied from the operating system on the contributor's browser before submitting the implementation PR.

Prototype: [implementation branch](https://github.com/akiyan/emdash/tree/fix/image-field-clipboard-paste).
