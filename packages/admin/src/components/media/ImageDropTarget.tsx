import { Button, Loader } from "@cloudflare/kumo";
import { Trans, useLingui } from "@lingui/react/macro";
import { UploadSimple } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { fetchMediaItem, uploadMedia, type MediaItem } from "../../lib/api/media.js";
import { matchesMimeAllowlist } from "../../lib/mime-utils.js";
import { cn } from "../../lib/utils.js";
import { getMutationError } from "../DialogError.js";

interface ImageDropTargetProps {
	label: string;
	onSelect: () => void;
	onUploaded: (item: MediaItem) => void;
	allowedMimeTypes?: string[];
	fieldId?: string;
	blockType?: string;
	blockVersion?: number;
	className?: string;
	/** Extra attributes for the browse button, such as the link to a field error. */
	buttonProps?: Pick<React.ComponentProps<typeof Button>, "aria-invalid" | "aria-describedby">;
}

export function ImageDropTarget({
	label,
	onSelect,
	onUploaded,
	allowedMimeTypes,
	fieldId,
	blockType,
	blockVersion,
	className,
	buttonProps,
}: ImageDropTargetProps) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const [dragActive, setDragActive] = React.useState(false);
	const [uploading, setUploading] = React.useState(false);
	const [readingClipboard, setReadingClipboard] = React.useState(false);
	const clipboardRead = React.useRef<AbortController | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const activeUpload = React.useRef<AbortController | null>(null);
	const dragDepth = React.useRef(0);

	React.useEffect(
		() => () => {
			clipboardRead.current?.abort();
			clipboardRead.current = null;
			activeUpload.current?.abort();
			activeUpload.current = null;
		},
		[],
	);

	const validateImageType = (mimeType: string) => {
		if (!matchesMimeAllowlist(mimeType, ["image/"])) {
			setError(t`Only image files can be uploaded here.`);
			return false;
		}
		if (allowedMimeTypes?.length && !matchesMimeAllowlist(mimeType, allowedMimeTypes)) {
			setError(t`This field does not accept ${mimeType} files.`);
			return false;
		}

		return true;
	};

	const upload = async (files: File[]) => {
		if (activeUpload.current || clipboardRead.current) return;
		if (files.length !== 1) {
			setError(t`Upload one image at a time.`);
			return;
		}
		const file = files[0]!;
		if (!validateImageType(file.type)) return;

		const controller = new AbortController();
		activeUpload.current = controller;
		setUploading(true);
		setError(null);
		try {
			const item = await uploadMedia(file, {
				fieldId,
				blockType,
				blockVersion,
				signal: controller.signal,
			});
			if (controller.signal.aborted || activeUpload.current !== controller) return;
			void queryClient.invalidateQueries({ queryKey: ["media"] });
			onUploaded(item);
		} catch (cause) {
			if (!controller.signal.aborted && activeUpload.current === controller) {
				setError(getMutationError(cause) ?? t`Image upload failed. Try again.`);
			}
		} finally {
			if (activeUpload.current === controller) {
				activeUpload.current = null;
				setUploading(false);
			}
		}
	};

	const pasteFromClipboard = async () => {
		if (activeUpload.current || clipboardRead.current) return;
		if (!navigator.clipboard?.read) {
			setError(t`Clipboard access is unavailable. Choose an image or drag one here.`);
			return;
		}
		const read = new AbortController();
		let resolvingImage = false;
		clipboardRead.current = read;
		setReadingClipboard(true);
		setError(null);
		try {
			const items = await navigator.clipboard.read();
			const files = await Promise.all(
				items.flatMap((item) => {
					const type = item.types.find((candidate) => candidate.startsWith("image/"));
					if (!type) return [];
					return [
						item.getType(type).then(
							(blob) =>
								new File([blob], `clipboard-image.${type.split("/")[1]!.replace("+xml", "")}`, {
									type,
								}),
						),
					];
				}),
			);
			let copiedImage: MediaItem | undefined;
			if (files.length === 0) {
				const html = await Promise.all(
					items
						.filter((item) => item.types.includes("text/html"))
						.map(async (item) => (await item.getType("text/html")).text()),
				);
				if (clipboardRead.current !== read) return;
				const images = html.flatMap((value) => [
					...new DOMParser().parseFromString(value, "text/html").images,
				]);
				if (images.length > 1) {
					setError(t`Upload one image at a time.`);
					return;
				}
				const image = images[0];
				const mediaId = image?.getAttribute("mediaid");
				if (mediaId && image?.getAttribute("provider") === "local") {
					resolvingImage = true;
					copiedImage = await fetchMediaItem(mediaId, { signal: read.signal });
				}
			}
			if (clipboardRead.current !== read) return;
			clipboardRead.current = null;
			setReadingClipboard(false);
			if (copiedImage) {
				if (validateImageType(copiedImage.mimeType)) onUploaded(copiedImage);
				return;
			}
			if (files.length === 0) {
				setError(t`No image found in the clipboard. Copy an image and try again.`);
				return;
			}
			await upload(files);
		} catch {
			if (clipboardRead.current === read) {
				setError(
					resolvingImage
						? t`Could not load the copied image. Choose an image from the media library.`
						: t`Could not read the clipboard. Check this site's clipboard permission, or choose an image.`,
				);
			}
		} finally {
			if (clipboardRead.current === read) {
				clipboardRead.current = null;
				setReadingClipboard(false);
			}
		}
	};

	const busy = uploading || readingClipboard;

	return (
		<div className={cn("grid gap-2", className)}>
			<div
				className={cn(
					"rounded-xl border-2 border-dashed border-kumo-line bg-kumo-control",
					dragActive && "border-kumo-brand bg-kumo-tint",
					!busy && "hover:bg-kumo-tint",
				)}
				aria-busy={busy}
				onDragEnter={(event) => {
					if (!event.dataTransfer.types.includes("Files") || activeUpload.current) return;
					event.preventDefault();
					dragDepth.current += 1;
					setDragActive(true);
				}}
				onDragOver={(event) => {
					event.preventDefault();
					event.dataTransfer.dropEffect =
						event.dataTransfer.types.includes("Files") && !activeUpload.current ? "copy" : "none";
				}}
				onDragLeave={() => {
					dragDepth.current = Math.max(0, dragDepth.current - 1);
					if (dragDepth.current === 0) setDragActive(false);
				}}
				onDrop={(event) => {
					event.preventDefault();
					event.stopPropagation();
					dragDepth.current = 0;
					setDragActive(false);
					if (event.dataTransfer.types.includes("Files"))
						void upload([...event.dataTransfer.files]);
				}}
			>
				<div className="flex min-h-32 flex-col items-center justify-center gap-3 px-4 py-5 text-center text-base text-kumo-subtle">
					{busy ? (
						<span aria-hidden="true" className="flex shrink-0">
							<Loader size="sm" />
						</span>
					) : (
						<UploadSimple className="h-8 w-8 shrink-0" aria-hidden="true" />
					)}
					<div className="flex flex-wrap items-center justify-center gap-y-2">
						<Trans>
							Drop an image here or{" "}
							<Button
								type="button"
								variant="ghost"
								disabled={busy}
								className="h-auto min-h-0 p-0 text-base font-medium text-kumo-default underline decoration-kumo-line decoration-2 underline-offset-4 hover:bg-transparent"
								aria-label={t`Drop an image here or browse for ${label}`}
								{...buttonProps}
								onClick={() => {
									setError(null);
									onSelect();
								}}
							>
								browse
							</Button>
						</Trans>
						<span className="mx-1.5">
							<Trans>or</Trans>
						</span>
						<Button
							type="button"
							variant="ghost"
							disabled={busy}
							className="h-auto min-h-0 p-0 text-base font-medium text-kumo-default underline decoration-kumo-line decoration-2 underline-offset-4 hover:bg-transparent"
							onClick={() => void pasteFromClipboard()}
						>
							<Trans>Paste</Trans>
						</Button>
					</div>
				</div>
			</div>
			<span role="status" className="sr-only">
				{uploading ? t`Uploading image…` : readingClipboard ? t`Reading clipboard…` : ""}
			</span>
			{error && (
				<p role="alert" className="text-xs leading-4 text-kumo-danger">
					{error}
				</p>
			)}
		</div>
	);
}
