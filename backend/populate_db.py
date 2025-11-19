import os
import pandas as pd
import random
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 1. Importowanie Modeli
# Musimy zaimportować model, aby móc go użyć do wstawiania danych
# Zakładam, że plik product.py jest w 'models'
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from models.product import Product
from database import Base, engine, SessionLocal
# from utils.tokenJWT import get_password_hash # Ta linia jest już zakomentowana/usunięta

# --- Konfiguracja ---
DB_URL = "sqlite:///./database.db"
DATA_DIR = os.path.join(os.path.dirname(__file__), "data_source")
LIMIT = 2000 # Ograniczenie liczby produktów do wstawienia
# --- Koniec Konfiguracji ---

def load_products_from_olist():
    """Wczytuje, filtruje i transformuje dane produktów z Olist."""
    
    try:
        # Wczytanie plików
        products_df = pd.read_csv(os.path.join(DATA_DIR, 'olist_products_dataset.csv'))
        translation_df = pd.read_csv(os.path.join(DATA_DIR, 'product_category_name_translation.csv'))
        
        # --- Uproszczone mapowanie i czyszczenie ---
        
        # Tłumaczenie nazw kategorii na angielski
        translation_map = dict(zip(translation_df['product_category_name'], translation_df['product_category_name_english']))
        products_df['product_category_name_english'] = products_df['product_category_name'].map(translation_map)

        # Wyrzucenie produktów bez nazwy (niezmapowanych)
        products_df.dropna(subset=['product_category_name_english'], inplace=True)
        
        # Filtrowanie i ograniczenie liczby rekordów
        products_df = products_df.head(LIMIT).copy()
        
        # Dodanie sztucznych kolumn (ceny i stanu - bo ich nie ma w pliku z produktami)
        products_df['sell_price_net'] = [round(random.uniform(5.00, 500.00), 2) for _ in range(len(products_df))]
        products_df['tax_rate'] = random.choices([5.0, 8.0, 23.0], k=len(products_df))
        products_df['stock_quantity'] = [random.randint(50, 2000) for _ in range(len(products_df))]
        products_df['location'] = random.choices(["A1-01", "B2-05", "C3-10", "D4-01"], k=len(products_df))
        
        # --- Generowanie linków do zdjęć ---
        def generate_image_url(row):
            seed = str(row['product_id'])[:8]
            return f"https://picsum.photos/seed/{seed}/300/300" 
            
        products_df['image_url'] = products_df.apply(generate_image_url, axis=1)

        # Mapowanie kolumn na model Product
        new_products = []
        for index, row in products_df.iterrows():
            
            # 1. ZMIANA: Czysta nazwa kategorii
            category_name = row['product_category_name_english'].replace('_', ' ').title()
            
            # 2. ZMIANA: Tworzenie unikalnego ID dla nazwy
            unique_id_part = str(row['product_id'])[:6].upper()
            product_name = f"{category_name} - Model {unique_id_part}" 
            
            new_products.append(
                Product(
                    name=product_name, # Używamy unikalnej nazwy
                    code=row['product_id'][:8].upper(),
                    description=f"Kategoria: {category_name}.",
                    sell_price_net=row['sell_price_net'],
                    buy_price=round(row['sell_price_net'] * random.uniform(0.6, 0.9), 2),
                    tax_rate=row['tax_rate'],
                    stock_quantity=row['stock_quantity'],
                    location=row['location'],
                    image_url=row['image_url'],
                    category=category_name,
                )
            )
        
        return new_products

    except FileNotFoundError:
        print(f"Błąd: Nie znaleziono plików CSV w katalogu {DATA_DIR}. Upewnij się, że pliki tam są.")
        return []
    except Exception as e:
        print(f"Wystąpił nieoczekiwany błąd podczas ładowania CSV: {e}")
        return []

def populate_database():
    """Usuwa stare produkty i wstawia nowe."""
    session = SessionLocal()
    
    try:
        print(f"Ładowanie danych produktów z Olist (limit: {LIMIT})...")
        new_products = load_products_from_olist()
        
        if not new_products:
            print("Nie wstawiono żadnych produktów.")
            return

        # 1. Usunięcie starych produktów
        print("Usuwanie starych produktów...")
        session.query(Product).delete()
        
        # 2. Wstawienie nowych produktów
        print(f"Wstawianie {len(new_products)} nowych produktów...")
        session.add_all(new_products)

        session.commit()
        print("✅ Pomyślnie zaktualizowano bazę danych. Nowe produkty zostały wstawione.")
        
    except Exception as e:
        session.rollback()
        print(f"Wystąpił błąd podczas transakcji w bazie danych: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    populate_database()