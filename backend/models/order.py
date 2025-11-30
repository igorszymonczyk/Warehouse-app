from sqlalchemy import Column, Integer, ForeignKey, String, DateTime, Float, func
from sqlalchemy.orm import relationship
from database import Base
from models.product import Product

# Model Order
# Reprezentuje zamówienie złożone przez użytkownika. Zawiera podstawowy
# stan zamówienia, dane rozliczeniowe (w tym dane do faktury), wartości
# finansowe oraz powiązanie z pozycjami zamówienia.
# Dane częściowo pełnią rolę snapshotu wykorzystywanego przy generowaniu faktur.
class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)

    # Ogólny status procesu realizacji zamówienia.
    status = Column(String, default="pending", index=True)

    # Łączna kwota zamówienia.
    total_amount = Column(Float, default=0.0)

    created_at = Column(DateTime, server_default=func.now())

    # Dane wykorzystywane przy generowaniu faktury dla tego zamówienia.
    invoice_buyer_name = Column(String, nullable=True)
    invoice_contact_person = Column(String, nullable=True)
    invoice_buyer_nip = Column(String, nullable=True)
    invoice_address_street = Column(String, nullable=True)
    invoice_address_zip = Column(String, nullable=True)
    invoice_address_city = Column(String, nullable=True)

    # Informacje związane z procesem płatności (np. PayU).
    payment_url = Column(String, nullable=True)
    payu_order_id = Column(String, index=True, nullable=True, unique=True)

    # Pozycje zamówienia.
    items = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan"
    )


# Model OrderItem
# Pojedyncza pozycja w zamówieniu, zawierająca informację o produkcie,
# jego cenie oraz ilości. Stanowi podstawę do późniejszego tworzenia dokumentów
# finansowych, takich jak faktura.
class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), index=True, nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), index=True, nullable=False)

    qty = Column(Float, nullable=False)
    unit_price = Column(Float, nullable=False)

    order = relationship("Order", back_populates="items")
    product = relationship("Product")
