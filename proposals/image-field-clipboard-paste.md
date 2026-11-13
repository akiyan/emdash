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

When an empty Featured Image or OG Image control has keyboard focus, pasting one image file uploads it and selects the result. A hint below the control explains that pasting is available. For example, copy a screenshot, Tab to the empty Featured Image control, and press Ctrl+V or Command+V.

The upload uses the existing progress indicator, validation, cancellation, and inline errors. Featured Image stores the uploaded media metadata; OG Image stores its URL, as with dropped files.

## Goals

- Accept one clipboard image in each empty image control.
- Preserve keyboard browsing, file drops, and text paste behavior elsewhere.
- Localize the hint and validation messages and associate the hint with its control for assistive technology.

## Non-goals

- Replacing an already selected image directly through paste. Remove the current image first.
- Downloading images referenced only by clipboard HTML or a URL.
- Changing body-editor image paste behavior or adding a clipboard-read button.

## Interfaces and compatibility

Public APIs, configuration, and stored data formats stay the same. The paste event supplies the file to the existing media upload API; clipboard-read permission is not requested. Existing field MIME restrictions apply.

## Errors and edge cases

- Multiple files, including an image mixed with another file, show the one-image validation error.
- A single image outside the field's MIME allowlist shows the existing unsupported-format error.
- Text and clipboard files containing no image pass through normally.
- Image pastes are consumed within the control so ancestor paste handlers do not also process them.
- Further uploads are ignored while one is active. Upload failure leaves the control available for retry; unmounting aborts the upload.

## Verification

Browser tests cover both Featured Image and OG Image, stored values, repeated uploads while busy, multiple images, MIME restrictions, text and non-image clipboard contents, and event propagation. Existing tests cover progress, retry, cancellation, media-picker selection, and body image paste. Capture before-and-after images of both empty fields at the same viewport, locale, and theme. Manually verify a screenshot copied from the operating system on the contributor's browser before submitting the implementation PR.

Prototype: [implementation branch](https://github.com/akiyan/emdash/tree/fix/image-field-clipboard-paste).
