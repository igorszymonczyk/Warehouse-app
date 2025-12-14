from pydantic import BaseModel, EmailStr
from typing import Optional

# Shared properties for user models
class UserBase(BaseModel):
    email: EmailStr

# Schema for user authentication credentials
class UserLogin(UserBase):
    password: str

# Schema for user registration requests
class UserCreate(UserBase):
    password: str
    first_name: str
    last_name: str
    role: str = "customer"  # default role

# Output schema for user profile details
class UserResponse(UserBase):
    id: int
    role: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
   
    class Config:
        from_attributes = True

# Schema for JWT authentication token response
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

# Schema for JWT payload contents
class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None

# Schema for administrative role updates
class RoleUpdate(BaseModel):
    role: str