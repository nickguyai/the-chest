"""Tkinter GUI that uses Gemini to describe/categorize unlabeled photos."""

from __future__ import annotations

import json
import mimetypes
import os
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from PIL import Image, ImageTk
from dotenv import load_dotenv


SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".gif"}
THUMBNAIL_SIZE = (240, 240)


def read_image_bytes(image_path: Path) -> Tuple[bytes, str]:
    """Return raw bytes plus mime type for Gemini uploads."""

    data = image_path.read_bytes()
    mime_type, _ = mimetypes.guess_type(str(image_path))
    if not mime_type:
        mime_type = "image/jpeg"
    return data, mime_type


class GeminiImageDescriber:
    """Wrapper that hides differences between google-genai and google-generativeai."""

    def __init__(self, api_key: Optional[str], model: str = "gemini-2.5-flash") -> None:
        self.api_key = api_key
        self.model = model
        self._client = None
        self._backend = None  # Either "genai" or "generativeai"

    def describe(self, image_path: Path) -> Tuple[str, str]:
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY is missing; set it in your .env file.")

        if self._client is None:
            self._init_client()

        if self._backend == "genai":
            return self._describe_with_genai(image_path)
        return self._describe_with_generativeai(image_path)

    def _init_client(self) -> None:
        try:
            from google import genai  # type: ignore

            self._client = genai.Client(api_key=self.api_key)
            self._backend = "genai"
        except ImportError:
            try:
                import google.generativeai as genai_old  # type: ignore

                genai_old.configure(api_key=self.api_key)
                self._client = genai_old.GenerativeModel(self.model)
                self._backend = "generativeai"
            except ImportError as exc:  # pragma: no cover
                raise RuntimeError(
                    "Install google-genai or google-generativeai to call Gemini."
                ) from exc

    def _describe_with_genai(self, image_path: Path) -> Tuple[str, str]:
        try:
            from google.genai import types as genai_types  # type: ignore
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("google-genai is required for this backend.") from exc

        data, mime_type = read_image_bytes(image_path)
        prompt = (
            "You see a single photograph. Give a concise (<=60 words) description of "
            "what is happening plus a short category label such as Nature, Food, "
            "Architecture, People, Documents, or Objects. Return JSON with "
            "description and category fields."
        )

        schema = genai_types.Schema(
            type=genai_types.Type.OBJECT,
            properties={
                "description": genai_types.Schema(type=genai_types.Type.STRING),
                "category": genai_types.Schema(type=genai_types.Type.STRING),
            },
            required=["description"],
        )

        response = self._client.models.generate_content(
            model=self.model,
            contents=[
                genai_types.Part.from_bytes(data=data, mime_type=mime_type),
                prompt,
            ],
            config=genai_types.GenerateContentConfig(
                temperature=0.4,
                response_mime_type="application/json",
                response_schema=schema,
            ),
        )

        text = self._extract_text(response)
        return self._parse_summary(text)

    def _describe_with_generativeai(self, image_path: Path) -> Tuple[str, str]:
        data, mime_type = read_image_bytes(image_path)
        prompt = (
            "Describe the main subject of this photo in <=60 words and provide a "
            "succinct category label (Nature, People, Architecture, Objects, Food, etc.). "
            "Return JSON that looks like {\"description\":\"...\",\"category\":\"...\"}."
        )

        response = self._client.generate_content(
            [
                {"text": prompt},
                {"inline_data": {"mime_type": mime_type, "data": data}},
            ],
            generation_config={
                "response_mime_type": "application/json",
                "temperature": 0.4,
            },
        )

        text = self._extract_text(response)
        return self._parse_summary(text)

    @staticmethod
    def _extract_text(response: object) -> str:
        for attr in ("output_text", "text"):
            value = getattr(response, attr, None)
            if value:
                if isinstance(value, (list, tuple)):
                    return "\n".join(str(part) for part in value)
                return str(value)

        # google-genai Response -> candidates -> content -> parts
        candidates = getattr(response, "candidates", None)
        if candidates:
            for candidate in candidates:
                content = getattr(candidate, "content", None)
                if not content:
                    continue
                parts = getattr(content, "parts", None)
                if parts:
                    texts = [part.get("text") for part in parts if isinstance(part, dict)]
                    texts = [t for t in texts if t]
                    if texts:
                        return "\n".join(texts)

        return str(response)

    @staticmethod
    def _parse_summary(model_output: str) -> Tuple[str, str]:
        try:
            payload = json.loads(model_output)
            description = payload.get("description", "").strip()
            category = payload.get("category", "").strip()
            if not description:
                raise ValueError("Missing description field.")
            return description, category or "Uncategorized"
        except Exception as exc:
            # Fall back to returning raw text as description
            cleaned = model_output.strip()
            if not cleaned:
                cleaned = f"Unable to parse model response: {exc}"
            return cleaned, "Uncategorized"


@dataclass
class ImageCard:
    path: Path
    thumbnail: ImageTk.PhotoImage
    description: str = "Waiting for Gemini..."
    category: str = "Uncategorized"
    widgets: Dict[str, tk.StringVar] = field(default_factory=dict)


