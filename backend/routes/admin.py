# backend/routes/admin.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List
from sqlalchemy.orm import Session
from database import get_db
from models.users import User
from utils.tokenJWT import get_current_user
from schemas.user import RoleUpdate, UserResponse
from pydantic import BaseModel
from typing import Optional, Literal
from fastapi import Request

router = APIRouter(tags=["Admin"])

# Odpowiedź paginowana — struktura wyników listy użytkowników.
class PaginatedUsersResponse(BaseModel):
    items: List[UserResponse]
    total: int
    page: int
    page_size: int


# Endpoint zwracający listę użytkowników z obsługą:
# - wyszukiwania,
# - filtrowania po roli,
# - sortowania,
# - paginacji.
# Dostęp tylko dla administratora.
@router.get("/users", response_model=PaginatedUsersResponse)
def get_all_users(
    request: Request,
    q: Optional[str] = Query(None, description="Szukaj po e-mailu"),
    role: Optional[str] = Query(None, description="Filtruj po roli"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: Literal["id", "email", "role"] = "id",
    order: Literal["asc", "desc"] = "asc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Weryfikacja dostępu — tylko administrator.
    if current_user.role.lower() != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    query = db.query(User)

    # Filtrowanie po e-mailu (wyszukiwanie).
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(User.email.ilike(like))

    # Filtrowanie po roli.
    if role:
        query = query.filter(User.role.ilike(role))

    # Sortowanie po wybranym polu.
    sort_map = {
        "id": User.id,
        "email": User.email,
        "role": User.role,
    }
    col = sort_map.get(sort_by, User.id)
    query = query.order_by(col.asc() if order == "asc" else col.desc())

    # Paginacja wyników.
    total = query.count()
    users = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": users,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# Endpoint do zmiany roli użytkownika.
# Umożliwia zarządzanie uprawnieniami — dostęp tylko dla administratora.
@router.put("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    new_role: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.role = new_role.role
    db.commit()
    db.refresh(user)

    return {"message": f"User {user.email} role updated to {user.role}", "id": user.id, "role": user.role}


# Endpoint do usuwania użytkownika.
# Zapobiega usunięciu własnego konta administratora.
@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Blokada samousunięcia.
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")

    db.delete(user)
    db.commit()

    return {"message": f"User {user.email} has been deleted"}
