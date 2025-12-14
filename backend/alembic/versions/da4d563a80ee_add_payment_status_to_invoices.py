"""Add payment_status to invoices

Revision ID: da4d563a80ee
Revises: 75389edc8690
Create Date: 2025-11-13 17:50:49.927966

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# Revision identifiers used by Alembic
revision: str = 'da4d563a80ee'
down_revision: Union[str, Sequence[str], None] = '75389edc8690'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add payment_status column, indexes, and foreign keys to invoices table
    op.add_column('invoices', sa.Column('payment_status', sa.Enum('PENDING', 'PAID', 'CANCELLED', name='paymentstatus'), nullable=True))
    op.create_index(op.f('ix_invoices_order_id'), 'invoices', ['order_id'], unique=False)
    op.create_index(op.f('ix_invoices_user_id'), 'invoices', ['user_id'], unique=False)
    op.create_foreign_key(None, 'invoices', 'orders', ['order_id'], ['id'])
    op.create_foreign_key(None, 'invoices', 'users', ['user_id'], ['id'])
    
    # Enforce non-nullable constraints on stock_movements and warehouse_documents
    op.alter_column('stock_movements', 'created_at',
               existing_type=sa.DATETIME(),
               nullable=False,
               existing_server_default=sa.text('(CURRENT_TIMESTAMP)'))
    op.alter_column('warehouse_documents', 'invoice_id',
               existing_type=sa.INTEGER(),
               nullable=False)
    op.alter_column('warehouse_documents', 'created_at',
               existing_type=sa.DATETIME(),
               nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    # Revert non-nullable constraints on warehouse_documents and stock_movements
    op.alter_column('warehouse_documents', 'created_at',
               existing_type=sa.DATETIME(),
               nullable=True)
    op.alter_column('warehouse_documents', 'invoice_id',
               existing_type=sa.INTEGER(),
               nullable=True)
    op.alter_column('stock_movements', 'created_at',
               existing_type=sa.DATETIME(),
               nullable=True,
               existing_server_default=sa.text('(CURRENT_TIMESTAMP)'))
    
    # Drop foreign keys, indexes, and payment_status column from invoices
    op.drop_constraint(None, 'invoices', type_='foreignkey')
    op.drop_constraint(None, 'invoices', type_='foreignkey')
    op.drop_index(op.f('ix_invoices_user_id'), table_name='invoices')
    op.drop_index(op.f('ix_invoices_order_id'), table_name='invoices')
    op.drop_column('invoices', 'payment_status')