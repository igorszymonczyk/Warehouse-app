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

# Schema for paginated user list response
class PaginatedUsersResponse(BaseModel):
    items: List[UserResponse]
    total: int
    page: int
    page_size: int


# Retrieve a list of users with filtering, sorting, and pagination (Admin only)
@router.get("/users", response_model=PaginatedUsersResponse)
def get_all_users(
    request: Request,
    q: Optional[str] = Query(None, description="Szukaj po e-mailu"),
    last_name: Optional[str] = Query(None, description="Szukaj po nazwisku"),
    role: Optional[str] = Query(None, description="Filtruj po roli"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    sort_by: Literal["id", "email", "role","first_name","last_name"] = "id",
    order: Literal["asc", "desc"] = "asc",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify admin privileges
    if current_user.role.lower() != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    query = db.query(User)

    # Filter by email
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(User.email.ilike(like))

    # Filter by role
    if role:
        query = query.filter(User.role.ilike(role))

    # Filter by last name
    if last_name:
        query = query.filter(User.last_name.ilike(f"%{last_name}%"))

    # Apply sorting based on selected field and order
    sort_map = {
        "id": User.id,
        "email": User.email,
        "role": User.role,
        "first_name": User.first_name,
        "last_name": User.last_name,
    }
    col = sort_map.get(sort_by, User.id)
    query = query.order_by(col.asc() if order == "asc" else col.desc())

    # Apply pagination
    total = query.count()
    users = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": users,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# Update user role (Admin only)
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


# Delete a user account (Admin only)
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

    # Prevent self-deletion
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")

    db.delete(user)
    db.commit()

    return {"message": f"User {user.email} has been deleted"}