class ImageDeskApp:
    def __init__(self, root: tk.Tk) -> None:
        load_dotenv()
        self.root = root
        self.root.title("Gemini Photo Desk")
        self.root.geometry("1100x720")

        self.folder_var = tk.StringVar(value="No folder loaded")
        self.image_cards: List[ImageCard] = []
        self.describe_thread: Optional[threading.Thread] = None

        api_key = os.getenv("GEMINI_API_KEY")
        self.describer = GeminiImageDescriber(api_key=api_key)

        self._build_widgets()

    def _build_widgets(self) -> None:
        controls = ttk.Frame(self.root, padding=10)
        controls.pack(fill="x")

        ttk.Label(controls, textvariable=self.folder_var).pack(side="left", padx=(0, 12))
        ttk.Button(controls, text="Load Folder", command=self.load_folder).pack(side="left")
        ttk.Button(controls, text="Auto-Categorize", command=self.auto_categorize).pack(
            side="left", padx=6
        )
        ttk.Button(controls, text="Save Descriptions", command=self.save_descriptions).pack(
            side="left"
        )

        self.canvas = tk.Canvas(self.root, highlightthickness=0)
        self.canvas.pack(side="left", fill="both", expand=True)

        scrollbar = ttk.Scrollbar(self.root, orient="vertical", command=self.canvas.yview)
        scrollbar.pack(side="right", fill="y")
        self.canvas.configure(yscrollcommand=scrollbar.set)

        self.cards_frame = ttk.Frame(self.canvas)
        self.canvas_window = self.canvas.create_window((0, 0), window=self.cards_frame, anchor="nw")

        self.cards_frame.bind("<Configure>", self._on_frame_configure)
        self.canvas.bind("<Configure>", self._on_canvas_configure)

    def _on_frame_configure(self, event: tk.Event) -> None:
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))

    def _on_canvas_configure(self, event: tk.Event) -> None:
        self.canvas.itemconfig(self.canvas_window, width=event.width)

    def load_folder(self) -> None:
        folder = filedialog.askdirectory(title="Select folder with photos")
        if not folder:
            return

        folder_path = Path(folder)
        image_paths = sorted(
            [p for p in folder_path.iterdir() if p.suffix.lower() in SUPPORTED_EXTENSIONS]
        )
        if not image_paths:
            messagebox.showinfo("No images", "The selected folder does not contain supported files.")
            return

        cards: List[ImageCard] = []
        for image_path in image_paths:
            try:
                thumb = self._make_thumbnail(image_path)
            except Exception as exc:
                print(f"Skipping {image_path}: {exc}")
                continue
            cards.append(ImageCard(path=image_path, thumbnail=thumb))

        if not cards:
            messagebox.showerror("Error", "Unable to open any images in that folder.")
            return

        self.image_cards = cards
        self.folder_var.set(f"Loaded {len(cards)} images from {folder_path}")
        self._render_cards()
        self._start_description_thread()

    def _make_thumbnail(self, image_path: Path) -> ImageTk.PhotoImage:
        with Image.open(image_path) as img:
            img.thumbnail(THUMBNAIL_SIZE)
            thumb = img.copy()
        return ImageTk.PhotoImage(thumb)

    def _render_cards(self) -> None:
        for child in self.cards_frame.winfo_children():
            child.destroy()

        for idx, card in enumerate(self.image_cards):
            frame = ttk.Frame(self.cards_frame, padding=10, borderwidth=1, relief="solid")
            frame.grid(row=idx, column=0, sticky="ew", padx=12, pady=6)

            img_label = ttk.Label(frame, image=card.thumbnail)
            img_label.image = card.thumbnail  # keep reference
            img_label.grid(row=0, column=0, rowspan=3, sticky="nw", padx=(0, 12))

            filename = ttk.Label(frame, text=card.path.name, font=("TkDefaultFont", 11, "bold"))
            filename.grid(row=0, column=1, sticky="w")

            desc_var = tk.StringVar(value=card.description)
            cat_var = tk.StringVar(value=f"Category: {card.category}")

            ttk.Label(frame, textvariable=desc_var, wraplength=700, justify="left").grid(
                row=1, column=1, sticky="w"
            )
            ttk.Label(frame, textvariable=cat_var, foreground="#555").grid(
                row=2, column=1, sticky="w", pady=(4, 0)
            )

            card.widgets["description"] = desc_var
            card.widgets["category"] = cat_var

    def _start_description_thread(self) -> None:
        if self.describe_thread and self.describe_thread.is_alive():
            return

        def worker() -> None:
            for card in self.image_cards:
                try:
                    description, category = self.describer.describe(card.path)
                except Exception as exc:
                    description = f"Error: {exc}"
                    category = "Uncategorized"

                def update(card=card, desc=description, cat=category) -> None:
                    card.description = desc
                    card.category = cat or "Uncategorized"
                    if "description" in card.widgets:
                        card.widgets["description"].set(desc)
                    if "category" in card.widgets:
                        card.widgets["category"].set(f"Category: {card.category}")

                self.root.after(0, update)

        self.describe_thread = threading.Thread(target=worker, daemon=True)
        self.describe_thread.start()

    def auto_categorize(self) -> None:
        if not self.image_cards:
            messagebox.showinfo("No images", "Load images before auto-categorizing.")
            return
        self.image_cards.sort(
            key=lambda card: (card.category.lower() if card.category else "zzzz", card.path.name.lower())
        )
        self._render_cards()

    def save_descriptions(self) -> None:
        if not self.image_cards:
            messagebox.showinfo("No images", "Load images before saving descriptions.")
            return

        file_path = filedialog.asksaveasfilename(
            title="Save descriptions",
            defaultextension=".txt",
            filetypes=[("Text Files", "*.txt"), ("All Files", "*.*")],
        )
        if not file_path:
            return

        lines = []
        for card in self.image_cards:
            desc = card.description.strip()
            if not desc:
                desc = "Description pending"
            cat = card.category or "Uncategorized"
            lines.append(f"{card.path.name}\t{cat}\t{desc}")

        try:
            Path(file_path).write_text("\n".join(lines), encoding="utf-8")
            messagebox.showinfo("Saved", f"Wrote {len(lines)} descriptions to {file_path}")
        except OSError as exc:
            messagebox.showerror("Error", f"Unable to save file: {exc}")


def main() -> None:
    root = tk.Tk()
    app = ImageDeskApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
