from fastapi import FastAPI, UploadFile, File
import uvicorn
from ocr_engine import process_legacy_document

app = FastAPI()

@app.post("/api/ocr/extract")
async def extract_form(file: UploadFile = File(...)):
    contents = await file.read()
    results = process_legacy_document(contents)
    return {
        "filename": file.filename,
        "extracted_data": results
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
