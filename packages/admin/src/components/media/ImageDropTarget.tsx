import { Button, Loader } from "@cloudflare/kumo";
import { Trans, useLingui } from "@lingui/react/macro";
import { Clipboard, Image as ImageIcon, UploadSimple } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { uploadMedia, type MediaItem } from "../../lib/api/media.js";
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
	const pasteHintId = React.useId();
	const queryClient = useQueryClient();
	const [dragActive, setDragActive] = React.useState(false);
	const [uploading, setUploading] = React.useState(false);
	const [readingClipboard, setReadingClipboard] = React.useState(false);
	const clipboardRead = React.useRef<symbol | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const activeUpload = React.useRef<AbortController | null>(null);
	const dragDepth = React.useRef(0);

	React.useEffect(
		() => () => {
			clipboardRead.current = null;
			activeUpload.current?.abort();
			activeUpload.current = null;
		},
		[],
	);

	const upload = async (files: File[]) => {
		if (activeUpload.current || clipboardRead.current) return;
		if (files.length !== 1) {
			setError(t`Upload one image at a time.`);
			return;
		}
		const file = files[0]!;
		if (!matchesMimeAllowlist(file.type, ["image/"])) {
			setError(t`Only image files can be uploaded here.`);
			return;
		}
		if (allowedMimeTypes?.length && !matchesMimeAllowlist(file.type, allowedMimeTypes)) {
			setError(t`This field does not accept ${file.type} files.`);
			return;
		}

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
			setError(
				t`Clipboard access is unavailable. Focus this field and use your keyboard's paste shortcut.`,
			);
			return;
		}
		const read = Symbol();
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
			if (clipboardRead.current !== read) return;
			clipboardRead.current = null;
			setReadingClipboard(false);
			if (files.length === 0) {
				setError(t`No image found in the clipboard. Copy an image and try again.`);
				return;
			}
			await upload(files);
		} catch {
			if (clipboardRead.current === read) {
				setError(
					t`Could not read the clipboard. Allow clipboard access, or focus this field and use your keyboard's paste shortcut.`,
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
					"flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-kumo-line bg-kumo-control px-4 py-5",
					dragActive && "border-kumo-brand bg-kumo-tint",
				)}
				aria-busy={busy}
				onPaste={(event) => {
					const files = [...event.clipboardData.files];
					if (!files.some((file) => file.type.startsWith("image/"))) return;
					event.preventDefault();
					event.stopPropagation();
					void upload(files);
				}}
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
				{busy ? (
					<span aria-hidden="true">
						<Loader size="sm" />
					</span>
				) : (
					<UploadSimple className="h-8 w-8 text-kumo-subtle" aria-hidden="true" />
				)}
				<span className="text-sm text-kumo-subtle">
					{uploading
						? t`Uploading image…`
						: readingClipboard
							? t`Reading clipboard…`
							: t`Drop an image here`}
				</span>
				<div className="flex flex-wrap items-center justify-center gap-2">
					<Button
						type="button"
						variant="secondary"
						size="sm"
						icon={<ImageIcon aria-hidden="true" />}
						aria-label={t`Choose image for ${label}`}
						disabled={busy}
						{...buttonProps}
						aria-describedby={[buttonProps?.["aria-describedby"], pasteHintId]
							.filter(Boolean)
							.join(" ")}
						onClick={() => {
							setError(null);
							onSelect();
						}}
					>
						<Trans>Choose image</Trans>
					</Button>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						icon={<Clipboard aria-hidden="true" />}
						disabled={busy}
						aria-describedby={pasteHintId}
						onClick={() => void pasteFromClipboard()}
					>
						<Trans>Paste</Trans>
					</Button>
				</div>
			</div>
			<p id={pasteHintId} className="text-xs leading-4 text-kumo-subtle">
				<Trans>Or focus this field and use your keyboard’s paste shortcut.</Trans>
			</p>
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
