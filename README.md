# Warehouse-App 

> A comprehensive Full-Stack Web Application supporting sales, e-commerce, and warehouse management operations. Built as a Bachelor's Thesis project.

## About The Project

Warehouse-App is a modern, modular IT system designed to integrate key business processes of a commercial enterprise. It eliminates information silos by providing a single source of truth for inventory, sales, invoicing, and e-commerce transactions. 

The system features role-based access control (Admin, Salesperson, Warehouseman, Customer) and includes advanced functionalities such as automated PDF document generation, online payment integration, and an AI-driven product recommendation engine.

### Built With (Tech Stack)

**Backend:**
*   **Python 3**
*   **FastAPI** (High-performance REST API framework)
*   **SQLAlchemy** (ORM)
*   **SQLite** (Relational Database)
*   **Pydantic** (Data validation)
*   **PyJWT** (Authentication)
*   **ReportLab** (Dynamic PDF Generation)

**Frontend:**
*   **React** (Single Page Application)
*   **TypeScript** (Static typing)
*   **Tailwind CSS** (Utility-first styling)
*   **Vite** (Build tool & dev server)

**Data Science & AI:**
*   **Pandas** (Data manipulation)
*   **mlxtend** (Apriori algorithm for Market Basket Analysis)
*   *Trained on the Kaggle Olist E-commerce Dataset*

## Key Features

*   **Role-Based Access Control (RBAC):** Distinct dashboards and permissions for Administrators, Warehousemen, Salespeople, and Customers.
*   **Real-time Inventory Management:** Automatic stock updates upon order placement, fulfillment, or warehouse corrections.
*   **E-commerce & Point of Sale (POS):** Unified system handling both online store purchases and face-to-face physical sales.
*   **Financial & Document Automation:** Automated generation of PDF Invoices and Warehouse Release Documents (WZ).
*   **Payment Gateway Integration:** Sandbox integration with the **PayU API** for secure online transactions.
*   **Smart Product Recommendations:** Integration of the Apriori algorithm to suggest products based on historical shopping cart data.
*   **System Audit Logging:** Comprehensive logging of critical user actions for security and administrative oversight.

## System Architecture

The application is built on a standard 3-tier client-server architecture:
1.  **Presentation Layer (Frontend):** React SPA communicating exclusively via HTTP requests.
2.  **Business Logic Layer (Backend):** FastAPI REST API handling routing, validation, and complex business rules.
3.  **Data Layer:** SQLite database managed through SQLAlchemy ORM, ensuring ACID compliance.
