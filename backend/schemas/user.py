from pydantic import BaseModel, EmailStr
from typing import Optional

class UserBase(BaseModel):
    email: EmailStr

class UserLogin(UserBase):
    password: str

class UserCreate(UserBase):
    password: str
    first_name: str
    last_name: str
    role: str = "customer"  # default role

class UserResponse(UserBase):
    id: int
    role: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
   
    class Config:
        from_attributes = True

# Token (JWT)
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None

class RoleUpdate(BaseModel):
    role: str