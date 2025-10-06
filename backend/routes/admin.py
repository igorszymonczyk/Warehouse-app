from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models.users import User
from utils.tokenJWT import get_current_user
from schemas.user import RoleUpdate
from models import users as models
from schemas import user as schemas

router = APIRouter(tags=["Admin"])


#wyświtlanie zarejestrowanych kont
@router.get("/users", response_model=list[schemas.UserResponse])
def get_all_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # dostęp tylko dla admina
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    users = db.query(models.User).all()
    return users

@router.put("/users/{user_id}/role")
def update_user_role(
    user_id: int,
    new_role: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # dostęp tylko dla admina
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    user.role = new_role.role
    db.commit()
    db.refresh(user)

    return {"message": f"User {user.email} role updated to {user.role}"}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # tylko admin może usuwać konta
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )

    # znajdź użytkownika
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    #  zabezpieczenie — admin nie może usunąć samego siebie
    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account"
        )

    db.delete(user)
    db.commit()

    return {"message": f"User {user.email} has been deleted"}