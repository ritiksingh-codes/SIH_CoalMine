import os
import json
from io import BytesIO
from PIL import Image
from google import genai
from google.genai import types
from dotenv import load_dotenv

_service_dir = os.path.dirname(__file__)
load_dotenv(os.path.join(_service_dir, '.env'))         
load_dotenv(os.path.join(_service_dir, '..', '.env'))   

def optimize_image(image_bytes: bytes) -> bytes:
    try:
        img = Image.open(BytesIO(image_bytes))
        img.thumbnail((800, 800))
        if img.mode != 'RGB':
            img = img.convert('RGB')
        out = BytesIO()
        img.save(out, format='JPEG', quality=80)
        return out.getvalue()
    except Exception:
        return image_bytes

def process_legacy_document(image_bytes: bytes) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise Exception("GEMINI_API_KEY is missing from environment variables.")
        
    client = genai.Client(api_key=api_key)
    optimized_bytes = optimize_image(image_bytes)
    
    image_part = types.Part.from_bytes(
        data=optimized_bytes,
        mime_type='image/jpeg',
    )
    
    prompt = 'You are a highly accurate mining safety digitizer. Read the ENTIRE handwritten text from this historical mining log. Output ONLY JSON with exactly these keys: "report_date" (string), "time" (string), "pit_seam_id" (string), "gas_concentration_ch4" (string), "equipment_status" (string), "full_narrative" (string), "critical_violations" (array of strings).'
    
    schema = {
        "type": "OBJECT",
        "properties": {
            "report_date": {"type": "STRING"},
            "time": {"type": "STRING"},
            "pit_seam_id": {"type": "STRING"},
            "gas_concentration_ch4": {"type": "STRING"},
            "equipment_status": {"type": "STRING"},
            "full_narrative": {"type": "STRING"},
            "critical_violations": {"type": "ARRAY", "items": {"type": "STRING"}}
        }
    }
    
    response = client.models.generate_content(
        model='gemini-3.8-flash',
        contents=[image_part, prompt],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
        )
    )
    return json.loads(response.text)
