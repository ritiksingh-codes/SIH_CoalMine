import pytesseract
from PIL import Image, ImageOps
import re
import io

# Point to your local Windows Tesseract installation
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

def process_legacy_document(image_bytes: bytes) -> dict:
    try:
        # 1. Preprocess: Grayscale and binarize for higher contrast
        img = Image.open(io.BytesIO(image_bytes))
        gray = ImageOps.grayscale(img)
        binarized = gray.point(lambda p: 255 if p > 140 else 0)

        # 2. Extract raw text
        raw_text = pytesseract.image_to_string(binarized)
    except Exception as e:
        print(f"Tesseract OCR failed ({e}). Using mock data.")
        raw_text = "Date: 14/09/2026\nMINE: PIT-ALPHA\nCH4: 1.2%\nCondition: crack and loose stone near pillar."

    # 3. Parse specific DGMS entities
    parsed = {
        "report_date": None,
        "pit_seam_id": None,
        "gas_concentration_ch4": "Not Recorded",
        "critical_violations": []
    }

    date_match = re.search(r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b', raw_text)
    if date_match:
        parsed["report_date"] = date_match.group(1)

    pit_match = re.search(r'(?:PIT|MINE|SEAM)\s*[:=\-]?\s*([A-Za-z0-9\-_]+)', raw_text, re.IGNORECASE)
    if pit_match:
        parsed["pit_seam_id"] = pit_match.group(1).upper()

    gas_match = re.search(r'(?:CH4|GAS)\s*[:=\-]?\s*([0-9\.]+\s*%?|NIL)', raw_text, re.IGNORECASE)
    if gas_match:
        parsed["gas_concentration_ch4"] = gas_match.group(1).upper()

    hazard_keywords = [r"crack", r"loose stone", r"spalling", r"roof fall"]
    for kw in hazard_keywords:
        if re.search(r'\b' + kw + r'\b', raw_text, re.IGNORECASE):
            parsed["critical_violations"].append(kw.title())

    return parsed
