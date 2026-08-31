"""Render docs/technical-guide.html to a PDF.

Run from the backend virtualenv (it already has Playwright installed):

    backend\\venv\\Scripts\\python docs\\generate_pdf.py

Re-run after editing the HTML to refresh the PDF.
"""

from pathlib import Path

from playwright.sync_api import sync_playwright

DOCS_DIR = Path(__file__).resolve().parent
SOURCE = DOCS_DIR / "technical-guide.html"
OUTPUT = DOCS_DIR / "Instagram-Media-Manager-Technical-Guide.pdf"

FOOTER = """
<div style="width:100%;font-family:Segoe UI,Arial;font-size:7.5pt;color:#8a949f;
            padding:0 14mm;display:flex;justify-content:space-between;">
  <span>Instagram Media Manager — Technical Guide</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>
"""


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing source file: {SOURCE}")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        # file:// so relative assets resolve; networkidle so fonts settle.
        page.goto(SOURCE.as_uri(), wait_until="networkidle")
        page.emulate_media(media="print")
        page.pdf(
            path=str(OUTPUT),
            format="A4",
            print_background=True,
            display_header_footer=True,
            header_template="<div></div>",
            footer_template=FOOTER,
            margin={"top": "14mm", "bottom": "16mm", "left": "0mm", "right": "0mm"},
        )
        browser.close()

    print(f"Wrote {OUTPUT}  ({OUTPUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
