from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List


# --- KONFIGURACJA DLA ORM ---
class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- GŁÓWNY MODEL BAZOWY PRODUKTU ---
class ProductBase(ORMBase):
    name: str
    code: str
    description: Optional[str] = None
    category: Optional[str] = None
    supplier: Optional[str] = None
    buy_price: Optional[float] = Field(default=None, ge=0)
    sell_price_net: Optional[float] = Field(default=None, ge=0)
    tax_rate: Optional[float] = Field(default=None, ge=0)
    stock_quantity: Optional[int] = Field(default=None, ge=0)
    location: Optional[str] = None
    comment: Optional[str] = None


# --- TWORZENIE PRODUKTU ---
class ProductCreate(ProductBase):
    name: str
    code: str
    sell_price_net: float
    stock_quantity: int


# --- EDYCJA PRODUKTU (PATCH) ---
class ProductEditRequest(ORMBase):
    """Dla PATCH — wszystkie pola opcjonalne."""
    name: Optional[str] = Field(None, description="Nazwa produktu")
    code: Optional[str] = Field(None, description="Kod produktu")
    description: Optional[str] = None
    category: Optional[str] = None
    supplier: Optional[str] = None
    buy_price: Optional[float] = Field(None, ge=0)
    sell_price_net: Optional[float] = Field(None, gt=0)
    tax_rate: Optional[float] = Field(None, ge=0)
    stock_quantity: Optional[int] = Field(None, ge=0)
    location: Optional[str] = None
    comment: Optional[str] = None


# --- ODP. DLA JEDNEGO PRODUKTU ---
class ProductOut(ProductBase):
    id: int


# --- ODP. DLA LISTY PRODUKTÓW (Z PAGINACJĄ) ---
class ProductListPage(ORMBase):
    items: List[ProductOut]
    total: int
    page: int
    page_size: int

class ProductResponse(ORMBase):
    id: int
    name: str
    code: str
    description: Optional[str] = None
    category: Optional[str] = None
    supplier: Optional[str] = None
    buy_price: Optional[float] = None
    sell_price_net: Optional[float] = None
    tax_rate: Optional[float] = None
    stock_quantity: Optional[int] = None
    location: Optional[str] = None
    comment: Optional[str] = None
