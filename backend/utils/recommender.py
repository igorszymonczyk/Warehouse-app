# backend/utils/recommender.py

import pandas as pd
from sqlalchemy import create_engine
from mlxtend.frequent_patterns import apriori, association_rules
import os
import sys

# Konfiguracja ścieżek
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Konfiguracja bazy
DATABASE_URL = "sqlite:///./database_warehouseapp.db"
engine = create_engine(DATABASE_URL)

def get_transaction_data() -> pd.DataFrame:
    """Pobiera dane i tworzy koszyk One-Hot."""
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
        if data.empty:
            return pd.DataFrame()
    except Exception as e:
        print(f"Recommender DB Error: {e}")
        return pd.DataFrame()

    # One-Hot Encoding
    # applymap jest deprecated w nowszych pandas, używamy map lub starych metod w zależności od wersji
    # tutaj bezpieczniejsza wersja:
    basket = (data.groupby(['order_id', 'product_name'])['product_name']
                .count().unstack().fillna(0))
    
    # Konwersja na 0/1
    basket = basket.apply(lambda x: x.map(lambda y: 1 if y > 0 else 0))
    
    # Filtrujemy zamówienia z mniej niż 2 produktami (nie dają reguł)
    basket['__Total'] = basket.sum(axis=1)
    basket = basket[basket['__Total'] >= 2]
    basket.drop(columns=['__Total'], inplace=True)
    
    return basket

def generate_recommendations(min_support: float = 0.01, min_confidence: float = 0.2) -> pd.DataFrame:
    """
    Generuje reguły asocjacyjne.
    Nazwa funkcji ujednolicona z 'salesman.py'.
    """
    basket = get_transaction_data()
    if basket.empty:
        return pd.DataFrame()
        
    # 1. Częste zbiory
    frequent_itemsets = apriori(basket, min_support=min_support, use_colnames=True)
    
    if frequent_itemsets.empty:
        return pd.DataFrame()

    # 2. Reguły
    rules = association_rules(frequent_itemsets, metric="lift", min_threshold=1.0)
    
    # Sortowanie dla lepszej jakości
    rules.sort_values('lift', ascending=False, inplace=True)
    
    return rules