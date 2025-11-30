# backend/routes/salesman.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from database import get_db
from models.users import User
from utils.tokenJWT import get_current_user

# Importujemy funkcję z recommender.py
try:
    from utils.recommender import generate_recommendations
except ImportError:
    # Fallback, żeby aplikacja nie padła bez bibliotek ML
    def generate_recommendations(**kwargs):
        import pandas as pd
        return pd.DataFrame()

router = APIRouter(prefix="/salesman", tags=["Salesman"])

class RecommendationRuleSchema(BaseModel):
    product_in: List[str]
    product_out: List[str]
    confidence: str
    lift: str

@router.get("/recommendations", response_model=List[RecommendationRuleSchema])
def get_sales_recommendations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Zwraca reguły asocjacyjne dla frontendu (koszyk / faktura).
    """
    # Dostęp dla Admina i Sprzedawcy (Magazynier raczej nie potrzebuje, ale można dodać)
    if (current_user.role or "").lower() not in ["admin", "salesman", "customer"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    try:
        # Generujemy reguły
        rules_df = generate_recommendations(min_support=0.01, min_confidence=0.2)
        
        if rules_df.empty:
            return []

        results = []
        for _, row in rules_df.iterrows():
            # Konwersja frozenset -> list
            ants = list(row['antecedents'])
            cons = list(row['consequents'])
            
            results.append({
                "product_in": ants,
                "product_out": cons,
                "confidence": f"{row['confidence']:.2f}",
                "lift": f"{row['lift']:.2f}",
            })
            
        return results

    except Exception as e:
        print(f"Salesman Recommendation Error: {e}")
        return []