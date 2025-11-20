# backend/routes/salesman.py

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import json

from database import get_db, SessionLocal
from utils.tokenJWT import get_current_user
from models.users import User
from utils.recommender import generate_recommendations # Import naszego modelu!

router = APIRouter(prefix="/salesman", tags=["Salesman AI"])

# ZMIANA: Nowa funkcja sprawdzająca uprawnienia (teraz dla wszystkich, którzy potrzebują AI)
def _is_authorized_to_view_ai(user: User):
    if (user.role or "").upper() not in {"ADMIN", "SALESMAN", "CUSTOMER"}: # <-- DODANO 'CUSTOMER'
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

@router.get("/recommendations", response_model=List[Dict[str, Any]])
def get_recommendations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Zwraca rekomendacje produktowe dla wsparcia Salesmana i Klienta (Cross-selling).
    """
    _is_authorized_to_view_ai(current_user) # <-- Używamy nowej funkcji sprawdzającej
    
    # Generowanie rekomendacji
    # Progi na skrajnie liberalne (0.0005, 0.3)
    rules_df = generate_recommendations(min_support=0.0005, min_confidence=0.3) 
    
    if rules_df.empty:
        return [{"message": "Brak wystarczającej liczby danych do wygenerowania reguł."}]
        
    # Konwersja zestawów (frozensets) na listy stringów i formatowanie do JSON
    rules_list = []
    for index, row in rules_df.head(10).iterrows(): # Zwracamy Top 10
        rules_list.append({
            "product_in": list(row['antecedents']), # Co kupił klient
            "product_out": list(row['consequents']), # Co możemy mu polecić
            "confidence": f"{row['confidence']:.2f}",
            "lift": f"{row['lift']:.2f}"
        })

    return rules_list