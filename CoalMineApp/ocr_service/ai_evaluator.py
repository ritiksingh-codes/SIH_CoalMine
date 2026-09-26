import os
import json
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load .env from the service directory, then fallback to parent directory.
_service_dir = os.path.dirname(__file__)
load_dotenv(os.path.join(_service_dir, '.env'))         # ocr_service/.env
load_dotenv(os.path.join(_service_dir, '..', '.env'))   # project root .env (fallback)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = None
if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)

def predict_hazard_compliance(hazard_text: str) -> dict:
    """
    Evaluates raw hazard text against DGMS statutory guidelines.
    Returns structured JSON with severity, category, and action required.
    """
    system_prompt = """
    You are an automated DGMS Coal Mine Statutory Compliance Engine.
    Analyze the incoming observation or OCR excerpt and return ONLY valid JSON matching this schema.
    """
    
    schema = {
        "type": "OBJECT",
        "properties": {
            "severity": {"type": "STRING", "description": "CRITICAL, HIGH, MEDIUM, or LOW"},
            "category": {"type": "STRING"},
            "statutory_violation": {"type": "BOOLEAN"},
            "dgms_regulation_tag": {"type": "STRING"},
            "recommended_action": {"type": "STRING"}
        }
    }

    if not client:
        return {
            "severity": "UNKNOWN",
            "category": "Unclassified",
            "statutory_violation": False,
            "dgms_regulation_tag": "N/A",
            "recommended_action": "Error contacting AI prediction engine: GEMINI_API_KEY is missing."
        }

    try:
        response = client.models.generate_content(
            model='gemini-3.8-flash',
            contents=f"Hazard Observation: {hazard_text}",
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                response_schema=schema,
                temperature=0.0
            )
        )
        return json.loads(response.text)
    except Exception as e:
        return {
            "severity": "UNKNOWN",
            "category": "Unclassified",
            "statutory_violation": False,
            "dgms_regulation_tag": "N/A",
            "recommended_action": f"Error contacting AI prediction engine: {str(e)}"
        }

def generate_eod_report(hazards_list: list) -> dict:
    """
    Acts as a Chief Safety Inspector to summarize the day's hazards.
    Returns structured JSON with an executive summary, key trends, and a safety rating.
    """
    if not hazards_list:
        return {
            "safety_rating": "A+",
            "executive_summary": "No hazards reported today. Excellent compliance.",
            "key_trends": ["Zero incidents"],
            "action_items": ["Maintain current safety protocols."]
        }
        
    system_prompt = """
    You are the Chief Safety Inspector for a Coal Mine governed by DGMS.
    Analyze the following list of hazards reported today and provide an End of Day Executive Summary.
    Return ONLY valid JSON matching this schema.
    """
    
    schema = {
        "type": "OBJECT",
        "properties": {
            "safety_rating": {"type": "STRING", "description": "A+, A, B, C, D, or F based on severity"},
            "executive_summary": {"type": "STRING", "description": "A 2-3 sentence overview of the day's safety performance."},
            "key_trends": {
                "type": "ARRAY",
                "items": {"type": "STRING"}
            },
            "action_items": {
                "type": "ARRAY",
                "items": {"type": "STRING"}
            }
        }
    }
    
    # Simplify the hazards list to save tokens
    simplified_hazards = [
        f"[{h.get('timestamp', 'Time Unknown')}] {h.get('hazard_type', 'Unknown')}: {h.get('description', '')} (Severity: {h.get('severity', 'Unknown')})"
        for h in hazards_list
    ]
    
    hazards_text = "\n".join(simplified_hazards)

    if not client:
        return {
            "safety_rating": "UNKNOWN",
            "executive_summary": "Error generating report: GEMINI_API_KEY is missing. Please set it in the environment.",
            "key_trends": ["N/A"],
            "action_items": ["N/A"]
        }

    try:
        response = client.models.generate_content(
            model='gemini-3.8-flash',
            contents=f"Today's Hazards:\n{hazards_text}",
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                response_schema=schema,
                temperature=0.3
            )
        )
        return json.loads(response.text)
    except Exception as e:
        return {
            "safety_rating": "UNKNOWN",
            "executive_summary": f"Error generating report: {str(e)}",
            "key_trends": ["N/A"],
            "action_items": ["N/A"]
        }
