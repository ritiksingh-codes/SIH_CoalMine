import os
import json
from io import BytesIO
from PIL import Image
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load .env from the service directory, then fallback to parent directory.
# This works for both local dev (Windows) and cloud (Linux).
_service_dir = os.path.dirname(__file__)
load_dotenv(os.path.join(_service_dir, '.env'))         # ocr_service/.env
load_dotenv(os.path.join(_service_dir, '..', '.env'))   # project root .env (fallback)

def optimize_image(image_bytes: bytes) -> bytes:
    try:
        img = Image.open(BytesIO(image_bytes))
        img.thumbnail((800, 800)) # Maximum compression for ultra-fast upload
        if img.mode != 'RGB':
            img = img.convert('RGB')
        out = BytesIO()
        img.save(out, format='JPEG', quality=80)
        return out.getvalue()
    except Exception:
        return image_bytes # fallback if it fails

def process_legacy_document(image_bytes: bytes) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("GEMINI_API_KEY not found in .env")
        return get_mock_data()
        
    try:
        client = genai.Client(api_key=api_key)
        
        optimized_bytes = optimize_image(image_bytes)
        
        image_part = types.Part.from_bytes(
            data=optimized_bytes,
            mime_type='image/jpeg',
        )
        
        prompt = """
        You are a highly accurate mining safety digitizer. 
        Read the ENTIRE handwritten text from this historical mining log. 
        Do not omit any narrative details. Extract all specific fields AND the full textual narrative.
        """
        
        schema = {
            "type": "OBJECT",
            "properties": {
                "report_date": {"type": "STRING"},
                "time": {"type": "STRING"},
                "pit_seam_id": {"type": "STRING"},
                "gas_concentration_ch4": {"type": "STRING"},
                "equipment_status": {"type": "STRING"},
                "full_narrative": {"type": "STRING", "description": "The complete narrative text transcribed word-for-word."},
                "critical_violations": {
                    "type": "ARRAY",
                    "items": {"type": "STRING"}
                }
            }
        }
        
        response = client.models.generate_content(
            model='gemini-3.6-flash',
            contents=[image_part, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
            )
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"Gemini OCR failed: {e}")
        return get_mock_data()

def get_mock_data():
    return {
        "report_date": "14/09/2026",
        "pit_seam_id": "PIT-ALPHA",
        "gas_concentration_ch4": "1.2%",
        "critical_violations": ["Crack", "Loose Stone (Mock)"]
    }
