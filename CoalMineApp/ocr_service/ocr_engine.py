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
    
    prompt = 'You are a highly accurate mining safety digitizer. Read the ENTIRE handwritten text from this historical mining log. Output ONLY JSON.'
    
    from pydantic import BaseModel
    class OCRResult(BaseModel):
        report_date: str
        time: str
        pit_seam_id: str
        gas_concentration_ch4: str
        equipment_status: str
        full_narrative: str
        critical_violations: list[str]
    
    import time
    from google.genai import errors
    
    max_retries = 6
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model='gemini-3.8-flash',
                contents=[image_part, prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=OCRResult,
                )
            )
            return json.loads(response.text)
        except Exception as e:
            if ("429" in str(e) or "503" in str(e)) and attempt < max_retries - 1:
                time.sleep((2 ** attempt) + 1)
            else:
                from fastapi import HTTPException
                raise HTTPException(status_code=500, detail=str(e))
