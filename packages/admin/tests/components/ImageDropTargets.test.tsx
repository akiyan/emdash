import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";

import "../../dist/styles.css";
import {
	ImageFieldRenderer,
	type ImageFieldValue,
} from "../../src/components/ImageFieldRenderer.js";
import { SeoImageField } from "../../src/components/SeoImageField.js";
import { fetchMediaItem, uploadMedia, type LocalMediaItem } from "../../src/lib/api/media.js";
import { render } from "../utils/render.js";

vi.mock("../../src/lib/api/media.js", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/lib/api/media.js")>()),
	fetchMediaItem: vi.fn(),
	uploadMedia: vi.fn(),
}));

vi.mock("../../src/lib/api/current-user.js", () => ({
	useCurrentUser: () => ({ data: { id: "editor-1", role: 40 } }),
}));

vi.mock("../../src/components/MediaPickerModal", () => ({
	MediaPickerModal: ({ open }: { open: boolean }) =>
		open ? (
			<div role="dialog" aria-label="Media picker">
				Choose an image
			</div>
		) : null,
}));

vi.mock("../../src/components/MediaDetailPanel.js", () => ({
	MediaDetailPanel: () => null,
}));

const uploaded: LocalMediaItem = {
	id: "uploaded-image",
	filename: "upload.png",
	mimeType: "image/png",
	url: "/_emdash/api/media/file/upload.png",
	storageKey: "upload.png",
	size: 1024,
	width: 640,
	height: 480,
	alt: "Uploaded image",
	createdAt: "2026-09-09T00:00:00Z",
	authorId: "editor-1",
	folderId: null,
};

type TargetKind = "featured" | "og";

function Target({
	kind,
	allowedMimeTypes,
	onSaved,
}: {
	kind: TargetKind;
	allowedMimeTypes?: string[];
	onSaved?: (value: unknown) => void;
}) {
	const [value, setValue] = React.useState<ImageFieldValue | null>(null);
	const [seoImage, setSeoImage] = React.useState<string | null>(null);
	return (
		<>
			{kind === "featured" ? (
				<ImageFieldRenderer
					label="Featured image"
					variant="featured"
					value={value ?? undefined}
					allowedMimeTypes={allowedMimeTypes}
					fieldId="featured-field"
					onChange={(next) => {
						setValue(next);
						onSaved?.(next);
					}}
				/>
			) : (
				<SeoImageField
					seo={{ image: seoImage, title: null, description: null, canonical: null, noIndex: false }}
					onChange={(next) => {
						setSeoImage(next.image ?? null);
						onSaved?.(next);
					}}
				/>
			)}
			<pre data-testid="stored-value">{JSON.stringify(kind === "featured" ? value : seoImage)}</pre>
		</>
	);
}

function dropFiles(element: Element, files: File[]) {
	const dataTransfer = new DataTransfer();
	for (const file of files) dataTransfer.items.add(file);
	for (const type of ["dragenter", "dragover", "drop"]) {
		element.dispatchEvent(new DragEvent(type, { dataTransfer, bubbles: true, cancelable: true }));
	}
}

function imageFile() {
	return new File(["image bytes"], "upload.png", { type: "image/png" });
}

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(fetchMediaItem).mockResolvedValue(uploaded);
	vi.mocked(uploadMedia).mockResolvedValue(uploaded);
});

