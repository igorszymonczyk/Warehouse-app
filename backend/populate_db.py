import os
import pandas as pd
import random
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, joinedload
from datetime import datetime, timedelta

# Dodajemy folder 'backend' do ścieżki Pythona
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# --- Modele i DB ---
from models.product import Product
from models.order import Order, OrderItem
from models.users import User # Będziemy potrzebować użytkownika
from models.invoice import Invoice, InvoiceItem, PaymentStatus
from database import Base, engine, SessionLocal
from models.WarehouseDoc import WarehouseDocument, WarehouseStatus # Zapewnia, że WZ jest znany

# --- Konfiguracja ---
DATA_DIR = os.path.join(os.path.dirname(__file__), "data_source")
LIMIT_PRODUCTS = 2000 # Ograniczenie liczby produktów do wstawienia
LIMIT_ORDERS = 10000 # Ograniczenie liczby transakcji do wstawienia (dla Apriori)
ORDER_DATE_START = datetime(2023, 1, 1) # Ustalamy stałą datę startową dla zamówień
# --- Koniec Konfiguracji ---

def load_all_data():
    """Wczytuje, filtruje i transformuje dane produktów i zamówień z Olist."""
    session = SessionLocal()
    
    # --- 1. PRZYGOTOWANIE: Utwórz domyślnego użytkownika, jeśli nie istnieje ---
    admin_user = session.query(User).filter(User.role == 'admin').first()
    if not admin_user:
        print("Brak użytkownika admina w bazie. Proszę, stwórz go ręcznie.")
        session.close()
        return

    # --- 2. Ładowanie i mapowanie DANYCH PRODUKTÓW ---
    try:
        products_df = pd.read_csv(os.path.join(DATA_DIR, 'olist_products_dataset.csv'))
        translation_df = pd.read_csv(os.path.join(DATA_DIR, 'product_category_name_translation.csv'))
        items_df = pd.read_csv(os.path.join(DATA_DIR, 'olist_order_items_dataset.csv'))
        orders_df = pd.read_csv(os.path.join(DATA_DIR, 'olist_orders_dataset.csv'))
        product_cache = {}  # Cache produktów do szybkiego dostępu
        
    except FileNotFoundError:
        print(f"Błąd: Nie znaleziono plików CSV w katalogu {DATA_DIR}. Upewnij się, że pliki tam są.")
        session.close()
        return

    # --- Mapowanie i czyszczenie (jak wcześniej) ---
    translation_map = dict(zip(translation_df['product_category_name'], translation_df['product_category_name_english']))
    products_df['product_category_name_english'] = products_df['product_category_name'].map(translation_map)
    products_df.dropna(subset=['product_category_name_english'], inplace=True)
    
    # Ograniczenie i tworzenie pól dla NOWYCH produktów
    products_df = products_df.head(LIMIT_PRODUCTS).copy()
    products_df['sell_price_net'] = [round(random.uniform(5.00, 500.00), 2) for _ in range(len(products_df))]
    products_df['tax_rate'] = random.choices([5.0, 8.0, 23.0], k=len(products_df))
    products_df['stock_quantity'] = [random.randint(50, 2000) for _ in range(len(products_df))]
    products_df['location'] = random.choices(["A1-01", "B2-05", "C3-10", "D4-01"], k=len(products_df))
    
    # Generowanie linków i kodu
    products_df['image_url'] = products_df.apply(lambda row: f"https://picsum.photos/seed/{str(row['product_id'])[:8]}/300/300", axis=1)
    products_df['code'] = products_df['product_id'].apply(lambda x: str(x)[:8].upper())
    products_df['name'] = products_df['product_category_name_english'].apply(lambda x: x.replace('_', ' ').title()) + products_df['product_id'].apply(lambda x: f" - Model {str(x)[:4].upper()}")

    # --- 3. WSTAWIANIE PRODUKTÓW ---
    session.query(Product).delete()
    product_map = {} # Mapa do wiązania OlistID -> ModelID
    
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
        # Zapisujemy mapowanie OlistID (code) do ModelID (id)
        product_map[new_product.code] = new_product.id
        product_cache[new_product.code] = new_product
    
    print("Produkty wstawione. Tworzenie transakcji...")
    
    # --- 4. ŁADOWANIE TRANSAKCJI (ORDER ITEMS) ---
    # Filtrujemy pozycje zamówień, aby zawierały tylko produkty, które właśnie wstawiliśmy
    items_df['product_code'] = items_df['product_id'].apply(lambda x: str(x)[:8].upper())
    valid_items_df = items_df[items_df['product_code'].isin(product_map.keys())]
    
    # Grupowanie pozycji po order_id
    order_groups = valid_items_df.groupby('order_id')
    
    # Filtrowanie głównych zamówień (ORDERS)
    valid_order_ids = valid_items_df['order_id'].unique()
    valid_orders_df = orders_df[orders_df['order_id'].isin(valid_order_ids)].head(LIMIT_ORDERS)
    
    # --- 5. WSTAWIANIE ZAMÓWIEŃ (ORDERS) ---
    customer_user = session.query(User).filter(User.role == 'customer').first()
    if not customer_user:
        print("Brak użytkownika klienta. Tworzenie zamówień niemożliwe.")
        session.commit()
        return

    # Używamy jednego klienta (dla uproszczenia), by Apriori mogło szukać wzorców
    customer_id = customer_user.id 
    
    print(f"Wstawianie {len(valid_orders_df)} zamówień dla Apriori...")

    for index, order_row in valid_orders_df.iterrows():
        order_id_str = order_row['order_id']
        
        # Tworzymy Order
        order_date = pd.to_datetime(order_row['order_purchase_timestamp']).to_pydatetime() or ORDER_DATE_START
        
        # Obliczenia: łączymy dane z payload (adres) z danymi z Olist (transakcje)
        order_amount = order_groups.get_group(order_id_str)['price'].sum()
        
        new_order = Order(
            user_id=customer_id,
            status="shipped", # Olist to głównie zamówienia wysłane
            total_amount=order_amount,
            created_at=order_date,
            # Dodajemy placeholder dla danych adresowych, które są wymagane w modelu
            invoice_buyer_name=f"Klient {customer_id}",
            invoice_contact_person="Olist Customer",
            invoice_address_street="ul. Zakupowa 1",
            invoice_address_zip="00-001",
            invoice_address_city="Warszawa",
        )
        session.add(new_order)
        session.flush() 
        
        current_total_gross = 0.0
        
        # Tworzymy OrderItems
        for item_index, item_row in order_groups.get_group(order_id_str).iterrows():
            product_code = item_row['product_id'][:8].upper()
            internal_product_id = product_map.get(product_code)
            
            if internal_product_id:
                product_data = product_cache.get(product_code)
                
                # Ceny z Olist to ceny brutto. Musimy je przeliczyć na netto dla naszej struktury
                # Zakładamy VAT 23% dla uproszczenia
                price_gross = item_row['price']
                price_net = price_gross / 1.23
                
                # Dodajemy OrderItem
                new_item = OrderItem(
                    order_id=new_order.id,
                    product_id=internal_product_id,
                    qty=item_row['order_item_id'], # Używamy id jako qty (uproszczenie)
                    unit_price=price_net,
                )
                session.add(new_item)
                current_total_gross += price_gross

        # Tworzymy Fakturę i WZ (Tylko po to, żeby nie łamać relacji i Apriori miało dane)
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
            items_json=json.dumps([]), # Lista items jest pusta, bo nie jest nam potrzebna
            status=WarehouseStatus.RELEASED,
        )
        session.add(warehouse_doc)


    session.commit()
    print(f"✅ Pomyślnie wstawiono {len(valid_orders_df)} zamówień Olist.")
    session.close()

def populate_database():
    """Główna funkcja populująca bazę danych."""
    
    # 1. Sprawdź, czy baza jest pusta, czy nie - jeśli nie, zresetuj ją.
    # W tym przypadku usuwamy tylko produkty, ale nie użytkowników!
    session = SessionLocal()
    session.query(Product).delete()
    session.query(Order).delete()
    session.query(OrderItem).delete()
    session.commit()
    session.close()
    
    load_all_data()

if __name__ == "__main__":
    populate_database()