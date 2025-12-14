# backend/schemas/product.py
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List


# Base configuration for ORM compatibility
class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# Shared base attributes for product entities
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
    image_url: Optional[str] = None


# Schema for creating a new product
class ProductCreate(ProductBase):
    name: str
    code: str
    sell_price_net: float
    stock_quantity: int
    # 'image_url' is excluded here as it is handled via separate multipart file upload


# Schema for partial product updates
class ProductEditRequest(ORMBase):
    """Schema for PATCH requests - all fields optional."""
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
    # Image updates are handled via specific file upload endpoints


# Full product representation including ID
class ProductOut(ProductBase):
    id: int
    # Inherits image_url from ProductBase

class ProductNameList(BaseModel):
    product_names: List[str]
    
# Paginated response for product listings
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
    image_url: Optional[str] = None