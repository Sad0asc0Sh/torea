# Reports System Implementation Guide (Part 2)

**Repository:** ToInfinity  
**Author:** smkhadivpoor  
**Date:** 2025-12-29  
**Status:** Implementation Guide

---

## Table of Contents

1. [Overview](#overview)
2. [Forgotten Products Analysis](#forgotten-products-analysis)
3. [Database Schema](#database-schema)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [Testing Strategy](#testing-strategy)
7. [Deployment Guide](#deployment-guide)
8. [Performance Optimization](#performance-optimization)

---

## Overview

The Reports System (Part 2) focuses on advanced analytics and reporting features for inventory management, including:

- **Forgotten Products Analysis**: Identify products with no recent sales
- **Sales History Tracking**: Comprehensive sales data storage and retrieval
- **Critical Products Monitoring**: Low stock alerts and automatic reordering
- **Performance Optimization**: Query timeout protection and caching strategies
- **Visual Analytics**: Interactive charts and graphs for data visualization

---

## Forgotten Products Analysis

### Business Logic

Forgotten products are items that haven't been sold within a configurable time period (default: 90 days). This analysis helps:

- Identify slow-moving inventory
- Optimize storage space
- Plan clearance sales
- Adjust purchasing decisions

### Query Implementation

```sql
-- Forgotten Products Query (90 days)
SELECT 
    p.id,
    p.name,
    p.sku,
    p.category,
    p.current_stock,
    p.unit_price,
    MAX(sh.sale_date) as last_sale_date,
    DATEDIFF(CURDATE(), MAX(sh.sale_date)) as days_since_last_sale,
    (p.current_stock * p.unit_price) as tied_capital
FROM products p
LEFT JOIN sales_history sh ON p.id = sh.product_id
GROUP BY p.id
HAVING 
    last_sale_date IS NULL 
    OR days_since_last_sale > 90
ORDER BY days_since_last_sale DESC, tied_capital DESC;
```

### Configurable Time Periods

```python
# Backend configuration
FORGOTTEN_PRODUCTS_THRESHOLDS = {
    'critical': 180,  # 6 months
    'warning': 90,    # 3 months
    'notice': 30      # 1 month
}
```

---

## Database Schema

### Sales History Table

```sql
CREATE TABLE sales_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    sale_date DATE NOT NULL,
    quantity_sold INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    customer_id BIGINT,
    invoice_number VARCHAR(50),
    payment_method VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    
    INDEX idx_product_date (product_id, sale_date),
    INDEX idx_sale_date (sale_date),
    INDEX idx_invoice (invoice_number),
    INDEX idx_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Critical Products Table

```sql
CREATE TABLE critical_products (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT NOT NULL UNIQUE,
    minimum_stock INT NOT NULL DEFAULT 10,
    reorder_point INT NOT NULL DEFAULT 20,
    reorder_quantity INT NOT NULL DEFAULT 50,
    last_check_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    alert_sent BOOLEAN DEFAULT FALSE,
    alert_sent_date TIMESTAMP NULL,
    status ENUM('normal', 'warning', 'critical') DEFAULT 'normal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    
    INDEX idx_status (status),
    INDEX idx_alert (alert_sent, last_check_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Products Table Enhancements

```sql
-- Add columns to existing products table
ALTER TABLE products 
ADD COLUMN last_sale_date DATE NULL,
ADD COLUMN total_sales_count INT DEFAULT 0,
ADD COLUMN total_revenue DECIMAL(15, 2) DEFAULT 0.00,
ADD INDEX idx_last_sale (last_sale_date);
```

---

## Backend Implementation

### Django Models

```python
# models.py

from django.db import models
from django.utils import timezone
from datetime import timedelta

class SalesHistory(models.Model):
    """Track all product sales for analytics"""
    
    PAYMENT_METHODS = [
        ('cash', 'Cash'),
        ('card', 'Credit/Debit Card'),
        ('bank', 'Bank Transfer'),
        ('online', 'Online Payment'),
        ('credit', 'Store Credit'),
    ]
    
    product = models.ForeignKey('Product', on_delete=models.CASCADE, related_name='sales')
    sale_date = models.DateField(default=timezone.now)
    quantity_sold = models.IntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    customer = models.ForeignKey('Customer', on_delete=models.SET_NULL, null=True, blank=True)
    invoice_number = models.CharField(max_length=50, unique=True)
    payment_method = models.CharField(max_length=50, choices=PAYMENT_METHODS)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'sales_history'
        ordering = ['-sale_date', '-created_at']
        indexes = [
            models.Index(fields=['product', 'sale_date']),
            models.Index(fields=['sale_date']),
            models.Index(fields=['invoice_number']),
        ]
    
    def __str__(self):
        return f"{self.product.name} - {self.quantity_sold} units on {self.sale_date}"


class CriticalProduct(models.Model):
    """Monitor products with low stock levels"""
    
    STATUS_CHOICES = [
        ('normal', 'Normal'),
        ('warning', 'Warning'),
        ('critical', 'Critical'),
    ]
    
    product = models.OneToOneField('Product', on_delete=models.CASCADE, related_name='critical_status')
    minimum_stock = models.IntegerField(default=10)
    reorder_point = models.IntegerField(default=20)
    reorder_quantity = models.IntegerField(default=50)
    last_check_date = models.DateTimeField(default=timezone.now)
    alert_sent = models.BooleanField(default=False)
    alert_sent_date = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='normal')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'critical_products'
        ordering = ['status', 'product__name']
    
    def update_status(self):
        """Update status based on current stock"""
        current_stock = self.product.current_stock
        
        if current_stock <= self.minimum_stock:
            self.status = 'critical'
        elif current_stock <= self.reorder_point:
            self.status = 'warning'
        else:
            self.status = 'normal'
            self.alert_sent = False
        
        self.last_check_date = timezone.now()
        self.save()
    
    def __str__(self):
        return f"{self.product.name} - {self.status}"
```

### Views with Timeout Protection

```python
# views.py

from django.views import View
from django.http import JsonResponse
from django.db import connection
from django.core.cache import cache
from datetime import datetime, timedelta
import signal
from contextlib import contextmanager

class TimeoutException(Exception):
    pass

@contextmanager
def timeout(seconds):
    """Context manager for query timeout"""
    def timeout_handler(signum, frame):
        raise TimeoutException("Query timeout exceeded")
    
    # Set the signal handler
    old_handler = signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(seconds)
    
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)


class ForgottenProductsView(View):
    """API endpoint for forgotten products analysis"""
    
    CACHE_KEY = 'forgotten_products_report'
    CACHE_TIMEOUT = 3600  # 1 hour
    QUERY_TIMEOUT = 30  # 30 seconds
    
    def get(self, request):
        days_threshold = int(request.GET.get('days', 90))
        force_refresh = request.GET.get('refresh', '0') == '1'
        
        cache_key = f"{self.CACHE_KEY}_{days_threshold}"
        
        # Try cache first
        if not force_refresh:
            cached_data = cache.get(cache_key)
            if cached_data:
                return JsonResponse({
                    'success': True,
                    'data': cached_data,
                    'cached': True,
                    'timestamp': cached_data.get('generated_at')
                })
        
        try:
            with timeout(self.QUERY_TIMEOUT):
                data = self._get_forgotten_products(days_threshold)
                cache.set(cache_key, data, self.CACHE_TIMEOUT)
                
                return JsonResponse({
                    'success': True,
                    'data': data,
                    'cached': False
                })
        
        except TimeoutException:
            return JsonResponse({
                'success': False,
                'error': 'Query timeout - please try again or contact administrator'
            }, status=504)
        
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': str(e)
            }, status=500)
    
    def _get_forgotten_products(self, days_threshold):
        """Execute forgotten products query"""
        query = """
            SELECT 
                p.id,
                p.name,
                p.sku,
                p.category,
                p.current_stock,
                p.unit_price,
                MAX(sh.sale_date) as last_sale_date,
                DATEDIFF(CURDATE(), MAX(sh.sale_date)) as days_since_last_sale,
                (p.current_stock * p.unit_price) as tied_capital
            FROM products p
            LEFT JOIN sales_history sh ON p.id = sh.product_id
            GROUP BY p.id, p.name, p.sku, p.category, p.current_stock, p.unit_price
            HAVING 
                last_sale_date IS NULL 
                OR days_since_last_sale > %s
            ORDER BY days_since_last_sale DESC, tied_capital DESC
            LIMIT 1000
        """
        
        with connection.cursor() as cursor:
            cursor.execute(query, [days_threshold])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        # Calculate summary statistics
        total_products = len(results)
        total_tied_capital = sum(float(r['tied_capital'] or 0) for r in results)
        
        return {
            'products': results,
            'summary': {
                'total_products': total_products,
                'total_tied_capital': total_tied_capital,
                'threshold_days': days_threshold,
            },
            'generated_at': datetime.now().isoformat()
        }


class CriticalProductsView(View):
    """API endpoint for critical products monitoring"""
    
    def get(self, request):
        status_filter = request.GET.get('status', 'all')
        
        queryset = CriticalProduct.objects.select_related('product')
        
        if status_filter != 'all':
            queryset = queryset.filter(status=status_filter)
        
        products = []
        for cp in queryset:
            products.append({
                'id': cp.product.id,
                'name': cp.product.name,
                'sku': cp.product.sku,
                'current_stock': cp.product.current_stock,
                'minimum_stock': cp.minimum_stock,
                'reorder_point': cp.reorder_point,
                'reorder_quantity': cp.reorder_quantity,
                'status': cp.status,
                'alert_sent': cp.alert_sent,
                'last_check': cp.last_check_date.isoformat()
            })
        
        return JsonResponse({
            'success': True,
            'data': products,
            'count': len(products)
        })
    
    def post(self, request):
        """Update critical product thresholds"""
        import json
        data = json.loads(request.body)
        
        product_id = data.get('product_id')
        
        try:
            cp, created = CriticalProduct.objects.get_or_create(
                product_id=product_id,
                defaults={
                    'minimum_stock': data.get('minimum_stock', 10),
                    'reorder_point': data.get('reorder_point', 20),
                    'reorder_quantity': data.get('reorder_quantity', 50)
                }
            )
            
            if not created:
                cp.minimum_stock = data.get('minimum_stock', cp.minimum_stock)
                cp.reorder_point = data.get('reorder_point', cp.reorder_point)
                cp.reorder_quantity = data.get('reorder_quantity', cp.reorder_quantity)
                cp.save()
            
            cp.update_status()
            
            return JsonResponse({
                'success': True,
                'message': 'Critical product settings updated'
            })
        
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': str(e)
            }, status=400)


class SalesReportView(View):
    """Comprehensive sales reporting"""
    
    def get(self, request):
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        group_by = request.GET.get('group_by', 'day')  # day, week, month
        
        query = """
            SELECT 
                DATE_FORMAT(sale_date, %s) as period,
                COUNT(*) as transaction_count,
                SUM(quantity_sold) as total_units,
                SUM(total_amount) as total_revenue,
                AVG(total_amount) as avg_transaction
            FROM sales_history
            WHERE sale_date BETWEEN %s AND %s
            GROUP BY period
            ORDER BY period
        """
        
        date_formats = {
            'day': '%Y-%m-%d',
            'week': '%Y-%u',
            'month': '%Y-%m'
        }
        
        with connection.cursor() as cursor:
            cursor.execute(query, [
                date_formats.get(group_by, '%Y-%m-%d'),
                start_date,
                end_date
            ])
            columns = [col[0] for col in cursor.description]
            results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        return JsonResponse({
            'success': True,
            'data': results,
            'parameters': {
                'start_date': start_date,
                'end_date': end_date,
                'group_by': group_by
            }
        })
```

### URL Configuration

```python
# urls.py

from django.urls import path
from .views import ForgottenProductsView, CriticalProductsView, SalesReportView

urlpatterns = [
    path('api/reports/forgotten-products/', ForgottenProductsView.as_view(), name='forgotten_products'),
    path('api/reports/critical-products/', CriticalProductsView.as_view(), name='critical_products'),
    path('api/reports/sales/', SalesReportView.as_view(), name='sales_report'),
]
```

---

## Frontend Implementation

### Forgotten Products Component

```javascript
// ForgottenProducts.jsx

import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const ForgottenProducts = () => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [daysThreshold, setDaysThreshold] = useState(90);
    const [summary, setSummary] = useState(null);
    const [error, setError] = useState(null);
    
    useEffect(() => {
        fetchForgottenProducts();
    }, [daysThreshold]);
    
    const fetchForgottenProducts = async (forceRefresh = false) => {
        setLoading(true);
        setError(null);
        
        try {
            const url = `/api/reports/forgotten-products/?days=${daysThreshold}${forceRefresh ? '&refresh=1' : ''}`;
            const response = await fetch(url);
            const result = await response.json();
            
            if (result.success) {
                setProducts(result.data.products);
                setSummary(result.data.summary);
            } else {
                setError(result.error);
            }
        } catch (err) {
            setError('Failed to fetch forgotten products: ' + err.message);
        } finally {
            setLoading(false);
        }
    };
    
    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(value);
    };
    
    return (
        <div className="forgotten-products-report">
            <h1>Forgotten Products Analysis</h1>
            
            <div className="controls">
                <label>
                    Days Threshold:
                    <select value={daysThreshold} onChange={(e) => setDaysThreshold(e.target.value)}>
                        <option value="30">30 Days</option>
                        <option value="60">60 Days</option>
                        <option value="90">90 Days</option>
                        <option value="180">180 Days</option>
                        <option value="365">1 Year</option>
                    </select>
                </label>
                
                <button onClick={() => fetchForgottenProducts(true)}>
                    Refresh Data
                </button>
            </div>
            
            {error && (
                <div className="error-message">{error}</div>
            )}
            
            {loading ? (
                <div className="loading">Loading...</div>
            ) : summary && (
                <>
                    <div className="summary-cards">
                        <div className="card">
                            <h3>Total Forgotten Products</h3>
                            <p className="value">{summary.total_products}</p>
                        </div>
                        <div className="card">
                            <h3>Tied Capital</h3>
                            <p className="value">{formatCurrency(summary.total_tied_capital)}</p>
                        </div>
                    </div>
                    
                    <div className="chart-container">
                        <h3>Top 20 by Tied Capital</h3>
                        <BarChart width={800} height={400} data={products.slice(0, 20)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="tied_capital" fill="#ff6b6b" name="Tied Capital ($)" />
                        </BarChart>
                    </div>
                    
                    <div className="products-table">
                        <h3>Detailed List</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>SKU</th>
                                    <th>Category</th>
                                    <th>Stock</th>
                                    <th>Unit Price</th>
                                    <th>Tied Capital</th>
                                    <th>Last Sale</th>
                                    <th>Days Ago</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map(product => (
                                    <tr key={product.id}>
                                        <td>{product.name}</td>
                                        <td>{product.sku}</td>
                                        <td>{product.category}</td>
                                        <td>{product.current_stock}</td>
                                        <td>{formatCurrency(product.unit_price)}</td>
                                        <td>{formatCurrency(product.tied_capital)}</td>
                                        <td>{product.last_sale_date || 'Never'}</td>
                                        <td>{product.days_since_last_sale || 'N/A'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};

export default ForgottenProducts;
```

### Critical Products Dashboard

```javascript
// CriticalProductsDashboard.jsx

import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Legend, Tooltip } from 'recharts';

const CriticalProductsDashboard = () => {
    const [products, setProducts] = useState([]);
    const [statusFilter, setStatusFilter] = useState('all');
    const [loading, setLoading] = useState(false);
    
    const COLORS = {
        normal: '#4caf50',
        warning: '#ff9800',
        critical: '#f44336'
    };
    
    useEffect(() => {
        fetchCriticalProducts();
    }, [statusFilter]);
    
    const fetchCriticalProducts = async () => {
        setLoading(true);
        
        try {
            const url = `/api/reports/critical-products/?status=${statusFilter}`;
            const response = await fetch(url);
            const result = await response.json();
            
            if (result.success) {
                setProducts(result.data);
            }
        } catch (err) {
            console.error('Error fetching critical products:', err);
        } finally {
            setLoading(false);
        }
    };
    
    const getStatusCounts = () => {
        const counts = { normal: 0, warning: 0, critical: 0 };
        products.forEach(p => counts[p.status]++);
        
        return Object.entries(counts).map(([status, count]) => ({
            name: status.charAt(0).toUpperCase() + status.slice(1),
            value: count
        }));
    };
    
    const updateThresholds = async (productId, thresholds) => {
        try {
            const response = await fetch('/api/reports/critical-products/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product_id: productId,
                    ...thresholds
                })
            });
            
            const result = await response.json();
            if (result.success) {
                fetchCriticalProducts();
            }
        } catch (err) {
            console.error('Error updating thresholds:', err);
        }
    };
    
    return (
        <div className="critical-products-dashboard">
            <h1>Critical Products Monitor</h1>
            
            <div className="controls">
                <label>
                    Filter by Status:
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="all">All</option>
                        <option value="normal">Normal</option>
                        <option value="warning">Warning</option>
                        <option value="critical">Critical</option>
                    </select>
                </label>
            </div>
            
            {!loading && products.length > 0 && (
                <div className="status-chart">
                    <h3>Status Distribution</h3>
                    <PieChart width={400} height={400}>
                        <Pie
                            data={getStatusCounts()}
                            cx={200}
                            cy={200}
                            labelLine={false}
                            label
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                        >
                            {getStatusCounts().map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[entry.name.toLowerCase()]} />
                            ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                    </PieChart>
                </div>
            )}
            
            <div className="products-grid">
                {products.map(product => (
                    <div key={product.id} className={`product-card status-${product.status}`}>
                        <h4>{product.name}</h4>
                        <p>SKU: {product.sku}</p>
                        <div className="stock-info">
                            <div className="stock-bar">
                                <div 
                                    className="stock-level"
                                    style={{
                                        width: `${(product.current_stock / product.reorder_quantity) * 100}%`,
                                        backgroundColor: COLORS[product.status]
                                    }}
                                />
                            </div>
                            <p>Current: {product.current_stock} / Min: {product.minimum_stock}</p>
                        </div>
                        <div className="thresholds">
                            <p>Reorder Point: {product.reorder_point}</p>
                            <p>Reorder Quantity: {product.reorder_quantity}</p>
                        </div>
                        {product.alert_sent && (
                            <div className="alert-badge">Alert Sent</div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CriticalProductsDashboard;
```

### Styling

```css
/* reports.css */

.forgotten-products-report,
.critical-products-dashboard {
    padding: 20px;
    max-width: 1400px;
    margin: 0 auto;
}

.controls {
    margin: 20px 0;
    display: flex;
    gap: 15px;
    align-items: center;
}

.controls select {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
}

.controls button {
    padding: 8px 16px;
    background: #2196f3;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.controls button:hover {
    background: #1976d2;
}

.summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
    margin: 20px 0;
}

.card {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.card h3 {
    margin: 0 0 10px 0;
    color: #666;
    font-size: 14px;
    text-transform: uppercase;
}

.card .value {
    font-size: 32px;
    font-weight: bold;
    color: #333;
    margin: 0;
}

.chart-container {
    background: white;
    padding: 20px;
    border-radius: 8px;
    margin: 20px 0;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.products-table {
    background: white;
    padding: 20px;
    border-radius: 8px;
    margin: 20px 0;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    overflow-x: auto;
}

.products-table table {
    width: 100%;
    border-collapse: collapse;
}

.products-table th,
.products-table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #eee;
}

.products-table th {
    background: #f5f5f5;
    font-weight: 600;
    color: #333;
}

.products-table tr:hover {
    background: #f9f9f9;
}

.products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
    margin: 20px 0;
}

.product-card {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    border-left: 4px solid #ddd;
}

.product-card.status-normal {
    border-left-color: #4caf50;
}

.product-card.status-warning {
    border-left-color: #ff9800;
}

.product-card.status-critical {
    border-left-color: #f44336;
}

.stock-bar {
    height: 20px;
    background: #f0f0f0;
    border-radius: 10px;
    overflow: hidden;
    margin: 10px 0;
}

.stock-level {
    height: 100%;
    transition: width 0.3s ease;
}

.alert-badge {
    display: inline-block;
    background: #f44336;
    color: white;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    margin-top: 10px;
}

.error-message {
    background: #ffebee;
    color: #c62828;
    padding: 15px;
    border-radius: 4px;
    margin: 20px 0;
}

.loading {
    text-align: center;
    padding: 40px;
    font-size: 18px;
    color: #666;
}
```

---

## Testing Strategy

### Unit Tests

```python
# tests/test_reports.py

from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
from ..models import Product, SalesHistory, CriticalProduct

class ForgottenProductsTestCase(TestCase):
    
    def setUp(self):
        self.product_recent = Product.objects.create(
            name="Recent Product",
            sku="SKU-001",
            current_stock=100,
            unit_price=Decimal('10.00')
        )
        
        self.product_old = Product.objects.create(
            name="Old Product",
            sku="SKU-002",
            current_stock=50,
            unit_price=Decimal('20.00')
        )
        
        # Recent sale
        SalesHistory.objects.create(
            product=self.product_recent,
            sale_date=timezone.now().date() - timedelta(days=30),
            quantity_sold=10,
            unit_price=Decimal('10.00'),
            total_amount=Decimal('100.00'),
            invoice_number="INV-001",
            payment_method="cash"
        )
        
        # Old sale
        SalesHistory.objects.create(
            product=self.product_old,
            sale_date=timezone.now().date() - timedelta(days=120),
            quantity_sold=5,
            unit_price=Decimal('20.00'),
            total_amount=Decimal('100.00'),
            invoice_number="INV-002",
            payment_method="card"
        )
    
    def test_forgotten_products_query(self):
        """Test forgotten products identification"""
        from django.db import connection
        
        query = """
            SELECT p.id, MAX(sh.sale_date) as last_sale_date,
                   DATEDIFF(CURDATE(), MAX(sh.sale_date)) as days_since_last_sale
            FROM products p
            LEFT JOIN sales_history sh ON p.id = sh.product_id
            GROUP BY p.id
            HAVING days_since_last_sale > 90
        """
        
        with connection.cursor() as cursor:
            cursor.execute(query)
            results = cursor.fetchall()
        
        # Should find the old product
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0][0], self.product_old.id)


class CriticalProductsTestCase(TestCase):
    
    def setUp(self):
        self.product = Product.objects.create(
            name="Test Product",
            sku="SKU-003",
            current_stock=15,
            unit_price=Decimal('25.00')
        )
        
        self.critical = CriticalProduct.objects.create(
            product=self.product,
            minimum_stock=10,
            reorder_point=20,
            reorder_quantity=50
        )
    
    def test_status_normal(self):
        """Test normal status detection"""
        self.product.current_stock = 25
        self.product.save()
        
        self.critical.update_status()
        self.assertEqual(self.critical.status, 'normal')
    
    def test_status_warning(self):
        """Test warning status detection"""
        self.product.current_stock = 15
        self.product.save()
        
        self.critical.update_status()
        self.assertEqual(self.critical.status, 'warning')
    
    def test_status_critical(self):
        """Test critical status detection"""
        self.product.current_stock = 5
        self.product.save()
        
        self.critical.update_status()
        self.assertEqual(self.critical.status, 'critical')


class SalesHistoryTestCase(TestCase):
    
    def test_sales_creation(self):
        """Test sales history record creation"""
        product = Product.objects.create(
            name="Sale Product",
            sku="SKU-004",
            current_stock=100,
            unit_price=Decimal('15.00')
        )
        
        sale = SalesHistory.objects.create(
            product=product,
            sale_date=timezone.now().date(),
            quantity_sold=10,
            unit_price=Decimal('15.00'),
            total_amount=Decimal('150.00'),
            invoice_number="INV-003",
            payment_method="cash"
        )
        
        self.assertEqual(sale.product, product)
        self.assertEqual(sale.quantity_sold, 10)
        self.assertEqual(sale.total_amount, Decimal('150.00'))
```

### Integration Tests

```python
# tests/test_views.py

from django.test import TestCase, Client
from django.urls import reverse
import json

class ReportsAPITestCase(TestCase):
    
    def setUp(self):
        self.client = Client()
    
    def test_forgotten_products_api(self):
        """Test forgotten products API endpoint"""
        response = self.client.get(reverse('forgotten_products'))
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertTrue(data['success'])
        self.assertIn('products', data['data'])
        self.assertIn('summary', data['data'])
    
    def test_critical_products_api(self):
        """Test critical products API endpoint"""
        response = self.client.get(reverse('critical_products'))
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertTrue(data['success'])
        self.assertIn('data', data)
    
    def test_query_timeout(self):
        """Test query timeout protection"""
        # This would require mocking or actual slow query
        response = self.client.get(
            reverse('forgotten_products') + '?days=3650'  # 10 years
        )
        
        # Should either succeed or timeout gracefully
        self.assertIn(response.status_code, [200, 504])
```

### Performance Tests

```python
# tests/test_performance.py

from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
import time

class PerformanceTestCase(TestCase):
    
    def setUp(self):
        # Create large dataset
        for i in range(1000):
            product = Product.objects.create(
                name=f"Product {i}",
                sku=f"SKU-{i:04d}",
                current_stock=100,
                unit_price=Decimal('10.00')
            )
            
            # Add random sales history
            for j in range(50):
                SalesHistory.objects.create(
                    product=product,
                    sale_date=timezone.now().date() - timedelta(days=j*2),
                    quantity_sold=5,
                    unit_price=Decimal('10.00'),
                    total_amount=Decimal('50.00'),
                    invoice_number=f"INV-{i}-{j}",
                    payment_method="cash"
                )
    
    def test_forgotten_products_performance(self):
        """Test forgotten products query performance"""
        start_time = time.time()
        
        response = self.client.get(reverse('forgotten_products'))
        
        execution_time = time.time() - start_time
        
        self.assertEqual(response.status_code, 200)
        self.assertLess(execution_time, 30)  # Should complete within 30 seconds
```

---

## Deployment Guide

### Database Migration

```bash
# Create migrations
python manage.py makemigrations

# Apply migrations
python manage.py migrate

# Create indexes for performance
python manage.py dbshell
```

```sql
-- Additional indexes for optimization
CREATE INDEX idx_products_last_sale ON products(last_sale_date DESC);
CREATE INDEX idx_sales_composite ON sales_history(product_id, sale_date DESC);
CREATE INDEX idx_critical_status_date ON critical_products(status, last_check_date);
```

### Environment Configuration

```python
# settings.py

# Reports Configuration
REPORTS_CACHE_TIMEOUT = 3600  # 1 hour
REPORTS_QUERY_TIMEOUT = 30    # 30 seconds
FORGOTTEN_PRODUCTS_DEFAULT_DAYS = 90
CRITICAL_STOCK_CHECK_INTERVAL = 3600  # Check every hour

# Cache Configuration
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': 'redis://127.0.0.1:6379/1',
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        },
        'KEY_PREFIX': 'toinfinity_reports',
        'TIMEOUT': 3600,
    }
}
```

### Celery Tasks for Background Processing

```python
# tasks.py

from celery import shared_task
from django.utils import timezone
from .models import CriticalProduct, SalesHistory, Product

@shared_task
def update_critical_products_status():
    """Update all critical products status"""
    critical_products = CriticalProduct.objects.select_related('product').all()
    
    for cp in critical_products:
        cp.update_status()
    
    return f"Updated {critical_products.count()} critical products"


@shared_task
def update_product_sales_stats():
    """Update product sales statistics"""
    products = Product.objects.all()
    
    for product in products:
        sales = SalesHistory.objects.filter(product=product)
        
        if sales.exists():
            product.last_sale_date = sales.latest('sale_date').sale_date
            product.total_sales_count = sales.count()
            product.total_revenue = sum(s.total_amount for s in sales)
            product.save()
    
    return f"Updated sales stats for {products.count()} products"


@shared_task
def send_critical_stock_alerts():
    """Send alerts for critical stock levels"""
    from django.core.mail import send_mail
    
    critical_products = CriticalProduct.objects.filter(
        status='critical',
        alert_sent=False
    ).select_related('product')
    
    if not critical_products.exists():
        return "No critical products to alert"
    
    message = "The following products have critical stock levels:\n\n"
    
    for cp in critical_products:
        message += f"- {cp.product.name} (SKU: {cp.product.sku}): {cp.product.current_stock} units\n"
        cp.alert_sent = True
        cp.alert_sent_date = timezone.now()
        cp.save()
    
    send_mail(
        subject='Critical Stock Alert',
        message=message,
        from_email='noreply@toinfinity.com',
        recipient_list=['admin@toinfinity.com'],
        fail_silently=False,
    )
    
    return f"Sent alert for {critical_products.count()} products"
```

### Celery Configuration

```python
# celery.py

from celery import Celery
from celery.schedules import crontab

app = Celery('toinfinity')
app.config_from_object('django.conf:settings', namespace='CELERY')

# Schedule periodic tasks
app.conf.beat_schedule = {
    'update-critical-products-hourly': {
        'task': 'reports.tasks.update_critical_products_status',
        'schedule': crontab(minute=0),  # Every hour
    },
    'update-sales-stats-daily': {
        'task': 'reports.tasks.update_product_sales_stats',
        'schedule': crontab(hour=2, minute=0),  # Daily at 2 AM
    },
    'send-critical-alerts-daily': {
        'task': 'reports.tasks.send_critical_stock_alerts',
        'schedule': crontab(hour=8, minute=0),  # Daily at 8 AM
    },
}
```

### Production Deployment Steps

```bash
# 1. Update code
git pull origin main

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run migrations
python manage.py migrate

# 4. Collect static files
python manage.py collectstatic --noinput

# 5. Build frontend
cd frontend
npm install
npm run build
cd ..

# 6. Restart services
sudo systemctl restart gunicorn
sudo systemctl restart celery
sudo systemctl restart celery-beat
sudo systemctl restart nginx

# 7. Clear cache
python manage.py shell
>>> from django.core.cache import cache
>>> cache.clear()
```

---

## Performance Optimization

### Database Optimization

```sql
-- Analyze and optimize tables
ANALYZE TABLE products, sales_history, critical_products;

-- Add partitioning for sales_history (by year)
ALTER TABLE sales_history
PARTITION BY RANGE (YEAR(sale_date)) (
    PARTITION p2023 VALUES LESS THAN (2024),
    PARTITION p2024 VALUES LESS THAN (2025),
    PARTITION p2025 VALUES LESS THAN (2026),
    PARTITION p_future VALUES LESS THAN MAXVALUE
);
```

### Query Optimization

```python
# Use select_related and prefetch_related
products = Product.objects.select_related('category').prefetch_related(
    'sales__customer'
).all()

# Use queryset aggregation
from django.db.models import Count, Sum, Avg

stats = SalesHistory.objects.aggregate(
    total_sales=Sum('total_amount'),
    avg_sale=Avg('total_amount'),
    transaction_count=Count('id')
)

# Use database views for complex queries
from django.db import connection

def create_forgotten_products_view():
    with connection.cursor() as cursor:
        cursor.execute("""
            CREATE OR REPLACE VIEW forgotten_products_view AS
            SELECT 
                p.id,
                p.name,
                p.sku,
                MAX(sh.sale_date) as last_sale_date,
                DATEDIFF(CURDATE(), MAX(sh.sale_date)) as days_since_last_sale
            FROM products p
            LEFT JOIN sales_history sh ON p.id = sh.product_id
            GROUP BY p.id, p.name, p.sku
        """)
```

### Caching Strategy

```python
# Cache expensive queries
from django.core.cache import cache

def get_forgotten_products(days=90):
    cache_key = f'forgotten_products_{days}'
    result = cache.get(cache_key)
    
    if result is None:
        # Execute query
        result = _execute_forgotten_products_query(days)
        cache.set(cache_key, result, timeout=3600)
    
    return result

# Invalidate cache on data changes
from django.db.models.signals import post_save
from django.dispatch import receiver

@receiver(post_save, sender=SalesHistory)
def invalidate_reports_cache(sender, instance, **kwargs):
    cache.delete_pattern('forgotten_products_*')
    cache.delete_pattern('sales_report_*')
```

---

## Monitoring and Maintenance

### Logging Configuration

```python
# settings.py

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'file': {
            'level': 'INFO',
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': '/var/log/toinfinity/reports.log',
            'maxBytes': 1024 * 1024 * 15,  # 15MB
            'backupCount': 10,
        },
    },
    'loggers': {
        'reports': {
            'handlers': ['file'],
            'level': 'INFO',
            'propagate': True,
        },
    },
}
```

### Monitoring Queries

```python
# Monitor slow queries
import logging

logger = logging.getLogger('reports')

def log_query_performance(query_name, execution_time):
    if execution_time > 10:  # Log if query takes more than 10 seconds
        logger.warning(f"Slow query detected: {query_name} took {execution_time:.2f} seconds")
```

---

## Conclusion

This comprehensive guide provides everything needed to implement a robust Reports System with:

✅ **Forgotten Products Analysis** with configurable thresholds  
✅ **Critical Products Monitoring** with automatic alerts  
✅ **Sales History Tracking** with detailed analytics  
✅ **Timeout Protection** for long-running queries  
✅ **Performance Optimization** with caching and indexing  
✅ **Background Tasks** with Celery  
✅ **Interactive Charts** with React and Recharts  
✅ **Comprehensive Testing** strategy  
✅ **Production Deployment** guide

For questions or issues, please contact the development team or create an issue in the repository.

---

**Last Updated:** 2025-12-29  
**Version:** 2.0  
**Status:** Ready for Implementation
