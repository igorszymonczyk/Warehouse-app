"""Add address fields to orders table

Revision ID: 7bc7347a1953
Revises: 
Create Date: 2025-11-13 14:18:10.044829

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# Revision identifiers used by Alembic
revision: str = '7bc7347a1953'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add invoice details columns to the orders table
    op.add_column('orders', sa.Column('invoice_buyer_name', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('invoice_contact_person', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('invoice_buyer_nip', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('invoice_address_street', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('invoice_address_zip', sa.String(), nullable=True))
    op.add_column('orders', sa.Column('invoice_address_city', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove invoice details columns from the orders table
    op.drop_column('orders', 'invoice_address_city')
    op.drop_column('orders', 'invoice_address_zip')
    op.drop_column('orders', 'invoice_address_street')
    op.drop_column('orders', 'invoice_buyer_nip')
    op.drop_column('orders', 'invoice_contact_person')
    op.drop_column('orders', 'invoice_buyer_name')