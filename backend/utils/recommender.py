# backend/utils/recommender.py

import pandas as pd
from sqlalchemy import create_engine
from mlxtend.frequent_patterns import apriori, association_rules
import os
import sys

# Configure system path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Database connection configuration
DATABASE_URL = "sqlite:///./database_warehouseapp.db"
engine = create_engine(DATABASE_URL)

def get_transaction_data() -> pd.DataFrame:
    """Fetches sales data and transforms it into a One-Hot encoded basket format."""
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

    # Pivot data: rows=orders, cols=products
    # Note: Using apply with map for binary conversion to ensure compatibility
    basket = (data.groupby(['order_id', 'product_name'])['product_name']
                .count().unstack().fillna(0))
    
    # Convert counts to binary (0/1) values
    basket = basket.apply(lambda x: x.map(lambda y: 1 if y > 0 else 0))
    
    # Filter out orders with fewer than 2 items to ensure associations
    basket['__Total'] = basket.sum(axis=1)
    basket = basket[basket['__Total'] >= 2]
    basket.drop(columns=['__Total'], inplace=True)
    
    return basket

def generate_recommendations(min_support: float = 0.01, min_confidence: float = 0.2) -> pd.DataFrame:
    """
    Generates association rules using the Apriori algorithm.
    Function name unified with 'salesman.py'.
    """
    basket = get_transaction_data()
    if basket.empty:
        return pd.DataFrame()
        
    # 1. Identify frequent itemsets
    frequent_itemsets = apriori(basket, min_support=min_support, use_colnames=True)
    
    if frequent_itemsets.empty:
        return pd.DataFrame()

    # 2. Derive rules based on lift metric
    rules = association_rules(frequent_itemsets, metric="lift", min_threshold=1.0)
    
    # Sort by lift to prioritize strongest associations
    rules.sort_values('lift', ascending=False, inplace=True)
    
    return rules