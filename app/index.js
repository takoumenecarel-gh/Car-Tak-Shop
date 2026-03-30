const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const products = [
  { id: 1, name: 'Wireless Headphones', price: 99.99, stock: 50, category: 'Electronics' },
  { id: 2, name: 'Running Shoes',       price: 79.99, stock: 30, category: 'Sports' },
  { id: 3, name: 'Coffee Maker',        price: 49.99, stock: 20, category: 'Kitchen' },
  { id: 4, name: 'Yoga Mat',            price: 29.99, stock: 100, category: 'Sports' },
  { id: 5, name: 'Smart Watch',         price: 199.99, stock: 15, category: 'Electronics' },
];

app.get('/health', (_req, res) =>
  res.json({ status: 'healthy', version: process.env.APP_VERSION || '1.0.0' })
);

app.get('/api/products', (_req, res) =>
  res.json({ products, total: products.length })
);

app.get('/api/products/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Ecommerce app running on port ${PORT}`));
}

module.exports = app;
