import os
import pandas as pd
import random
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, joinedload
from datetime import datetime, timedelta

# Add 'backend' folder to Python path
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Database models and setup
from models.product import Product
from models.order import Order, OrderItem
from models.users import User 
from models.invoice import Invoice, InvoiceItem, PaymentStatus
from database import Base, engine, SessionLocal
from models.WarehouseDoc import WarehouseDocument, WarehouseStatus 

# Configuration
DATA_DIR = os.path.join(os.path.dirname(__file__), "data_source")
LIMIT_PRODUCTS = 2000 # Product limit
LIMIT_ORDERS = 10000 # Transaction limit for Apriori
ORDER_DATE_START = datetime(2023, 1, 1) # Start date for orders
# End Configuration

def load_all_data():
    """Loads, filters, and transforms Olist dataset."""
    session = SessionLocal()
    
    # Ensure admin user exists
    admin_user = session.query(User).filter(User.role == 'admin').first()
    if not admin_user:
        print("Brak użytkownika admina w bazie. Proszę, stwórz go ręcznie.")
        session.close()
        return

    # Load CSV datasets
    try:
        products_df = pd.read_csv(os.path.join(DATA_DIR, 'olist_products_dataset.csv'))
        translation_df = pd.read_csv(os.path.join(DATA_DIR, 'product_category_name_translation.csv'))
        items_df = pd.read_csv(os.path.join(DATA_DIR, 'olist_order_items_dataset.csv'))
        orders_df = pd.read_csv(os.path.join(DATA_DIR, 'olist_orders_dataset.csv'))
        product_cache = {}  # Quick access cache
        
    except FileNotFoundError:
        print(f"Błąd: Nie znaleziono plików CSV w katalogu {DATA_DIR}. Upewnij się, że pliki tam są.")
        session.close()
        return

    # Map category names and clean data
    translation_map = dict(zip(translation_df['product_category_name'], translation_df['product_category_name_english']))
    products_df['product_category_name_english'] = products_df['product_category_name'].map(translation_map)
    products_df.dropna(subset=['product_category_name_english'], inplace=True)
    
    # Limit dataset and generate synthetic fields
    products_df = products_df.head(LIMIT_PRODUCTS).copy()
    products_df['sell_price_net'] = [round(random.uniform(5.00, 500.00), 2) for _ in range(len(products_df))]
    products_df['tax_rate'] = random.choices([5.0, 8.0, 23.0], k=len(products_df))
    products_df['stock_quantity'] = [random.randint(50, 2000) for _ in range(len(products_df))]
    products_df['location'] = random.choices(["A1-01", "B2-05", "C3-10", "D4-01"], k=len(products_df))
    
    # Generate image URLs, codes, and names
    products_df['image_url'] = products_df.apply(lambda row: f"https://picsum.photos/seed/{str(row['product_id'])[:8]}/300/300", axis=1)
    products_df['code'] = products_df['product_id'].apply(lambda x: str(x)[:8].upper())
    products_df['name'] = products_df['product_category_name_english'].apply(lambda x: x.replace('_', ' ').title()) + products_df['product_id'].apply(lambda x: f" - Model {str(x)[:4].upper()}")

    # Insert products into database
    session.query(Product).delete()
    product_map = {} # Map OlistID to InternalID
    
    print(f"Wstawianie {len(products_df)} produktów...")
    for index, row in products_df.iterrows():
        new_product = Product(
            name=row['name'],
            code=row['code'],
            description=f"Kategoria: {row['product_category_name_english'].replace('_', ' ').title()}.",
            sell_price_net=row['sell_price_net'],
            buy_price=round(row['sell_price_net'] * random.uniform(0.6, 0.9), 2),
            tax_rate=row['tax_rate'],
            stock_quantity=row['stock_quantity'],
            location=row['location'],
            image_url=row['image_url'],
            category=row['product_category_name_english'].replace('_', ' ').title(),
        )
        session.add(new_product)
        session.flush()
        # Cache internal ID and object
        product_map[new_product.code] = new_product.id
        product_cache[new_product.code] = new_product
    
    print("Produkty wstawione. Tworzenie transakcji...")
    
    # Filter and prepare order items
    # Ensure items belong to products we just inserted
    items_df['product_code'] = items_df['product_id'].apply(lambda x: str(x)[:8].upper())
    valid_items_df = items_df[items_df['product_code'].isin(product_map.keys())]
    
    # Group items by order ID
    order_groups = valid_items_df.groupby('order_id')
    
    # Filter valid parent orders
    valid_order_ids = valid_items_df['order_id'].unique()
    valid_orders_df = orders_df[orders_df['order_id'].isin(valid_order_ids)].head(LIMIT_ORDERS)
    
    # Process and insert orders
    customer_user = session.query(User).filter(User.role == 'customer').first()
    if not customer_user:
        print("Brak użytkownika klienta. Tworzenie zamówień niemożliwe.")
        session.commit()
        return

    # Use single customer to facilitate Apriori pattern mining
    customer_id = customer_user.id 
    
    print(f"Wstawianie {len(valid_orders_df)} zamówień dla Apriori...")

    for index, order_row in valid_orders_df.iterrows():
        order_id_str = order_row['order_id']
        
        # Create Order record
        order_date = pd.to_datetime(order_row['order_purchase_timestamp']).to_pydatetime() or ORDER_DATE_START
        
        # Calculate order total from source items
        order_amount = order_groups.get_group(order_id_str)['price'].sum()
        
        new_order = Order(
            user_id=customer_id,
            status="shipped", # Mimic completed orders
            total_amount=order_amount,
            created_at=order_date,
            # Add required placeholder address data
            invoice_buyer_name=f"Klient {customer_id}",
            invoice_contact_person="Olist Customer",
            invoice_address_street="ul. Zakupowa 1",
            invoice_address_zip="00-001",
            invoice_address_city="Warszawa",
        )
        session.add(new_order)
        session.flush() 
        
        current_total_gross = 0.0
        
        # Create associated OrderItem records
        for item_index, item_row in order_groups.get_group(order_id_str).iterrows():
            product_code = item_row['product_id'][:8].upper()
            internal_product_id = product_map.get(product_code)
            
            if internal_product_id:
                product_data = product_cache.get(product_code)
                
                # Convert gross price to net assuming 23% VAT
                price_gross = item_row['price']
                price_net = price_gross / 1.23
                
                # Instantiate OrderItem
                new_item = OrderItem(
                    order_id=new_order.id,
                    product_id=internal_product_id,
                    qty=item_row['order_item_id'], # Use ID as qty simplification
                    unit_price=price_net,
                )
                session.add(new_item)
                current_total_gross += price_gross

        # Create linked Invoice and WarehouseDocument to satisfy constraints
        total_net = current_total_gross / 1.23
        total_vat = current_total_gross - total_net

        invoice = Invoice(
            user_id=customer_id,
            order_id=new_order.id,
            payment_status=PaymentStatus.PAID,
            buyer_name=new_order.invoice_buyer_name,
            buyer_address=new_order.invoice_address_street,
            created_by=admin_user.id,
            total_net=total_net,
            total_vat=total_vat,
            total_gross=current_total_gross,
        )
        session.add(invoice)
        session.flush()

        warehouse_doc = WarehouseDocument(
            invoice_id=invoice.id,
            buyer_name=invoice.buyer_name,
            invoice_date=invoice.created_at,
            items_json=json.dumps([]), # Empty items list as irrelevant here
            status=WarehouseStatus.RELEASED,
        )
        session.add(warehouse_doc)


    session.commit()
    print(f"Pomyślnie wstawiono {len(valid_orders_df)} zamówień Olist.")
    session.close()

def populate_database():
    """Main execution function to populate database."""
    
    # Clean existing transaction and product data
    # Users are preserved
    session = SessionLocal()
    session.query(Product).delete()
    session.query(Order).delete()
    session.query(OrderItem).delete()
    session.commit()
    session.close()
    
    load_all_data()

if __name__ == "__main__":
    populate_database()