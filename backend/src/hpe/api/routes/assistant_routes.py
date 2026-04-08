"""Assistant endpoint — /assistant/ask"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/assistant", tags=["Assistant"])


class AssistantRequest(BaseModel):
    question: str
    context: Optional[dict] = None


@router.post("/ask")
async def ask_assistant(req: AssistantRequest):
    """Responde pergunta de engenharia usando RAG local + regras Gülich."""
    from hpe.ai.assistant import EngineeringAssistant
    assistant = EngineeringAssistant()
    result = assistant.ask(req.question, context=req.context)
    return {
        "answer": result.answer,
        "relevant_topics": result.relevant_topics,
        "recommendations": result.recommendations,
        "references": result.references,
        "confidence": result.confidence,
        "mode": result.mode,
    }