describe("Editor image drop targets", () => {
	it.each(["featured", "og"] as const)(
		"renders a dashed %s target and keeps keyboard selection",
		async (kind) => {
			const screen = await render(<Target kind={kind} />);
			const button = screen.getByRole("button", {
				name:
					kind === "featured"
						? "Drop an image here or browse for Featured image"
						: "Drop an image here or browse for OG Image",
				exact: true,
			});
			expect(getComputedStyle(button.element().closest("[aria-busy]")!).borderTopStyle).toBe(
				"dashed",
			);
			await expect.element(button).toHaveTextContent("browse");
			await expect
				.element(screen.getByRole("button", { name: "Paste", exact: true }))
				.toBeVisible();
			button.element().focus();
			await userEvent.keyboard("{Enter}");
			await expect.element(screen.getByRole("dialog", { name: "Media picker" })).toBeVisible();
		},
	);

	it("shows the brand border while a file is dragged over the target", async () => {
		const screen = await render(
			<>
				<Target kind="featured" />
				<span data-testid="brand-color" style={{ color: "var(--color-kumo-brand)" }} />
			</>,
		);
		const target = screen
			.getByRole("button", { name: "Drop an image here or browse for Featured image", exact: true })
			.element()
			.closest("[aria-busy]")!;
		const brand = getComputedStyle(screen.getByTestId("brand-color").element()).color;

		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(imageFile());
		target.dispatchEvent(
			new DragEvent("dragenter", { dataTransfer, bubbles: true, cancelable: true }),
		);

		await vi.waitFor(() => expect(getComputedStyle(target).borderTopColor).toBe(brand));
	});

	it.each([
		{ kind: "featured", sendFiles: dropFiles },
		{ kind: "og", sendFiles: dropFiles },
	] as const)(
		"uploads one file into $kind with $sendFiles.name and ignores another upload while busy",
		async ({ kind, sendFiles }) => {
			let complete!: (item: LocalMediaItem) => void;
			vi.mocked(uploadMedia).mockImplementation(
				() =>
					new Promise((resolve) => {
						complete = resolve;
					}),
			);
			const screen = await render(<Target kind={kind} />);
			const button = screen.getByRole("button", {
				name:
					kind === "featured"
						? "Drop an image here or browse for Featured image"
						: "Drop an image here or browse for OG Image",
				exact: true,
			});
			sendFiles(button.element(), [imageFile()]);
			await expect.element(button).toBeDisabled();
			sendFiles(button.element(), [imageFile()]);
			expect(uploadMedia).toHaveBeenCalledTimes(1);
			if (kind === "featured")
				expect(vi.mocked(uploadMedia).mock.calls[0]?.[1]?.fieldId).toBe("featured-field");

			await React.act(async () => {
				complete(uploaded);
			});
			await vi.waitFor(() => {
				const stored = JSON.parse(screen.getByTestId("stored-value").element().textContent!);
				if (kind === "featured") {
					expect(stored).toMatchObject({
						id: uploaded.id,
						provider: "local",
						width: 640,
						height: 480,
						meta: { storageKey: "upload.png" },
					});
				} else {
					expect(stored).toBe(uploaded.url);
				}
			});
			if (kind === "featured")
				await expect.element(screen.getByText("upload.png", { exact: true })).toBeVisible();
			else
				await expect.element(screen.getByRole("button", { name: "Remove OG Image" })).toBeVisible();
		},
	);

	it.each(["featured", "og"] as const)(
		"announces only the upload status while %s uploads",
		async (kind) => {
			vi.mocked(uploadMedia).mockImplementation(() => new Promise(() => {}));
			const screen = await render(<Target kind={kind} />);
			const button = screen.getByRole("button", {
				name:
					kind === "featured"
						? "Drop an image here or browse for Featured image"
						: "Drop an image here or browse for OG Image",
				exact: true,
			});

			dropFiles(button.element(), [imageFile()]);

			await expect.element(button).toBeDisabled();
			const announced = [...document.querySelectorAll("[role='status']")].filter(
				(element) => !element.closest("[aria-hidden='true']"),
			);
			expect(announced.map((element) => element.textContent)).toEqual(["Uploading image…"]);
		},
	);

	it.each([
		{
			files: [new File(["text"], "note.txt", { type: "text/plain" })],
			allowed: undefined,
			message: "Only image files can be uploaded here.",
		},
		{
			files: [imageFile(), imageFile()],
			allowed: undefined,
			message: "Upload one image at a time.",
		},
		{
			files: [imageFile()],
			allowed: ["image/jpeg"],
			message: "This field does not accept image/png files.",
		},
	])("rejects incompatible drops: $message", async ({ files, allowed, message }) => {
		const screen = await render(<Target kind="featured" allowedMimeTypes={allowed} />);
		dropFiles(
			screen
				.getByRole("button", {
					name: "Drop an image here or browse for Featured image",
					exact: true,
				})
				.element(),
			files,
		);
		await expect.element(screen.getByRole("alert")).toHaveTextContent(message);
		expect(uploadMedia).not.toHaveBeenCalled();
		expect(screen.getByTestId("stored-value").element().textContent).toBe("null");
	});

	it.each(["featured", "og"] as const)(
		"pastes a clipboard image using the %s button",
		async (kind) => {
			const read = vi
				.spyOn(navigator.clipboard, "read")
				.mockResolvedValue([
					new ClipboardItem({ "image/png": new Blob(["pixels"], { type: "image/png" }) }),
				]);
			const screen = await render(<Target kind={kind} />);
			await screen.getByRole("button", { name: "Paste", exact: true }).click();
			await vi.waitFor(() => {
				const stored = JSON.parse(screen.getByTestId("stored-value").element().textContent!);
				if (kind === "featured")
					expect(stored).toMatchObject({ id: uploaded.id, width: 640, height: 480 });
				else expect(stored).toBe(uploaded.url);
			});
			expect(read).toHaveBeenCalledOnce();
			expect(vi.mocked(uploadMedia).mock.calls[0]?.[0]).toMatchObject({
				name: "clipboard-image.png",
				type: "image/png",
			});
		},
	);

	it.each([
		{ count: 2, allowed: undefined, message: "Upload one image at a time." },
		{ count: 1, allowed: ["image/jpeg"], message: "This field does not accept image/png files." },
	])("validates clipboard button uploads: $message", async ({ count, allowed, message }) => {
		vi.spyOn(navigator.clipboard, "read").mockResolvedValue(
			Array.from(
				{ length: count },
				() => new ClipboardItem({ "image/png": new Blob(["pixels"], { type: "image/png" }) }),
			),
		);
		const screen = await render(<Target kind="featured" allowedMimeTypes={allowed} />);
		await screen.getByRole("button", { name: "Paste", exact: true }).click();
		await expect.element(screen.getByRole("alert")).toHaveTextContent(message);
		expect(uploadMedia).not.toHaveBeenCalled();
	});

	it.each(["featured", "og"] as const)(
		"selects an image copied from the body editor into %s",
		async (kind) => {
			vi.spyOn(navigator.clipboard, "read").mockResolvedValue([
				new ClipboardItem({
					"text/html": new Blob(
						[
							`<img src="" mediaid="${uploaded.id}" provider="local" data-pm-slice="0 0 []"><p></p>`,
						],
						{ type: "text/html" },
					),
				}),
			]);
			const screen = await render(<Target kind={kind} />);
			await screen.getByRole("button", { name: "Paste", exact: true }).click();
			await vi.waitFor(() => {
				const stored = JSON.parse(screen.getByTestId("stored-value").element().textContent!);
				if (kind === "featured")
					expect(stored).toMatchObject({ id: uploaded.id, width: 640, height: 480 });
				else expect(stored).toBe(uploaded.url);
			});
			expect(uploadMedia).not.toHaveBeenCalled();
		},
	);

	it("applies field restrictions to images copied from the body editor", async () => {
		vi.spyOn(navigator.clipboard, "read").mockResolvedValue([
			new ClipboardItem({
				"text/html": new Blob([`<img mediaid="${uploaded.id}" provider="local">`], {
					type: "text/html",
				}),
			}),
		]);
		const screen = await render(<Target kind="featured" allowedMimeTypes={["image/jpeg"]} />);
		await screen.getByRole("button", { name: "Paste", exact: true }).click();
		await expect
			.element(screen.getByRole("alert"))
			.toHaveTextContent("This field does not accept image/png files.");
		expect(screen.getByTestId("stored-value").element().textContent).toBe("null");
		expect(uploadMedia).not.toHaveBeenCalled();
	});

	it.each([
		'<img src="https://example.com/picture.png">',
		'<img mediaid="foreign-image" provider="external">',
	])("does not resolve unsupported clipboard HTML: %s", async (html) => {
		vi.spyOn(navigator.clipboard, "read").mockResolvedValue([
			new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }) }),
		]);
		const screen = await render(<Target kind="featured" />);
		await screen.getByRole("button", { name: "Paste", exact: true }).click();
		await expect
			.element(screen.getByRole("alert"))
			.toHaveTextContent("No image found in the clipboard.");
		expect(fetchMediaItem).not.toHaveBeenCalled();
		expect(uploadMedia).not.toHaveBeenCalled();
	});

	it("rejects multiple copied body images", async () => {
		vi.spyOn(navigator.clipboard, "read").mockResolvedValue([
			new ClipboardItem({
				"text/html": new Blob(
					['<img mediaid="one" provider="local"><img mediaid="two" provider="local">'],
					{ type: "text/html" },
				),
			}),
		]);
		const screen = await render(<Target kind="featured" />);
		await screen.getByRole("button", { name: "Paste", exact: true }).click();
		await expect
			.element(screen.getByRole("alert"))
			.toHaveTextContent("Upload one image at a time.");
		expect(fetchMediaItem).not.toHaveBeenCalled();
		expect(uploadMedia).not.toHaveBeenCalled();
	});

	it("allows retry when a copied media reference cannot be loaded", async () => {
		vi.spyOn(navigator.clipboard, "read").mockResolvedValue([
			new ClipboardItem({
				"text/html": new Blob([`<img mediaid="${uploaded.id}" provider="local">`], {
					type: "text/html",
				}),
			}),
		]);
		vi.mocked(fetchMediaItem).mockRejectedValueOnce(new Error("Not found"));
		const screen = await render(<Target kind="featured" />);
		await screen.getByRole("button", { name: "Paste", exact: true }).click();
		await expect
			.element(screen.getByRole("alert"))
			.toHaveTextContent("Could not load the copied image.");
		await screen.getByRole("button", { name: "Paste", exact: true }).click();
		await vi.waitFor(() =>
			expect(JSON.parse(screen.getByTestId("stored-value").element().textContent!)).toMatchObject({
				id: uploaded.id,
			}),
		);
		expect(uploadMedia).not.toHaveBeenCalled();
	});

	it("aborts a copied media lookup when the field unmounts", async () => {
		vi.spyOn(navigator.clipboard, "read").mockResolvedValue([
			new ClipboardItem({
				"text/html": new Blob([`<img mediaid="${uploaded.id}" provider="local">`], {
					type: "text/html",
				}),
			}),
		]);
		let finish!: (item: LocalMediaItem) => void;
		vi.mocked(fetchMediaItem).mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const onSaved = vi.fn();
		const screen = await render(<Target kind="featured" onSaved={onSaved} />);
		await screen.getByRole("button", { name: "Paste", exact: true }).click();
		await vi.waitFor(() => expect(fetchMediaItem).toHaveBeenCalledOnce());
		const signal = vi.mocked(fetchMediaItem).mock.calls[0]?.[1]?.signal;
		await screen.unmount();
		expect(signal?.aborted).toBe(true);
		await React.act(async () => finish(uploaded));
		expect(onSaved).not.toHaveBeenCalled();
		expect(uploadMedia).not.toHaveBeenCalled();
	});

	it("explains when the clipboard contains no image", async () => {
		vi.spyOn(navigator.clipboard, "read").mockResolvedValue([
			new ClipboardItem({ "text/plain": new Blob(["A title"], { type: "text/plain" }) }),
		]);
		const screen = await render(<Target kind="featured" />);
		await screen.getByRole("button", { name: "Paste", exact: true }).click();
		await expect
			.element(screen.getByRole("alert"))
			.toHaveTextContent("No image found in the clipboard.");
		expect(uploadMedia).not.toHaveBeenCalled();
	});

	it("allows retry after clipboard permission is denied", async () => {
		const read = vi
			.spyOn(navigator.clipboard, "read")
			.mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"))
			.mockResolvedValue([]);
		const screen = await render(<Target kind="featured" />);
		await screen.getByRole("button", { name: "Paste", exact: true }).click();
		await expect
			.element(screen.getByRole("alert"))
			.toHaveTextContent("Could not read the clipboard.");
		await screen.getByRole("button", { name: "Paste", exact: true }).click();
		await expect
			.element(screen.getByRole("alert"))
			.toHaveTextContent("No image found in the clipboard.");
		expect(read).toHaveBeenCalledTimes(2);
		expect(uploadMedia).not.toHaveBeenCalled();
	});

	it("ignores a clipboard read that finishes after unmount", async () => {
		let finish!: (items: ClipboardItem[]) => void;
		vi.spyOn(navigator.clipboard, "read").mockImplementation(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const screen = await render(<Target kind="featured" />);
		await screen.getByRole("button", { name: "Paste", exact: true }).click();
		await expect.element(screen.getByRole("button", { name: "Paste", exact: true })).toBeDisabled();
		await screen.unmount();
		await React.act(async () =>
			finish([new ClipboardItem({ "image/png": new Blob(["pixels"], { type: "image/png" }) })]),
		);
		expect(uploadMedia).not.toHaveBeenCalled();
	});

	it("keeps the empty target usable after an upload fails", async () => {
		vi.mocked(uploadMedia).mockRejectedValueOnce(new Error("Storage is unavailable"));
		const screen = await render(<Target kind="og" />);
		const button = screen.getByRole("button", {
			name: "Drop an image here or browse for OG Image",
			exact: true,
		});
		dropFiles(button.element(), [imageFile()]);
		await expect.element(screen.getByRole("alert")).toHaveTextContent("Storage is unavailable");
		await expect.element(button).toBeEnabled();
		dropFiles(button.element(), [imageFile()]);
		await vi.waitFor(() =>
			expect(screen.getByTestId("stored-value").element().textContent).toBe(
				JSON.stringify(uploaded.url),
			),
		);
	});

	it("aborts an unmounted target and ignores its late completion", async () => {
		let complete!: (item: LocalMediaItem) => void;
		vi.mocked(uploadMedia).mockImplementation(
			() =>
				new Promise((resolve) => {
					complete = resolve;
				}),
		);
		const onSaved = vi.fn();
		const screen = await render(<Target kind="og" onSaved={onSaved} />);
		dropFiles(
			screen
				.getByRole("button", { name: "Drop an image here or browse for OG Image", exact: true })
				.element(),
			[imageFile()],
		);
		await vi.waitFor(() => expect(uploadMedia).toHaveBeenCalledOnce());
		const signal = vi.mocked(uploadMedia).mock.calls[0]?.[1]?.signal;
		await screen.unmount();
		expect(signal?.aborted).toBe(true);
		await React.act(async () => {
			complete(uploaded);
		});
		expect(onSaved).not.toHaveBeenCalled();
	});
});
