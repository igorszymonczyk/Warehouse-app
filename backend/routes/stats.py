# backend/routers/stats.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, Date, cast
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import List

from database import get_db
from utils.tokenJWT import get_current_user
from models.users import User
# Import necessary models for statistics
from models.invoice import Invoice, InvoiceItem
from models.product import Product

router = APIRouter(
    prefix="/stats",
    tags=["Stats"]
)

# Threshold for low stock alert
LOW_STOCK_THRESHOLD = 10

# === Pydantic Response Schemas ===

class StatsSummary(BaseModel):
    total_revenue: float
    total_invoices: int
    invoices_this_month: int
    low_stock_products: int

class DailyRevenue(BaseModel):
    date: str
    revenue: float

class DailyRevenueResponse(BaseModel):
    data: List[DailyRevenue]

# Schema for top selling products
class TopProduct(BaseModel):
    product_id: int
    product_name: str
    total_quantity_sold: int

    class Config:
        # Enable ORM mode
        from_attributes = True 

class TopProductsResponse(BaseModel):
    data: List[TopProduct]


# === Endpoint 1: Dashboard Summary ===

@router.get("/summary", response_model=StatsSummary)
def get_stats_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Not authorized to view stats")

    # Calculate total historical revenue
    total_revenue_query = db.query(func.sum(Invoice.total_gross)).scalar()
    total_revenue = total_revenue_query or 0.0

    # Count total invoices
    total_invoices = db.query(Invoice).count()

    # Count invoices created in the current month
    current_month = datetime.utcnow().month
    current_year = datetime.utcnow().year
    
    invoices_this_month = db.query(Invoice).filter(
        extract('month', Invoice.created_at) == current_month,
        extract('year', Invoice.created_at) == current_year
    ).count()

    # Count products below stock threshold
    low_stock_products = db.query(Product).filter(
        Product.stock_quantity < LOW_STOCK_THRESHOLD
    ).count()

    return StatsSummary(
        total_revenue=total_revenue,
        total_invoices=total_invoices,
        invoices_this_month=invoices_this_month,
        low_stock_products=low_stock_products
    )

# === Endpoint 2: Chart Data ===

@router.get("/daily-revenue", response_model=DailyRevenueResponse)
def get_daily_revenue_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Not authorized")

    today = datetime.utcnow().date()
    seven_days_ago = today - timedelta(days=6)

    # Aggregate revenue by date for the last week
    sales_data = (
        db.query(
            func.date(Invoice.created_at).label("date"),
            func.sum(Invoice.total_gross).label("revenue")
        )
        .filter(Invoice.created_at >= seven_days_ago)
        .group_by(func.date(Invoice.created_at))
        .order_by(func.date(Invoice.created_at))
        .all()
    )

    sales_by_date = {str(row.date): row.revenue for row in sales_data}
    result_data = []

    # Fill missing dates with zero revenue
    for i in range(7):
        current_date = seven_days_ago + timedelta(days=i)
        date_str = current_date.strftime("%Y-%m-%d")
        display_date = current_date.strftime("%d/%m")
        revenue = sales_by_date.get(date_str, 0.0)
        result_data.append(DailyRevenue(date=display_date, revenue=revenue))

    return DailyRevenueResponse(data=result_data)

# === Endpoint 3: Top 5 Products ===

@router.get("/top-products", response_model=TopProductsResponse)
def get_top_products_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if (current_user.role or "").upper() not in {"ADMIN", "SALESMAN"}:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Filter by current month and year
    current_month = datetime.utcnow().month
    current_year = datetime.utcnow().year

    # Aggregate sales quantity by product, sort descending, and limit to top 5
    top_products_query = (
        db.query(
            Product.id.label("product_id"),
            Product.name.label("product_name"),
            func.sum(InvoiceItem.quantity).label("total_quantity_sold")
        )
        .join(InvoiceItem, InvoiceItem.product_id == Product.id)
        .join(Invoice, Invoice.id == InvoiceItem.invoice_id)
        .filter(
            extract('month', Invoice.created_at) == current_month,
            extract('year', Invoice.created_at) == current_year
        )
        .group_by(Product.id, Product.name)
        .order_by(func.sum(InvoiceItem.quantity).desc())
        .limit(5)
        .all()
    )

    return TopProductsResponse(data=top_products_query)