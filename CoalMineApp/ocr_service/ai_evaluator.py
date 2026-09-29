import os
import json
from google import genai
from google.genai import types
from dotenv import load_dotenv

_service_dir = os.path.dirname(__file__)
load_dotenv(os.path.join(_service_dir, '.env'))         
load_dotenv(os.path.join(_service_dir, '..', '.env'))   

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = None
if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)

def predict_hazard_compliance(hazard_text: str) -> dict:
    if not client:
        raise Exception("GEMINI_API_KEY is missing from environment variables.")

    system_prompt = 'You are an automated DGMS Coal Mine Statutory Compliance Engine. Analyze the incoming observation and return ONLY valid JSON.'

    from pydantic import BaseModel
    class HazardCompliance(BaseModel):
        severity: str
        category: str
        statutory_violation: bool
        dgms_regulation_tag: str
        recommended_action: str

    import time
    from google.genai import errors
    
    max_retries = 2
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model='gemini-2.5-pro',
                contents=f"Hazard Observation: {hazard_text}",
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    response_mime_type="application/json",
                    response_schema=HazardCompliance,
                    temperature=0.0
                )
            )
            return json.loads(response.text)
        except Exception as e:
            if ("429" in str(e) or "503" in str(e)) and attempt < max_retries - 1:
                time.sleep((2 ** attempt) + 1)
            else:
                from fastapi import HTTPException
                raise HTTPException(status_code=500, detail=str(e))

def generate_eod_report(hazards_list: list) -> dict:
    if not hazards_list:
        return {
            "safety_rating": "A+",
            "executive_summary": "No hazards reported today. Excellent compliance.",
            "key_trends": ["Zero incidents"],
            "action_items": ["Maintain current safety protocols."]
        }
        
    system_prompt = 'You are the Chief Safety Inspector for a Coal Mine. Analyze the hazards and provide an End of Day Summary. Return ONLY valid JSON.'
    
    from pydantic import BaseModel
    class EODReport(BaseModel):
        safety_rating: str
        executive_summary: str
        key_trends: list[str]
        action_items: list[str]
    
    simplified_hazards = [
        f"[{h.get('timestamp', 'Time Unknown')}] {h.get('hazard_type', 'Unknown')}: {h.get('description', '')} (Severity: {h.get('severity', 'Unknown')})"
        for h in hazards_list
    ]
    hazards_text = "\n".join(simplified_hazards)

    if not client:
        raise Exception("GEMINI_API_KEY is missing from environment variables.")

    import time
    from google.genai import errors
    
    max_retries = 2
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model='gemini-2.5-pro',
                contents=f"Today's Hazards:\n{hazards_text}",
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    response_mime_type="application/json",
                    response_schema=EODReport,
                    temperature=0.3
                )
            )
            return json.loads(response.text)
        except Exception as e:
            if ("429" in str(e) or "503" in str(e)) and attempt < max_retries - 1:
                time.sleep((2 ** attempt) + 1)
            else:
                from fastapi import HTTPException
                raise HTTPException(status_code=500, detail=str(e))
