# backend/utils/recommender.py

import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from mlxtend.frequent_patterns import apriori, association_rules
import os
import sys

# Dodajemy folder 'backend' do ścieżki, aby zaimportować models
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import SessionLocal
from models.order import Order, OrderItem
from models.product import Product

# Używamy ścieżki do bazy danych, aby utworzyć silnik, który jest potrzebny pandas
# (Zakładamy, że database.py definiuje SessionLocal)
DATABASE_URL = "sqlite:///./database_warehouseapp.db" # Użyj właściwej ścieżki do Twojej bazy!
engine = create_engine(DATABASE_URL)


def get_transaction_data(session: Session = None) -> pd.DataFrame:
    """
    Pobiera dane zamówień i konwertuje je do formatu Transakcje (One-Hot Encoded).
    Filtruje transakcje z pojedynczymi produktami.
    """
    if session is None:
        session = SessionLocal()

    # Optymalne zapytanie SQL (bez zmian)
    query = """
    SELECT 
        oi.order_id, 
        p.name AS product_name 
    FROM order_items oi
    JOIN "products" p ON oi.product_id = p.id
    ORDER BY oi.order_id
    """
    
    try:
        data = pd.read_sql(query, engine)
    except Exception as e:
        print(f"Błąd podczas odczytu danych z bazy: {e}")
        return pd.DataFrame()
    finally:
        session.close()

    # 1. Konwersja do formatu One-Hot (gdzie 1=kupiono)
    basket = (data.groupby(['order_id', 'product_name'])['product_name']
                .count().unstack().fillna(0).applymap(lambda x: 1 if x > 0 else 0))
    
    # 2. ZMIANA: Dodanie kolumny sumującej, aby usunąć zamówienia pojedyncze
    basket['__Total_Items'] = basket.sum(axis=1)
    
    # 3. Filtrowanie: zostawiamy tylko koszyki z 2 lub więcej unikalnymi pozycjami
    basket = basket[basket['__Total_Items'] >= 2]
    
    # 4. Usunięcie kolumny pomocniczej
    basket.drop(columns=['__Total_Items'], inplace=True) 
    
    return basket

def generate_recommendations(min_support: float = 0.01, min_confidence: float = 0.5) -> pd.DataFrame:
    """
    Generuje reguły asocjacyjne przy użyciu algorytmu Apriori.
    
    :param min_support: Minimalna częstotliwość występowania zestawu produktów (np. 1%).
    :param min_confidence: Minimalna pewność reguły (np. 50%).
    :return: DataFrame z regułami rekomendacyjnymi.
    """
    basket_sets = get_transaction_data()
    
    if basket_sets.empty:
        return pd.DataFrame()
        
    # 1. Znajdowanie często występujących zestawów produktów
    frequent_itemsets = apriori(basket_sets, min_support=min_support, use_colnames=True)
    
    # 2. Generowanie reguł asocjacyjnych
    rules = association_rules(frequent_itemsets, metric="lift", min_threshold=1.0)
    
    # Sortowanie po wskaźniku lift (jak bardzo zestaw jest bardziej prawdopodobny niż losowy)
    rules.sort_values('lift', ascending=False, inplace=True)
    
    # Opcjonalne filtrowanie po minimalnym zaufaniu (confidence)
    rules = rules[rules['confidence'] >= min_confidence]
    
    return rules[['antecedents', 'consequents', 'support', 'confidence', 'lift']]