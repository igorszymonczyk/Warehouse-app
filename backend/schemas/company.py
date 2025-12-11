from pydantic import BaseModel
from typing import Optional


# Schema for displaying company details
class CompanyOut(BaseModel):
    id: int
    name: Optional[str] = None
    nip: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

    class Config:
        orm_mode = True


# Schema for updating company information
class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    nip: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None