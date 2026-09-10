from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from ocr_engine import process_legacy_document
from pydantic import BaseModel
from typing import List, Dict, Any
from ai_evaluator import predict_hazard_compliance, generate_eod_report

class PredictRequest(BaseModel):
    text: str

class ReportRequest(BaseModel):
    hazards: List[Dict[str, Any]]

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/ocr/extract")
async def extract_form(file: UploadFile = File(...)):
    contents = await file.read()
    results = process_legacy_document(contents)
    
    # 2. Run Groq AI assessment on extracted hazard notes
    hazard_observation = results.get("full_narrative", str(results))
    ai_prediction = predict_hazard_compliance(hazard_observation)
    
    # 3. Combine into a unified payload
    return {
        "filename": file.filename,
        "success": True,
        "extracted_data": results,
        "ai_compliance": ai_prediction
    }

@app.post("/api/ai/predict")
async def predict_hazard(request: PredictRequest):
    ai_prediction = predict_hazard_compliance(request.text)
    return {
        "success": True,
        "ai_compliance": ai_prediction
    }

@app.post("/api/ai/report")
async def generate_report(request: ReportRequest):
    report = generate_eod_report(request.hazards)
    return {
        "success": True,
        "report": report
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
